'use strict';
const fs = require('fs').promises;
const OpenAI = require("openai");
const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
require("dotenv").config();


// Constants
const TEMP = 0.1;
const TOKEN_LIMIT_SAFETY_CHARS_BUFFER_PERCENTAGE = 1;
const RESERVED_COMPLETION_MIN_TOKENS = 2048;
const COMPLETION_TOKEN_MIN_RATIO = 2;
const PROMPT_VARIABLE_TO_REPLACE = "{content}"
const SPLIT_WRAPPER_TEMPLATE_PATH = "./src/prompts/split-wrapper-template.prompt";
const MERGE_WRAPPER_TEMPLATE_PATH = "./src/prompts/merge-wrapper-template.prompt";
const STATUS_COMPLETED = "completed";
const STATUS_EXCEEDED = "exceeded";
const STATUS_OVERLOADED = "overloaded";
const { LLM_API_KEY, LLM_MODEL, AZURE_ENDPOINT, FILEPATH: CONTENT_FILEPATH } = process.env;


//
// Main function to execute the main flow.
//
async function main() {
  const llmClient = getLLMClient();
  const promptTemplatePath = "./src/prompts/sample.prompt";
  const promptTemplate = await readFileAsync(promptTemplatePath);
  const content = await readFileAsync(CONTENT_FILEPATH);
  const prompt = promptTemplate.replace(PROMPT_VARIABLE_TO_REPLACE, content);
  let result = await sendPromptToAnLLMWithRetries(llmClient, prompt);

  if (result.status === STATUS_EXCEEDED) {
    console.log("Need to split content into multiple prompts and then merge into a final prompt due to LLM max tokens being exceeded");
    result = await splitMergePrompts(llmClient, promptTemplate, content, result.promptTokens, result.completionTokens, result.tokensLimit);
  } 
  
  if (result.status === STATUS_OVERLOADED) {
    console.error(`FAILURE: LLM unable to process prompt for text completion because it is overloaded (even after retries)`);
  } else if (result.status === STATUS_COMPLETED) {
    console.log(`SUCCESS:\n${result.msg}\n`);
  } else if (result.status === STATUS_EXCEEDED) {
    console.error(`FAILURE: LLM request token size ${result.promptTokens} exceeded limit of ${result.tokensLimit}`);
  } else {
    console.error(`FAILURE: Unable error occure whilst LLM attempting to process prompt for text completio`);
  }
}


//
// Send a prompt to an LLM for text completion, retrying a number of times if the LLM is
// overloaded. 
//
async function sendPromptToAnLLMWithRetries(llmClient, prompt) {
  return await withRetry(sendPromptToLLM, [llmClient, prompt], result => (result.status === STATUS_OVERLOADED));
}


//
// Sends a promot to an LLM for text completion, capturing the successful response or otherwise 
// metadata on what went wrong. Response object contains the key "status" one of the following
// values (or throws an error for an unknown issue): "completed", "overloaded", "exceeded"
//
async function sendPromptToLLM(llmClient, prompt) {
  let result = null;
   
  try {
    const responses = await promptLLMForTextCompletion(llmClient, prompt);
    const response = responses?.choices[0];

    if (!response) {
      throw new Error("Completetion response contained no choices with response messages");
    } else if (response?.finishReason === "length") {      
      result = extractTokensAmountAndLimitFromResponseMetadata(responses.usage);
      result.status = STATUS_EXCEEDED;
    } else {
      result = { status: STATUS_COMPLETED, msg: response.message?.content };
    }
  } catch (error) {
    if (error.response && error.response.status === 429) {
      result = { status: STATUS_OVERLOADED };
    } else if (error.code === "context_length_exceeded") {
      result = extractTokensAmountAndLimitFromErrorMsg(error.message);
      result.status = STATUS_EXCEEDED;
    } else {
      throw error;
    }
  }

  return result;
}


