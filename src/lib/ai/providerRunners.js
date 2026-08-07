// Shared AI provider request builders — no browser-only APIs, safe to import
// from both client code (engine.js) and server code (serverAiHandler.js) so
// the request-building logic (and any future fixes to it) lives in one place.

export const cleanBase64 = (base64) => {
    if (!base64) return null;
    if (base64.startsWith('data:')) {
        return base64.split(',')[1];
    }
    return base64;
};

export const getMimeType = (base64) => {
    if (base64 && base64.startsWith('data:')) {
        const m = base64.match(/data:([^;]+);/);
        if (m) return m[1];
    }
    return 'image/jpeg';
};

export function safeJSONParse(text) {
    try {
        let cleanText = text.trim();
        if (cleanText.includes('```')) {
            const matches = cleanText.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
            if (matches && matches[1]) cleanText = matches[1].trim();
        }
        return JSON.parse(cleanText);
    } catch (err) {
        console.error("[AI Provider] JSON Parse Error:", err, "Raw Text:", text);
        return { error: "Parse failure", confidence: 0 };
    }
}

export async function executeGeminiRequest(provider, apiKey, prompt, history = [], useJson = true, image = null, signal, images = null) {
    const url = `${provider.baseUrl}/v1beta/models/${provider.modelName}:generateContent?key=${apiKey}`;
    const contents = [];

    history.forEach(msg => {
        let role = msg.role;
        if (role === 'assistant') role = 'model';
        if (role === 'system') return;

        contents.push({
            role: role,
            parts: [{ text: msg.content }]
        });
    });

    const activeParts = [{ text: prompt }];
    const imageList = Array.isArray(images) && images.length > 0 ? images : (image ? [image] : []);
    imageList.forEach(img => {
        if (img) {
            activeParts.push({
                inlineData: {
                    mimeType: getMimeType(img),
                    data: cleanBase64(img)
                }
            });
        }
    });

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

export async function executeClaudeRequest(provider, apiKey, prompt, history = [], useJson = true, image = null, signal, images = null) {
    const endpoint = provider.baseUrl.endsWith('/v1/messages') ? provider.baseUrl : `${provider.baseUrl}/v1/messages`;

    const systemMsg = history.find(msg => msg.role === 'system');
    const filteredHistory = history.filter(msg => msg.role !== 'system');

    const messages = [];
    filteredHistory.forEach(msg => {
        messages.push({
            role: msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
        });
    });

    const imageList = Array.isArray(images) && images.length > 0 ? images : (image ? [image] : []);
    let contentPayload = prompt;
    if (imageList.length > 0) {
        contentPayload = [
            ...imageList.map(img => ({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: getMimeType(img),
                    data: cleanBase64(img)
                }
            })),
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
    if (useJson) {
        body.system = `${body.system ? body.system + '\n\n' : ''}Respond with ONLY a valid JSON object, no prose, no markdown fences.`;
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
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

export async function executeOpenAICompatibleRequest(provider, apiKey, prompt, history = [], useJson = true, image = null, signal, images = null) {
    let url = provider.baseUrl;
    if (url.endsWith('/chat/completions')) {
        // already correct
    } else if (url.endsWith('/v1')) {
        url = `${url}/chat/completions`;
    } else if (url.endsWith('/v1/')) {
        url = `${url}chat/completions`;
    } else {
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

    const imageList = Array.isArray(images) && images.length > 0 ? images : (image ? [image] : []);
    let userContent = prompt;
    if (imageList.length > 0) {
        userContent = [
            { type: 'text', text: prompt },
            ...imageList.map(img => ({
                type: 'image_url',
                image_url: { url: `data:${getMimeType(img)};base64,${cleanBase64(img)}` }
            }))
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
        headers['HTTP-Referer'] = (typeof window !== 'undefined' && window.location?.origin) || 'https://celronhub.app';
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

export async function executeProviderRequest(provider, apiKey, prompt, history = [], useJson = true, image = null, signal, images = null) {
    const name = (provider.name || '').toLowerCase();
    if (name === 'gemini') {
        return executeGeminiRequest(provider, apiKey, prompt, history, useJson, image, signal, images);
    }
    if (name === 'claude') {
        return executeClaudeRequest(provider, apiKey, prompt, history, useJson, image, signal, images);
    }
    return executeOpenAICompatibleRequest(provider, apiKey, prompt, history, useJson, image, signal, images);
}
