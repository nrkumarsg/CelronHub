/**
 * Google Auth & API Integration Service
 * Handles OAuth 2.0 flow and common API fetching (Gmail, Contacts)
 */

import * as pdfjs from 'pdfjs-dist';

// Set up PDF.js worker
if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
    ).href;
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// Combined scopes for Gmail, Contacts, and Drive
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/contacts.readonly',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

/**
 * Initiates the Google OAuth 2.0 flow
 * @param {string} state - Arbitrary state (e.g. accountId or 'contacts_sync')
 * @param {string} customScope - Optional scope override
 */
export const connectGoogleAPI = (state = 'sync', customScope = null, loginHint = null) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = window.location.origin + '/oauth-callback';

    if (!clientId) {
        alert('Google Client ID not configured in .env file');
        return;
    }

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'token',
        scope: customScope || SCOPES,
        state: state,
        prompt: 'select_account',
        include_granted_scopes: 'true'
    });

    // Optionally hint which account should be selected
    if (loginHint) {
        params.append('login_hint', loginHint);
    }

    console.log('Initiating Google OAuth:', {
        clientId: clientId,
        redirectUri: redirectUri,
        state: state
    });
    
    window.location.href = `${GOOGLE_AUTH_URL}?${params.toString()}`;
};

/**
 * Checks if the stored Google access token is still valid.
 * @returns {boolean}
 */
export const isTokenValid = () => {
    const token = localStorage.getItem('google_access_token');
    const expiry = localStorage.getItem('google_token_expiry');

    if (!token || !expiry) return false;

    // Check if expiry is in the future (with 1 minute buffer)
    return new Date(expiry).getTime() > (Date.now() + 60000);
};

/**
 * Returns the stored token if valid, otherwise returns null.
 * @returns {string|null}
 */
export const getStoredToken = () => {
    // Prefer company-scoped token if active company set
    try {
        const activeCompany = localStorage.getItem('active_company_id');
        if (activeCompany) {
            const compToken = localStorage.getItem(`google_access_token_company_${activeCompany}`);
            const compExpiry = localStorage.getItem(`google_token_expiry_company_${activeCompany}`);
            if (compToken && compExpiry && new Date(compExpiry).getTime() > (Date.now() + 60000)) {
                return compToken;
            }
        }
    } catch (e) {
        // ignore and fall back to global token
    }

    return isTokenValid() ? localStorage.getItem('google_access_token') : null;
};

/**
 * Validates the token with Google's tokeninfo endpoint.
 * Useful for checking if a token has been revoked even if it hasn't expired.
 * @param {string} token 
 * @returns {Promise<boolean>}
 */
export const validateToken = async (token) => {
    if (!token) return false;
    try {
        const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`);
        return response.ok;
    } catch (e) {
        console.error('Token validation failed:', e);
        return false;
    }
};

/**
 * Gmail fetching logic (moved from gmailService)
 */
export const fetchGmailThreads = async (accessToken) => {
    const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
    if (!accessToken) throw new Error('No access token available.');

    try {
        // Step 1: Verify token with userinfo (often more reliable for CORS)
        let profileRes;
        try {
            profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                mode: 'cors'
            });
        } catch (e) {
            console.error('Connection blocked:', e);
            throw new Error('Network error: Browser blocked Google connection. Please check if a VPN, Firewall, or Ad-blocker is active.');
        }

        if (!profileRes.ok) {
            if (profileRes.status === 401) throw new Error('AUTH_EXPIRED');
            throw new Error(`Google API check failed: ${profileRes.status}`);
        }

        // Step 2: Fetch thread list
        let response;
        try {
            response = await fetch(`${GMAIL_API_BASE}/threads?maxResults=30`, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                mode: 'cors'
            });
        } catch (e) {
            console.error('Threads fetch blocked:', e);
            throw new Error('Network error: Could not reach Gmail servers.');
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 401) throw new Error('AUTH_EXPIRED');
            throw new Error(errorData.error?.message || `Gmail error ${response.status}`);
        }

        const data = await response.json();
        if (!data.threads || data.threads.length === 0) return [];

        const threadDetails = [];
        for (const thread of data.threads.slice(0, 15)) {
            try {
                const res = await fetch(`${GMAIL_API_BASE}/threads/${thread.id}`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` },
                    mode: 'cors'
                });
                if (res.ok) {
                    const detail = await res.json();
                    threadDetails.push(detail);
                }
            } catch (err) {
                console.warn(`Failed to fetch thread ${thread.id}:`, err);
            }
        }

        return formatThreads(threadDetails);
    } catch (error) {
        console.error('Error fetching Gmail:', error);
        throw error;
    }
};