//
// Splits the content into manageable chunks, sending each to LLM, and then merging the results to 
// send to the LLM again.
//
async function splitMergePrompts(llmClient, promptTemplate, content, promptTokens, completionTokens, tokensLimit) {
  const chunkPromptResponses = await processSplitPrompting(llmClient, content, promptTokens, completionTokens, tokensLimit, promptTemplate);
  return await processMergePrompting(llmClient, chunkPromptResponses, promptTemplate);
}


//
// Split te content into management chunks and send each to the LLM concurrently.
//
async function processSplitPrompting(llmClient, content, promptTokens, completionTokens, tokensLimit, promptTemplate) {
  const splitWrapperTemplate = await readFileAsync(SPLIT_WRAPPER_TEMPLATE_PATH);
  const chunkCharsLen = calculateSplitChunkSizeChars(content.length, promptTokens, completionTokens, tokensLimit, promptTemplate.length, splitWrapperTemplate.length);
  const chunks = splitTextContentIntoChunks(content, chunkCharsLen);
  const chunkPromptRequests = [];
  console.log("SPLITING...");

  for (const chunk of chunks) {
    const chunkPrompt = promptTemplate.replace(PROMPT_VARIABLE_TO_REPLACE, chunk);
    const splitWrappedChunkPrompt = splitWrapperTemplate.replace(PROMPT_VARIABLE_TO_REPLACE, chunkPrompt);
    chunkPromptRequests.push(sendPromptToAnLLMWithRetries(llmClient, splitWrappedChunkPrompt));
  }

  console.log(`Split into ${chunkPromptRequests.length} chunks`);
  return await Promise.all(chunkPromptRequests);
}


//
// Merge the results for each chunk being processed by an LLM into one piece of merged content to 
// send again to the LLM.
//
async function processMergePrompting(llmClient, chunkPromptResponses, promptTemplate) {
  const mergeWrapperTemplate = await readFileAsync(MERGE_WRAPPER_TEMPLATE_PATH);
  let mergedContent = "";
  let chunksProblem = false;

  for (const chunkPromptResponse of chunkPromptResponses) {
    if (chunkPromptResponse.status === STATUS_COMPLETED) {
      mergedContent += `\n\n-----\n\n${chunkPromptResponse.msg}`;
    } else {
      console.error(`Procesed chunk did not complete propertly, so skipping chunk - status: ${chunkPromptResponse.status}`);
      chunksProblem = true;
    }
  }

  if (chunksProblem) {
    throw new Error(`Problem occurred processing at least one chunk so abandoning without even attempting to merge`);
  }

  console.log("MERGING...");
  const originalPromptPlusMergedContent = promptTemplate + mergedContent;
  const mergeWrapperPrompt = mergeWrapperTemplate.replace(PROMPT_VARIABLE_TO_REPLACE, originalPromptPlusMergedContent);
  return await sendPromptToAnLLMWithRetries(llmClient, mergeWrapperPrompt);
}


//
// Calculates the size of each content chunk to split into based on a number of factors discovered 
// from the failed attempt of calling an LLM with the whole content, like token limit, prompt 
// tokens used, completion tokens used, etc..
//
function calculateSplitChunkSizeChars(contentCharsCount, promptTokens, completionTokens, tokensLimit, promptTemplateCharsCount, wrapperTemplateCharsCount) {
  const charsPerToken = (promptTemplateCharsCount - PROMPT_VARIABLE_TO_REPLACE.length + contentCharsCount) / promptTokens;
  const charsLimit = tokensLimit * charsPerToken;
  const completionCharsNeeded = Math.max((RESERVED_COMPLETION_MIN_TOKENS - completionTokens), (completionTokens * COMPLETION_TOKEN_MIN_RATIO)) * charsPerToken;
  const promptCharsNeeded = charsLimit - completionCharsNeeded;
  const chunkCharsSizeNoBuffer = promptCharsNeeded - promptTemplateCharsCount + PROMPT_VARIABLE_TO_REPLACE.length - wrapperTemplateCharsCount + PROMPT_VARIABLE_TO_REPLACE.length;
  const chunkSizeChars = Math.floor((100 - TOKEN_LIMIT_SAFETY_CHARS_BUFFER_PERCENTAGE) / 100 * chunkCharsSizeNoBuffer);    
  return Math.max(chunkSizeChars, 1); // Ensure split size is always positive
}


