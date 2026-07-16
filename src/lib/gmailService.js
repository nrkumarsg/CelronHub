/**
 * Gmail Integration Service
 * Handles OAuth 2.0 flow and message fetching for Google Mail
 */

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/v1/users/me';

/**
 * Initiates the Google OAuth 2.0 flow for a specific account
 * @param {string} accountId - Internal ID of the communication account
 */
export const connectGmailAPI = (accountId) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = window.location.origin + '/oauth-callback';

    if (!clientId) {
        alert('Google Client ID not configured in .env file');
        return;
    }

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'token', // Using Implicit Flow for simplicity in a SPA, though Auth Code is better for security
        scope: GMAIL_SCOPE,
        state: accountId, // Pass accountId to identify which account this belongs to
        prompt: 'select_account'
    });

    window.location.href = `${GOOGLE_AUTH_URL}?${params.toString()}`;
};

/**
 * Fetches recent threads for an authenticated account
 * @param {string} accessToken - OAuth access token
 */
export const fetchGmailThreads = async (accessToken) => {
    try {
        const response = await fetch(`${GMAIL_API_BASE}/threads?maxResults=10`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const data = await response.json();

        if (!data.threads) return [];

        // Fetch details for each thread
        const threadDetails = await Promise.all(
            data.threads.map(async (thread) => {
                const res = await fetch(`${GMAIL_API_BASE}/threads/${thread.id}`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                return res.json();
            })
        );

        return formatThreads(threadDetails);
    } catch (error) {
        console.error('Error fetching Gmail threads:', error);
        return [];
    }
};

/**
 * Formats Google's complex thread response into a simple message format for our UI
 */
const formatThreads = (threads) => {
    return threads.map(thread => {
        const lastMessage = thread.messages[thread.messages.length - 1];
        const headers = lastMessage.payload.headers;

        const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
        const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
        const date = headers.find(h => h.name === 'Date')?.value || '';

        // Extract snippet/excerpt
        const snippet = lastMessage.snippet;

        return {
            id: thread.id,
            sender: from.split('<')[0].trim(),
            subject: subject,
            excerpt: snippet,
            time: new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isUnread: thread.messages.some(m => m.labelIds?.includes('UNREAD')),
            fullDate: date
        };
    });
};
