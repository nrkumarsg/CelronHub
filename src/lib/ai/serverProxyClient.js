// Client-only: routes an AI request through the backend so the operator's own
// provider keys never need to be shipped to the browser. Used whenever the
// user hasn't configured their own personal key for a given provider.
export async function callServerAiProxy(providerId, prompt, history = [], useJson = true, image = null, model = null) {
    const resp = await fetch('/api/ai/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, prompt, history, useJson, image, model })
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        throw new Error(data.error || `AI proxy request failed with status ${resp.status}`);
    }
    return data.result;
}
