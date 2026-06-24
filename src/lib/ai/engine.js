const API_KEYS = [
  (typeof process !== 'undefined' && process.env.VITE_GROQ_API_KEY) || 
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GROQ_API_KEY)
].filter(Boolean);

const MODELS = {
  FAST: "llama-3.1-8b-instant", 
  SMART: "llama-3.3-70b-versatile",
  LATEST: "llama-3.1-8b-instant"
};

const DEFAULT_CONFIG = {
  temperature: 0.1,
  topP: 0.95,
  maxOutputTokens: 2048,
};

// -----------------------------
// CORE RUNNER (WITH PROGRESSIVE ESCALATION)
// -----------------------------
export async function runWithFallback(prompt, useSmart = false, history = [], tools = null, image = null, useJson = true) {
  if (image) {
      console.warn("[AI Engine] Vision models are currently unsupported on Groq.");
      return useJson ? { error: "Vision (OCR) features are not supported with the current AI provider.", confidence: 0 } : "Vision unsupported.";
  }

  const modelQueue = useSmart ? [MODELS.SMART, MODELS.LATEST, MODELS.FAST] : [MODELS.FAST, MODELS.LATEST, MODELS.SMART];
  
  for (const model of modelQueue) {
    try {
      return await chatWithModel(model, prompt, history, useJson, 0);
    } catch (err) {
      console.warn(`[AI Engine] ${model} failed. Trying next... Error: ${err.message}`);
      continue;
    }
  }
  throw new Error("All AI models and fallbacks failed. Check API Key quota.");
}

async function chatWithModel(model, prompt, history = [], useJson = true, keyIndex = 0) {
    if (keyIndex >= API_KEYS.length) {
        throw new Error("All keys exhausted for " + model);
    }

    const currentKey = API_KEYS[keyIndex];
    const url = `https://api.groq.com/openai/v1/chat/completions`;
    
    const TIMEOUT_MS = 8000; // 8-second hard timeout per model attempt
    
    try {
        const messages = [...history];
        messages.push({ role: 'user', content: prompt });

        const body = {
            model: model,
            messages: messages,
            temperature: DEFAULT_CONFIG.temperature,
            max_tokens: DEFAULT_CONFIG.maxOutputTokens,
            top_p: DEFAULT_CONFIG.topP
        };

        if (useJson) {
            body.response_format = { type: "json_object" };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentKey}`
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json();
        
        if (data.error) {
            if (data.error.code === 'invalid_api_key' || data.error.code === 'insufficient_quota') {
                return chatWithModel(model, prompt, history, useJson, keyIndex + 1);
            }
            throw new Error(`${data.error.type}: ${data.error.message}`);
        }

        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error("Empty Response");
        return useJson ? safeJSONParse(text) : text;
    } catch (err) {
        throw err;
    }
}

function safeJSONParse(text) {
  try {
    let cleanText = text.trim();
    if (cleanText.includes('```')) {
      const matches = cleanText.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
      if (matches && matches[1]) cleanText = matches[1].trim();
    }
    return JSON.parse(cleanText);
  } catch (err) {
    console.error("[AI Engine] JSON Parse Error:", err, "Raw Text:", text);
    return { error: "Parse failure", confidence: 0 };
  }
}

// -----------------------------
// TASK DISPATCHER
// -----------------------------
export async function runAI(task, input, history = [], tools = null) {
  switch (task) {
    case 'autofill':
      return runAutofill(input, history, tools);
    case 'research':
      return runResearch(input, history, tools);
    case 'ocr':
      return runOCR(input, history);
    case 'bill_ocr':
      return runBillOCR(input, history);
    default:
      throw new Error(`Unknown AI task: ${task}`);
  }
}

async function runBillOCR(input, history) {
  const prompt = `
    TASK: Extract structured data from this Supplier Bill/Invoice.
    Return ONLY JSON: { 
      supplier_name: string, 
      uen: string, 
      invoice_no: string, 
      invoice_date: string (YYYY-MM-DD), 
      currency: string (e.g. SGD, USD),
      subtotal: number, 
      gst_amount: number, 
      total_amount: number, 
      items: [{ description: string, quantity: number, unit_price: number, amount: number }] 
    }.
  `;
  return runWithFallback(prompt, false, history, null, input.image);
}

async function runAutofill(input, history, tools) {
  if (input.prompt) {
    return runWithFallback(input.prompt, input.useSmart || false, history, tools);
  }
  
  const isVerification = input.isVerification;
    const prompt = `
    TASK: ${isVerification ? 'DEEP VERIFY & COMPLETE' : 'EXTRACT'} structured business data.
    ENTITY: ${input.companyName}
    WEBSITE: ${input.website || 'Search for official site'}
    CONTEXT: ${input.searchContext}
    
    GUIDELINES:
    1. UEN: Look for Singapore Unique Entity Number (UEN). This is CRITICAL. It usually looks like '201436227C' or 'T14LP0001B'. Prioritize data from uen.sg or ACRA.
    2. CATEGORIZATION: Select 1-5 most relevant categories from: [Principal, International Supplier, Local Supplier, Freelancer, Service Company, Spare Parts, Service, Calibration, Automation, Electrical, Mechanical, Instrumentation, Safety Equipment, Industrial Supplies, Supplier, Customer].
    3. ACTIVITY: Summarize the core business scope in 1-2 professional sentences. Mention key brands or specialized services.
    4. ACCURACY: If UEN is found on an official source, confidence should be 95-100%. If only found on directory sites, 70-85%. If guessed, set < 50%.
    
    RETURN ONLY JSON:
    { 
      "uen": "string", 
      "company_name": "string",
      "address": "string",
      "postal_code": "string",
      "city": "string",
      "country": "Singapore",
      "email": "string", 
      "phone": "string",
      "website": "string",
      "brands": "comma-separated strings",
      "categories": ["array of strings"],
      "activity_summary": "string",
      "confidence": number
    }
  `;
  return runWithFallback(prompt, isVerification, history, tools);
}

async function runResearch(input, history, tools) {
  const query = typeof input === 'string' ? input : (input.query || JSON.stringify(input));
  const prompt = `Research query: ${query}. Provide a detailed raw text summary. Use tools if available.`;
  return runWithFallback(prompt, false, history, tools, null, false);
}

async function runOCR(input, history) {
  const prompt = `Extract JSON from business card image.`;
  return runWithFallback(prompt, false, history, null, input.image);
}
