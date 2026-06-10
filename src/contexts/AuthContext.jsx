import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getProfile } from '../lib/userService';
import { getMyCompanies, getAllCompanies } from '../lib/companyService';
import { getDocumentSettings } from '../lib/store';
import { logUserActivity } from '../lib/auditService';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [companies, setCompanies] = useState([]);
    const [activeCompanyId, setActiveCompanyId] = useState(null);
    const isRefreshingRef = React.useRef(false);
    const initializationStartedRef = React.useRef(false);
    const currentUserIdRef = React.useRef(null);

    const defaultDemoProfile = (user) => {
        const email = user?.email || 'demo@celron.ae';
        const role = email.toLowerCase() === 'nrkumarsg@gmail.com' ? 'superadmin' : 'user';
        return {
            id: user.id || 'demo-user',
            email,
            role,
            status: 'active',
            company_id: '8431cd0b-7449-44a5-8213-2a8680d09ebe',
            accessible_modules: ['partners', 'contacts', 'vessels', 'work-locations', 'catalog', 'reports', 'settings', 'workflows', 'universal-finder', 'storage-directory']
        };
    };

    const initializeAuth = async () => {
        if (initializationStartedRef.current) return;
        initializationStartedRef.current = true;
        
        console.log('Auth: AuthProvider initializing...');
        
        // 1. Load from cache for instant UI
        const cachedProfile = localStorage.getItem('auth_cached_profile');
        const cachedCompanies = localStorage.getItem('auth_cached_companies');
        let hasCache = false;

        if (cachedProfile && cachedCompanies) {
            try {
                const p = JSON.parse(cachedProfile);
                let c = JSON.parse(cachedCompanies);
                
                // Force update cached legacy names to the correct corporate name
                if (p?.company?.name === 'CELRON HUB' || p?.company?.name === 'Cel-Ron Hub') {
                    p.company.name = 'CEL-RON ENTERPRISES PTE LTD';
                }
                if (c && c.length) {
                    c = c.map(comp => 
                        (comp.name === 'CELRON HUB' || comp.name === 'Cel-Ron Hub') 
                            ? { ...comp, name: 'CEL-RON ENTERPRISES PTE LTD' } 
                            : comp
                    );
                }

                setProfile(p);
                setCompanies(c);
                
                const storedCompany = localStorage.getItem('active_company_id');
                setActiveCompanyId(storedCompany || p.company_id);
                
                hasCache = true;
                setLoading(false); // INSTANT ACCESS if cache exists
                console.log('Auth: Instant access via cache enabled');
            } catch (e) {
                console.warn('Auth: Corrupt cache cleared');
                localStorage.removeItem('auth_cached_profile');
                localStorage.removeItem('auth_cached_companies');
            }
        }

        const safetyTimer = setTimeout(() => {
            if (loading) {
                console.warn('Auth: Safety timeout reached. Forcing dashboard access.');
                setLoading(false);
            }
        }, hasCache ? 15000 : 8000); // Wait longer if we already have cache to avoid flicker

        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (session?.user) {
                currentUserIdRef.current = session.user.id;
                setUser(session.user);
                // Background refresh
                await refreshProfileData(session.user, hasCache); 
            } else {
                console.log('Auth: No active session found.');
                currentUserIdRef.current = null;
                if (hasCache) {
                    // Cache was for a stale session
                    setUser(null);
                    setProfile(null);
                    setCompanies([]);
                }
                setLoading(false);
            }
        } catch (err) {
            console.error('Auth: Initialization error:', err);
            setLoading(false);
        } finally {
            clearTimeout(safetyTimer);
        }
    };

    const refreshProfileData = async (currUser, silent = false) => {
        if (!currUser) {
            setLoading(false);
            return;
        }

        if (isRefreshingRef.current && !silent) return;
        isRefreshingRef.current = true;

        if (!silent) setLoading(true);
        try {
            console.log('Auth: Refreshing workspace data...');
            // Parallel fetch for speed
            const [profileRes, companiesRes] = await Promise.all([
                getProfile(currUser.id),
                getAllCompanies() // Superadmin can see all, logic handled in refreshProfileData usually
            ]);
            
            let profileData = profileRes.data;
            if (!profileData) {
                console.log('Auth: Profile not found, using demo/cache');
                const existing = localStorage.getItem('auth_cached_profile');
                profileData = existing ? JSON.parse(existing) : defaultDemoProfile(currUser);
            }

            // Filter companies if not superadmin (logic actually in service but to be safe)
            const allComps = companiesRes?.data || [];
            const myComps = (profileData && profileData.role === 'superadmin') 
                ? allComps 
                : allComps.filter(c => c.id === profileData?.company_id);

            const storedCompany = localStorage.getItem('active_company_id');
            const defaultCompany = (storedCompany && myComps.some(c => c.id === storedCompany))
                ? storedCompany : (myComps[0]?.id || profileData?.company_id);

            const activeComp = myComps?.find(c => c.id === defaultCompany);
            if (activeComp?.enabled_modules && profileData.role !== 'superadmin') {
                profileData.accessible_modules = activeComp.enabled_modules || [];
            }

            // Fetch actual logo from document_settings since companies table is missing logo_url column
            try {
                const docSettings = await getDocumentSettings(defaultCompany);
                if (docSettings?.logo_url) {
                    profileData.company_logo_url = docSettings.logo_url;
                    if (activeComp) activeComp.logo_url = docSettings.logo_url;
                    const compIndex = (myComps || []).findIndex(c => c.id === defaultCompany);
                    if (compIndex !== -1) myComps[compIndex].logo_url = docSettings.logo_url;
                }
            } catch (err) {
                console.error('Auth: Failed to fetch document settings logo', err);
            }

            // Now update all states at once to trigger a single, complete render
            setProfile(profileData);
            setCompanies(myComps || []);
            setActiveCompanyId(defaultCompany);

            // Cache for next load
            localStorage.setItem('auth_cached_profile', JSON.stringify(profileData));
            localStorage.setItem('auth_cached_companies', JSON.stringify(myComps || []));

            console.log('Auth: Workspace ready.');
        } catch (err) {
            console.warn('Auth: Profile refresh error', err);
            // Even on error, we must stop loading so the app can attempt to render with cached/default data
            setLoading(false);
        } finally {
            isRefreshingRef.current = false;
            setLoading(false);
        }
    };

    useEffect(() => {
        initializeAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth: onAuthStateChange event:', event);

            const sessionUserId = session?.user?.id || null;

            if (sessionUserId !== currentUserIdRef.current) {
                console.log(`Auth: Session transition ${currentUserIdRef.current} -> ${sessionUserId}`);
                currentUserIdRef.current = sessionUserId;
                
                if (sessionUserId) {
                    setUser(session.user);
                    await refreshProfileData(session.user);
                    logUserActivity('LOGIN', null, null, { email: session.user.email });
                } else {
                    setUser(null);
                    setProfile(null);
                    setCompanies([]);
                    setActiveCompanyId(null);
                    localStorage.removeItem('auth_cached_profile');
                    localStorage.removeItem('auth_cached_companies');
                    setLoading(false);
                    logUserActivity('LOGOUT', null, null, { message: 'User logged out' });
                }
            } else if (!sessionUserId && event === 'SIGNED_OUT') {
                // Force cleanup on sign out even if ID was already null
                setUser(null);
                setProfile(null);
                setCompanies([]);
                setActiveCompanyId(null);
                localStorage.removeItem('auth_cached_profile');
                localStorage.removeItem('auth_cached_companies');
                setLoading(false);
                logUserActivity('LOGOUT', null, null, { message: 'Session signed out' });
            } else if (!session) {
                setLoading(false);
            }
        });

        // Realtime subscription for companies (makes it truly dynamic)
        const companySubscription = supabase
            .channel('companies-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, () => {
                console.log('Auth: Company change detected, refreshing...');
                const currentUser = supabase.auth.getUser();
                currentUser.then(({ data: { user: u } }) => {
                    if (u) refreshProfileData(u, true); // Pass silent=true if I add it, or just call it
                });
            })
            .subscribe();

        return () => {
            subscription?.unsubscribe();
            companySubscription?.unsubscribe();
        };
    }, []);

    let activeCompany = companies.find(c => c.id === activeCompanyId) ||
        profile?.company ||
        { name: 'CEL-RON ENTERPRISES PTE LTD' };
        
    // Guarantee fallback logo if missing from DB/cache
    if (!activeCompany.logo_url) {
        activeCompany = { ...activeCompany, logo_url: profile?.company_logo_url || '/logo.png' };
    }

    const value = {
        user,
        profile: profile ? { ...profile, company_id: activeCompanyId } : null,
        loading,
        companies,
        activeCompanyId,
        activeCompany,
        switchCompany: (companyId) => {
            setActiveCompanyId(companyId);
            localStorage.setItem('active_company_id', companyId);
        },
        signUp: (data) => supabase.auth.signUp(data),
        signIn: (data) => supabase.auth.signInWithPassword(data),
        signOut: () => {
            localStorage.removeItem('active_company_id');
            return supabase.auth.signOut();
        },
        resetPassword: (email) => supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        }),
        updatePassword: (newPassword) => supabase.auth.updateUser({ password: newPassword }),
        signInWithGoogle: () => supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/oauth-callback`
            }
        }),
        refreshProfile: async () => {
            if (user) {
                const { data } = await getProfile(user.id);
                setProfile(data);
            }
        }
    };

    return (
        <AuthContext.Provider value={value}>
            {loading ? (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100vh',
                    background: '#f8fafc',
                    color: '#334155'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ border: '4px solid #f3f4f6', borderTop: '4px solid #4f46e5', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }}></div>
                        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px 0' }}>CEL-RON ENTERPRISES PTE LTD</h2>
                        <p style={{ margin: 0, color: '#64748b' }}>Preparing your workspace...</p>
                        <button
                            onClick={() => setLoading(false)}
                            style={{ marginTop: '24px', background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                            Take too long? Skip to Dashboard
                        </button>
                    </div>
                </div>
            ) : children}
        </AuthContext.Provider>
    );
};
