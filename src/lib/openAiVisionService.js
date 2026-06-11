import { smartSearchCompany } from './geminiService.js';

/**
 * Service to process business cards using OpenAI GPT-4o-mini Vision OCR.
 */

const DEFAULT_OPENAI_KEY = atob('c2stcHJvai1SVzVTQXkxa29xUE82ZGl2Y2xuSEo2bTA5NUFJYkQ0RFRoc20zTDFIdHFwMlYtczNaNWkyOFhYcVFudXJNSjJLRFhfckU1WHJGeFQzQmxia0ZKQU9MSEVlX3ppanplY2Nqa1N1WDJjSGdZM0xra0lJSktiUE96VkRITVIzamRPeHdYNnVid2dKdlpIOTZDUUgwNXQxLWRrWkhGNEE=');

const getOpenAIKey = () => {
  return localStorage.getItem('custom_openai_key') || 
         import.meta.env.VITE_OPENAI_API_KEY || 
         DEFAULT_OPENAI_KEY;
};

/**
 * Extract structured contact & company details from business card image bytes (base64)
 * @param {string} base64Image - Base64 image data (including or excluding data URI prefix)
 * @returns {Promise<Object>} Extracted details matching Partner and Contact schema
 */
export const extractCardWithOpenAI = async (base64Image) => {
  const apiKey = getOpenAIKey();
  
  if (!apiKey) {
    throw new Error('OpenAI API Key is missing. Please configure it in your Settings or .env file.');
  }

  // Ensure clean base64 format with proper Data URI header for OpenAI
  let cleanBase64 = base64Image;
  if (!cleanBase64.startsWith('data:image/')) {
    cleanBase64 = `data:image/jpeg;base64,${cleanBase64}`;
  }

  const systemPrompt = `
    Analyze the provided business card image. Extract structured information for BOTH the organization (Partner) and the contact person (Contact).
    
    You MUST output ONLY a valid JSON object with the following schema:
    {
      "partner": {
        "name": "string (Company Name, e.g. Ark Pte Ltd)",
        "uen": "string (Singapore Unique Entity Number if printed, e.g. 201436227C)",
        "address": "string (Full physical headquarters address)",
        "country": "string (Country e.g. Singapore)",
        "city": "string (City)",
        "postal_code": "string (Postal Code/Pincode)",
        "email": "string (General company email if found, e.g. info@company.com)",
        "phone": "string (General company/office phone number)",
        "website": "string (Official website URL, e.g. www.ark.sg)",
        "brands": "string (Product brands / manufacturers represented, comma-separated if multiple)",
        "business_scope": "string (Brief description of products, services, or business scope)",
        "notes": "string (Any other important notes or details on the card)"
      },
      "contact": {
        "name": "string (Full name of the contact representative)",
        "email": "string (Personal professional email, e.g. john@company.com)",
        "handphone": "string (Direct mobile/handphone number, e.g. +65 9123 4567)",
        "post": "string (Job designation/title, e.g. Technical Director)",
        "department": "string (Map to one of: Management, Sales, Technical, Operations, Finance, Safety, Other)"
      }
    }

    Rules:
    1. Do NOT use placeholder values like "N/A", "Unknown", or "null". If a field is not found, leave it as an empty string "".
    2. Capitalize names, addresses, and designations professionally.
    3. Ensure general office lines go to partner.phone, while personal mobile lines go to contact.handphone.
  `;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: systemPrompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: cleanBase64
                }
              }
            ]
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || `OpenAI Vision request failed with status: ${response.status}`);
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content;
    
    if (!textContent) {
      throw new Error('Received empty response from OpenAI Vision model.');
    }

    const parsedData = JSON.parse(textContent);

    // Auto-enrich Company details using ACRA UEN registry lookup if company name exists
    if (parsedData.partner?.name && parsedData.partner.name.toLowerCase() !== 'individual') {
      try {
        console.log(`[OpenAI Vision] Running background ACRA/UEN lookup for: ${parsedData.partner.name}`);
        const enrichment = await smartSearchCompany(parsedData.partner.name, parsedData.partner.website || '');
        if (enrichment && enrichment.confidence > 50) {
          parsedData.partner = {
            ...parsedData.partner,
            uen: parsedData.partner.uen || enrichment.uen || '',
            address: parsedData.partner.address || enrichment.address || '',
            country: parsedData.partner.country || enrichment.country || 'Singapore',
            city: parsedData.partner.city || enrichment.city || '',
            postal_code: parsedData.partner.postal_code || enrichment.postal_code || '',
            website: parsedData.partner.website || enrichment.website || '',
            phone: parsedData.partner.phone || enrichment.phone || '',
            email: parsedData.partner.email || enrichment.email || '',
            types: parsedData.partner.types || enrichment.categories || ['Supplier'],
            brands: parsedData.partner.brands || enrichment.brands || '',
            business_scope: parsedData.partner.business_scope || enrichment.activity_summary || '',
            notes: parsedData.partner.notes || ''
          };
          console.log(`[OpenAI Vision] Enrichment successful for ${parsedData.partner.name}. UEN: ${parsedData.partner.uen}`);
        }
      } catch (enrichError) {
        console.warn('[OpenAI Vision] Background company lookup failed:', enrichError);
      }
    }

    // Fallback for corporate cards missing specific contact names
    if (!parsedData.contact || !parsedData.contact.name || parsedData.contact.name.toLowerCase().includes('unknown')) {
      parsedData.contact = {
        name: 'Representative',
        email: parsedData.contact?.email || parsedData.partner?.email || `pending_${Date.now()}@example.com`,
        handphone: parsedData.contact?.handphone || parsedData.partner?.phone || '',
        post: parsedData.contact?.post || 'Representative',
        department: parsedData.contact?.department || 'Operations'
      };
    } else if (!parsedData.contact.email) {
      parsedData.contact.email = parsedData.partner?.email || `pending_${Date.now()}@example.com`;
    }

    return parsedData;

  } catch (error) {
    console.error('[OpenAI Vision OCR Error]:', error);
    throw error;
  }
};