//
// From a LLM API response object, extract the values of the fields indicating token limit, prompt
// tokens used and completion tokens used.
//
function extractTokensAmountAndLimitFromResponseMetadata({ promptTokens, completionTokens, totalTokens }) {
  return { promptTokens, completionTokens, tokensLimit: totalTokens };
}

//
// From a LLM API thrown error's text message, extract the values of the fields indicating token
// limit and prompt tokens used (assume completion tokens used was zero).
//
function extractTokensAmountAndLimitFromErrorMsg(errorMsg) {
  let promptTokens = -1;
  let completionTokens = 0;
  let tokensLimit = -1;       
  const matches = errorMsg.match(/max.*?(\d+) tokens[\s\S]*?(\d+) to/);

  if (matches && (matches.length > 2)) {
    tokensLimit = parseInt(matches[1], 10);
    promptTokens = parseInt(matches[2], 10);
  }

  if ((promptTokens < 0) || (tokensLimit < 0)) {
    throw new Error(`Unable to extract tokens amount and limit numbers from error message: ${errorMsg}`);
  }

  return { promptTokens, completionTokens, tokensLimit };
}


//
// Split a large UTF8 text into chunks with a maximum length characters per chunk.
//
function splitTextContentIntoChunks(text, maxChunkLength) {
  const parts = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + maxChunkLength;

    if (endIndex > text.length) {
      endIndex = text.length;
    }

    parts.push(text.substring(startIndex, endIndex));
    startIndex = endIndex;
  }

  return parts;
}


//
// Get handle on the LLM API.
//
function getLLMClient() {
  const llmClient = AZURE_ENDPOINT ?
                    (new OpenAIClient(AZURE_ENDPOINT, new AzureKeyCredential(LLM_API_KEY))):
                    (new OpenAI({ apiKey: LLM_API_KEY }));  
 return llmClient;
}


//
// Send a prompt for text completion to a specific LLM.
//
async function promptLLMForTextCompletion(llmClient, prompt) {
  const messages = [{ role: 'user',  content: prompt }];
  const response = AZURE_ENDPOINT ?
                   (await llmClient.getChatCompletions(LLM_MODEL, messages, { temperature: TEMP })):
                   (await llmClient.chat.completions.create({ model: LLM_MODEL, messages, temperature: TEMP }));    
  return response;
}


//
// Read content from a specified file asynchronously.
//
async function readFileAsync(filePath) {
  return await fs.readFile(filePath, { encoding: "utf8" });
}


/**
 * Generic retry mechanism for asynchronous functions.
 * 
 * @param {Function} asyncFunc - The asynchronous function to retry.
 * @param {Array} args - Arguments to pass to the async function.
 * @param {Function} shouldRetry - A function that takes the result and decides whether to retry.
 * @param {number} maxAttempts - Maximum number of attempts.
 * @param {number} retryDelay - Delay between retries in milliseconds.
 * @param {number} logRetry - Log to console if retrying
 * @returns {Promise<any>} - The result of the asynchronous function, if successful.
 */
async function withRetry(asyncFunc, args, shouldRetry, maxAttempts = 3, retryDelay = 1000, logRetry = true) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const result = await asyncFunc(...args);

    if (shouldRetry(result)) {
      attempts++;
      logRetry && console.log("...retrying...");
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempts));
    } else {
      return result; 
    }
  }
}


//
// Bootstrap
//
(async () => {
  await main();
})();
