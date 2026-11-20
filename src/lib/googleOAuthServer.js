// Server-only helper — never imported by client/browser code.
// Manages permanent company-wide Google Drive OAuth refresh tokens stored in Supabase
// and mints fresh short-lived access tokens for authenticated staff members.

import { createClient } from '@supabase/supabase-js';

const DEFAULT_CLIENT_ID = '646093609919-9chvqi80qq34427tejbj0vbl4o87ca3u.apps.googleusercontent.com';
const DEFAULT_COMPANY_ID = '8431cd0b-7449-44a5-8213-2a8680d09ebe';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

// In-memory cache per company to avoid unnecessary Google token hits on warm Vercel lambdas
const tokenCache = new Map();

function getSupabaseAdmin() {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://dfoihdzpgkrtyerzzchm.supabase.co';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!serviceKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in server environment variables.');
    }
    return createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

function getGoogleOAuthConfig() {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientSecret) {
        throw new Error('GOOGLE_CLIENT_SECRET is not configured in server environment variables.');
    }
    return { clientId, clientSecret };
}

/**
 * Verifies the caller's Supabase JWT from Authorization: Bearer <token>
 * and resolves their profile & company access.
 */
async function verifyCaller(req) {
    const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!jwt) {
        return { error: 'Missing Authorization header', status: 401 };
    }

    const admin = getSupabaseAdmin();
    const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userRes?.user) {
        return { error: 'Invalid or expired session', status: 401 };
    }

    const user = userRes.user;
    const { data: profile } = await admin
        .from('profiles')
        .select('id, role, company_id, email')
        .eq('id', user.id)
        .maybeSingle();

    return { admin, user, profile };
}

/**
 * POST /api/google/oauth/exchange
 * Exchanges a one-time Google authorization code for an access_token + permanent refresh_token
 * and saves them in public.company_google_integrations for the target company.
 */
export async function handleGoogleOAuthExchange(req) {
    try {
        const auth = await verifyCaller(req);
        if (auth.error) return { status: auth.status, body: { error: auth.error } };

        const { admin, user, profile } = auth;
        const { code, redirectUri, companyId } = req.body || {};

        if (!code || !redirectUri) {
            return { status: 400, body: { error: 'Missing code or redirectUri' } };
        }

        const role = (profile?.role || '').toLowerCase();
        const isSuperOrAdmin = ['superadmin', 'admin', 'manager', 'director'].includes(role) ||
            (user.email || '').toLowerCase() === 'nrkumarsg@gmail.com';

        if (!isSuperOrAdmin) {
            return { status: 403, body: { error: 'Only an admin or superadmin can link the permanent company Google Drive.' } };
        }

        const targetCompanyId = companyId || profile?.company_id || DEFAULT_COMPANY_ID;
        const { clientId, clientSecret } = getGoogleOAuthConfig();

        const tokenParams = new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
        });

        const tokenResp = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenParams.toString()
        });

        const tokenData = await tokenResp.json();
        if (!tokenResp.ok || !tokenData.access_token) {
            console.error('[GoogleOAuth] Code exchange failed:', tokenData);
            return {
                status: 400,
                body: { error: tokenData.error_description || tokenData.error || 'Failed to exchange Google auth code' }
            };
        }

        // Fetch Google account email & name
        let googleEmail = null;
        let googleName = null;
        try {
            const uiResp = await fetch(USERINFO_ENDPOINT, {
                headers: { Authorization: `Bearer ${tokenData.access_token}` }
            });
            if (uiResp.ok) {
                const ui = await uiResp.json();
                googleEmail = ui.email || null;
                googleName = ui.name || null;
            }
        } catch (e) {
            console.warn('[GoogleOAuth] Failed to fetch userinfo:', e.message);
        }

        const expiresInSec = parseInt(tokenData.expires_in, 10) || 3600;
        const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

        // Keep existing refresh_token if Google did not return a new one (though prompt=consent should always return it)
        let refreshTokenToStore = tokenData.refresh_token || null;
        if (!refreshTokenToStore) {
            const { data: existing } = await admin
                .from('company_google_integrations')
                .select('refresh_token')
                .eq('company_id', targetCompanyId)
                .maybeSingle();
            refreshTokenToStore = existing?.refresh_token || null;
        }

        if (!refreshTokenToStore) {
            return {
                status: 400,
                body: {
                    error: 'Google did not return a refresh_token. Please revoke CelronHub in Google Account Permissions and reconnect with consent.'
                }
            };
        }

        const { error: upsertErr } = await admin
            .from('company_google_integrations')
            .upsert({
                company_id: targetCompanyId,
                google_email: googleEmail,
                google_name: googleName,
                refresh_token: refreshTokenToStore,
                access_token: tokenData.access_token,
                access_token_expires_at: expiresAt,
                scopes: tokenData.scope || null,
                connected_by: user.id,
                updated_at: new Date().toISOString()
            }, { onConflict: 'company_id' });

        if (upsertErr) {
            console.error('[GoogleOAuth] DB upsert failed:', upsertErr);
            return { status: 500, body: { error: 'Failed to persist Google refresh token: ' + upsertErr.message } };
        }

        const resultPayload = {
            access_token: tokenData.access_token,
            expires_at: expiresAt,
            expires_in: expiresInSec,
            google_email: googleEmail,
            google_name: googleName,
            company_id: targetCompanyId,
            permanent: true
        };

        tokenCache.set(targetCompanyId, resultPayload);
        return { status: 200, body: resultPayload };
    } catch (err) {
        console.error('[GoogleOAuth] Exchange exception:', err);
        return { status: 500, body: { error: err.message } };
    }
}

/**
 * GET /api/google/token?companyId=...
 * Returns a valid Google access_token for the company, silently refreshing via the stored
 * permanent refresh_token whenever the cached token is within 5 minutes of expiring.
 */
