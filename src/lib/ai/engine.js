import { getEnabledProvidersInPriority, getDecryptedApiKey } from './configService.js';

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
// SPECIFIC API RUNNERS
// -----------------------------

async function executeGeminiRequest(provider, apiKey, prompt, history, useJson, image, signal) {
    const url = `${provider.baseUrl}/v1beta/models/${provider.modelName}:generateContent?key=${apiKey}`;
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
            temperature: provider.temperature || 0.1,
            maxOutputTokens: provider.maxTokens || 2048
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

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Gemini API status ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty candidate content returned from Gemini API");

    return useJson ? safeJSONParse(text) : text;
}

async function executeClaudeRequest(provider, apiKey, prompt, history, useJson, image, signal) {
    const endpoint = `${provider.baseUrl.endsWith('/v1/messages') ? provider.baseUrl : provider.baseUrl + '/v1/messages'}`;
    
    // Claude system role
    const systemMsg = history.find(msg => msg.role === 'system');
    const filteredHistory = history.filter(msg => msg.role !== 'system');
    
    const messages = [];
    filteredHistory.forEach(msg => {
        messages.push({
            role: msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
        });
    });

    let contentPayload = prompt;
    if (image) {
        contentPayload = [
            {
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: getMimeType(image),
                    data: cleanBase64(image)
                }
            },
            {
                type: 'text',
                text: prompt
            }
        ];
    }

    messages.push({
        role: 'user',
        content: contentPayload
    });

    const body = {
        model: provider.modelName,
        max_tokens: provider.maxTokens || 2048,
        temperature: provider.temperature || 0.1,
        messages
    };

    if (systemMsg) {
        body.system = systemMsg.content;
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'dangerously-allow-html-user-delegation': 'true'
        },
        body: JSON.stringify(body),
        signal
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Claude status ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (!text) throw new Error("Empty response from Claude API");

    return useJson ? safeJSONParse(text) : text;
}

async function executeOpenAICompatibleRequest(provider, apiKey, prompt, history, useJson, image, signal) {
    let url = provider.baseUrl;
    // Normalize URL: ensure it ends with /v1/chat/completions
    if (url.endsWith('/chat/completions')) {
        // already correct
    } else if (url.endsWith('/v1')) {
        url = `${url}/chat/completions`;
    } else if (url.endsWith('/v1/')) {
        url = `${url}chat/completions`;
    } else {
        // baseUrl like https://api.deepseek.com or https://api.groq.com/openai
        const hasV1 = url.includes('/v1');
        url = hasV1
            ? (url.endsWith('/') ? `${url}chat/completions` : `${url}/chat/completions`)
            : (url.endsWith('/') ? `${url}v1/chat/completions` : `${url}/v1/chat/completions`);
    }

    const messages = [];
    history.forEach(msg => {
        messages.push({
            role: msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : msg.role,
            content: msg.content
        });
    });

    let userContent = prompt;
    if (image) {
        userContent = [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${getMimeType(image)};base64,${cleanBase64(image)}` } }
        ];
    }

    messages.push({
        role: 'user',
        content: userContent
    });

    const body = {
        model: provider.modelName,
        messages,
        temperature: provider.temperature || 0.1,
        max_tokens: provider.maxTokens || 2048
    };

    if (useJson) {
        body.response_format = { type: 'json_object' };
    }

    const headers = {
        'Content-Type': 'application/json'
    };
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }
    if (provider.name === 'OpenRouter') {
        headers['HTTP-Referer'] = window.location.origin;
        headers['X-Title'] = 'CelronHub';
    }

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `${provider.name} status ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error(`Empty completion from ${provider.name}`);

    return useJson ? safeJSONParse(text) : text;
}

// -----------------------------
// CORE DYNAMIC FALLBACK ROUTER
// -----------------------------

export async function runWithFallback(prompt, useSmart = false, history = [], tools = null, image = null, useJson = true) {
    const enabledProviders = getEnabledProvidersInPriority();
    
    if (enabledProviders.length === 0) {
        throw new Error("No AI providers are enabled in Settings. Please enable at least one provider (e.g. Gemini, DeepSeek, Groq) in Settings > AI Providers.");
    }

    const errors = [];
    for (const provider of enabledProviders) {
        const decryptedKey = await getDecryptedApiKey(provider.name);
        const timeoutMs = provider.timeout || 15000;
        const retryLimit = provider.retryCount || 1;

        let attempt = 0;
        let success = false;
        let result = null;

        // Vision task compatibility check: route text fallback if non-supporting model handles image
        if (image && provider.name !== 'Gemini' && provider.name !== 'OpenAI' && provider.name !== 'Claude' && provider.name !== 'OpenRouter') {
            console.warn(`[AI Engine] Provider "${provider.name}" may not support vision payloads. Skipping for image extraction task.`);
            continue;
        }

        while (attempt < retryLimit && !success) {
            attempt++;
            console.log(`[AI Engine] Attempting task via ${provider.name} (Model: ${provider.modelName}, Attempt ${attempt}/${retryLimit})...`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            try {
                if (provider.name === 'Gemini') {
                    result = await executeGeminiRequest(provider, decryptedKey, prompt, history, useJson, image, controller.signal);
                } else if (provider.name === 'Claude') {
                    result = await executeClaudeRequest(provider, decryptedKey, prompt, history, useJson, image, controller.signal);
                } else {
                    result = await executeOpenAICompatibleRequest(provider, decryptedKey, prompt, history, useJson, image, controller.signal);
                }
                success = true;
                clearTimeout(timeoutId);
            } catch (err) {
                clearTimeout(timeoutId);
                const isTimeout = err.name === 'AbortError';
                const msg = isTimeout ? `Request timed out after ${timeoutMs}ms` : err.message;
                console.warn(`[AI Engine] ${provider.name} failed: ${msg}`);
                
                if (attempt >= retryLimit) {
                    errors.push(`${provider.name} (${provider.modelName}): ${msg}`);
                }
            }
        }

        if (success) {
            return result;
        }
    }

    throw new Error(`All enabled AI providers failed to resolve the request:\n${errors.join('\n')}`);
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
