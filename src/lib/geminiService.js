import { runAI } from './ai/engine.js';

/**
 * Sends a message to Gemini with optional image data and tools.
 * Redirects to the centralized AI engine.
 */
export async function chatWithGemini(prompt, base64Image = null, history = [], tools = null) {
    // If it's just a text chat, we can use a generic "research" or custom task.
    // For now, we'll implement a raw runner in engine.js or just use fetch here but with engine's config.
    // To keep it simple, we'll use runAI with a custom prompt if needed.
    
    // For image identification, we use a specific prompt
    if (base64Image) {
        return runAI('autofill', { prompt, image: base64Image }, history, tools);
    }
    
    return runAI('research', prompt, history, tools);
}

/**
 * LLM Query Cleaner: Normalizes company names and addresses for better search accuracy.
 * Strips legal noise, corrects typos, and extracts core entity names.
 */
export async function cleanSearchQuery(rawInput, type = 'company') {
    const prompt = `
        ACT AS A DATA NORMALIZATION EXPERT.
        Clean the following ${type} input for high-precision search indexing.
        Input: "${rawInput}"
        
        Rules:
        1. Correct obvious typos.
        2. For companies: Strip legal suffixes (Pte Ltd, LLC, Corp) unless they are part of the core brand identity.
        3. For addresses: Format into standard "Street, Building, Unit, City, Country" if possible.
        4. Return ONLY a valid JSON object: {"cleaned": "string", "original": "string", "confidence": number}
    `;

    try {
        const response = await runAI('autofill', { prompt });
        return response.cleaned || rawInput;
    } catch (err) {
        console.error('Query Cleaner Error:', err);
        return rawInput;
    }
}

/**
 * Image-to-Terms Extraction: Uses Gemini to turn a photo into a search query.
 */
export async function extractTermsFromImage(base64Image) {
    const data = await runAI('autofill', { 
        task: 'Extract search terms from image',
        image: base64Image 
    });
    return data.raw || data.query || data.vessel_name || "";
}

/**
 * Smart Search Company Auto-fill: Multi-Stage Orchestrator
 */
/**
 * Smart Search Company Auto-fill: 3-Stage Pipeline
 */
export async function smartSearchCompany(companyName, website = '', searchContext = '') {
    try {
        // STAGE 1: Raw Research
        console.log('[AI Stage 1] Researching...');
        const researchSummary = await runAI('research', { 
            query: `Find official Singapore UEN (Unique Entity Number), ACRA registration details, headquarters address, primary email, phone, and brands for the business: ${companyName}. 
            Try searching on uen.sg, opencorpdata.com, or official ACRA records. 
            Website: ${website}. ${searchContext ? 'Context: ' + searchContext : ''}`,
            useTools: false 
        });

        // STAGE 2: Extraction (Strict JSON)
        console.log('[AI Stage 2] Extracting structured data...');
        const extractData = await runAI('autofill', { 
            companyName, 
            website, 
            searchContext: typeof researchSummary === 'string' ? researchSummary : JSON.stringify(researchSummary)
        }, [], null); // No tools needed here, just extraction
        
        // STAGE 3: Deep Verification (If needed)
        const confidence = extractData.confidence || 0;
        if (confidence < 85 || !extractData.uen) {
            console.log('[AI Stage 3] Deep Verifying and finding missing links...');
            const verifyData = await runAI('autofill', { 
                isVerification: true, 
                extractedData: extractData, 
                searchContext: typeof researchSummary === 'string' ? researchSummary : JSON.stringify(researchSummary)
            });
            
            const merged = { ...extractData, ...verifyData };
            // Ensure we don't lose data from stage 2 if stage 3 returned less
            Object.keys(extractData).forEach(key => {
                if (!merged[key] && extractData[key]) merged[key] = extractData[key];
            });

            return formatResult(merged, companyName, website);
        }

        return formatResult(extractData, companyName, website);
    } catch (err) {
        console.warn('Smart Search Pipeline failed:', err);
        return {
            company_name: companyName,
            confidence: 0,
            manual_verification_required: true
        };
    }
}

