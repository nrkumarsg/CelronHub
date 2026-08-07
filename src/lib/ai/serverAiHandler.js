// Server-only — never imported by client/browser code. Resolves the operator's
// own AI provider keys from server-side env vars (never VITE_ prefixed, so
// Vite never inlines them into the browser bundle) and performs the request.
import { PROVIDER_DEFAULTS } from './providerDefaults.js';
import { executeProviderRequest } from './providerRunners.js';

function getServerApiKey(providerId) {
    const map = {
        gemini: process.env.GEMINI_API_KEY,
        claude: process.env.ANTHROPIC_API_KEY,
        deepseek: process.env.DEEPSEEK_API_KEY,
        groq: process.env.GROQ_API_KEY,
        openai: process.env.OPENAI_API_KEY
    };
    return map[providerId] || '';
}

export async function handleAiComplete(req) {
    const { provider: providerId, prompt, history = [], useJson = true, image = null, model, images = null } = req || {};
    const id = (providerId || '').toLowerCase();
    const defaults = PROVIDER_DEFAULTS[id];

    if (!defaults) {
        return { status: 400, body: { error: `Unknown AI provider "${providerId}"` } };
    }
    if (!prompt) {
        return { status: 400, body: { error: 'Missing prompt' } };
    }

    const apiKey = getServerApiKey(id);
    if (!apiKey) {
        return { status: 501, body: { error: `${defaults.name} is not configured on the server (missing API key env var)` } };
    }

    const provider = model ? { ...defaults, modelName: model } : defaults;

    try {
        const result = await executeProviderRequest(provider, apiKey, prompt, history, useJson, image, null, images);
        return { status: 200, body: { result } };
    } catch (err) {
        console.error(`[AI Proxy] ${defaults.name} request failed:`, err.message);
        return { status: 502, body: { error: err.message } };
    }
}
