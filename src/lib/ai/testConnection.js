/**
 * Connection testing utility for AI providers
 */
export async function testProviderConnection(provider, apiKey) {
    const startTime = Date.now();
    const url = provider.baseUrl;
    const model = provider.modelName;

    try {
        if (provider.name === 'Gemini') {
            const endpoint = `${url}/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
                    generationConfig: { maxOutputTokens: 5 }
                })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error?.message || `Status ${res.status}`);
            }
            const latency = Date.now() - startTime;
            return { success: true, latency, model, message: "Connected successfully to Google Gemini." };
        }

        if (provider.name === 'Ollama') {
            const endpoint = `${url}/api/tags`;
            const controller = new AbortController();
            const tId = setTimeout(() => controller.abort(), 4000); // 4s timeout
            const res = await fetch(endpoint, {
                method: 'GET',
                signal: controller.signal
            });
            clearTimeout(tId);
            if (!res.ok) throw new Error(`Ollama responded with status ${res.status}`);
            const data = await res.json();
            const modelsList = data.models?.map(m => m.name).join(', ') || 'none';
            const latency = Date.now() - startTime;
            return { 
                success: true, 
                latency, 
                model, 
                message: `Connected successfully to local Ollama. Installed models: ${modelsList}` 
            };
        }

        if (provider.name === 'Claude') {
            // Anthropic doesn't support CORS easily from browser unless set up,
            // but we'll try to fetch or return a CORS warning message if it fails on headers
            const endpoint = `${url.endsWith('/v1/messages') ? url : url + '/v1/messages'}`;
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'dangerously-allow-html-user-delegation': 'true'
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 5,
                    messages: [{ role: 'user', content: 'ping' }]
                })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error?.message || `Claude status ${res.status}`);
            }
            const latency = Date.now() - startTime;
            return { success: true, latency, model, message: "Connected successfully to Anthropic Claude." };
        }

        // DeepSeek, Groq, OpenAI, OpenRouter use standard OpenAI chat format
        let endpoint = url;
        if (!endpoint.endsWith('/chat/completions') && !endpoint.endsWith('/v1')) {
            endpoint = endpoint.endsWith('/') ? `${endpoint}chat/completions` : `${endpoint}/chat/completions`;
        } else if (endpoint.endsWith('/v1')) {
            endpoint = `${endpoint}/chat/completions`;
        }
        
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };
        if (provider.name === 'OpenRouter') {
            headers['HTTP-Referer'] = window.location.origin;
            headers['X-Title'] = 'CelronHub';
        }

        const res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                max_tokens: 5,
                messages: [{ role: 'user', content: 'ping' }]
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Status ${res.status}: ${JSON.stringify(err)}`);
        }

        const latency = Date.now() - startTime;
        return { success: true, latency, model, message: `Connected successfully to ${provider.name}.` };
    } catch (e) {
        return { success: false, latency: Date.now() - startTime, model, message: e.message };
    }
}
