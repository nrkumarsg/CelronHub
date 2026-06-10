import { supabase } from './supabase';

/**
 * Log a user action or activity to the audit_logs table.
 * 
 * @param {string} actionType - The type of action (e.g., 'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'SCAN_OCR', 'EXPORT')
 * @param {string|null} tableName - The database table name related to this action (if any, e.g., 'partners')
 * @param {string|null} recordId - The UUID of the record being acted upon (if any)
 * @param {object} metadata - Extra details (e.g., old/new values, page title, specific options chosen)
 */
export const logUserActivity = async (actionType, tableName = null, recordId = null, metadata = {}) => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
            console.log('[AuditService] Bypass log: No active user session.');
            return;
        }

        const user = session.user;
        let companyId = null;
        let email = user.email || 'unknown@celron.ae';

        // Load profile from localStorage cache for fast, low-network execution
        const cachedProfile = localStorage.getItem('auth_cached_profile');
        if (cachedProfile) {
            try {
                const profile = JSON.parse(cachedProfile);
                companyId = profile.company_id || profile.company?.id;
                if (profile.email) email = profile.email;
            } catch (e) {
                console.warn('[AuditService] Failed parsing cached profile:', e);
            }
        }

        // Fallback for company_id if not found in cache
        if (!companyId) {
            companyId = 'd0000000-0000-0000-0000-000000000001'; // Default Cel-Ron Global company
        }

        const logRecord = {
            user_id: user.id,
            user_email: email,
            company_id: companyId,
            action_type: actionType,
            table_name: tableName,
            record_id: recordId,
            old_data: metadata.old_data || null,
            new_data: metadata.new_data || null,
            metadata: {
                ...metadata,
                browser: navigator.userAgent,
                page_url: window.location.href,
                page_path: window.location.pathname,
                client_timestamp: new Date().toISOString()
            }
        };

        // Suppress old_data/new_data inside metadata if already set at top-level
        delete logRecord.metadata.old_data;
        delete logRecord.metadata.new_data;

        const { error } = await supabase.from('audit_logs').insert([logRecord]);
        if (error) {
            console.error('[AuditService] Failed to insert audit log:', error.message);
        } else {
            console.log(`[AuditService] Action logged: ${actionType} on ${tableName || 'system'}`);
        }
    } catch (err) {
        console.error('[AuditService] Unexpected error logging activity:', err);
    }
};
