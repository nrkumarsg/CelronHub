import { createClient } from '@supabase/supabase-js'

// --- GLOBAL LOCK MANAGER BYPASS ---
// In some browsers/environments, the Navigator LockManager hangs or fails.
// We monkey-patch it to ensure it never blocks Supabase operations.
if (typeof window !== 'undefined' && window.navigator && window.navigator.locks) {
    const originalRequest = window.navigator.locks.request.bind(window.navigator.locks);
    window.navigator.locks.request = async (name, options, callback) => {
        // If it's a Supabase-related lock, we bypass the wait or use a timeout
        if (name.includes('supabase') || name.includes('sb-')) {
            console.log(`[SupabaseFix] Bypassing lock request: ${name}`);
            if (typeof options === 'function') return options({ release: () => {} });
            if (callback) return callback({ release: () => {} });
            return { release: () => {} };
        }
        return originalRequest(name, options, callback);
    };
}
console.log('SUPABASE_CONFIG: v5_GLOBAL_LOCK_BYPASS_ENABLED');
// --- END BYPASS ---

const supabaseUrl = (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
    (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
    'https://dfoihdzpgkrtyerzzchm.supabase.co'
);
const supabaseAnonKey = (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
    (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmb2loZHpwZ2tydHllcnp6Y2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NzMxMTgsImV4cCI6MjA4NzE0OTExOH0.9FGN21KeUpS0UyyFJJ1YjXLElL4AF6ym_hKAJsr_ek4'
);


const isLocalStorageAvailable = () => {
    if (typeof window === 'undefined') return false;
    try {
        const key = '__ls_test__';
        window.localStorage.setItem(key, key);
        window.localStorage.removeItem(key);
        return true;
    } catch (e) {
        return false;
    }
};

// Memory storage fallback for restricted browsers
class MemoryStorage {
    constructor() { this.items = {}; }
    getItem(key) { return this.items[key] || null; }
    setItem(key, value) { this.items[key] = value; }
    removeItem(key) { delete this.items[key]; }
}

const storage = isLocalStorageAvailable() ? window.localStorage : new MemoryStorage();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: isLocalStorageAvailable(),
        detectSessionInUrl: typeof window !== 'undefined',
        storage: storage,
        lockManager: {
            acquire: async (name, callback) => {
                if (typeof callback === 'function') {
                    return await callback();
                }
                if (typeof name === 'function') {
                    return await name();
                }
                return { release: () => {} };
            }
        },
    },
    global: {
        headers: { 'x-my-custom-header': 'celronhub' }
    }
})

if (typeof window !== 'undefined') {
    window.supabase = supabase;
}
