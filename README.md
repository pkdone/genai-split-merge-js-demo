# GenAI LLM Large Prompt Split Merge Demo

This demo project explores whether a tool can automatically handle the challenge of processing large structured content (specifically, a Java class file) that exceeds a single LLM token limit. It investigates whether the tool can transparently divide the content into smaller prompts for the LLM and then seamlessly combine these LLM response fragments into a unified summary prompt for the LLM to generate a final response. The aim is to achieve a final response equivalent to that from a single, large prompt processed by an LLM with a larger token limit. Essentially, the project seeks a reusable method for processing large structured content with an LLM using a standard prompt template, even when the content must be divided and merged behind the scenes.

However, this project **FAILED** to prove this is possible.

The implementation revealed **several challenges** that may actually be universal to any attempt to transparently split and merge content for text completions with a specific, predefined prompt template:

1. **Split Point Challenge**: Splitting content at arbitrary points can result in corruption of information, adversely affecting outcomes. For instance, when a Java class file is split into chunks by token or character count limits, details such as class names and method descriptions can be inaccurately captured due to the split occurring mid-name or definition. Consequently some of the class's components will not be recognised and captured by the split-merge process.

1. **Identifying Splits Requires Analysis**: Properly splitting a Java file into chunks to maintain key information, like a class's purpose and its public methods, demands a sophisticated solution beyond merely applying token count limits for each chunk boundary. This presents a dilemma: analyzing the file for split points ideally requires the same technology (LLM-based analysis) we're needing to circumvent for the split-point analysis. An alternative, such as parsing the code into an [Abstract Syntax Tree](https://www.geeksforgeeks.org/abstract-syntax-tree-ast-in-java/) (AST), sidesteps this but at the cost of the efficiency gains anticipated from using GenAI in the first place, rather than writing this low-level plumbing. Having built a tree model representing the class to identify the its method boundaries will have mean we will have identified the methods anyway which negates the need for using an LLM at all, even once the split-points have been identified.

1. **Later Chunks Lack Higher-Level Context**: The iinitial split chunk may contain the class name and signature, but subsequent chunks will lack references to the encompassing class. This diminishes the accuracy of identifying and associating methods with their class, undermining the split-merge process's integrity.

1. **Self-Defeating Solution for Large Content**: If merged content from split chunk LLM responses exceeds the LLM's token limit for the subsequent merge prompt request to the LLM, a recursive split-merge approach might be considered. However, this risks infinite recursion and undermines the rationale behind split-merge: to cope with 'over-sized' content. Ironically, larger original content results in larger merged content from all the chunked prompt LLM responses, to be sent to the LLM for final summarization, exacerbating the issue and making the approach counterproductive and self-defeating.

1. **Split Sizes Remain Speculative**: As demonstrated in this code (see function `calculateSplitChunkSizeChars()`), even if all the other concerns could be addressed, there is still a significant level of estimation involved in calculating the chunk size to be within LLM token limits. Without magically knowing the completion response in advance, and hence the response's token size, accurately gauging tokens available to reserve for the chunk prompt, relative to the known LLM token size limit, is guesswork. 

This project failed to prove its 'transparent split-merge' goal was possible. Of course, proof of impossibility is challenging to achieve, so there could still be a solution out there. However, given the challenges raised, it is probably prudent to move forward with one or both of the alternative approaches for such situations:

1. **Use an LLM that supports a larger context window**. Google's recent Gemini 1.5 LLM release is said to handle around 1 million tokens, offering capabilities akin to GPT4 but for significantly larger files. This contrasts with the 8k token limit LLM used in our tests, suggesting that Gemini 1.5 could theoretically process a Java file up to 128 times larger.

1. **Engineer solutions that explicitly break down the problem**. Instead of handling large files in one go, opt for approaches that explicitly break down file processing into different responsibilities. For example, a separate project took a large codebase, decomposing it into individual files before processing each file independently with an LLM and storing the results of each in a database for future retrieval and summarization. A similar approach could be taken to decompose each file further, albeit some of the engineering work outlined in challenge #2 above would still apply. Alternatively, evolving GenAI tooling like LangChain appears to include [the ability to decompose code files](https://python.langchain.com/docs/modules/data_connection/document_transformers/code_splitter) into components. In this case, you could not retain the original prompt template for processing a single Java class file. Instead, you would be required to construct new prompts targeted at summarising specifically identified components. 


## Prerequisites

1. Ensure you have the following software installed on your workstation:

    - [Node.js JavaScript runtime](https://nodejs.dev/en/download/package-manager/)
    - [`npm` package manager CLI](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)

1. Ensure you have an OpenAI or Azure OpenAI API and set of models accessible with the following model type available to use, along with appropriate API keys / credentials:

    -  __Text completions model with an 8k token limit__ for generating text and JSON summaries for dealing with small content (e.g. `gpt-4`)
    
1. In a terminal on your workstation, from the root folder of this project, run the following command to copy an example environment configuration file to a new file into the same root folder called `.env`, and then edit the values for the properties shown in this new `.env` file to reflect your specific environment settings:

    ```console
    cp 'EXAMPLE.env' '.env'
    ```


## How To Run

1. Execute the application from a terminal (shown below) or your IDE (e.g., VS Code, optionally with the debugger). 

    ```console
    node ./src/prompt-llm-split-merge.js
    ```
