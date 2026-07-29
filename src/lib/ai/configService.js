import { encryptKey, decryptKey } from './cryptoHelper.js';

const STORAGE_PROVIDERS_KEY = 'celron_ai_providers_list';
const STORAGE_KEYS_PREFIX = 'celron_ai_key_';

const DEFAULT_PROVIDERS = [
    {
        name: 'Gemini',
        enabled: true,
        priority: 1,
        baseUrl: 'https://generativelanguage.googleapis.com',
        modelName: 'gemini-2.5-flash',
        timeout: 12000,
        retryCount: 3,
        temperature: 0.1,
        maxTokens: 2048,
        notes: 'Primary provider — best general and vision model.'
    },
    {
        name: 'DeepSeek',
        enabled: true,
        priority: 2,
        baseUrl: 'https://api.deepseek.com',
        modelName: 'deepseek-chat',
        timeout: 15000,
        retryCount: 3,
        temperature: 0.1,
        maxTokens: 2048,
        notes: 'Fallback text provider (deepseek-chat) — cheap, already funded.'
    },
    {
        name: 'Claude',
        enabled: false,
        priority: 3,
        baseUrl: 'https://api.anthropic.com',
        modelName: 'claude-sonnet-5',
        timeout: 15000,
        retryCount: 3,
        temperature: 0.1,
        maxTokens: 2048,
        notes: 'Optional — disabled until Anthropic API credits are added.'
    },
    {
        name: 'Groq',
        enabled: false,
        priority: 4,
        baseUrl: 'https://api.groq.com/openai/v1',
        modelName: 'llama-3.3-70b-versatile',
        timeout: 8000,
        retryCount: 2,
        temperature: 0.1,
        maxTokens: 2048,
        notes: 'Optional high-speed text model fallback.'
    },
    {
        name: 'Ollama',
        enabled: false,
        priority: 5,
        baseUrl: 'http://localhost:11434',
        modelName: 'llama3',
        timeout: 30000,
        retryCount: 1,
        temperature: 0.1,
        maxTokens: 2048,
        notes: 'Optional local host configuration.'
    },
    {
        name: 'OpenAI',
        enabled: false,
        priority: 6,
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4o-mini',
        timeout: 15000,
        retryCount: 3,
        temperature: 0.1,
        maxTokens: 2048,
        notes: 'Optional — disabled, Gemini/Claude are primary.'
    },
    {
        name: 'OpenRouter',
        enabled: false,
        priority: 7,
        baseUrl: 'https://openrouter.ai/api/v1',
        modelName: 'google/gemini-2.5-flash',
        timeout: 15000,
        retryCount: 3,
        temperature: 0.1,
        maxTokens: 2048,
        notes: 'OpenRouter routing engine.'
    }
];

// Load providers from local storage or merge with defaults
export function getProviders() {
    try {
        const stored = localStorage.getItem(STORAGE_PROVIDERS_KEY);
        if (!stored) {
            // Seed default fallback keys from env variables if available
            return DEFAULT_PROVIDERS;
        }
        const parsed = JSON.parse(stored);
        
        // Ensure new defaults are merged in if they don't exist in saved config
        const merged = [...parsed];
        DEFAULT_PROVIDERS.forEach(def => {
            if (!merged.some(p => p.name === def.name)) {
                merged.push(def);
            }
        });
        
        return merged.sort((a, b) => a.priority - b.priority);
    } catch (e) {
        console.error("Failed to load providers:", e);
        return DEFAULT_PROVIDERS;
    }
}

export function saveProviders(providers) {
    const sorted = [...providers].sort((a, b) => a.priority - b.priority);
    localStorage.setItem(STORAGE_PROVIDERS_KEY, JSON.stringify(sorted));
}

export function saveProvider(provider) {
    const list = getProviders();
    const idx = list.findIndex(p => p.name === provider.name);
    if (idx > -1) {
        list[idx] = { ...list[idx], ...provider };
    } else {
        list.push(provider);
    }
    saveProviders(list);
}

// Reset everything to defaults
export function resetToDefaults() {
    localStorage.removeItem(STORAGE_PROVIDERS_KEY);
    DEFAULT_PROVIDERS.forEach(p => {
        localStorage.removeItem(`${STORAGE_KEYS_PREFIX}${p.name.toLowerCase()}`);
    });
}

// Get raw encrypted API key
export function getEncryptedApiKey(providerName) {
    return localStorage.getItem(`${STORAGE_KEYS_PREFIX}${providerName.toLowerCase()}`) || '';
}

// Decrypt and return the user's personally-configured key, if any.
// There is deliberately no fallback to an operator-owned key here — when the
// user hasn't set their own key, the AI engine routes the request through the
// backend proxy instead, which holds the operator's keys server-side only.
export async function getDecryptedApiKey(providerName) {
    const encrypted = getEncryptedApiKey(providerName);
    if (!encrypted) return '';
    return await decryptKey(encrypted);
}

// Encrypt and save key
export async function saveApiKey(providerName, rawKey) {
    if (!rawKey) {
        localStorage.removeItem(`${STORAGE_KEYS_PREFIX}${providerName.toLowerCase()}`);
        return;
    }
    const encrypted = await encryptKey(rawKey);
    localStorage.setItem(`${STORAGE_KEYS_PREFIX}${providerName.toLowerCase()}`, encrypted);
}

export function deleteApiKey(providerName) {
    localStorage.removeItem(`${STORAGE_KEYS_PREFIX}${providerName.toLowerCase()}`);
}

// Filter enabled providers sorted by priority
export function getEnabledProvidersInPriority() {
    return getProviders()
        .filter(p => p.enabled)
        .sort((a, b) => a.priority - b.priority);
}
