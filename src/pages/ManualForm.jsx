import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Cloud, FileText, Book, User, Info, Building, Tag, Ship, Smartphone, X, Loader, RefreshCw } from 'lucide-react';
import { saveManual, getManuals } from '../lib/manualsService';
import { getMakers, getModels, getSystems } from '../lib/marineCatalogService';
import { uploadFileToDrive, getOrCreateFolder, listFolderContent } from '../lib/driveService';
import { connectGoogleAPI } from '../lib/googleAuthService';
import { useAuth } from '../contexts/AuthContext';
import SmartUploadPanel from '../components/upload/SmartUploadPanel';

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
        file_id: '',
        system_id: '',
        maker_id: '',
        model_id: ''
    });

    const [makersList, setMakersList] = useState([]);
    const [modelsList, setModelsList] = useState([]);
    const [systemsList, setSystemsList] = useState([]);
    const [customMaker, setCustomMaker] = useState(false);
    const [customModel, setCustomModel] = useState(false);

    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [uploadConfig, setUploadConfig] = useState({
        isOpen: false,
        activeFolderId: null,
        activeFolderName: '',
        initialTab: 'recent'
    });

    useEffect(() => {
        if (profile?.company_id) {
            fetchCatalogData();
        }
    }, [profile]);

    const fetchCatalogData = async () => {
        try {
            const cid = profile.company_id;
            const [makersRes, modelsRes, systemsRes] = await Promise.all([
                getMakers(cid),
                getModels(cid),
                getSystems(1, 1000, '', {}, cid)
            ]);
            setMakersList(makersRes.data || []);
            setModelsList(modelsRes.data || []);
            setSystemsList(systemsRes.data || []);
        } catch (e) {
            console.error("Error fetching catalog data", e);
        }
    };

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
                file_id: unpacked.file_id || '',
                system_id: unpacked.system_id || '',
                maker_id: unpacked.maker_id || '',
                model_id: unpacked.model_id || ''
            });

            // Determine if maker or model are custom typed
            if (unpacked.manufacturer && !unpacked.maker_id) {
                setCustomMaker(true);
            }
            if (unpacked.model && !unpacked.model_id) {
                setCustomModel(true);
            }
        }
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            if (selectedFile.type !== 'application/pdf') {
                alert('Only PDF files are supported for technical manuals.');
                return;
            }
            handleSelectFile(selectedFile);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) {
            if (droppedFile.type !== 'application/pdf') {
                alert('Only PDF files are supported for technical manuals.');
                return;
            }
            setFile(droppedFile);
            setIsUploadPanelOpen(true);
        }
    };

    const handleSelectFile = (selectedFile, suggestions) => {
        if (!selectedFile) return;

        if (selectedFile.isGoogleDrive) {
            setFormData(prev => ({
                ...prev,
                file_url: selectedFile.webViewLink,
                file_id: selectedFile.id
            }));
            setFile(null);
        } else {
            setFile(selectedFile);
        }

        if (suggestions) {
            setFormData(prev => {
                const next = { ...prev };
                if (!next.title) next.title = suggestions.title;
                if (!next.category) next.category = suggestions.category;
                
                // Relational Maker resolution
                if (suggestions.manufacturer && !next.maker_id) {
                    const matchMaker = makersList.find(m => m.name.toLowerCase() === suggestions.manufacturer.toLowerCase());
                    if (matchMaker) {
                        next.maker_id = matchMaker.id;
                        next.manufacturer = matchMaker.name;
                    } else {
                        setCustomMaker(true);
                        next.manufacturer = suggestions.manufacturer;
                    }
                }

                // Relational Model resolution
                if (suggestions.model && !next.model_id) {
                    const matchModel = modelsList.find(m => 
                        m.name.toLowerCase() === suggestions.model.toLowerCase() && 
                        (!next.maker_id || m.maker_id === next.maker_id)
                    );
                    if (matchModel) {
                        next.model_id = matchModel.id;
                        next.model = matchModel.name;
                    } else {
                        setCustomModel(true);
                        next.model = suggestions.model;
                    }
                }

                if (!next.tags) {
                    next.tags = suggestions.tags;
                }

                return next;
            });
        }
    };

    const ensureManualFolder = async () => {
        if (!formData.manufacturer || !formData.model) {
            alert('Please select or specify Manufacturer/Brand and Model/Series before uploading. They are needed to organize files on Google Drive.');
            return null;
        }

        const token = sessionStorage.getItem('google_contacts_token') || localStorage.getItem('google_access_token');
        const expires = sessionStorage.getItem('google_contacts_expires');

        if (!token || (expires && new Date(expires) < new Date())) {
            if (window.confirm('Google Drive access is required to connect. Redirect to login?')) {
                sessionStorage.setItem('pending_manual_data', JSON.stringify(formData));
                connectGoogleAPI('manual_upload');
            }
            return null;
        }

        try {
            const manualsRootId = await getOrCreateFolder(token, 'Manuals');
            const mfgFolderId = await getOrCreateFolder(token, formData.manufacturer || 'Unknown', manualsRootId);
            const modelFolderId = await getOrCreateFolder(token, formData.model || 'General', mfgFolderId);
            return modelFolderId;
        } catch (err) {
            console.error("Failed to provision manual folders:", err);
            alert("Error connecting to Google Drive: " + err.message);
        }
        return null;
    };

    const handleTriggerUpload = async (tab = 'recent') => {
        const folderId = await ensureManualFolder();
        if (!folderId) return;

        setUploadConfig({
            isOpen: true,
            activeFolderId: folderId,
            activeFolderName: `${formData.manufacturer} ${formData.model}`,
            initialTab: tab
        });
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
                info: finalData.summary,
                system_id: finalData.system_id || null,
                maker_id: finalData.maker_id || null,
                model_id: finalData.model_id || null
            };

            if (formData.id) {
                savePayload.id = formData.id;
            }

            const { error } = await saveManual(savePayload);
            if (error) throw error;

            alert('Manual saved successfully!');
            navigate('/catalog/manuals');
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
                    onClick={() => navigate('/catalog/manuals')}
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
                            {!customMaker ? (
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <Building size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8', zIndex: 10 }} />
                                    <select
                                        className="form-select"
                                        style={{ paddingLeft: '40px' }}
                                        value={formData.maker_id || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === 'custom') {
                                                setCustomMaker(true);
                                                setFormData(prev => ({ ...prev, maker_id: '', manufacturer: '' }));
                                            } else {
                                                const m = makersList.find(item => item.id === val);
                                                setFormData(prev => ({ ...prev, maker_id: val, manufacturer: m ? m.name : '' }));
                                            }
                                        }}
                                        required
                                    >
                                        <option value="">-- Select Brand / Maker --</option>
                                        {makersList.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                        <option value="custom">++ Add Custom Maker ++</option>
                                    </select>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Type Manufacturer Name..."
                                        value={formData.manufacturer}
                                        onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                                        required
                                    />
                                    {makersList.length > 0 && (
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                                            onClick={() => {
                                                setCustomMaker(false);
                                                setFormData(prev => ({ ...prev, maker_id: '', manufacturer: '' }));
                                            }}
                                        >
                                            Select
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="form-label">Model / Series *</label>
                        <div style={{ position: 'relative' }}>
                            {!customModel ? (
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <Info size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8', zIndex: 10 }} />
                                    <select
                                        className="form-select"
                                        style={{ paddingLeft: '40px' }}
                                        value={formData.model_id || ''}
                                        disabled={!formData.maker_id}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === 'custom') {
                                                setCustomModel(true);
                                                setFormData(prev => ({ ...prev, model_id: '', model: '' }));
                                            } else {
                                                const m = modelsList.find(item => item.id === val);
                                                setFormData(prev => ({ ...prev, model_id: val, model: m ? m.name : '' }));
                                            }
                                        }}
                                        required
                                    >
                                        <option value="">-- Select Model / Series --</option>
                                        {modelsList
                                            .filter(m => m.maker_id === formData.maker_id)
                                            .map(m => (
                                                <option key={m.id} value={m.id}>{m.name}</option>
                                            ))}
                                        <option value="custom">++ Add Custom Model ++</option>
                                    </select>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Type Model Name..."
                                        value={formData.model}
                                        onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                                        onClick={() => {
                                            setCustomModel(false);
                                            setFormData(prev => ({ ...prev, model_id: '', model: '' }));
                                        }}
                                    >
                                        Select
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="form-label">Associated Machinery System</label>
                        <div style={{ position: 'relative' }}>
                            <Ship size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8', zIndex: 10 }} />
                            <select
                                className="form-select"
                                style={{ paddingLeft: '40px' }}
                                value={formData.system_id || ''}
                                onChange={(e) => setFormData({ ...formData, system_id: e.target.value })}
                            >
                                <option value="">-- Link to a Machinery System --</option>
                                {systemsList.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.system_no || 'No Ref'})</option>
                                ))}
                            </select>
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

                <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    style={{ 
                        marginBottom: '20px', 
                        padding: '32px 24px', 
                        background: isDragging ? '#eef2ff' : '#f8fafc', 
                        borderRadius: '16px', 
                        border: isDragging ? '2px dashed #6366f1' : '2px dashed #cbd5e1',
                        textAlign: 'center',
                        transition: 'all 0.2s ease',
                        cursor: 'pointer',
                        position: 'relative'
                    }}
                >
                    <div
                        onClick={() => handleTriggerUpload('recent')}
                        style={{ position: 'absolute', inset: 0, cursor: 'pointer', width: '100%', height: '100%', zIndex: 1 }}
                    />
                    
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', position: 'relative', zIndex: 2, pointerEvents: 'none' }}>
                        <Cloud size={48} color={file || isDragging ? '#6366f1' : '#cbd5e1'} style={{ transition: 'color 0.2s' }} />
                        <div>
                            <h4 style={{ margin: '0 0 4px 0', color: '#475569', fontSize: '0.95rem', fontWeight: 600 }}>
                                {file ? `Selected: ${file.name}` : 'Drag & drop your PDF manual here'}
                            </h4>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                {file ? 'Click or drag new file to change' : 'or click to browse local files'}
                            </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>Supported format: PDF. Direct upload to Google Drive.</p>
                        
                        {formData.file_url && !file && (
                            <a 
                                href={formData.file_url} 
                                target="_blank" 
                                rel="noreferrer" 
                                style={{ 
                                    pointerEvents: 'auto',
                                    zIndex: 5,
                                    fontSize: '0.85rem', 
                                    color: '#6366f1', 
                                    textDecoration: 'none', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '4px',
                                    marginTop: '8px'
                                }}
                            >
                                <FileText size={14} /> Current File in Drive
                            </a>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
                    <button
                        type="button"
                        onClick={() => handleTriggerUpload('mobile_qr')}
                        className="btn btn-secondary"
                        style={{ flex: 1, padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600 }}
                    >
                        <Smartphone size={18} /> Upload via Mobile (QR Code / WhatsApp)
                    </button>
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
                        onClick={() => navigate('/catalog/manuals')}
                        style={{ padding: '14px 24px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                </div>
            </form>

            <SmartUploadPanel 
                isOpen={uploadConfig.isOpen} 
                onClose={() => setUploadConfig(prev => ({ ...prev, isOpen: false }))} 
                onSelect={handleSelectFile}
                documentType="manual"
                accept=".pdf"
                activeFolderId={uploadConfig.activeFolderId}
                activeFolderName={uploadConfig.activeFolderName}
                initialTab={uploadConfig.initialTab}
            />
        </div>
    );
}
