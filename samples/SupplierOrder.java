/*
 * Copyright 2003 Sun Microsystems, Inc. All Rights Reserved.
 * 
 * All Java Pet Store graphics and images are distributed under licenses restricting their use,
 * copying, distribution, and decompilation. Java Pet Store graphics and images may not be
 * reproduced in any form, in whole or in part, by any means without prior written authorization
 * of Sun and its licensors, if any.
 * 
 * Java Pet Store Software 1.3.2: Copyright 2003 Sun Microsystems, Inc. All Rights Reserved.
 * 
 * Redistribution and use in source and binary forms, with or without modification, are permitted 
 * provided that the following conditions are met: -Redistributions of source code must retain the
 * above copyright notice, this list of conditions and the following disclaimer. -Redistribution in
 * binary form must reproduce the above copyright notice, this list of conditions and the following
 * disclaimer in the documentation and/or other materials provided with the distribution. Neither
 * the name of Sun Microsystems, Inc., 'Java Pet Store', 'Java', 'Java'-based names, nor the names
 * of contributors may be used to endorse or promote products derived from this software without
 * specific prior written permission. This software is provided "AS IS," without a warranty of any
 * kind. ALL EXPRESS OR IMPLIED CONDITIONS, REPRESENTATIONS AND WARRANTIES, INCLUDING ANY IMPLIED
 * WARRANTY OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE OR NON-INFRINGEMENT, ARE HEREBY
 * EXCLUDED. SUN AND ITS LICENSORS SHALL NOT BE LIABLE FOR ANY DAMAGES OR LIABILITIES SUFFERED BY
 * LICENSEE AS A RESULT OF OR RELATING TO USE, MODIFICATION OR DISTRIBUTION OF THE SOFTWARE OR ITS
 * DERIVATIVES. IN NO EVENT WILL SUN OR ITS LICENSORS BE LIABLE FOR ANY LOST REVENUE, PROFIT OR
 * DATA, OR FOR DIRECT, INDIRECT, SPECIAL, CONSEQUENTIAL, INCIDENTAL OR PUNITIVE DAMAGES, HOWEVER
 * CAUSED AND REGARDLESS OF THE THEORY OF LIABILITY, ARISING OUT OF THE USE OF OR INABILITY TO USE
 * SOFTWARE, EVEN IF SUN HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. You acknowledge that
 * Software is not designed, licensed or intended for use in the design, construction, operation
 * or maintenance of any nuclear facility.
 */
package com.sun.j2ee.blueprints.supplierpo.ejb;

import org.w3c.dom.*;
import org.xml.sax.*;
import org.xml.sax.helpers.*;
import java.io.*;
import java.util.*;
import java.net.URL;
import java.text.SimpleDateFormat;
import javax.xml.parsers.*;
import javax.xml.transform.*;
import javax.xml.transform.sax.*;
import javax.xml.transform.stream.*;

import com.sun.j2ee.blueprints.xmldocuments.*;
import com.sun.j2ee.blueprints.contactinfo.ejb.ContactInfo;
import com.sun.j2ee.blueprints.lineitem.ejb.LineItem;


public class SupplierOrder {
  public static final boolean TRACE = true;
  public static final String DTD_PUBLIC_ID = "-//Sun Microsystems, Inc. - J2EE Blueprints Group//DTD SupplierOrder 1.1//EN";
  public static final String DTD_SYSTEM_ID = "/com/sun/j2ee/blueprints/supplierpo/rsrc/schemas/SupplierOrder.dtd";
  public static final boolean VALIDATING = true;
  public static final String XML_SUPPLIERORDER = "SupplierOrder";
  public static final String XML_ORDERID = "OrderId";
  public static final String XML_ORDERDATE = "OrderDate";
  public static final String XML_SHIPPINGINFO = "ShippingInfo";
  private final SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd");
  private String orderId;
  private Date orderDate;
  private ContactInfo shippingInfo;
  private ArrayList lineItems = null;


  // Constructor to be used when creating SupplierOrder from data

  public SupplierOrder() {}
  // XML (de)serialization methods

  public void toXML(Result result) throws XMLDocumentException {
    toXML(result, null);
    return;
  }

  public String toXML() throws XMLDocumentException {
    return toXML((URL) null);
  }

  public void toXML(Result result, URL entityCatalogURL)
    throws XMLDocumentException {
      if (entityCatalogURL != null) {
        XMLDocumentUtils.toXML(toDOM(), DTD_PUBLIC_ID, entityCatalogURL,
                               XMLDocumentUtils.DEFAULT_ENCODING, result);
      } else {
        XMLDocumentUtils.toXML(toDOM(), DTD_PUBLIC_ID, DTD_SYSTEM_ID,
                               XMLDocumentUtils.DEFAULT_ENCODING, result);
      }
      return;
  }
}