function formatResult(data, companyName, website) {
    const cleanValue = (val) => (val === '-' || val === 'null' || !val) ? '' : val;
    return {
        company_name: data.company_name || companyName,
        website: data.website || website || data.website,
        uen: cleanValue(data.uen),
        email: cleanValue(data.email),
        phone: cleanValue(data.phone),
        country: data.country || "Singapore",
        city: cleanValue(data.city),
        postal_code: cleanValue(data.postal_code),
        address: cleanValue(data.address),
        categories: data.categories || ["Supplier"],
        brands: cleanValue(data.brands),
        activity_summary: cleanValue(data.activity_summary),
        confidence: data.confidence || 50,
        manual_verification_required: data.manual_verification_required ?? true
    };
}

/**
 * Intelligent Company Research: Redirects to smartSearchCompany
 */
export async function researchCompanyWithGemini(companyName, searchContext = '') {
    const data = await smartSearchCompany(companyName, '', searchContext);
    return {
        fields: {
            uen: data.uen || '',
            address: data.address || '',
            country: data.country || '',
            city: data.city || '',
            pincode: data.postal_code || '',
            email1: data.email || '',
            phone1: data.phone || '',
            weblink: data.website || ''
        },
        extraInfo: `Categories: ${data.categories?.join(', ') || ''}. Confidence: ${data.confidence}.`
    };
}

/**
 * Contact Profiling: Redirects to runAI('autofill')
 */
export async function researchContactWithGemini(name, companyName) {
    const prompt = `
        TASK: Profile a professional contact and extract contact details.
        NAME: ${name}
        COMPANY: ${companyName}
        
        Return ONLY a JSON object:
        {
          "post": "string (Job Title)",
          "email": "string",
          "phone": "string",
          "mobile": "string",
          "address": "string"
        }
    `;

    try {
        const data = await runAI('autofill', { prompt });
        return {
            fields: {
                post: data.post || data.designation || '',
                email: data.email || '',
                phone: data.phone || '',
                handphone: data.mobile || '',
                address: data.address || ''
            }
        };
    } catch (err) {
        console.error('Gemini Contact Error:', err);
        throw new Error('Failed to profile contact via AI.');
    }
}

/**
 * Vessel Intelligence: Redirects to runAI('autofill')
 */
export async function researchVesselWithGemini(vesselName, imoNumber = '', mmsi = '', searchContext = '') {
    const prompt = `
        TASK: Extract high-precision vessel identifiers and ownership data.
        VESSEL: ${vesselName || ''} ${imoNumber || ''} ${mmsi || ''}
        CONTEXT: ${searchContext}
        
        Rules:
        1. IMO: Must be 7 digits (e.g. 9709984).
        2. MMSI: Must be 9 digits (e.g. 419001087).
        3. VESSEL_TYPE: e.g. Oil Tanker, Bulk Carrier, Chemical Tanker.
        4. MANAGEMENT/OWNER: Find the registered owner or manager (e.g. Great Eastern Shipping).
        5. DO NOT return the string "null", "unknown", or "-" if not found. Leave the field empty "" instead.
        
        Return ONLY a JSON object:
        {
          "vessel_name": "string",
          "imo_number": "string",
          "mmsi": "string",
          "vessel_type": "string",
          "vessel_management": "string",
          "vessel_owner": "string",
          "confidence": "high|medium|low"
        }
    `;

    try {
        const data = await runAI('autofill', { prompt });
        
        const clean = (val) => (val && val !== 'null' && val !== 'undefined' && val !== 'unknown') ? val : '';

        return {
            fields: {
                vessel_name: clean(data.vessel_name) || vesselName,
                imo_number: clean(data.imo_number) || imoNumber || '',
                mmsi: clean(data.mmsi) || mmsi || '',
                vessel_type: clean(data.vessel_type) || '',
                vessel_management: clean(data.vessel_management) || '',
                vessel_owner: clean(data.vessel_owner) || ''
            },
            confidence: data.confidence || 'medium',
            manual_verification_required: data.manual_verification_required ?? true
        };
    } catch (err) {
        console.error('Gemini Vessel Error:', err);
        return {
            fields: {
                vessel_name: vesselName,
                imo_number: imoNumber || '',
                mmsi: mmsi || '',
                vessel_type: '',
                vessel_management: '',
                vessel_owner: ''
            },
            confidence: 'none',
            error: err.message || 'AI Research temporarily unavailable'
        };
    }
}


/**
 * Real-time Exchange Rate: Uses Gemini + Google Search to find current currency rates.
 */
