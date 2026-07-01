/**
 * ============================================================
 *  Centralized AI Engine with Multi-Provider Fallback
 *  Uses Google Gemini (Best performance + Vision/OCR support)
 *  with Groq API as the high-speed backup provider.
 * ============================================================
 */

// Embedded fallback keys (sourced from environment variables)
const FALLBACK_GEMINI_KEY = "";
const FALLBACK_GROQ_KEY = "";

// Helper to extract base64 representation without data type prefix
const cleanBase64 = (base64) => {
    if (!base64) return null;
    if (base64.startsWith('data:')) {
        return base64.split(',')[1];
    }
    return base64;
};

// Helper to extract mimeType from base64 string
const getMimeType = (base64) => {
    if (base64 && base64.startsWith('data:')) {
        const m = base64.match(/data:([^;]+);/);
        if (m) return m[1];
    }
    return 'image/jpeg';
};

// -----------------------------
// PROVIDER 0: DEEPSEEK API (Primary / Text-only)
// -----------------------------
async function chatWithDeepSeekAPI(prompt, history = [], useJson = true) {
    const key = (typeof process !== 'undefined' && process.env.VITE_DEEPSEEK_API_KEY) || 
                (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEEPSEEK_API_KEY) ||
                (typeof process !== 'undefined' && process.env.DEEPSEEK_API_KEY) || 
                (typeof import.meta !== 'undefined' && import.meta.env?.DEEPSEEK_API_KEY) ||
                "";

    const url = 'https://api.deepseek.com/chat/completions';

    const messages = [];

    // Map conversation history
    history.forEach(msg => {
        messages.push({
            role: msg.role === 'model' ? 'assistant' : msg.role,
            content: msg.content
        });
    });

    messages.push({
        role: 'user',
        content: prompt
    });

    const body = {
        model: 'deepseek-chat',
        messages: messages,
        temperature: 0.1,
        max_tokens: 2048
    };

    if (useJson) {
        body.response_format = { type: 'json_object' };
    }

    const TIMEOUT_MS = 15000; // 15-second timeout for DeepSeek
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `DeepSeek API error: Status ${response.status}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error("Empty completion returned from DeepSeek API");

        return useJson ? safeJSONParse(text) : text;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

// -----------------------------
// PROVIDER 1: GOOGLE GEMINI API (Primary / Best Performance)
// -----------------------------
async function chatWithGeminiAPI(prompt, history = [], useJson = true, image = null) {
    const key = (typeof process !== 'undefined' && process.env.VITE_GEMINI_API_KEY) || 
                (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) || 
                FALLBACK_GEMINI_KEY;

    // Use gemini-2.5-flash as the best performing general & vision model
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

    const contents = [];

    // Map conversation history
    history.forEach(msg => {
        let role = msg.role;
        if (role === 'assistant') role = 'model';
        if (role === 'system') return; // Handled separately in systemInstruction
        
        contents.push({
            role: role,
            parts: [{ text: msg.content }]
        });
    });

    // Add active prompt parts
    const activeParts = [{ text: prompt }];
    if (image) {
        activeParts.push({
            inlineData: {
                mimeType: getMimeType(image),
                data: cleanBase64(image)
            }
        });
    }

    contents.push({
        role: 'user',
        parts: activeParts
    });

    const body = {
        contents: contents,
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048
        }
    };

    // Include system instruction if present in history
    const systemMsg = history.find(msg => msg.role === 'system');
    if (systemMsg) {
        body.systemInstruction = {
            parts: [{ text: systemMsg.content }]
        };
    }

    if (useJson) {
        body.generationConfig.responseMimeType = "application/json";
    }

    const TIMEOUT_MS = 12000; // 12-second timeout for Gemini API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `Gemini API error: Status ${response.status}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Empty candidate content returned from Gemini API");

        return useJson ? safeJSONParse(text) : text;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

// -----------------------------
// PROVIDER 2: GROQ API (Backup)
// -----------------------------
async function chatWithGroqAPI(model, prompt, history = [], useJson = true) {
    const key = (typeof process !== 'undefined' && process.env.VITE_GROQ_API_KEY) || 
                (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GROQ_API_KEY) || 
                FALLBACK_GROQ_KEY;

    const url = `https://api.groq.com/openai/v1/chat/completions`;

    const messages = [...history];
    messages.push({ role: 'user', content: prompt });

    const body = {
        model: model,
        messages: messages,
        temperature: 0.1,
        max_tokens: 2048,
        top_p: 0.95
    };

    if (useJson) {
        body.response_format = { type: "json_object" };
    }

    const TIMEOUT_MS = 8000; // 8-second timeout for Groq
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `Groq API error: Status ${response.status}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error("Empty completion returned from Groq API");

        return useJson ? safeJSONParse(text) : text;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

// -----------------------------
// CORE RUNNER (WITH AUTOMATIC PROVIDER ESCALATION)
// -----------------------------
export async function runWithFallback(prompt, useSmart = false, history = [], tools = null, image = null, useJson = true) {
    // If an image is provided, route directly to Gemini as DeepSeek V3 does not support vision
    if (image) {
        console.log("[AI Engine] Vision payload detected. Routing primary request to Gemini API...");
        try {
            return await chatWithGeminiAPI(prompt, history, useJson, image);
        } catch (geminiErr) {
            console.warn(`[AI Engine] Gemini API failed for vision task (Error: ${geminiErr.message}). Escalating to Groq backup (text-only)...`);
            const groqModel = useSmart ? "llama-3.3-70b-versatile" : "llama-3.1-8b-instant";
            try {
                return await chatWithGroqAPI(groqModel, prompt, history, useJson);
            } catch (groqErr) {
                console.error("[AI Engine] Groq API also failed for vision fallback.");
                throw new Error(`AI Engines failed for vision. Gemini: ${geminiErr.message}. Groq: ${groqErr.message}`);
            }
        }
    }

    // 1. Try DeepSeek API first (Primary Text Provider)
    try {
        console.log("[AI Engine] Executing primary request via DeepSeek API...");
        return await chatWithDeepSeekAPI(prompt, history, useJson);
    } catch (deepseekErr) {
        console.warn(`[AI Engine] DeepSeek API failed (Error: ${deepseekErr.message}). Escalating to Gemini backup...`);

        // 2. Try Gemini API as backup
        try {
            console.log("[AI Engine] Executing backup request via Gemini API...");
            return await chatWithGeminiAPI(prompt, history, useJson, null);
        } catch (geminiErr) {
            console.warn(`[AI Engine] Gemini backup failed (Error: ${geminiErr.message}). Escalating to Groq backup...`);

            // 3. Try Groq API as final backup
            const groqModel = useSmart ? "llama-3.3-70b-versatile" : "llama-3.1-8b-instant";
            try {
                console.log(`[AI Engine] Executing final backup request via Groq API (${groqModel})...`);
                return await chatWithGroqAPI(groqModel, prompt, history, useJson);
            } catch (groqErr) {
                console.error("[AI Engine] Groq API also failed. All providers exhausted.");
                throw new Error(`AI Engines failed. DeepSeek: ${deepseekErr.message}. Gemini: ${geminiErr.message}. Groq: ${groqErr.message}`);
            }
        }
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
