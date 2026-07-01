/**
 * ============================================================
 *  Integration Service
 *  Handles external channel payloads, webhooks, and parsing for:
 *    - WhatsApp API alerts & webhook processing
 *    - Email subject line pattern matching (extracting reference keys)
 *    - Google Drive explorer path resolution
 * ============================================================
 */

/**
 * 1. API SCHEMA & WORKFLOW STATE
 * The Enquiry object lifecycle statuses:
 *   - 'New' or 'Open' (mapped to 'New Enquiry' in UI)
 *   - 'RFQ Floated' (awaiting supplier quotes)
 *   - 'Quoted' or 'Quote Sent' (quotation sent to customer)
 *   - 'Job Created' (converted to active job)
 *   - 'Closed' / 'Cancelled'
 * 
 * Simulated database row structure:
 * @typedef {Object} Enquiry
 * @property {string} id - UUID primary key
 * @property {string} enquiry_no - Unique auto-increment number (e.g. ECEL-2606-2401)
 * @property {string} company_id - UUID for multi-tenancy separation
 * @property {string} customer_id - UUID referencing public.partners
 * @property {string} contact_id - UUID referencing public.contacts
 * @property {string} enquiry_date - Date received (YYYY-MM-DD)
 * @property {string} due_date - Response deadline (YYYY-MM-DD)
 * @property {string} source_type - Channel received from ('Email', 'WhatsApp', 'Verbal', etc.)
 * @property {string} description - Rich text or plain description
 * @property {string} customer_ref - Reference code (e.g. SR-4457-L26-1832, Enquiry, Draft)
 * @property {string} status - Workflow status ('New', 'Open', 'RFQ Floated', 'Quoted', 'Job Created', etc.)
 * @property {string} gdrive_folder_id - Google Drive folder ID for this specific enquiry
 * @property {string} gdrive_file_link - Google Drive webViewLink
 */


/**
 * 2. EMAIL SUBJECT PARSING LOGIC
 * Extracts reference numbers (such as job ref, enquiry ref, or service request ID) 
 * from incoming email subject lines.
 * 
 * Matches patterns:
 *   - SR references: e.g., SR-4457-L26-1832
 *   - Enquiry references: e.g., ECEL-2606-2401, ENQ-CEL-2606-1000
 * 
 * @param {string} subject - Email subject line
 * @returns {string|null} Extracted reference or null
 */
export const parseEmailSubjectForReference = (subject) => {
    if (!subject) return null;

    // Matches standard SR patterns (e.g., SR-4457-L26-1832)
    const srPattern = /SR-\d{4}-[A-Z0-9]+-\d{4}/i;
    // Matches Celron custom enquiry pattern (e.g., ECEL-2606-2401 or ENQ-CEL-2606-1000)
    const enqPattern = /(?:ENQ|ECEL)-[A-Z0-9]+-\d{4}/i;
    const generalEnqPattern = /Enq-\d{4}-\d{4}/i;

    const srMatch = subject.match(srPattern);
    if (srMatch) return srMatch[0].toUpperCase();

    const enqMatch = subject.match(enqPattern) || subject.match(generalEnqPattern);
    if (enqMatch) return enqMatch[0].toUpperCase();

    return null;
};


/**
 * 3. WHATSAPP API INTEGRATION PAYLOAD
 * Formats a Cloud WhatsApp API request payload to send template alerts 
 * for incoming enquiries, float RFQs, or overdue reminders.
 * 
 * @param {string} toPhoneNumber - Destination phone number with country code (e.g. "6597685891")
 * @param {string} templateName - Template registered in Meta Dashboard
 * @param {Array} components - Template parameter components
 * @returns {Object} WhatsApp API JSON request body
 */
export const buildWhatsAppAlertPayload = (toPhoneNumber, templateName, components) => {
    return {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toPhoneNumber.replace(/[^0-9]/g, ''),
        type: "template",
        template: {
            name: templateName,
            language: {
                code: "en_US"
            },
            components: components
        }
    };
};

/**
 * 4. WHATSAPP WEBHOOK SIMULATOR
 * Processes webhook postbacks from Meta's WhatsApp Cloud API.
 * Detects reference numbers automatically from the text body to assist in auto-linking.
 * 
 * @param {Object} webhookBody - Postback JSON payload from Meta WhatsApp Webhook
 * @returns {Object} Extracted data: success status, sender, text message, and parsed reference
 */
export const simulateWhatsAppReceiveWebhook = (webhookBody) => {
    console.log("[Webhook] WhatsApp event received:", JSON.stringify(webhookBody, null, 2));

    const entry = webhookBody.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
        return { success: false, reason: "No message content found" };
    }

    const from = message.from;
    const textBody = message.text?.body || "";
    const detectedRef = parseEmailSubjectForReference(textBody);

    return {
        success: true,
        sender: from,
        messageText: textBody,
        detectedReference: detectedRef,
        timestamp: message.timestamp
    };
};


/**
 * 5. GOOGLE DRIVE EXPLORER URL RESOLUTION
 * Resolves the URL for the folder explorer button. If folder ID is not yet provisioned,
 * falls back to the parent 'ENQUIRIES' root path under CelronHub.
 * 
 * @param {Enquiry} enquiry - The enquiry object
 * @param {string} rootFolderId - The main google_drive_folder_id from settings
 * @returns {string} Target URL
 */
export const getGoogleDriveExplorerUrl = (enquiry, rootFolderId) => {
    if (enquiry?.gdrive_file_link) {
        return enquiry.gdrive_file_link;
    }
    if (enquiry?.gdrive_folder_id) {
        return `https://drive.google.com/drive/folders/${enquiry.gdrive_folder_id}`;
    }
    // Fallback to general time-based inquiries directory
    const activeYear = new Date(enquiry?.enquiry_date || enquiry?.created_at || Date.now()).getFullYear();
    if (rootFolderId) {
        const cleanRoot = rootFolderId.replace('https://drive.google.com/drive/folders/', '');
        return `https://drive.google.com/drive/folders/${cleanRoot}`;
    }
    return "https://drive.google.com";
};