export async function handleGetCompanyGoogleToken(req) {
    try {
        const auth = await verifyCaller(req);
        if (auth.error) return { status: auth.status, body: { error: auth.error } };

        const { admin, profile } = auth;
        const requestedCompanyId = req.query?.companyId || req.body?.companyId || profile?.company_id || DEFAULT_COMPANY_ID;
        const forceRefresh = req.query?.force === 'true' || req.body?.force === true;

        // 1. Check warm in-memory cache (valid with > 5 min buffer)
        const now = Date.now();
        const BUFFER_MS = 5 * 60 * 1000;
        const cached = tokenCache.get(requestedCompanyId);
        if (!forceRefresh && cached?.access_token && cached?.expires_at) {
            if (new Date(cached.expires_at).getTime() - now > BUFFER_MS) {
                return { status: 200, body: cached };
            }
        }

        // 2. Load company integration row from Supabase
        const { data: row, error: fetchErr } = await admin
            .from('company_google_integrations')
            .select('company_id, google_email, google_name, refresh_token, access_token, access_token_expires_at')
            .eq('company_id', requestedCompanyId)
            .maybeSingle();

        if (fetchErr) {
            console.error('[GoogleOAuth] DB fetch error:', fetchErr);
            return { status: 500, body: { error: fetchErr.message } };
        }

        // 3. Fallback to env var GOOGLE_REFRESH_TOKEN if DB row not yet created
        const refreshToken = row?.refresh_token || process.env.GOOGLE_REFRESH_TOKEN || null;

        if (!refreshToken) {
            return {
                status: 200,
                body: { connected: false, reason: 'not_configured', company_id: requestedCompanyId }
            };
        }

        // 4. If DB already holds a fresh access token (> 5 min left), return it directly
        if (!forceRefresh && row?.access_token && row?.access_token_expires_at) {
            const expMs = new Date(row.access_token_expires_at).getTime();
            if (expMs - now > BUFFER_MS) {
                const payload = {
                    connected: true,
                    permanent: true,
                    access_token: row.access_token,
                    expires_at: row.access_token_expires_at,
                    expires_in: Math.floor((expMs - now) / 1000),
                    google_email: row.google_email,
                    google_name: row.google_name,
                    company_id: requestedCompanyId
                };
                tokenCache.set(requestedCompanyId, payload);
                return { status: 200, body: payload };
            }
        }

        // 5. Silently mint a brand-new access_token from Google using the permanent refresh_token
        const { clientId, clientSecret } = getGoogleOAuthConfig();
        const refreshParams = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        });

        const refreshResp = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: refreshParams.toString()
        });

        const refreshData = await refreshResp.json();
        if (!refreshResp.ok || !refreshData.access_token) {
            console.error('[GoogleOAuth] Token refresh failed:', refreshData);
            return {
                status: 200,
                body: {
                    connected: false,
                    reason: refreshData.error || 'refresh_failed',
                    error: refreshData.error_description || 'Permanent Google Drive token needs reconnection by Admin.'
                }
            };
        }

        const expiresInSec = parseInt(refreshData.expires_in, 10) || 3600;
        const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

        // Populate email/name if missing
        let googleEmail = row?.google_email || null;
        let googleName = row?.google_name || null;
        if (!googleEmail) {
            try {
                const uiResp = await fetch(USERINFO_ENDPOINT, {
                    headers: { Authorization: `Bearer ${refreshData.access_token}` }
                });
                if (uiResp.ok) {
                    const ui = await uiResp.json();
                    googleEmail = ui.email || null;
                    googleName = ui.name || null;
                }
            } catch {
                // non-fatal
            }
        }

        // Persist refreshed access token in DB so other serverless instances reuse it
        if (row) {
            await admin
                .from('company_google_integrations')
                .update({
                    access_token: refreshData.access_token,
                    access_token_expires_at: expiresAt,
                    google_email: googleEmail,
                    google_name: googleName,
                    updated_at: new Date().toISOString()
                })
                .eq('company_id', requestedCompanyId);
        }

        const payload = {
            connected: true,
            permanent: true,
            access_token: refreshData.access_token,
            expires_at: expiresAt,
            expires_in: expiresInSec,
            google_email: googleEmail,
            google_name: googleName,
            company_id: requestedCompanyId
        };

        tokenCache.set(requestedCompanyId, payload);
        return { status: 200, body: payload };
    } catch (err) {
        console.error('[GoogleOAuth] Get company token error:', err);
        return { status: 500, body: { error: err.message } };
    }
}

/**
 * POST /api/google/disconnect
 * Admin-only: removes the stored permanent refresh token for the company.
 */
export async function handleDisconnectCompanyGoogle(req) {
    try {
        const auth = await verifyCaller(req);
        if (auth.error) return { status: auth.status, body: { error: auth.error } };

        const { admin, user, profile } = auth;
        const role = (profile?.role || '').toLowerCase();
        const isSuperOrAdmin = ['superadmin', 'admin', 'director'].includes(role) ||
            (user.email || '').toLowerCase() === 'nrkumarsg@gmail.com';

        if (!isSuperOrAdmin) {
            return { status: 403, body: { error: 'Only an admin can disconnect the company Google Drive.' } };
        }

        const targetCompanyId = req.body?.companyId || profile?.company_id || DEFAULT_COMPANY_ID;
        await admin
            .from('company_google_integrations')
            .delete()
            .eq('company_id', targetCompanyId);

        tokenCache.delete(targetCompanyId);
        return { status: 200, body: { disconnected: true, company_id: targetCompanyId } };
    } catch (err) {
        console.error('[GoogleOAuth] Disconnect error:', err);
        return { status: 500, body: { error: err.message } };
    }
}
