// Native Web Crypto API helper for secure client-side encryption
const ALGORITHM = 'AES-GCM';
const KEY_MATERIAL = 'celronhub-secure-ai-key-salt-2026';

async function getKey() {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(KEY_MATERIAL),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: enc.encode('celron-salt-ai'),
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: ALGORITHM, length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encryptKey(text) {
    if (!text) return '';
    try {
        const enc = new TextEncoder();
        const key = await getKey();
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await window.crypto.subtle.encrypt(
            { name: ALGORITHM, iv },
            key,
            enc.encode(text)
        );
        const buffer = new Uint8Array(encrypted);
        const combined = new Uint8Array(iv.length + buffer.length);
        combined.set(iv);
        combined.set(buffer, iv.length);
        return btoa(String.fromCharCode.apply(null, combined));
    } catch (e) {
        console.error("Encryption failed:", e);
        return text;
    }
}

export async function decryptKey(ciphertext) {
    if (!ciphertext) return '';
    // If it doesn't look like a base64 encrypted payload (e.g. raw sk-... key), return it directly
    if (!/^[A-Za-z0-9+/=]+$/.test(ciphertext) || ciphertext.length < 24) {
        return ciphertext;
    }
    try {
        const key = await getKey();
        const combined = new Uint8Array(
            atob(ciphertext)
                .split('')
                .map(c => c.charCodeAt(0))
        );
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);
        const dec = new TextDecoder();
        const decrypted = await window.crypto.subtle.decrypt(
            { name: ALGORITHM, iv },
            key,
            data
        );
        return dec.decode(decrypted);
    } catch (e) {
        // Fallback to ciphertext directly if it wasn't encrypted
        return ciphertext;
    }
}