export async function getExchangeRateWithGemini(fromCurrency, toCurrency = 'SGD') {
    // 1. Try fetching from a real-time ExchangeRate API first
    try {
        console.log(`[FX API] Fetching real-time rates for ${fromCurrency}...`);
        const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`);
        if (response.ok) {
            const data = await response.json();
            const rate = data.rates?.[toCurrency];
            if (rate) {
                console.log(`[FX API] Successfully fetched rate: 1 ${fromCurrency} = ${rate} ${toCurrency}`);
                return {
                    rate: parseFloat(rate.toFixed(4)),
                    source: 'Real-time ExchangeRate API'
                };
            }
        }
    } catch (apiErr) {
        console.warn('[FX API] Direct fetch failed, falling back to AI Research:', apiErr);
    }
    const prompt = `Find the current exchange rate for 1 ${fromCurrency} to ${toCurrency} for today ${new Date().toLocaleDateString()}. 
    Return ONLY a JSON object with the "rate" (number) and "source" (string). Example: {"rate": 1.36, "source": "Google Search"}`;
    
    try {
        const data = await runAI('research', prompt);
        // Sometimes Gemini returns a string instead of parsed JSON if the engine doesn't auto-parse research tasks
        if (typeof data === 'string') {
            const match = data.match(/\{.*\}/s);
            if (match) return JSON.parse(match[0]);
        }
        return {
            rate: data.rate || 1,
            source: data.source || 'AI Estimate'
        };
    } catch (err) {
        console.error('Gemini FX Error:', err);
        return { rate: 1, error: 'Failed to fetch rate' };
    }
}

/**
 * Natural Language to Filters: Converts a user query into structured filters for lists.
 */
export async function translateQueryToFilters(query, context = {}) {
    const { partners = [], departments = [], categories = [] } = context;
    
    const prompt = `
        Convert this user query into search filters for a Contact Directory.
        Query: "${query}"
        
        Available Partners: ${JSON.stringify(partners.slice(0, 200).map(p => ({ id: p.id, name: p.name })))}
        Available Departments: ${JSON.stringify(departments)}
        Available Categories: ${JSON.stringify(categories)}
        
        Return ONLY a valid JSON object with these fields:
        {
          "searchTerm": "string or empty",
          "partnerId": "string ID from available partners or empty",
          "department": "string from available departments or empty",
          "type": "string from available categories or empty"
        }
        
        Rules:
        1. If they mention a company, try to match it to a partnerId.
        2. If they mention a role or category (e.g. Sales, Technical), match to department or type.
        3. Use searchTerm for any remaining descriptive words.
    `;

    try {
        const response = await runAI('filter', prompt);
        // engine.js runFilterTask returns runWithFallback which auto-parses JSON
        if (response && (response.searchTerm !== undefined || response.partnerId)) {
            return response;
        }
        
        let text = typeof response === 'string' ? response : response.raw || JSON.stringify(response);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return {};
    } catch (err) {
        console.error('Gemini Filter Translation Error:', err);
        return {};
    }
}
/**
 * Business Card OCR Parsing: Converts raw OCR text into structured contact details.
 */
export async function parseOCRBusinessCard(text) {
    const prompt = `
        Analyze this raw OCR text from a business card (front and/or back).
        Extract structured contact information.
        Text: "${text}"
        
        Return ONLY a JSON object with these fields (use empty string if not found):
        {
          "company_name": "string",
          "person_name": "string",
          "designation": "string",
          "email": "string",
          "phone": "string",
          "mobile": "string",
          "address": "string",
          "website": "string",
          "services": "string (comma separated list of services/activities mentioned)",
          "brands": "string (comma separated list of brands mentioned)"
        }
    `;

    try {
        const response = await runAI('autofill', { prompt });
        return response;
    } catch (err) {
        console.error('OCR Parsing Error:', err);
        return null;
    }
}
/**
 * Image to Items Extraction: Converts raw OCR text into structured line items for documents.
 */
export async function extractLineItemsFromImage(text) {
    const prompt = `
        Analyze this raw OCR text which contains a list of items (likely from an invoice, quotation, or packing list).
        Extract a structured array of line items.
        Text: "${text}"
        
        Return ONLY a JSON array of objects with these fields:
        [
          {
            "name": "string (main item name)",
            "specification": "string (technical details/specs)",
            "quantity": number,
            "uom": "string (unit of measure e.g. PCS, SET, KG)",
            "unit_price": number (if found, else 0),
            "total_amount": number (if found, else 0)
          }
        ]
        
        Rules:
        1. Try to separate Name from Specification.
        2. Clean up any OCR artifacts.
        3. If quantity is missing, default to 1.
    `;

    try {
        const response = await runAI('autofill', { prompt });
        return Array.isArray(response) ? response : [];
    } catch (err) {
        console.error('Line Item Extraction Error:', err);
        return [];
    }
}


export async function researchLocationPincodeWithGemini(locationName) {
    const prompt = `Find the exact postal code (pincode or zip code) for the following location: ${locationName}. 
    Return ONLY a JSON object with a single field 'pincode'. If you cannot find it, return an empty string. Example: {"pincode": "208787"}`;
    try {
        const { runAI } = await import('./ai/engine.js');
        const data = await runAI('autofill', { prompt });
        return { pincode: data.pincode || '' };
    } catch (err) {
        console.error('Gemini Pincode Error:', err);
        return { pincode: '' };
    }
}

export async function extractDualPartnerContact(text) {
    const prompt = `
        Analyze this text (likely from an email signature or business card OCR).
        Extract structured data for BOTH a Company (Partner) and a Contact Person.
        
        Text: "${text}"
        
        Return ONLY a JSON object with these fields:
        {
          "partner": {
            "name": "string (Company Name)",
            "uen": "string",
            "address": "string",
            "country": "string",
            "city": "string",
            "pincode": "string",
            "email": "string (General company email if found, else empty)",
            "phone": "string (General company phone if found, else empty)",
            "website": "string"
          },
          "contact": {
            "name": "string (Person Name)",
            "email": "string (Person's email)",
            "handphone": "string (Mobile/Cell)",
            "phone": "string (Office phone)",
            "post": "string (Designation/Title)",
            "department": "string"
          }
        }
        
        Rules:
        1. If a piece of info is a personal mobile, put it in contact.handphone.
        2. If it's a general office line, put it in partner.phone.
        3. If the company name is present, ensure it's in partner.name.
        4. Do NOT use placeholder values like "N/A" or "Unknown". Use empty string "".
    `;

    try {
        const response = await runAI('autofill', { prompt });
        return response;
    } catch (err) {
        console.error('Dual Extraction Error:', err);
        return null;
    }
}

/**
 * Bulk Email Signature / List Parser: Converts raw text dumps of To/Cc fields or signatures into structured contacts and domains.
 */
export async function parseBulkEmails(text) {
    const prompt = `
        Analyze this text containing a list of email addresses, names, or general contact blocks (e.g., from an email's To/Cc field, email signatures, or directory lists).
        Text: "${text}"
        
        Extract a list of contacts. For each contact, determine:
        1. Person's full name (if they only have a squashed handle or first name like "HussianShah", guess/convert to formatted name like "Hussian Shah". Capitalize correctly).
        2. Email address.
        3. Company name: Extract the domain from the email (excluding generic domains like gmail, yahoo, hotmail, outlook, live, icloud, ymail, etc.) and turn it into a readable, capitalized company name (e.g., "ttsalvage.com" -> "TT Salvage", "prakritimarine.com" -> "Prakriti Marine"). If it is a generic email domain (like gmail, yahoo, outlook), set company name as "Individual".
        4. Email domain (e.g. "ttsalvage.com").
        
        Return ONLY a JSON object with this exact structure:
        {
          "contacts": [
            {
              "name": "string",
              "email": "string",
              "companyName": "string",
              "domain": "string"
            }
          ]
        }
        
        Rules:
        - Do NOT include duplicate emails.
        - Ensure names are capitalized correctly.
        - If a name is missing, try to generate a readable name from the email handle (e.g., "Mansari" -> "M Ansari" or "Mansari").
    `;

    try {
        const response = await runAI('autofill', { prompt });
        return response?.contacts || [];
    } catch (err) {
        console.error('Bulk Email Parsing Error:', err);
        return [];
    }
}

/**
 * Intelligent Enquiry Document Parser: Extracts both header metadata and line items from an enquiry/RFQ document's OCR text.
 */
export async function extractEnquiryDocument(text) {
    const prompt = `
        Analyze this raw OCR text extracted from a purchase enquiry, RFQ, or quotation document.
        Extract the complete structured information including the header metadata and the line items.
        
        Text: "${text}"
        
        Return ONLY a JSON object with this exact schema:
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
        const response = await runAI('autofill', { prompt });
        return response;
    } catch (err) {
        console.error('Enquiry Document Extraction Error:', err);
        return null;
    }
}


