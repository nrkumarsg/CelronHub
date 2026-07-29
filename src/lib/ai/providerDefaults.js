// Shared provider connection defaults (base URL / default model), keyed by the
// lowercase provider id used in the /api/ai/complete request body. No secrets
// live here — see serverKeys.js for how the actual API keys are resolved.
export const PROVIDER_DEFAULTS = {
    gemini: {
        name: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
        modelName: 'gemini-2.5-flash',
        temperature: 0.1,
        maxTokens: 2048
    },
    claude: {
        name: 'Claude',
        baseUrl: 'https://api.anthropic.com',
        modelName: 'claude-sonnet-5',
        temperature: 0.1,
        maxTokens: 2048
    },
    deepseek: {
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        modelName: 'deepseek-chat',
        temperature: 0.1,
        maxTokens: 2048
    },
    groq: {
        name: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        modelName: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        maxTokens: 2048
    },
    openai: {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4o-mini',
        temperature: 0.1,
        maxTokens: 2048
    }
};
