// Google OAuth (implicit flow) via Thunderbird's messenger.identity API.
// Setup: create an OAuth 2.0 Client ID (type "Web application") in Google Cloud
// Console, enable the Drive API, and register getRedirectUrl()'s value as an
// Authorized redirect URI. Then paste the Client ID into the extension's
// Google Drive setup panel (stored locally, no rebuild required).

const SCOPES = 'https://www.googleapis.com/auth/drive';
const SESSION_KEY = 'google_oauth_session';
const CLIENT_ID_KEY = 'google_oauth_client_id';

const tb = typeof messenger !== 'undefined' ? messenger : (typeof browser !== 'undefined' ? browser : null);

export const getRedirectUrl = async () => {
    if (!tb?.identity) return '';
    return tb.identity.getRedirectURL();
};

export const getClientId = async () => {
    if (!tb?.storage?.local) return '';
    const data = await tb.storage.local.get(CLIENT_ID_KEY);
    return data?.[CLIENT_ID_KEY] || '';
};

export const setClientId = async (clientId) => {
    if (!tb?.storage?.local) return;
    await tb.storage.local.set({ [CLIENT_ID_KEY]: (clientId || '').trim() });
};

const storeSession = async (session) => {
    if (tb?.storage?.local) {
        await tb.storage.local.set({ [SESSION_KEY]: session });
    }
};

export const getSession = async () => {
    if (!tb?.storage?.local) return null;
    const data = await tb.storage.local.get(SESSION_KEY);
    const session = data?.[SESSION_KEY];
    if (!session || (session.expiresAt && Date.now() > session.expiresAt)) return null;
    return session;
};

export const getStoredToken = async () => {
    const session = await getSession();
    return session?.accessToken || null;
};

export const signOut = async () => {
    if (tb?.storage?.local) {
        await tb.storage.local.remove(SESSION_KEY);
    }
};

export const authenticate = async ({ interactive = true } = {}) => {
    if (!tb?.identity) {
        throw new Error('The identity API is unavailable in this environment.');
    }
    const clientId = await getClientId();
    if (!clientId) {
        throw new Error('Google Client ID not configured yet. Complete the Google Drive setup steps first.');
    }

    const redirectUri = await tb.identity.getRedirectURL();
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('prompt', interactive ? 'consent' : 'none');

    const resultUrl = await tb.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive
    });

    const fragment = (resultUrl.split('#')[1]) || '';
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');
    const error = params.get('error');

    if (error) throw new Error(`Google auth error: ${error}`);
    if (!accessToken) throw new Error('Google did not return an access token.');

    const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
    const session = { accessToken, expiresAt: Date.now() + (expiresIn * 1000) - 60000 };
    await storeSession(session);
    return accessToken;
};

export const performOCR = async (file) => {
    // Basic browser text extraction fallback / stub
    return "OCR extracted text sample from document.";
};
