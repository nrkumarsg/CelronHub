import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function OAuthCallback() {
    const navigate = useNavigate();

    useEffect(() => {
        const handleCallback = async () => {
            // Extract tokens from URL hash (Implicit Flow)
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);

            const accessToken = params.get('access_token');
            const state = params.get('state'); // This contains our accountId
            const expiresIn = params.get('expires_in') || '3600'; // Default to 1 hour if missing

            if (accessToken && state) {
                try {
                    console.log('Processing callback for state:', state);

                    // Store token globally for Vault/OCR/Drive integration
                    localStorage.setItem('google_access_token', accessToken);
                    localStorage.setItem('google_token_expiry', new Date(Date.now() + parseInt(expiresIn) * 1000).toISOString());

                    if (state === 'contacts_sync' || state === 'manual_upload' || state === 'enquiry_form' || state === 'catalog_photo_upload' || state === 'calibration_lab' || state === 'scanner_module' || state === 'apk_management' || state === 'drive_status_tray' || state === 'drive_card_sync') {
                        // Temp store token for the sync process
                        sessionStorage.setItem('google_contacts_token', accessToken);
                        sessionStorage.setItem('google_contacts_expires', new Date(Date.now() + parseInt(expiresIn) * 1000).toISOString());

                        const messageMap = {
                            enquiry_form: 'Google Account Connected! You can now resume saving.',
                            contacts_sync: 'Google Contacts Connected!',
                            manual_upload: 'Google Drive Connected!',
                            catalog_photo_upload: 'Google Drive Connected! You can now upload photos.',
                            calibration_lab: 'Google Drive Connected! Calibration Lab is ready.',
                            scanner_module: 'Google Drive Connected! Celron Scanner is active.',
                            apk_management: 'Google Drive Connected! APK Manager is ready.',
                            drive_status_tray: 'Google Drive Connected!',
                            drive_card_sync: 'Google Drive Connected! Card Scanner is ready.'
                        };

                        const targetMap = {
                            enquiry_form: '/workflows',
                            contacts_sync: '/contacts',
                            manual_upload: '/manuals/new',
                            catalog_photo_upload: '/catalog',
                            calibration_lab: '/forms/calibration-lab',
                            scanner_module: '/scanner',
                            apk_management: '/admin/apks',
                            drive_status_tray: '/dashboard',
                            drive_card_sync: '/partners/ai-drive-parser'
                        };

                        const returnUrl = sessionStorage.getItem('google_auth_return_url');
                        const target = returnUrl || targetMap[state] || '/dashboard';
                        if (returnUrl) sessionStorage.removeItem('google_auth_return_url');

                        alert(messageMap[state] || 'Google Connected Successfully!');
                        navigate(target);
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

                    // Update the communication account with the auth data
                    const { data, error, count } = await supabase
                        .from('communication_accounts')
                        .update({
                            auth_data: {
                                access_token: accessToken,
                                expires_at: new Date(Date.now() + parseInt(expiresIn) * 1000).toISOString(),
                            }
                        })
                        .eq('id', state)
                        .select(); // Select back to verify it worked

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
                } catch (err) {
                    console.error('Callback error:', err);
                    alert(`Failed to save authentication data: ${err.message}`);
                    navigate('/messaging');
                }
            } else {
                console.warn('Callback missing token or state:', { hasToken: !!accessToken, state });
                navigate('/messaging');
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
