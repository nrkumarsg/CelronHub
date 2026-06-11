import React, { useState, useEffect } from 'react';
import { 
    Smartphone, 
    Upload, 
    Link, 
    CheckCircle2, 
    AlertCircle, 
    Loader2, 
    Plus, 
    Trash2, 
    Globe, 
    RefreshCw,
    ExternalLink,
    Shield,
    Folder
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getStoredToken, connectGoogleAPI, validateToken } from '../../lib/googleAuthService';
import { provisionApkStructure, uploadFileToDrive, makeFilePublic, deleteFile, checkFileExists, getFileLink, getOrCreateFolder } from '../../lib/driveService';
import { getDocumentSettings, saveDocumentSettings } from '../../lib/store';
import UploadOverlay from '../../components/common/UploadOverlay';

export default function ApkManagement() {
    const [apps, setApps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [error, setError] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadLink, setUploadLink] = useState(null);
    const [newAppData, setNewAppData] = useState({ identifier: '', name: '' });
    const [fileExistence, setFileExistence] = useState({}); // { [appId]: boolean }
    const [editingVersion, setEditingVersion] = useState(null); // { id, version }
    
    const accessToken = getStoredToken();

    const fetchApks = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('application_apks')
                .select('*')
                .order('display_name', { ascending: true });

            if (error) {
                console.error('ApkManagement: Error fetching APKs from Supabase:', error);
                throw error;
            }
            const appsList = data || [];
            setApps(appsList);
            
            // Post-fetch: verify file existence if logged in
            if (accessToken && appsList.length > 0) {
                verifyFilesOnDrive(appsList, accessToken);
            }
        } catch (err) {
            console.error('ApkManagement: Error in fetchApks:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchApks();
    }, []);

    const verifyFilesOnDrive = async (appsList, token) => {
        const existenceMap = {};
        for (const app of appsList) {
            if (app.drive_file_id) {
                const exists = await checkFileExists(token, app.drive_file_id);
                existenceMap[app.id] = exists;
            }
        }
        setFileExistence(existenceMap);
    };

    const handleProvision = async (app) => {
        if (!accessToken) {
            connectGoogleAPI('apk_management');
            return;
        }

        setActionLoading(`provision-${app.id}`);
        setError(null);
        try {
            const settings = await getDocumentSettings();
            let celronRootId = settings?.gdrive_celron_root_id;
            if (!celronRootId) {
                let parentId = settings?.google_drive_folder_id || 'root';
                if (parentId.includes('drive.google.com')) {
                    const match = parentId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || parentId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (match) parentId = match[1];
                    else parentId = 'root';
                }
                celronRootId = await getOrCreateFolder(accessToken, 'CELRONHUB', parentId);
                await saveDocumentSettings({
                    ...settings,
                    gdrive_celron_root_id: celronRootId
                });
            }
            const result = await provisionApkStructure(accessToken, `${app.display_name}-Apk`, celronRootId);
            
            const { error: updateError } = await supabase
                .from('application_apks')
                .update({ 
                    drive_folder_id: result.id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', app.id);

            if (updateError) throw updateError;
            
            setApps(prev => prev.map(a => a.id === app.id ? { ...a, drive_folder_id: result.id } : a));
        } catch (err) {
            console.error('Provisioning error:', err);
            setError(`Failed to create Google Drive folder for ${app.display_name}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleFileUpload = async (e, app) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Dynamic Auth Check
        const isValid = await validateToken(accessToken);
        if (!accessToken || !isValid) {
            connectGoogleAPI('apk_management');
            e.target.value = '';
            return;
        }

        setActionLoading(`upload-${app.id}`);
        setError(null);
        setUploadProgress(1); // Start showing progress
        
        try {
            // 1. Upload to Drive with progress
            const result = await uploadFileToDrive(accessToken, file, { 
                folderId: app.drive_folder_id,
                title: `${app.display_name.replace(/\s+/g, '_')}_v${app.version || '1.0'}.apk`
            }, (progress) => {
                setUploadProgress(progress);
            });

            // 2. Make public (anyone with link can view - required for download)
            await makeFilePublic(accessToken, result.id);

            // 3. Update Supabase
            const { error: updateError } = await supabase
                .from('application_apks')
                .update({ 
                    drive_file_id: result.id,
                    download_url: result.webViewLink,
                    updated_at: new Date().toISOString()
                })
                .eq('id', app.id);

            if (updateError) throw updateError;
            
            setUploadLink(result.webViewLink);
            setApps(prev => prev.map(a => a.id === app.id ? { 
                ...a, 
                drive_file_id: result.id, 
                download_url: result.webViewLink 
            } : a));

            alert(`${app.display_name} APK updated successfully!`);
        } catch (err) {
            console.error('Upload error:', err);
            setError(`Failed to upload APK for ${app.display_name}: ${err.message}`);
        } finally {
            setActionLoading(null);
            // Don't reset uploadProgress here, let the overlay stay at 100% until dismissed
            e.target.value = ''; // Reset input
        }
    };

    const handleDeleteApk = async (app) => {
        if (!window.confirm(`Are you sure you want to delete the APK for ${app.display_name}? This will remove it from Google Drive.`)) return;
        
        if (!accessToken) {
            alert('Please connect Google Drive first.');
            return;
        }

        setActionLoading(`delete-apk-${app.id}`);
        try {
            // 1. Delete from Drive
            if (app.drive_file_id) {
                await deleteFile(accessToken, app.drive_file_id);
            }

            // 2. Clear in Supabase
            const { error: updateError } = await supabase
                .from('application_apks')
                .update({ 
                    drive_file_id: null,
                    download_url: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', app.id);

            if (updateError) throw updateError;
            
            setApps(prev => prev.map(a => a.id === app.id ? { 
                ...a, 
                drive_file_id: null, 
                download_url: null 
            } : a));

            alert(`APK for ${app.display_name} deleted.`);
        } catch (err) {
            console.error('Delete APK error:', err);
            alert(`Failed to delete APK: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeleteApp = async (app) => {
        if (!window.confirm(`Are you sure you want to delete the ${app.display_name} category? This will NOT delete files from Drive but will remove the category from this management screen.`)) return;

        setActionLoading(`delete-app-${app.id}`);
        try {
            const { error } = await supabase
                .from('application_apks')
                .delete()
                .eq('id', app.id);

            if (error) throw error;
            
            setApps(prev => prev.filter(a => a.id !== app.id));
        } catch (err) {
            console.error('Delete app error:', err);
            alert(`Failed to delete category: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleSyncLink = async (app) => {
        if (!accessToken) {
            connectGoogleAPI('apk_management');
            return;
        }

        setActionLoading(`sync-${app.id}`);
        try {
            const link = await getFileLink(accessToken, app.drive_file_id);
            if (!link) {
                alert('Could not find the file on Google Drive. It may have been deleted or moved.');
                return;
            }

            const { error: updateError } = await supabase
                .from('application_apks')
                .update({ 
                    download_url: link,
                    updated_at: new Date().toISOString()
                })
                .eq('id', app.id);

            if (updateError) throw updateError;
            
            setApps(prev => prev.map(a => a.id === app.id ? { ...a, download_url: link } : a));
            alert(`Link recovered successfully for ${app.display_name}!`);
        } catch (err) {
            console.error('Sync link error:', err);
            alert(`Failed to recover link: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleVersionUpdate = async (app, newVersion) => {
        setActionLoading(`version-${app.id}`);
        try {
            const { error } = await supabase
                .from('application_apks')
                .update({ 
                    version: newVersion,
                    updated_at: new Date().toISOString()
                })
                .eq('id', app.id);

            if (error) throw error;
            
            setApps(prev => prev.map(a => a.id === app.id ? { ...a, version: newVersion } : a));
            setEditingVersion(null);
        } catch (err) {
            console.error('Version update error:', err);
            alert(`Failed to update version: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleNameChange = (val) => {
        setNewAppData(prev => ({
            ...prev,
            name: val,
            // Auto-generate identifier if it hasn't been edited manually
            identifier: prev.identifier === prev.name.toLowerCase().replace(/\s+/g, '-') ? val.toLowerCase().replace(/\s+/g, '-') : prev.identifier
        }));
    };

    const handleAddApp = async () => {
        const identifier = newAppData.identifier || newAppData.name.toLowerCase().replace(/\s+/g, '-');
        if (!newAppData.name || !identifier) return;
        
        setActionLoading('adding');
        try {
            const { data, error } = await supabase
                .from('application_apks')
                .insert([{
                    app_identifier: identifier,
                    display_name: newAppData.name,
                    version: '1.0.0'
                }])
                .select();

            if (error) {
                if (error.code === '23505') throw new Error('An application with this identifier already exists.');
                throw error;
            }
            
            setApps([...apps, ...data]);
            setShowAddModal(false);
            setNewAppData({ identifier: '', name: '' });
        } catch (err) {
            console.error('Error adding app:', err);
            alert(err.message || 'Failed to add new application category.');
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100vh' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <Shield size={32} color="#6366f1" />
                        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>APK Management</h1>
                    </div>
                    <p style={{ color: '#64748b', fontSize: '1.1rem' }}>Centralized hosting for Celron Hub mobile applications</p>
                </div>
                
                <div style={{ display: 'flex', gap: '16px' }}>
                    <button 
                        onClick={() => setShowAddModal(true)}
                        className="btn btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '12px' }}
                    >
                        <Plus size={20} /> Add Application
                    </button>
                    {!accessToken && (
                        <button 
                            onClick={() => connectGoogleAPI('apk_management')}
                            className="btn btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '12px' }}
                        >
                            <RefreshCw size={18} /> Connect Drive
                        </button>
                    )}
                </div>
            </header>

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', padding: '16px', borderRadius: '12px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
                    <AlertCircle size={20} />
                    <span>{error}</span>
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '100px 0' }}>
                    <Loader2 size={48} className="animate-spin" style={{ color: '#6366f1', margin: '0 auto' }} />
                    <p style={{ marginTop: '24px', color: '#64748b', fontSize: '1.1rem' }}>Fetching application registry...</p>
                </div>
            ) : apps.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px', background: '#fff', borderRadius: '24px', border: '2px dashed #e2e8f0' }}>
                    <Smartphone size={64} color="#cbd5e1" style={{ marginBottom: '24px' }} />
                    <h2 style={{ color: '#475569', marginBottom: '12px' }}>No applications registered yet</h2>
                    <p style={{ color: '#94a3b8', marginBottom: '32px' }}>Start by adding your first application category (e.g., Scanner, POD).</p>
                    <button onClick={() => setShowAddModal(true)} className="btn btn-primary">Create First App Entry</button>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '24px' }}>
                    {apps.map(app => (
                        <div key={app.id} className="glass-panel" style={{ padding: '24px', borderRadius: '20px', border: '1px solid #e2e8f0', background: '#fff', transition: 'transform 0.2s' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                    <div style={{ width: '48px', height: '48px', background: '#eef2ff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Smartphone size={24} color="#6366f1" />
                                    </div>
                                <div>
                                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>{app.display_name}</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <code style={{ fontSize: '0.8rem', color: '#94a3b8' }}>ID: {app.app_identifier}</code>
                                        <button 
                                            onClick={() => handleDeleteApp(app)}
                                            style={{ background: 'none', border: 'none', padding: 0, color: '#94a3b8', cursor: 'pointer', display: 'flex' }}
                                            title="Delete Category"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                                {editingVersion?.id === app.id ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <input 
                                            type="text"
                                            value={editingVersion.version}
                                            onChange={(e) => setEditingVersion({ ...editingVersion, version: e.target.value })}
                                            style={{ width: '60px', padding: '2px 4px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #6366f1' }}
                                            autoFocus
                                        />
                                        <button 
                                            onClick={() => handleVersionUpdate(app, editingVersion.version)}
                                            disabled={actionLoading === `version-${app.id}`}
                                            style={{ background: '#6366f1', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', cursor: 'pointer' }}
                                        >
                                            {actionLoading === `version-${app.id}` ? <Loader2 size={10} className="animate-spin" /> : 'Save'}
                                        </button>
                                        <button 
                                            onClick={() => setEditingVersion(null)}
                                            style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', cursor: 'pointer' }}
                                        >
                                            ×
                                        </button>
                                    </div>
                                ) : (
                                    <span 
                                        onClick={() => setEditingVersion({ id: app.id, version: app.version })}
                                        style={{ background: '#f1f5f9', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                                        title="Click to edit version"
                                    >
                                        v{app.version}
                                    </span>
                                )}
                            </div>

                            <div style={{ spaceY: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {app.drive_folder_id ? (
                                        <CheckCircle2 size={16} color="#22c55e" />
                                    ) : (
                                        <AlertCircle size={16} color="#f59e0b" />
                                    )}
                                    <span style={{ fontSize: '0.9rem', color: '#475569' }}>
                                        {app.drive_folder_id ? 'Drive Folder Ready' : 'Folder Not Provisioned'}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {app.drive_file_id ? (
                                            !accessToken ? (
                                                <RefreshCw size={16} color="#94a3b8" />
                                            ) : fileExistence[app.id] === false ? (
                                                <AlertCircle size={16} color="#ef4444" />
                                            ) : (
                                                <CheckCircle2 size={16} color="#22c55e" />
                                            )
                                        ) : (
                                            <AlertCircle size={16} color="#94a3b8" />
                                        )}
                                        <span style={{ fontSize: '0.9rem', color: fileExistence[app.id] === false ? '#ef4444' : (app.drive_file_id ? '#475569' : '#94a3b8') }}>
                                            {app.drive_file_id 
                                               ? (!accessToken ? 'Connect Drive to verify' : (fileExistence[app.id] === false ? 'File Missing from Drive' : 'APK File Linked')) 
                                               : 'No APK Uploaded'}
                                        </span>
                                    </div>
                                    {app.drive_file_id && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {!app.download_url && (
                                                <button 
                                                    onClick={() => handleSyncLink(app)}
                                                    disabled={actionLoading === `sync-${app.id}`}
                                                    style={{ 
                                                        background: '#fff7ed', 
                                                        border: '1px solid #ffedd5', 
                                                        color: '#ea580c', 
                                                        padding: '2px 8px', 
                                                        borderRadius: '6px', 
                                                        fontSize: '0.75rem', 
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    {actionLoading === `sync-${app.id}` ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                                                    Repair Link
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => handleDeleteApk(app)}
                                                disabled={actionLoading === `delete-apk-${app.id}`}
                                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                title="Delete current APK file"
                                            >
                                                {actionLoading === `delete-apk-${app.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                                {!app.drive_folder_id ? (
                                    <button 
                                        onClick={() => handleProvision(app)}
                                        disabled={actionLoading === `provision-${app.id}`}
                                        className="btn btn-secondary"
                                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                    >
                                        {actionLoading === `provision-${app.id}` ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                                        Provision Folder
                                    </button>
                                ) : (
                                    <>
                                        <label className={`btn ${actionLoading === `upload-${app.id}` ? 'btn-secondary' : 'btn-primary'}`} style={{ flex: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                            <input 
                                                type="file" 
                                                accept=".apk" 
                                                onChange={(e) => handleFileUpload(e, app)}
                                                hidden 
                                                disabled={actionLoading === `upload-${app.id}`}
                                            />
                                            {actionLoading === `upload-${app.id}` ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                                            {app.drive_file_id ? 'Update APK' : 'Upload APK'}
                                        </label>
                                        
                                        <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                                            <a 
                                                href={`https://drive.google.com/drive/folders/${app.drive_folder_id}`}
                                                target="_blank" 
                                                rel="noreferrer" 
                                                className="btn btn-secondary"
                                                style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                title="Open in Google Drive"
                                            >
                                                <Folder size={18} />
                                            </a>
                                            
                                            {app.download_url ? (
                                                <a 
                                                    href={app.download_url} 
                                                    target="_blank" 
                                                    rel="noreferrer" 
                                                    className="btn btn-secondary"
                                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                                    title="Download/Preview APK"
                                                >
                                                    <ExternalLink size={18} /> Download
                                                </a>
                                            ) : app.drive_file_id && (
                                                <button 
                                                    onClick={() => handleSyncLink(app)}
                                                    className="btn btn-secondary"
                                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#ea580c' }}
                                                >
                                                    <RefreshCw size={18} className={actionLoading === `sync-${app.id}` ? 'animate-spin' : ''} />
                                                    Repair Link
                                                </button>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Standardized Upload Overlay */}
            <UploadOverlay 
                isVisible={uploadProgress > 0 || !!uploadLink} 
                progress={uploadProgress} 
                title="Uploading APK..."
                locationLink={uploadLink}
                onClose={() => {
                    setUploadProgress(0);
                    setUploadLink(null);
                }}
            />

            {/* Simple Add App Modal */}
            {showAddModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '450px', padding: '32px', borderRadius: '24px' }}>
                        <h2 style={{ marginBottom: '24px' }}>Add New Application</h2>
                        
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', marginBottom: '10px', fontWeight: 600, color: '#475569', fontSize: '0.9rem' }}>App Name</label>
                            <input 
                                type="text"
                                placeholder="e.g., Celron Scanner"
                                style={{ 
                                    width: '100%', 
                                    padding: '12px 16px', 
                                    borderRadius: '12px', 
                                    border: '1px solid #e2e8f0', 
                                    fontSize: '1rem',
                                    outline: 'none',
                                    transition: 'border-color 0.2s',
                                    background: '#f8fafc'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                value={newAppData.name}
                                onChange={(e) => handleNameChange(e.target.value)}
                            />
                        </div>

                        <div style={{ marginBottom: '32px' }}>
                            <label style={{ display: 'block', marginBottom: '10px', fontWeight: 600, color: '#475569', fontSize: '0.9rem' }}>App Identifier (URL slug)</label>
                            <input 
                                type="text"
                                placeholder="e.g., scanner"
                                style={{ 
                                    width: '100%', 
                                    padding: '12px 16px', 
                                    borderRadius: '12px', 
                                    border: '1px solid #e2e8f0', 
                                    fontSize: '1rem',
                                    outline: 'none',
                                    transition: 'border-color 0.2s',
                                    background: '#f8fafc'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                value={newAppData.identifier}
                                onChange={(e) => setNewAppData({ ...newAppData, identifier: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '16px' }}>
                            <button 
                                onClick={() => setShowAddModal(false)} 
                                className="btn btn-secondary" 
                                style={{ flex: 1, padding: '12px', borderRadius: '12px', fontWeight: 600 }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleAddApp} 
                                disabled={actionLoading === 'adding'}
                                className="btn btn-primary" 
                                style={{ flex: 1, padding: '12px', borderRadius: '12px', fontWeight: 600 }}
                            >
                                {actionLoading === 'adding' ? <Loader2 size={18} className="animate-spin" /> : 'Create Category'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
