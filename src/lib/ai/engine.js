import { getEnabledProvidersInPriority, getEncryptedApiKey, getDecryptedApiKey } from './configService.js';
import { executeGeminiRequest, executeClaudeRequest, executeOpenAICompatibleRequest } from './providerRunners.js';
import { callServerAiProxy } from './serverProxyClient.js';

// -----------------------------
// CORE DYNAMIC FALLBACK ROUTER
// -----------------------------

export async function runWithFallback(prompt, useSmart = false, history = [], tools = null, image = null, useJson = true) {
    const enabledProviders = getEnabledProvidersInPriority();

    if (enabledProviders.length === 0) {
        throw new Error("No AI providers are enabled in Settings. Please enable at least one provider (e.g. Gemini, Claude) in Settings > AI Providers.");
    }

    const errors = [];
    for (const provider of enabledProviders) {
        // A personally-configured key is used directly from the browser (BYOK).
        // Otherwise the request is routed through the backend, which holds the
        // operator's own provider keys server-side only.
        const hasCustomKey = Boolean(getEncryptedApiKey(provider.name));
        const decryptedKey = hasCustomKey ? await getDecryptedApiKey(provider.name) : null;
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
                if (provider.name === 'Ollama' || hasCustomKey) {
                    // Ollama runs on the operator's own machine (no key, not proxyable);
                    // a personally-configured key is always used directly from the browser.
                    if (provider.name === 'Gemini') {
                        result = await executeGeminiRequest(provider, decryptedKey, prompt, history, useJson, image, controller.signal);
                    } else if (provider.name === 'Claude') {
                        result = await executeClaudeRequest(provider, decryptedKey, prompt, history, useJson, image, controller.signal);
                    } else {
                        result = await executeOpenAICompatibleRequest(provider, decryptedKey, prompt, history, useJson, image, controller.signal);
                    }
                } else {
                    // No personal key configured: route through the backend, which
                    // holds the operator's own provider keys server-side only.
                    result = await callServerAiProxy(provider.name.toLowerCase(), prompt, history, useJson, image, provider.modelName);
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
