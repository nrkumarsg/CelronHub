// Server-only helper — never imported by client/browser code.
// Manages permanent company-wide Google Drive OAuth refresh tokens stored in Supabase
// and mints fresh short-lived access tokens for authenticated staff members.

import { createClient } from '@supabase/supabase-js';

const DEFAULT_CLIENT_ID = '646093609919-9chvqi80qq34427tejbj0vbl4o87ca3u.apps.googleusercontent.com';
const DEFAULT_COMPANY_ID = '8431cd0b-7449-44a5-8213-2a8680d09ebe';
const DEFAULT_SUPABASE_URL = 'https://dfoihdzpgkrtyerzzchm.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmb2loZHpwZ2tydHllcnp6Y2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NzMxMTgsImV4cCI6MjA4NzE0OTExOH0.9FGN21KeUpS0UyyFJJ1YjXLElL4AF6ym_hKAJsr_ek4';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

// In-memory cache per company to avoid unnecessary Google token hits on warm Vercel lambdas
const tokenCache = new Map();

function getSupabaseClient(jwt = '') {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (serviceKey) {
        return createClient(url, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
    }
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
    return createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        ...(jwt ? { global: { headers: { Authorization: `Bearer ${jwt}` } } } : {})
    });
}

async function resolveGoogleOAuthConfig(dbClient, companyId, bodyClientSecret = null) {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_CLIENT_ID;
    let clientSecret = process.env.GOOGLE_CLIENT_SECRET || bodyClientSecret || null;

    if (!clientSecret && dbClient) {
        try {
            // Check company_google_integrations first
            const { data: intRow } = await dbClient
                .from('company_google_integrations')
                .select('client_secret')
                .eq('company_id', companyId || DEFAULT_COMPANY_ID)
                .maybeSingle();
            if (intRow?.client_secret) {
                clientSecret = intRow.client_secret;
            }
        } catch {
            // ignore if column doesn't exist
        }
    }

    if (!clientSecret && dbClient) {
        try {
            // Check document_settings fallback
            const { data: dsRows } = await dbClient
                .from('document_settings')
                .select('*')
                .limit(5);
            const found = (dsRows || []).find(r => r.google_client_secret);
            if (found?.google_client_secret) {
                clientSecret = found.google_client_secret;
            }
        } catch {
            // ignore
        }
    }

    return { clientId, clientSecret };
}

/**
 * Verifies the caller's Supabase JWT from Authorization: Bearer <token>
 * and resolves their profile & company access. Does NOT require SUPABASE_SERVICE_ROLE_KEY.
 */
async function verifyCaller(req) {
    const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!jwt) {
        return { error: 'Missing Authorization header', status: 401 };
    }

    const dbClient = getSupabaseClient(jwt);
    const { data: userRes, error: userErr } = await dbClient.auth.getUser(jwt);
    if (userErr || !userRes?.user) {
        return { error: 'Invalid or expired session', status: 401 };
    }

    const user = userRes.user;
    const { data: profile } = await dbClient
        .from('profiles')
        .select('id, role, company_id, email')
        .eq('id', user.id)
        .maybeSingle();

    return { dbClient, user, profile, jwt };
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

        const { dbClient, user, profile } = auth;
        const { code, redirectUri, companyId, clientSecret: bodyClientSecret } = req.body || {};

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
        const { clientId, clientSecret } = await resolveGoogleOAuthConfig(dbClient, targetCompanyId, bodyClientSecret);

        if (!clientSecret) {
            return {
                status: 400,
                body: {
                    error: 'MISSING_GOOGLE_CLIENT_SECRET',
                    message: 'Google OAuth Client Secret is required once to enable permanent offline Google Drive connection.'
                }
            };
        }

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

        // Keep existing refresh_token if Google did not return a new one
        let refreshTokenToStore = tokenData.refresh_token || null;
        if (!refreshTokenToStore) {
            const { data: existing } = await dbClient
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
                    error: 'Google did not return a refresh_token. Please reconnect and approve consent.'
                }
            };
        }

        const upsertPayload = {
            company_id: targetCompanyId,
            google_email: googleEmail,
            google_name: googleName,
            refresh_token: refreshTokenToStore,
            access_token: tokenData.access_token,
            access_token_expires_at: expiresAt,
            scopes: tokenData.scope || null,
            connected_by: user.id,
            updated_at: new Date().toISOString()
        };

        // Try storing client_secret if column exists, fallback without it if column wasn't added yet
        let { error: upsertErr } = await dbClient
            .from('company_google_integrations')
            .upsert({ ...upsertPayload, client_secret: clientSecret }, { onConflict: 'company_id' });

        if (upsertErr && upsertErr.message?.includes('client_secret')) {
            const retry = await dbClient
                .from('company_google_integrations')
                .upsert(upsertPayload, { onConflict: 'company_id' });
            upsertErr = retry.error;
        }

        if (upsertErr) {
            console.warn('[GoogleOAuth] company_google_integrations upsert warning:', upsertErr.message);
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

        const { dbClient, profile } = auth;
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
        const { data: row, error: fetchErr } = await dbClient
            .from('company_google_integrations')
            .select('*')
            .eq('company_id', requestedCompanyId)
            .maybeSingle();

        if (fetchErr) {
            console.warn('[GoogleOAuth] DB fetch warning:', fetchErr.message);
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
        const { clientId, clientSecret } = await resolveGoogleOAuthConfig(dbClient, requestedCompanyId, row?.client_secret);
        if (!clientSecret) {
            return {
                status: 200,
                body: {
                    connected: false,
                    reason: 'missing_client_secret',
                    error: 'GOOGLE_CLIENT_SECRET is not configured.'
                }
            };
        }

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
            await dbClient
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

        const { dbClient, user, profile } = auth;
        const role = (profile?.role || '').toLowerCase();
        const isSuperOrAdmin = ['superadmin', 'admin', 'director'].includes(role) ||
            (user.email || '').toLowerCase() === 'nrkumarsg@gmail.com';

        if (!isSuperOrAdmin) {
            return { status: 403, body: { error: 'Only an admin can disconnect the company Google Drive.' } };
        }

        const targetCompanyId = req.body?.companyId || profile?.company_id || DEFAULT_COMPANY_ID;
        await dbClient
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
