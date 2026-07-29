// Server-only helper — never imported by client/browser code.
// Verifies the shared kiosk PIN against a server-side secret and, on match,
// signs in the underlying kiosk account so the PIN itself is the only value
// that ever crosses the network (the real account password stays server-side).
import { supabase } from './supabase.js';

const attempts = new Map();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(ip) {
    const now = Date.now();
    const record = attempts.get(ip);
    if (!record || now - record.windowStart > WINDOW_MS) {
        attempts.set(ip, { count: 1, windowStart: now });
        return false;
    }
    record.count += 1;
    return record.count > MAX_ATTEMPTS;
}

export async function handleKioskLogin(pin, ip) {
    if (isRateLimited(ip || 'unknown')) {
        return { status: 429, body: { error: 'Too many attempts. Try again later.' } };
    }

    const expectedPin = process.env.KIOSK_PIN;
    const email = process.env.KIOSK_ACCOUNT_EMAIL;
    const password = process.env.KIOSK_ACCOUNT_PASSWORD;

    if (!expectedPin || !email || !password) {
        console.error('Kiosk login: KIOSK_PIN / KIOSK_ACCOUNT_EMAIL / KIOSK_ACCOUNT_PASSWORD not configured');
        return { status: 500, body: { error: 'Kiosk login is not configured' } };
    }

    if (typeof pin !== 'string' || pin !== expectedPin) {
        return { status: 401, body: { error: 'Invalid PIN' } };
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.session) {
        console.error('Kiosk login: underlying account sign-in failed', error?.message);
        return { status: 500, body: { error: 'Kiosk account sign-in failed' } };
    }

    return { status: 200, body: { session: data.session } };
}
