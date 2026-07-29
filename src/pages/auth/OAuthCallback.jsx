import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function OAuthCallback() {
    const navigate = useNavigate();

    useEffect(() => {
        const handleCallback = async () => {
            // Extract tokens from URL hash
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);

            const accessToken = params.get('access_token');
            const stateRaw = params.get('state'); // Custom state for Drive flows
            const state = stateRaw || '';
            const expiresIn = params.get('expires_in') || '3600';

            console.log('[OAuthCallback] hash params:', { hasToken: !!accessToken, state });

            // ─── CASE 1: Supabase Auth Login (Google Sign-In) ────────────────────
            // When a user signs in with Google for authentication, Supabase returns
            // an access_token in the hash but with NO custom state.
            // We let Supabase SDK process the session automatically via onAuthStateChange.
            if (accessToken && !state) {
                try {
                    // Supabase automatically picks up the session from the URL hash.
                    const { data: { session }, error } = await supabase.auth.getSession();
                    if (error) throw error;

                    if (session?.user) {
                        console.log('[OAuthCallback] Auth login successful for:', session.user.email);
                        navigate('/', { replace: true });
                    } else {
                        // Try PKCE code exchange from query params
                        const urlParams = new URLSearchParams(window.location.search);
                        const code = urlParams.get('code');
                        if (code) {
                            const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
                            if (exchangeErr) throw exchangeErr;
                            navigate('/', { replace: true });
                        } else {
                            console.warn('[OAuthCallback] No session and no code found.');
                            navigate('/login', { replace: true });
                        }
                    }
                } catch (err) {
                    console.error('[OAuthCallback] Auth login error:', err);
                    navigate('/login', { replace: true });
                }
                return;
            }

            // ─── CASE 2: PKCE Code Exchange (code in query params, no hash token) ─
            const urlSearchParams = new URLSearchParams(window.location.search);
            const code = urlSearchParams.get('code');
            if (code && !state) {
                try {
                    const { error } = await supabase.auth.exchangeCodeForSession(code);
                    if (error) throw error;
                    console.log('[OAuthCallback] PKCE session exchange successful');
                    navigate('/', { replace: true });
                } catch (err) {
                    console.error('[OAuthCallback] PKCE exchange error:', err);
                    navigate('/login', { replace: true });
                }
                return;
            }

            // ─── CASE 3: Google Drive / Feature OAuth (has state) ────────────────
            if (accessToken && state) {
                try {
                    console.log('Processing Drive/feature callback for state:', state);

                    // Store token globally for Vault/OCR/Drive integration
                    localStorage.setItem('google_access_token', accessToken);
                    localStorage.setItem('google_token_expiry', new Date(Date.now() + parseInt(expiresIn) * 1000).toISOString());

                    const baseState = state.split(':')[0];

                    if (['general','contacts_sync','manual_upload','mobile_upload','enquiry_form','catalog_photo_upload','catalog_spare_new','calibration_lab','scanner_module','apk_management','drive_status_tray','drive_card_sync','drive_bill_sync'].includes(baseState)) {
                        localStorage.setItem('google_access_token', accessToken);
                        localStorage.setItem('google_token_expiry', new Date(Date.now() + parseInt(expiresIn) * 1000).toISOString());
                        sessionStorage.setItem('google_contacts_token', accessToken);
                        sessionStorage.setItem('google_contacts_expires', new Date(Date.now() + parseInt(expiresIn) * 1000).toISOString());

                        const messageMap = {
                            general: 'Google Drive Connected!',
                            mobile_upload: 'Google Account Signed In! You can now upload files from your mobile phone.',
                            enquiry_form: 'Google Account Connected! You can now resume saving.',
                            contacts_sync: 'Google Contacts Connected!',
                            manual_upload: 'Google Drive Connected!',
                            catalog_photo_upload: 'Google Drive Connected! You can now upload photos.',
                            catalog_spare_new: 'Google Drive Connected! Creating spare part folders now…',
                            calibration_lab: 'Google Drive Connected! Calibration Lab is ready.',
                            scanner_module: 'Google Drive Connected! Celron Scanner is active.',
                            apk_management: 'Google Drive Connected! APK Manager is ready.',
                            drive_status_tray: 'Google Drive Connected!',
                            drive_card_sync: 'Google Drive Connected! Card Scanner is ready.',
                            drive_bill_sync: 'Google Drive Connected! Accounts Payable Scanner is ready.'
                        };

                        const targetMap = {
                            general: '/dashboard',
                            mobile_upload: '/upload-media',
                            enquiry_form: '/workflows',
                            contacts_sync: '/contacts',
                            manual_upload: '/catalog/manuals/new',
                            catalog_photo_upload: '/catalog',
                            catalog_spare_new: '/catalog',
                            calibration_lab: '/forms/calibration-lab',
                            scanner_module: '/scanner',
                            apk_management: '/admin/apks',
                            drive_status_tray: '/dashboard',
                            drive_card_sync: '/partners/ai-drive-parser',
                            drive_bill_sync: '/accounts/bills'
                        };

                        const returnUrl = sessionStorage.getItem('google_auth_return_url');
                        let target = returnUrl || targetMap[baseState] || '/dashboard';
                        if (returnUrl) sessionStorage.removeItem('google_auth_return_url');

                        // If returnUrl exists and doesn't contain token yet, append token
                        if (target.includes('/upload-media') && !target.includes('token=')) {
                            target += (target.includes('?') ? '&' : '?') + `token=${accessToken}`;
                        }

                        alert(messageMap[baseState] || 'Google Connected Successfully!');
                        window.location.href = target;
                        return;
                    }

                    if (state.startsWith('job_')) {
                        const jobId = state.split('_')[1];
                        alert('Google Drive Connected! You can now view and upload project files.');
                        navigate(`/workflows/editor/job/${jobId}`);
                        return;
                    }

                    // Ensure we have a session before updating
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) {
                        console.error('No authenticated user found during callback');
                        alert('Error: You are not logged in. Please log in again.');
                        navigate('/login');
                        return;
                    }

                    try {
                        if (state.includes(':')) {
                            const [base, companyId] = state.split(':');
                            if (companyId) {
                                localStorage.setItem('google_access_token_company_' + companyId, accessToken);
                                localStorage.setItem('google_token_expiry_company_' + companyId, new Date(Date.now() + parseInt(expiresIn) * 1000).toISOString());
                                localStorage.setItem('google_access_token', accessToken);
                                localStorage.setItem('google_token_expiry', new Date(Date.now() + parseInt(expiresIn) * 1000).toISOString());
                            }
                        }

                        if (!state.includes(':')) {
                            const { data, error } = await supabase
                                .from('communication_accounts')
                                .update({
                                    auth_data: {
                                        access_token: accessToken,
                                        expires_at: new Date(Date.now() + parseInt(expiresIn) * 1000).toISOString(),
                                    }
                                })
                                .eq('id', state)
                                .select();

                            if (error) {
                                console.error('Database update error:', error);
                                throw error;
                            }

                            if (!data || data.length === 0) {
                                console.warn('Update matched 0 rows. State/ID might be wrong:', state);
                                alert('Warning: Account not found in database. Please try adding the account again.');
                                navigate('/messaging');
                                return;
                            }

                            console.log('Successfully updated account:', state);
                            alert('Google API Connected Successfully!');
                            navigate('/messaging');
                            return;
                        }
                    } catch (e) {
                        console.warn('Partial callback handling:', e);
                    }
                    alert('Google API Connected Successfully!');
                    navigate('/dashboard');
                } catch (err) {
                    console.error('Callback error:', err);
                    alert(`Failed to save authentication data: ${err.message}`);
                    navigate('/messaging');
                }
            } else {
                // No token, no code — unexpected
                console.warn('[OAuthCallback] No token or code found in callback URL');
                navigate('/login', { replace: true });
            }
        };

        handleCallback();
    }, [navigate]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '20px' }}>
            <div className="animate-spin" style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #3498db', borderRadius: '50%' }}></div>
            <p style={{ color: '#64748b' }}>Completing Google Authentication...</p>
        </div>
    );
}
