import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, FileText, Globe, Trash2, ExternalLink, Grid, List, Edit, FileCheck, Loader2, FolderOpen, RefreshCw, Sparkles, Building2, Calendar, MoreVertical, CheckCircle2, Cloud } from 'lucide-react';
import { getDocumentSettings } from '../lib/store';
import { listFolderContent, getOrCreateFolder } from '../lib/driveService';
import { getForms, syncFormsFromDrive, deleteForm } from '../lib/formsService';
import { useAuth } from '../contexts/AuthContext';
import { Modal, QuickFormAdd } from '../components/workflow/QuickAddForms';

export default function FormsDirectory() {
    const { profile } = useAuth();
    const [forms, setForms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [settings, setSettings] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const navigate = useNavigate();

    // The forms folder ID from the user's browser context
    const FORMS_FOLDER_ID = '1XrcgL4ydj_rnlk_knP_J1l5QFeYx4ltx';

    useEffect(() => {
        if (profile?.company_id) {
            loadForms();
        }
    }, [profile]);

    const loadForms = async () => {
        setLoading(true);
        try {
            const [settingsData, { data: formsData }] = await Promise.all([
                getDocumentSettings(profile.company_id),
                getForms()
            ]);
            setSettings(settingsData);
            setForms(formsData || []);
        } catch (err) {
            console.error("Forms load error:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        const accessToken = localStorage.getItem('google_access_token');
        if (!accessToken) return alert("Please connect Google Drive first.");

        setSyncing(true);
        try {
            const { count, error } = await syncFormsFromDrive(accessToken, FORMS_FOLDER_ID);
            if (error) throw error;
            alert(`Successfully synced ${count} forms from Drive!`);
            await loadForms();
        } catch (err) {
            console.error("Sync error:", err);
            alert("Failed to sync forms: " + err.message);
        } finally {
            setSyncing(false);
        }
    };

    const handleDirectUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const accessToken = localStorage.getItem('google_access_token');
        if (!accessToken) return alert("Please connect Google Drive first.");

        setSyncing(true);
        try {
            const { uploadFileToDrive } = await import('../lib/driveService');
            const driveFile = await uploadFileToDrive(accessToken, file, {
                title: file.name,
                folderId: FORMS_FOLDER_ID
            });

            if (driveFile.id) {
                const { saveForm } = await import('../lib/formsService');
                const { data, error } = await saveForm({
                    title: file.name,
                    file_id: driveFile.id,
                    file_url: driveFile.webViewLink,
                    form_type: file.name.split('.').pop()?.toUpperCase() || 'DOCUMENT',
                    company_id: profile?.company_id
                });
                if (error) throw error;
                setForms([data, ...forms]);
                alert('File uploaded and registered successfully!');
            }
        } catch (err) {
            console.error("Upload error:", err);
            alert("Failed to upload file: " + err.message);
        } finally {
            setSyncing(false);
        }
    };

    const handleDelete = async (id, e) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to remove this form from the library?')) return;
        
        try {
            await deleteForm(id);
            setForms(forms.filter(f => f.id !== id));
        } catch (err) {
            alert('Failed to delete form');
        }
    };

    const filteredForms = forms.filter(form =>
        form.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        form.form_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        form.author_company?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getFormIcon = (type) => {
        const t = type?.toUpperCase();
        if (t === 'PDF') return <div style={{ background: '#fee2e2', padding: '10px', borderRadius: '12px' }}><FileText size={24} color="#ef4444" /></div>;
        if (t === 'DOCX' || t === 'DOC') return <div style={{ background: '#e0e7ff', padding: '10px', borderRadius: '12px' }}><FileText size={24} color="#3b82f6" /></div>;
        if (t === 'XLSX' || t === 'XLS') return <div style={{ background: '#dcfce7', padding: '10px', borderRadius: '12px' }}><FileText size={24} color="#10b981" /></div>;
        return <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '12px' }}><FileText size={24} color="#64748b" /></div>;
    };

    return (
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>
            <header style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <div style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', padding: '10px', borderRadius: '14px', color: 'white', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)' }}>
                            <FileCheck size={28} />
                        </div>
                        <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.03em' }}>
                            Forms Library
                        </h1>
                    </div>
                    <p style={{ color: '#64748b', fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Globe size={16} className="text-accent" />
                        Centralized repository for all company templates and inspection forms.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '14px' }}>
                    <input 
                        type="file" 
                        id="form-upload-input" 
                        hidden 
                        onChange={handleDirectUpload}
                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                    />
                    <a
                        href={`https://drive.google.com/drive/folders/${FORMS_FOLDER_ID}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ 
                            background: '#fff', 
                            color: '#0f172a', 
                            border: '1px solid #e2e8f0', 
                            padding: '12px 24px', 
                            borderRadius: '14px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            fontWeight: 700, 
                            cursor: 'pointer', 
                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                            transition: 'all 0.2s',
                            textDecoration: 'none'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                        <FolderOpen size={18} style={{ color: '#3b82f6' }} /> Open Drive Folder
                    </a>
                    <button
                        onClick={() => document.getElementById('form-upload-input').click()}
                        disabled={syncing}
                        style={{ 
                            background: '#fff', 
                            color: '#0f172a', 
                            border: '1px solid #e2e8f0', 
                            padding: '12px 24px', 
                            borderRadius: '14px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            fontWeight: 700, 
                            cursor: 'pointer', 
                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                        {syncing ? <Loader2 className="animate-spin" size={18} /> : <Cloud size={18} color="#6366f1" />}
                        {syncing ? 'Uploading...' : 'Direct Upload'}
                    </button>
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        style={{ 
                            background: '#fff', 
                            color: '#0f172a', 
                            border: '1px solid #e2e8f0', 
                            padding: '12px 24px', 
                            borderRadius: '14px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            fontWeight: 700, 
                            cursor: 'pointer', 
                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                        <RefreshCw size={18} />
                        Sync from Drive
                    </button>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        style={{ 
                            background: 'linear-gradient(135deg, #6366f1, #4f46e5)', 
                            color: '#fff', 
                            border: 'none', 
                            padding: '12px 24px', 
                            borderRadius: '14px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            fontWeight: 700, 
                            cursor: 'pointer', 
                            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                        <Plus size={20} /> Add Template
                    </button>
                </div>
            </header>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '32px', alignItems: 'center' }}>
                <div style={{ flex: 1, display: 'flex', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '6px 16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', transition: 'all 0.3s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', color: '#94a3b8' }}><Search size={22} /></div>
                    <input
                        type="text"
                        placeholder="Search by title, department or type..."
                        style={{ flex: 1, border: 'none', outline: 'none', padding: '12px', fontSize: '1rem', color: '#1e293b', background: 'transparent' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div style={{ display: 'flex', background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    <button onClick={() => setViewMode('grid')} style={{ padding: '10px', background: viewMode === 'grid' ? '#f1f5f9' : 'transparent', border: 'none', borderRadius: '10px', cursor: 'pointer', color: viewMode === 'grid' ? '#6366f1' : '#64748b', transition: 'all 0.2s' }}>
                        <Grid size={22} />
                    </button>
                    <button onClick={() => setViewMode('list')} style={{ padding: '10px', background: viewMode === 'list' ? '#f1f5f9' : 'transparent', border: 'none', borderRadius: '10px', cursor: 'pointer', color: viewMode === 'list' ? '#6366f1' : '#64748b', transition: 'all 0.2s' }}>
                        <List size={22} />
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '120px 0' }}>
                    <div className="ai-pulse" style={{ width: '80px', height: '80px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '50%', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Sparkles size={40} color="#6366f1" />
                    </div>
                    <p style={{ fontWeight: 600, color: '#64748b', fontSize: '1.1rem' }}>Loading library intelligence...</p>
                </div>
            ) : filteredForms.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '100px 40px', background: '#fff', borderRadius: '24px', border: '2px dashed #e2e8f0', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                    <div style={{ width: '80px', height: '80px', background: '#f8fafc', borderRadius: '50%', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FolderOpen size={40} color="#cbd5e1" />
                    </div>
                    <h3 style={{ color: '#1e293b', fontSize: '1.5rem', fontWeight: 800, margin: '0 0 12px 0' }}>Empty Library</h3>
                    <p style={{ color: '#64748b', fontSize: '1rem', maxWidth: '400px', margin: '0 auto 24px', lineHeight: 1.6 }}>Your forms library is currently empty. Sync from Google Drive or add templates manually to get started.</p>
                    <button onClick={handleSync} style={{ background: '#f1f5f9', color: '#475569', border: 'none', padding: '12px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <RefreshCw size={18} /> Run Initial Sync
                    </button>
                </div>
            ) : (
                <div style={{
                    display: viewMode === 'grid' ? 'grid' : 'flex',
                    flexDirection: viewMode === 'list' ? 'column' : 'initial',
                    gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(320px, 1fr))' : 'none',
                    gap: '24px'
                }}>
                    {filteredForms.map(form => (
                        <div 
                            key={form.id} 
                            onClick={() => form.file_url && window.open(form.file_url, '_blank')}
                            style={{ 
                                padding: '24px', 
                                background: '#fff',
                                borderRadius: '20px',
                                border: '1px solid #e2e8f0',
                                cursor: 'pointer',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                display: 'flex',
                                flexDirection: 'column',
                                position: 'relative',
                                overflow: 'hidden',
                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01)'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.transform = 'translateY(-6px)';
                                e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.02)';
                                e.currentTarget.style.borderColor = '#6366f1';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01)';
                                e.currentTarget.style.borderColor = '#e2e8f0';
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                {getFormIcon(form.form_type)}
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); navigate(`/forms/${form.id}`); }}
                                        style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '8px', borderRadius: '10px', color: '#64748b', cursor: 'pointer' }}
                                    >
                                        <Edit size={16} />
                                    </button>
                                    <button 
                                        onClick={(e) => handleDelete(form.id, e)}
                                        style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '8px', borderRadius: '10px', color: '#ef4444', cursor: 'pointer' }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            <div style={{ flex: 1 }}>
                                <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.4 }}>{form.title}</h3>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.85rem' }}>
                                        <Building2 size={14} />
                                        <span style={{ fontWeight: 600 }}>{form.author_company || 'Global Template'}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.85rem' }}>
                                        <Calendar size={14} />
                                        <span>Added {new Date(form.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>

                                {form.info && (
                                    <p style={{ marginTop: '16px', fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        "{form.info}"
                                    </p>
                                )}
                            </div>

                            <div style={{ 
                                marginTop: '20px', 
                                paddingTop: '16px', 
                                borderTop: '1px solid #f1f5f9', 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center' 
                            }}>
                                <span style={{ 
                                    fontSize: '0.7rem', 
                                    fontWeight: 800, 
                                    padding: '4px 10px', 
                                    background: '#f1f5f9', 
                                    borderRadius: '8px', 
                                    color: '#64748b',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em'
                                }}>
                                    {form.form_type || 'DOC'}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6366f1', fontSize: '0.85rem', fontWeight: 700 }}>
                                    Open Link <ExternalLink size={14} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title="Add New Template"
                icon={Plus}
            >
                <QuickFormAdd
                    company_id={profile?.company_id}
                    onSuccess={(newForm) => {
                        setForms([newForm, ...forms]);
                        setIsAddModalOpen(false);
                    }}
                    onCancel={() => setIsAddModalOpen(false)}
                />
            </Modal>

            <style dangerouslySetInnerHTML={{ __html: `
                .text-accent { color: #6366f1; }
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .ai-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
                @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(0.95); } }
            `}} />
        </div>
    );
}