const formatThreads = (threads) => {
    return threads.map(thread => {
        try {
            const lastMessage = thread.messages?.[thread.messages.length - 1];
            if (!lastMessage) return null;

            const headers = lastMessage.payload?.headers || [];
            const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

            return {
                id: thread.id,
                sender: (getHeader('From') || 'Unknown').split('<')[0].trim(),
                email: getHeader('From')?.match(/<([^>]+)>/)?.[1] || '',
                subject: getHeader('Subject') || '(No Subject)',
                excerpt: lastMessage.snippet || '',
                body: getMessageBody(lastMessage),
                time: new Date(getHeader('Date') || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                timestamp: getHeader('Date') || '',
                isUnread: thread.messages.some(m => m.labelIds?.includes('UNREAD'))
            };
        } catch (e) {
            console.warn('Error formatting thread:', thread.id, e);
            return null;
        }
    }).filter(t => t !== null);
};

const getMessageBody = (message) => {
    const payload = message.payload;
    if (!payload) return '';

    const extractBody = (part) => {
        if (part.body?.data) {
            // Decode base64safe to UTF-8
            return b64DecodeUnicode(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        }
        if (part.parts) {
            for (const subPart of part.parts) {
                const body = extractBody(subPart);
                if (body) return body;
            }
        }
        return '';
    };

    return extractBody(payload);
};

// Helper for Unicode-safe base64 decoding
const b64DecodeUnicode = (str) => {
    return decodeURIComponent(atob(str).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
};

/**
 * Google Contacts fetching logic with support for pagination (e.g. 5000+ contacts)
 */
export const fetchGoogleContacts = async (accessToken) => {
    const PEOPLE_API_BASE = 'https://people.googleapis.com/v1/people/me/connections';
    let allConnections = [];
    let pageToken = null;

    try {
        do {
            const params = new URLSearchParams({
                personFields: 'names,emailAddresses,phoneNumbers,organizations,biographies,nicknames',
                pageSize: 1000,
            });
            if (pageToken) params.append('pageToken', pageToken);

            const response = await fetch(`${PEOPLE_API_BASE}?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const data = await response.json();

            if (data.connections) {
                allConnections = [...allConnections, ...data.connections];
            }

            pageToken = data.nextPageToken;
        } while (pageToken);

        return allConnections.map(person => {
            const nameObj = person.names?.[0] || {};
            const emailObj = person.emailAddresses?.[0] || {};
            const phoneObj = person.phoneNumbers?.[0] || {};
            const orgObj = person.organizations?.[0] || {};
            const bioObj = person.biographies?.[0] || {};
            const nickObj = person.nicknames?.[0] || {};

            return {
                id: person.resourceName,
                name: nameObj.displayName || 'Unnamed Contact',
                email: emailObj.value || '',
                phone: phoneObj.value || '',
                post: orgObj.title || '',
                company: orgObj.name || '',
                department: orgObj.department || '',
                note: bioObj.value || '',
                nickname: nickObj.value || ''
            };
        });
    } catch (error) {
        console.error('Error fetching Contacts:', error);
        return [];
    }
};

/**
 * Performs OCR on a file using Google Cloud Vision API
 * @param {File} file 
 * @returns {Promise<string>} Extracted text
 */
export const performOCR = async (file) => {
    // If the file is a PDF, use pdfjs to extract text directly from the PDF client-side!
    if (file && (
        file.type === 'application/pdf' || 
        file.name?.toLowerCase().endsWith('.pdf') ||
        (file instanceof Blob && file.type === 'application/pdf')
    )) {
        try {
            console.log('[performOCR] Detected PDF file. Extracting text client-side...');
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n';
            }
            if (fullText.trim()) {
                console.log('[performOCR] Successfully extracted text natively from PDF:', fullText.substring(0, 100) + '...');
                return fullText;
            } else {
                console.warn('[performOCR] Native PDF text extraction returned no text. Falling back to Google Vision image OCR if possible.');
            }
        } catch (pdfErr) {
            console.error('[performOCR] Native PDF text extraction failed:', pdfErr);
        }
    }

    const apiKey = (
        (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_API_KEY) ||
        (typeof process !== 'undefined' && process.env?.VITE_GOOGLE_API_KEY) ||
        'AIzaSyA5YW4mWUo__7hwGjvLor-DDsh-spg2r5M'
    );
    if (!apiKey) {
        console.warn('VITE_GOOGLE_API_KEY not found. OCR disabled.');
        return '';
    }

    try {
        // Convert file to base64
        const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(file);
        });

        const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
            method: 'POST',
            body: JSON.stringify({
                requests: [{
                    image: { content: base64 },
                    features: [{ type: 'TEXT_DETECTION' }]
                }]
            })
        });

        const data = await response.json();
        const fullText = data.responses?.[0]?.fullTextAnnotation?.text || '';
        return fullText;
    } catch (error) {
        console.error('OCR Error:', error);
        return '';
    }
};