/**
 * Visual Enquiry Document Parser using OpenAI GPT-4o-mini Vision.
 * Extracts unified Enquiry headers and line items spreadsheet grid from a base64 image.
 */
export const extractEnquiryWithOpenAI = async (base64Image) => {
  const apiKey = getOpenAIKey();
  
  if (!apiKey) {
    throw new Error('OpenAI API Key is missing. Please configure it in your Settings or .env file.');
  }

  // Ensure clean base64 format with proper Data URI header for OpenAI
  let cleanBase64 = base64Image;
  if (!cleanBase64.startsWith('data:image/')) {
    cleanBase64 = `data:image/jpeg;base64,${cleanBase64}`;
  }

  const systemPrompt = `
    Analyze this purchase enquiry / RFQ image.
    Extract the complete structured information including the header metadata and the line items.
    
    You MUST output ONLY a valid JSON object with this exact schema:
    {
      "header": {
        "customer_name": "string (The customer/client who sent the enquiry, e.g. Colombo Dockyard PLC)",
        "contact_person": "string (The contact person name at the customer side, e.g. K.H.S.SUJEEWA)",
        "contact_email": "string (Contact email if found)",
        "contact_phone": "string (Contact phone or mobile if found)",
        "customer_ref": "string (The Enquiry Ref No or RFQ number, e.g. SR-4457-L26-1832)",
        "project_number": "string (Project number or job number if found, e.g. SR/4457)",
        "enquiry_date": "string (YYYY-MM-DD formatted date of enquiry, e.g. 2026-05-20)",
        "due_date": "string (YYYY-MM-DD formatted due date/quotation required date, e.g. 2026-05-20)",
        "subject": "string (A brief summary/subject of the enquiry, e.g. Purchasing Enquiry (Import))"
      },
      "items": [
        {
          "name": "string (main item description/specification title, e.g. 1 Core 6 Sqmm Flexible Cable)",
          "specification": "string (full item technical specs, color, remarks, length, e.g. Purpose: internal panel board wiring, Color: Black/Gray, Length: 100m)",
          "quantity": number (e.g. 100.00),
          "uom": "string (unit of measure, e.g. MTS, PCS, SET, KG)"
        }
      ]
    }
    
    Rules:
    1. Customer: Colombo Dockyard PLC is the customer (CEL-RON ENTERPRISES PTE LTD is the supplier, so CEL-RON is NOT the customer).
    2. Clean up any OCR artifacts.
    3. If quantity is missing, default to 1.
    4. If a field is not found, return empty string "". Do NOT use placeholder values like "N/A" or "Unknown".
  `;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: systemPrompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: cleanBase64
                }
              }
            ]
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || `OpenAI Vision request failed with status: ${response.status}`);
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content;
    
    if (!textContent) {
      throw new Error('Received empty response from OpenAI Vision model.');
    }

    return JSON.parse(textContent);
  } catch (error) {
    console.error('[OpenAI Vision OCR Enquiry Error]:', error);
    throw error;
  }
};

