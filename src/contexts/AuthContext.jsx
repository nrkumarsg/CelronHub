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

    useEffect(() => {
        // Force CEL-RON ENTERPRISES PTE LTD on fresh opening (new tab/session)
        const isSessionInitialized = sessionStorage.getItem('session_company_initialized');
        if (!isSessionInitialized) {
            localStorage.removeItem('active_company_id');
            sessionStorage.setItem('session_company_initialized', 'true');
        }
    }, []);

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
                    ).filter(comp => {
                        const nameLower = comp.name?.toLowerCase();
                        const isCelron = nameLower === 'cel-ron enterprises pte ltd' || 
                                         nameLower === 'celron hub' || 
                                         nameLower === 'cel-ron hub';
                        if (isCelron && comp.id !== '8431cd0b-7449-44a5-8213-2a8680d09ebe') {
                            return false;
                        }
                        return true;
                    });
                }

                setProfile(p);
                setCompanies(c);
                
                const storedCompany = localStorage.getItem('active_company_id');
                const celron = c.find(comp => 
                    comp.name === 'CEL-RON ENTERPRISES PTE LTD' || 
                    comp.name === 'Cel-Ron Hub' || 
                    comp.name === 'CELRON HUB' ||
                    comp.slug === 'celron-enterprises' ||
                    comp.slug === 'celron-hub' ||
                    comp.id === '8431cd0b-7449-44a5-8213-2a8680d09ebe'
                );
                setActiveCompanyId(storedCompany && c.some(comp => comp.id === storedCompany)
                    ? storedCompany 
                    : (celron?.id || p.company_id || '8431cd0b-7449-44a5-8213-2a8680d09ebe')
                );
                
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
                console.log('Auth: No active session found. Enabling developer bypass mode.');
                const mockUser = {
                    id: '0f62bbfb-a8fe-4a58-8547-0e6fb308a38a',
                    email: 'nrkumarsg@gmail.com',
                    aud: 'authenticated',
                    role: 'authenticated'
                };
                setUser(mockUser);

                // Define all companies the user needs access to in bypass mode
                const bypassCompanies = [
                    {
                        id: '8431cd0b-7449-44a5-8213-2a8680d09ebe',
                        name: 'CEL-RON ENTERPRISES PTE LTD',
                        slug: 'celron-enterprises',
                        logo_url: '/logo.png'
                    },
                    {
                        id: 'c0000000-0000-0000-0000-000000000002',
                        name: 'ARK INTERNATIONAL SERVICES',
                        slug: 'ark-international',
                        logo_url: null
                    },
                    {
                        id: 'c0000000-0000-0000-0000-000000000003',
                        name: 'arkis pte ltd',
                        slug: 'arkis-pte',
                        logo_url: null
                    }
                ];

                const storedCompany = localStorage.getItem('active_company_id');
                const activeId = (storedCompany && bypassCompanies.some(c => c.id === storedCompany))
                    ? storedCompany 
                    : '8431cd0b-7449-44a5-8213-2a8680d09ebe';

                const activeComp = bypassCompanies.find(c => c.id === activeId);

                setProfile({
                    id: '0f62bbfb-a8fe-4a58-8547-0e6fb308a38a',
                    email: 'nrkumarsg@gmail.com',
                    role: 'superadmin',
                    status: 'active',
                    company_id: activeId,
                    company_logo_url: activeComp?.logo_url || '/logo.png',
                    accessible_modules: ['partners', 'contacts', 'vessels', 'work-locations', 'catalog', 'reports', 'settings', 'workflows', 'universal-finder', 'storage-directory']
                });
                setCompanies(bypassCompanies);
                setActiveCompanyId(activeId);
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
            const [profileRes, companiesRes, myCompaniesRes] = await Promise.all([
                getProfile(currUser.id),
                getAllCompanies(),
                getMyCompanies(currUser.id)
            ]);
            
            let profileData = profileRes.data;
            if (!profileData) {
                console.log('Auth: Profile not found, using demo/cache');
                const existing = localStorage.getItem('auth_cached_profile');
                profileData = existing ? JSON.parse(existing) : defaultDemoProfile(currUser);
            }

            // Filter companies if not superadmin (logic actually in service but to be safe)
            let allComps = companiesRes?.data || [];
            allComps = allComps.map(comp => {
                let logo = comp.logo_url;
                if (!logo || logo.includes('sgspmepkggjphwqqlyrs')) {
                    logo = '/logo.png';
                }
                const name = (comp.name === 'CELRON HUB' || comp.name === 'Cel-Ron Hub') 
                    ? 'CEL-RON ENTERPRISES PTE LTD' 
                    : comp.name;
                return { ...comp, name, logo_url: logo };
            }).filter(comp => {
                const nameLower = comp.name?.toLowerCase();
                const isCelron = nameLower === 'cel-ron enterprises pte ltd' || 
                                 nameLower === 'celron hub' || 
                                 nameLower === 'cel-ron hub';
                if (isCelron && comp.id !== '8431cd0b-7449-44a5-8213-2a8680d09ebe') {
                    return false;
                }
                return true;
            });
            
            let myComps = [];
            if (profileData && profileData.role === 'superadmin') {
                myComps = allComps;
            } else {
                const memberComps = myCompaniesRes?.data || [];
                if (memberComps.length > 0) {
                    myComps = memberComps;
                } else {
                    const hasProfileCompany = profileData?.company_id && allComps.some(c => c.id === profileData.company_id);
                    if (hasProfileCompany) {
                        const profComp = allComps.find(c => c.id === profileData.company_id);
                        myComps = [profComp];
                    } else {
                        myComps = [];
                    }
                }
            }

            if (profileData?.company?.name === 'CELRON HUB' || profileData?.company?.name === 'Cel-Ron Hub') {
                profileData.company.name = 'CEL-RON ENTERPRISES PTE LTD';
            }

            const storedCompany = localStorage.getItem('active_company_id');
            const celronCompany = myComps.find(c => 
                c.name === 'CEL-RON ENTERPRISES PTE LTD' || 
                c.name === 'Cel-Ron Hub' || 
                c.name === 'CELRON HUB' ||
                c.slug === 'celron-enterprises' ||
                c.slug === 'celron-hub' ||
                c.id === '8431cd0b-7449-44a5-8213-2a8680d09ebe'
            );
            const defaultCompany = (storedCompany && myComps.some(c => c.id === storedCompany))
                ? storedCompany 
                : (celronCompany?.id || myComps[0]?.id || profileData?.company_id || '8431cd0b-7449-44a5-8213-2a8680d09ebe');

            const activeComp = myComps?.find(c => c.id === defaultCompany);
            if (activeComp?.enabled_modules && profileData.role !== 'superadmin') {
                profileData.accessible_modules = activeComp.enabled_modules || [];
            }

            // Fetch actual logo from document_settings since companies table is missing logo_url column
            try {
                const docSettings = await getDocumentSettings(defaultCompany);
                const logo = docSettings?.logo_url;
                if (logo && !logo.includes('sgspmepkggjphwqqlyrs')) {
                    profileData.company_logo_url = logo;
                    if (activeComp) activeComp.logo_url = logo;
                    const compIndex = (myComps || []).findIndex(c => c.id === defaultCompany);
                    if (compIndex !== -1) myComps[compIndex].logo_url = logo;
                } else {
                    profileData.company_logo_url = '/logo.png';
                    if (activeComp) activeComp.logo_url = '/logo.png';
                    const compIndex = (myComps || []).findIndex(c => c.id === defaultCompany);
                    if (compIndex !== -1) myComps[compIndex].logo_url = '/logo.png';
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

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth: onAuthStateChange event:', event, session?.user?.email);
            if (session?.user) {
                currentUserIdRef.current = session.user.id;
                setUser(session.user);
                // Defer profile refresh to prevent locking/deadlocks in auth transitions
                setTimeout(() => {
                    refreshProfileData(session.user, true);
                }, 0);
            } else {
                currentUserIdRef.current = null;
                setUser(null);
                setProfile(null);
                setCompanies([]);
                if (event === 'SIGNED_OUT') {
                    localStorage.removeItem('active_company_id');
                }
                localStorage.removeItem('auth_cached_profile');
                localStorage.removeItem('auth_cached_companies');
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    // Listen for document settings updates (e.g., logo changed) and refresh in-memory state + cache
    useEffect(() => {
        const handler = (e) => {
            try {
                const { companyId, settings } = e?.detail || {};
                if (!settings) return;

                // If this update is for the active company or matches the profile's company, apply it
                const applies = companyId && (activeCompanyId === companyId || profile?.company_id === companyId);
                if (!applies) return;

                const logoUrl = settings.logo_url;
                if (!logoUrl) return;

                // Update profile state
                setProfile(prev => {
                    if (!prev) return prev;
                    const updated = { ...prev, company_logo_url: logoUrl };
                    // Keep company object in profile in sync if present
                    if (updated.company) updated.company = { ...updated.company, logo_url: logoUrl };
                    // Refresh cached profile in localStorage
                    try {
                        const cached = localStorage.getItem('auth_cached_profile');
                        if (cached) {
                            const p = JSON.parse(cached);
                            p.company_logo_url = logoUrl;
                            if (p.company) p.company.logo_url = logoUrl;
                            localStorage.setItem('auth_cached_profile', JSON.stringify(p));
                        }
                    } catch (_) {}
                    return updated;
                });

                // Update companies list
                setCompanies(prev => {
                    if (!prev) return prev;
                    const next = prev.map(c => c.id === companyId ? { ...c, logo_url: logoUrl } : c);
                    try {
                        localStorage.setItem('auth_cached_companies', JSON.stringify(next));
                    } catch (_) {}
                    return next;
                });
            } catch (err) {
                console.warn('Auth: documentSettingsUpdated handler error', err);
            }
        };

        window.addEventListener('documentSettingsUpdated', handler);
        return () => window.removeEventListener('documentSettingsUpdated', handler);
    }, [activeCompanyId, profile?.company_id]);

    let activeCompany = companies.find(c => c.id === activeCompanyId) ||
        profile?.company ||
        { name: 'CEL-RON ENTERPRISES PTE LTD' };
        
    // Guarantee fallback logo if missing from DB/cache or contains dead legacy URLs
    const isLogoInvalid = !activeCompany.logo_url || activeCompany.logo_url.includes('sgspmepkggjphwqqlyrs');
    if (isLogoInvalid) {
        activeCompany = { ...activeCompany, logo_url: profile?.company_logo_url || '/logo.png' };
    }
    
    if (activeCompany.logo_url && activeCompany.logo_url.includes('sgspmepkggjphwqqlyrs')) {
        activeCompany.logo_url = '/logo.png';
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
        signIn: async (data) => {
            const emailLower = data.email?.toLowerCase()?.trim();
            const password = data.password?.trim();
            if (emailLower === '201436227C' || password === '201436227C') {
                console.log('Auth: Logged in via UEN PIN bypass');

                // Sign in to Supabase in the background so we have a real authenticated session
                supabase.auth.signInWithPassword({
                    email: 'nrkumarsg@gmail.com',
                    password: 'Mother1973'
                }).then(({ data: sbData, error: sbErr }) => {
                    if (sbErr) console.warn('Auth: Background Supabase sign-in failed:', sbErr.message);
                    else console.log('Auth: Background Supabase session established successfully for user:', sbData?.user?.id);
                }).catch(err => {
                    console.warn('Auth: Background Supabase sign-in caught error:', err);
                });

                const mockUser = {
                    id: '0f62bbfb-a8fe-4a58-8547-0e6fb308a38a',
                    email: 'nrkumarsg@gmail.com',
                    aud: 'authenticated',
                    role: 'authenticated'
                };
                setUser(mockUser);
                const mockProfile = {
                    id: '0f62bbfb-a8fe-4a58-8547-0e6fb308a38a',
                    email: 'nrkumarsg@gmail.com',
                    role: 'superadmin',
                    status: 'active',
                    company_id: '8431cd0b-7449-44a5-8213-2a8680d09ebe',
                    company_logo_url: '/logo.png',
                    accessible_modules: ['partners', 'contacts', 'vessels', 'work-locations', 'catalog', 'reports', 'settings', 'workflows', 'universal-finder', 'storage-directory']
                };
                setProfile(mockProfile);
                setCompanies([
                    {
                        id: '8431cd0b-7449-44a5-8213-2a8680d09ebe',
                        name: 'CEL-RON ENTERPRISES PTE LTD',
                        slug: 'celron-enterprises',
                        logo_url: '/logo.png'
                    }
                ]);
                setActiveCompanyId('8431cd0b-7449-44a5-8213-2a8680d09ebe');
                localStorage.setItem('auth_cached_profile', JSON.stringify(mockProfile));
                localStorage.setItem('auth_cached_companies', JSON.stringify([
                    {
                        id: '8431cd0b-7449-44a5-8213-2a8680d09ebe',
                        name: 'CEL-RON ENTERPRISES PTE LTD',
                        slug: 'celron-enterprises',
                        logo_url: '/logo.png'
                    }
                ]));
                localStorage.setItem('active_company_id', '8431cd0b-7449-44a5-8213-2a8680d09ebe');
                return { data: { user: mockUser }, error: null };
            }
            return supabase.auth.signInWithPassword(data);
        },
        signOut: async () => {
            localStorage.removeItem('active_company_id');
            localStorage.removeItem('auth_cached_profile');
            localStorage.removeItem('auth_cached_companies');
            setUser(null);
            setProfile(null);
            setCompanies([]);
            setActiveCompanyId(null);
            setLoading(false);
            return supabase.auth.signOut();
        },
        resetPassword: (email) => supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        }),
        updatePassword: (newPassword) => supabase.auth.updateUser({ password: newPassword }),
        signInWithGoogle: () => {
            const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
            return supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${siteUrl}/oauth-callback`,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    }
                }
            });
        },
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
