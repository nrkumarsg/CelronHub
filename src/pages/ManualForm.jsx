import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Cloud, FileText, Book, User, Info, Building, Tag } from 'lucide-react';
import { saveManual, getManuals } from '../lib/manualsService';
import { uploadFileToDrive, getOrCreateFolder } from '../lib/driveService';
import { connectGoogleAPI } from '../lib/googleAuthService';
import { useAuth } from '../contexts/AuthContext';

export default function ManualForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { profile } = useAuth();
    const isNew = id === 'new';

    const [formData, setFormData] = useState({
        title: '',
        manufacturer: '',
        model: '',
        category: '',
        summary: '',
        tags: '',
        file_url: '',
        file_id: ''
    });

    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        const pendingData = sessionStorage.getItem('pending_manual_data');
        if (pendingData) {
            setFormData(JSON.parse(pendingData));
            sessionStorage.removeItem('pending_manual_data');
        }

        if (!isNew) {
            loadManual();
        }
    }, [id]);

    const loadManual = async () => {
        const { data } = await getManuals();
        const existing = data.find(m => m.id === id);
        if (existing) {
            let unpacked = { ...existing };
            if (existing.info && existing.info.startsWith('{')) {
                try {
                    const extra = JSON.parse(existing.info);
                    unpacked = { ...unpacked, ...extra };
                } catch (e) {}
            }
            setFormData({
                id: existing.id,
                title: unpacked.title || '',
                manufacturer: unpacked.manufacturer || unpacked.author_company || '',
                model: unpacked.model || '',
                category: unpacked.category || unpacked.group_name || '',
                summary: unpacked.summary || (unpacked.info && !unpacked.info.startsWith('{') ? unpacked.info : ''),
                tags: Array.isArray(unpacked.tags) ? unpacked.tags.join(', ') : (unpacked.tags || ''),
                file_url: unpacked.file_url || '',
                file_id: unpacked.file_id || ''
            });
        }
    };

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            let finalData = { ...formData };

            if (file) {
                const token = sessionStorage.getItem('google_contacts_token') || localStorage.getItem('google_access_token');
                const expires = sessionStorage.getItem('google_contacts_expires');

                if (!token || (expires && new Date(expires) < new Date())) {
                    if (window.confirm('Google Drive access is required for upload. Redirect to login?')) {
                        sessionStorage.setItem('pending_manual_data', JSON.stringify(formData));
                        connectGoogleAPI('manual_upload');
                        return;
                    }
                    throw new Error('Google authentication required');
                }

                setUploading(true);
                // Upload to /Manuals/{Manufacturer}/{Model} folder structure
                const manualsRootId = await getOrCreateFolder(token, 'Manuals');
                const mfgFolderId = await getOrCreateFolder(token, formData.manufacturer || 'Unknown', manualsRootId);
                const modelFolderId = await getOrCreateFolder(token, formData.model || 'General', mfgFolderId);

                const driveFile = await uploadFileToDrive(token, file, {
                    title: formData.title || file.name,
                    folderId: modelFolderId
                });

                finalData.file_id = driveFile.id;
                finalData.file_url = driveFile.webViewLink;
                setUploading(false);
            }

            // Convert comma-separated tags to array
            const tagsArray = formData.tags
                ? formData.tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '')
                : [];

            const savePayload = {
                title: finalData.title,
                manufacturer: finalData.manufacturer,
                model: finalData.model,
                category: finalData.category,
                summary: finalData.summary,
                tags: tagsArray,
                file_url: finalData.file_url,
                file_id: finalData.file_id,
                author_company: finalData.manufacturer, // For compatibility
                group_name: finalData.category, // For compatibility
                info: finalData.summary
            };

            if (formData.id) {
                savePayload.id = formData.id;
            }

            const { error } = await saveManual(savePayload);
            if (error) throw error;

            alert('Manual saved successfully!');
            navigate('/manuals');
        } catch (err) {
            console.error(err);
            alert('Error: ' + err.message);
        } finally {
            setLoading(false);
            setUploading(false);
        }
    };

    return (
        <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
                <button
                    onClick={() => navigate('/manuals')}
                    style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '10px', cursor: 'pointer', color: '#64748b' }}
                >
                    <ArrowLeft size={20} />
                </button>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                    {isNew ? 'Add New Manual' : 'Edit Manual Content'}
                </h1>
            </div>

            <form onSubmit={handleSave} className="glass-panel" style={{ padding: '40px', background: '#fff' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label className="form-label">Manual Title *</label>
                        <div style={{ position: 'relative' }}>
                            <Book size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }} />
                            <input
                                type="text"
                                className="form-input"
                                style={{ paddingLeft: '40px' }}
                                placeholder="e.g. Caterpillar C32 Service Manual"
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="form-label">Manufacturer / Brand *</label>
                        <div style={{ position: 'relative' }}>
                            <Building size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }} />
                            <input
                                type="text"
                                className="form-input"
                                style={{ paddingLeft: '40px' }}
                                placeholder="e.g. Caterpillar Inc."
                                value={formData.manufacturer}
                                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="form-label">Model / Series *</label>
                        <div style={{ position: 'relative' }}>
                            <Info size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }} />
                            <input
                                type="text"
                                className="form-input"
                                style={{ paddingLeft: '40px' }}
                                placeholder="e.g. C32"
                                value={formData.model}
                                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="form-label">Category / Group</label>
                        <div style={{ position: 'relative' }}>
                            <User size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }} />
                            <input
                                type="text"
                                className="form-input"
                                style={{ paddingLeft: '40px' }}
                                placeholder="e.g. Propulsion"
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="form-label">Tags (comma-separated)</label>
                        <div style={{ position: 'relative' }}>
                            <Tag size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }} />
                            <input
                                type="text"
                                className="form-input"
                                style={{ paddingLeft: '40px' }}
                                placeholder="e.g. engine, maintenance, service"
                                value={formData.tags}
                                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                            />
                        </div>
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <label className="form-label">Technical Summary / Description</label>
                        <textarea
                            className="form-input"
                            rows="4"
                            style={{ resize: 'vertical', padding: '12px' }}
                            placeholder="Enter a description or key technical summary..."
                            value={formData.summary}
                            onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                        />
                    </div>
                </div>

                <div style={{ marginBottom: '32px', padding: '24px', background: '#f8fafc', borderRadius: '12px', border: '2px dashed #e2e8f0' }}>
                    <label className="form-label" style={{ marginBottom: '12px' }}>{formData.file_url ? 'Update Manual File' : 'Upload PDF Manual'}</label>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <Cloud size={48} color={file ? '#6366f1' : '#cbd5e1'} />
                        <input
                            type="file"
                            accept=".pdf"
                            onChange={handleFileChange}
                            style={{ fontSize: '0.9rem' }}
                        />
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>Supported formats: PDF. Will be uploaded to Google Drive.</p>
                        {formData.file_url && !file && (
                            <a href={formData.file_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem', color: '#6366f1', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <FileText size={14} /> Current File in Drive
                            </a>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                    <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary"
                        style={{ flex: 1, padding: '14px', borderRadius: '10px', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                        {loading ? (
                            <>
                                <div className="animate-spin" style={{ width: '18px', height: '18px', border: '2px solid #fff', borderTop: '2px solid transparent', borderRadius: '50%' }}></div>
                                {uploading ? 'Uploading to Drive...' : 'Saving...'}
                            </>
                        ) : (
                            <>
                                <Save size={20} /> Save Manual
                            </>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/manuals')}
                        style={{ padding: '14px 24px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
}