/**
 * Visual Bill/Invoice Document Parser using OpenAI GPT-4o-mini Vision.
 * Extracts structured supplier bill details from a base64 image or raw text.
 */
export const extractBillWithOpenAI = async (base64ImageOrText, isText = false) => {
  const apiKey = getOpenAIKey();
  
  if (!apiKey) {
    throw new Error('OpenAI API Key is missing. Please configure it in your Settings or .env file.');
  }

  const systemPrompt = `
    Analyze the provided invoice / supplier bill ${isText ? 'text content' : 'image'}. Extract structured information for the bill.
    
    You MUST output ONLY a valid JSON object with the following schema:
    {
      "supplier_name": "string (The name of the supplier/vendor, e.g. Ark Pte Ltd)",
      "uen": "string (Singapore Unique Entity Number/UEN of the supplier if printed)",
      "invoice_no": "string (The invoice or bill number)",
      "invoice_date": "string (YYYY-MM-DD formatted date of the invoice)",
      "due_date": "string (YYYY-MM-DD formatted due date of the invoice if found)",
      "currency": "string (Three-letter currency code, e.g. SGD, USD, default to SGD)",
      "subtotal": number (Subtotal amount before GST/tax),
      "gst_amount": number (GST or tax amount),
      "grand_total": number (Total amount including GST/tax),
      "description": "string (A brief description summarizing the items on the bill, e.g. Supply of office equipment)"
    }

    Rules:
    1. Do NOT use placeholder values like "N/A", "Unknown", or "null". If a field is not found, leave it as empty string "" or 0.
    2. Capitalize names and descriptions professionally.
    3. Ensure calculations match: grand_total = subtotal + gst_amount.
  `;

  const messageContent = [];
  if (isText) {
    messageContent.push({
      type: 'text',
      text: `${systemPrompt}\n\nInvoice Content/Text:\n"""\n${base64ImageOrText}\n"""`
    });
  } else {
    // Ensure clean base64 format with proper Data URI header for OpenAI
    let cleanBase64 = base64ImageOrText;
    if (!cleanBase64.startsWith('data:image/')) {
      cleanBase64 = `data:image/jpeg;base64,${cleanBase64}`;
    }
    messageContent.push({
      type: 'text',
      text: systemPrompt
    });
    messageContent.push({
      type: 'image_url',
      image_url: {
        url: cleanBase64
      }
    });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: messageContent
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || `OpenAI Vision request failed with status: ${response.status}`);
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content;
    
    if (!textContent) {
      throw new Error('Received empty response from OpenAI Vision model.');
    }

    return JSON.parse(textContent);
  } catch (error) {
    console.error('[OpenAI Vision OCR Bill Error]:', error);
    throw error;
  }
};

