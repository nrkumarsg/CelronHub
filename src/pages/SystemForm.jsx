import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    ArrowLeft, Save, Trash2, Plus, Info, Database, FileText, ImageIcon,
    Ship, Wrench, FileCheck, RefreshCw, ExternalLink, Trash, Edit2, X, AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    getSystemById, createSystem, updateSystem, deleteSystem,
    getDepartments, getEquipmentGroups, getMakers, getModels,
    getMarineDocuments, createMarineDocument, deleteMarineDocument,
    getMarinePhotos, createMarinePhoto, deleteMarinePhoto,
    getMarineNotes, createMarineNote, deleteMarineNote,
    getSystemMaintenanceTasks, createSystemMaintenanceTask, updateSystemMaintenanceTask, deleteSystemMaintenanceTask,
    getMarineAuditLogs, logMarineAction
} from '../lib/marineCatalogService';

const SystemForm = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { profile } = useAuth();
    const isNewSystem = id === 'new';

    // UI state
    const [loading, setLoading] = useState(!isNewSystem);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');

    // Master list data
    const [departments, setDepartments] = useState([]);
    const [equipmentGroups, setEquipmentGroups] = useState([]);
    const [makers, setMakers] = useState([]);
    const [models, setModels] = useState([]);

    // System form data
    const [formData, setFormData] = useState({
        name: '',
        system_no: '',
        department_id: '',
        equipment_group_id: '',
        maker_id: '',
        model_id: ''
    });

    // Related Child structures
    const [parts, setParts] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [photos, setPhotos] = useState([]);
    const [maintenanceTasks, setMaintenanceTasks] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);

    // Input States
    const [docInput, setDocInput] = useState({ name: '', type: 'Manual', url: '' });
    const [photoUrlInput, setPhotoUrlInput] = useState('');
    const [maintInput, setMaintInput] = useState({ task_name: '', description: '', interval_months: 6, last_done_date: '', next_due_date: '' });
    const [showMaintModal, setShowMaintModal] = useState(false);
    const [editingMaintId, setEditingMaintId] = useState(null);

    // Fetch lists
    const fetchMasterData = async () => {
        const cid = profile?.company_id;
        const [depsRes, grpsRes, makersRes, modelsRes] = await Promise.all([
            getDepartments(cid),
            getEquipmentGroups(cid),
            getMakers(cid),
            getModels(cid)
        ]);

        setDepartments(depsRes.data || []);
        setEquipmentGroups(grpsRes.data || []);
        setMakers(makersRes.data || []);
        setModels(modelsRes.data || []);
    };

    // Fetch System data
    const fetchSystemData = async () => {
        setLoading(true);
        const { data, error } = await getSystemById(id);
        if (!error && data) {
            setFormData({
                name: data.name || '',
                system_no: data.system_no || '',
                department_id: data.department_id || '',
                equipment_group_id: data.equipment_group_id || '',
                maker_id: data.maker_id || '',
                model_id: data.model_id || ''
            });

            // Fetch children
            const [docsRes, photosRes, maintRes, auditRes, partsRes] = await Promise.all([
                getMarineDocuments('system', id),
                getMarinePhotos('system', id),
                getSystemMaintenanceTasks(id),
                getMarineAuditLogs('system', id),
                supabase.from('catalog_items').select('*').eq('system_id', id)
            ]);

            setDocuments(docsRes.data || []);
            setPhotos(photosRes.data || []);
            setMaintenanceTasks(maintRes.data || []);
            setAuditLogs(auditRes.data || []);
            setParts(partsRes.data || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchMasterData();
        if (!isNewSystem) {
            fetchSystemData();
        }
    }, [id]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (!formData.name) return toast.error('System name is required');

        setSaving(true);
        const payload = {
            ...formData,
            company_id: profile?.company_id || 'd0000000-0000-0000-0000-000000000001'
        };

        // Standardise empty values to null
        if (!payload.department_id) payload.department_id = null;
        if (!payload.equipment_group_id) payload.equipment_group_id = null;
        if (!payload.maker_id) payload.maker_id = null;
        if (!payload.model_id) payload.model_id = null;

        let res;
        if (isNewSystem) {
            res = await createSystem(payload);
            if (!res.error && res.data) {
                toast.success('Machinery System created successfully!');
                await logMarineAction('system', res.data.id, 'CREATE', { name: payload.name }, profile?.id, profile?.company_id);
                navigate(`/catalog/system/${res.data.id}`);
            } else {
                toast.error('Failed to create system: ' + (res.error?.message || 'Unknown error'));
            }
        } else {
            res = await updateSystem(id, payload);
            if (!res.error) {
                toast.success('Machinery System updated successfully!');
                await logMarineAction('system', id, 'UPDATE', { name: payload.name }, profile?.id, profile?.company_id);
                fetchSystemData();
            } else {
                toast.error('Failed to update system');
            }
        }
        setSaving(false);
    };

    const handleDeleteSystem = async () => {
        if (window.confirm('Are you sure you want to delete this Machinery System? All links to parts will be removed.')) {
            setSaving(true);
            const { error } = await deleteSystem(id);
            if (!error) {
                toast.success('System deleted');
                navigate('/catalog');
            } else {
                toast.error('Delete failed');
                setSaving(false);
            }
        }
    };

    // Sub-modules actions
    // Documents
    const handleAddDocument = async (e) => {
        e.preventDefault();
        if (!docInput.name || !docInput.url) return toast.error('Name and URL required');
        const payload = {
            entity_type: 'system',
            entity_id: id,
            name: docInput.name,
            file_url: docInput.url,
            document_type: docInput.type,
            company_id: profile?.company_id
        };

        const { error } = await createMarineDocument(payload);
        if (!error) {
            toast.success('Document linked successfully');
            setDocInput({ name: '', type: 'Manual', url: '' });
            fetchSystemData();
        } else {
            toast.error('Failed to link document');
        }
    };

    const handleDeleteDocument = async (docId) => {
        if (window.confirm('Delete this document?')) {
            const { error } = await deleteMarineDocument(docId);
            if (!error) {
                toast.success('Document deleted');
                fetchSystemData();
            }
        }
    };

    // Photos
    const handleAddPhoto = async (e) => {
        e.preventDefault();
        if (!photoUrlInput) return;
        const payload = {
            entity_type: 'system',
            entity_id: id,
            url: photoUrlInput,
            company_id: profile?.company_id
        };

        const { error } = await createMarinePhoto(payload);
        if (!error) {
            toast.success('Photo added');
            setPhotoUrlInput('');
            fetchSystemData();
        }
    };

    const handleDeletePhoto = async (photoId) => {
        if (window.confirm('Delete this photo?')) {
            const { error } = await deleteMarinePhoto(photoId);
            if (!error) {
                toast.success('Photo removed');
                fetchSystemData();
            }
        }
    };

    // Maintenance tasks
    const openNewMaintModal = () => {
        setMaintInput({ task_name: '', description: '', interval_months: 6, last_done_date: '', next_due_date: '' });
        setEditingMaintId(null);
        setShowMaintModal(true);
    };

    const openEditMaintModal = (t) => {
        setMaintInput({
            task_name: t.task_name || '',
            description: t.description || '',
            interval_months: t.interval_months || 6,
            last_done_date: t.last_done_date || '',
            next_due_date: t.next_due_date || ''
        });
        setEditingMaintId(t.id);
        setShowMaintModal(true);
    };

    const handleSaveMaintTask = async (e) => {
        e.preventDefault();
        const payload = {
            ...maintInput,
            system_id: id,
            company_id: profile?.company_id,
            interval_months: parseInt(maintInput.interval_months) || 6
        };

        let err;
        if (editingMaintId) {
            const res = await updateSystemMaintenanceTask(editingMaintId, payload);
            err = res.error;
        } else {
            const res = await createSystemMaintenanceTask(payload);
            err = res.error;
        }

        if (!err) {
            toast.success('Maintenance task saved');
            setShowMaintModal(false);
            fetchSystemData();
        } else {
            toast.error('Failed to save maintenance task');
        }
    };

    const handleDeleteMaintTask = async (taskId) => {
        if (window.confirm('Delete this maintenance task?')) {
            const { error } = await deleteSystemMaintenanceTask(taskId);
            if (!error) {
                toast.success('Maintenance task deleted');
                fetchSystemData();
            }
        }
    };

    if (loading) {
        return <div style={{ padding: '60px', textAlign: 'center' }}><RefreshCw className="animate-spin" size={32} style={{ margin: '0 auto' }} /></div>;
    }

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
            {/* Header */}
            <div className="page-header" style={{
                background: 'linear-gradient(135deg, rgba(26, 60, 99, 0.08) 0%, rgba(59, 130, 246, 0.04) 100%)',
                padding: '24px 32px',
                borderRadius: '20px',
                border: '1px solid rgba(226, 232, 240, 0.8)',
                marginBottom: '32px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className="btn btn-secondary" style={{ padding: '8px', borderRadius: '50%', minWidth: 'auto', width: '42px', height: '42px' }} onClick={() => navigate('/catalog')}>
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="page-title" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>
                            {isNewSystem ? 'New Machinery System' : `System: ${formData.name}`}
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '0.88rem', marginTop: '4px' }}>
                            {!isNewSystem ? `Machinery ID: ${formData.system_no || 'N/A'}` : 'Configure and register a new vessel machinery system'}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    {!isNewSystem && (
                        <button className="btn btn-danger" onClick={handleDeleteSystem}>
                            <Trash2 size={16} /> Delete System
                        </button>
                    )}
                    <button className="btn btn-secondary" onClick={() => navigate('/catalog')}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave} style={{ background: '#1a3c63', borderColor: '#1a3c63' }}>
                        <Save size={16} /> Save System
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ borderBottom: '1px solid #cbd5e1', marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '2px' }}>
                    {[
                        { id: 'overview', label: 'System Overview', icon: <Info size={16} /> },
                        { id: 'parts', label: `Spare Parts (${parts.length})`, icon: <Database size={16} /> },
                        { id: 'documents', label: `Documents (${documents.length})`, icon: <FileText size={16} /> },
                        { id: 'photos', label: `Photos (${photos.length})`, icon: <ImageIcon size={16} /> },
                        { id: 'maintenance', label: `Maintenance Schedule (${maintenanceTasks.length})`, icon: <Wrench size={16} /> },
                        { id: 'audit_logs', label: 'Audit Trail', icon: <FileCheck size={16} /> }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            style={{
                                padding: '12px 20px',
                                background: activeTab === tab.id ? '#ffffff' : 'transparent',
                                border: '1px solid',
                                borderColor: activeTab === tab.id ? '#cbd5e1 #cbd5e1 transparent' : 'transparent',
                                borderRadius: '8px 8px 0 0',
                                fontWeight: 700,
                                fontSize: '0.88rem',
                                color: activeTab === tab.id ? '#1a3c63' : '#64748b',
                                marginBottom: '-1px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab content */}
            {activeTab === 'overview' && (
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: '0 0 24px', fontSize: '1.15rem', fontWeight: 800, color: '#1a3c63' }}>System Specifications</h3>
                    <form onSubmit={handleSave}>
                        <div className="grid-2">
                            <div className="form-group">
                                <label className="form-label">System Name *</label>
                                <input type="text" className="form-input" name="name" value={formData.name} onChange={handleInputChange} required placeholder="e.g. Main Engine Fuel Oil Purifier" />
                            </div>

                            <div className="form-group">
                                <label className="form-label">System Number (Auto-Generated)</label>
                                <input type="text" className="form-input" name="system_no" value={formData.system_no} disabled placeholder="SYSXXXXXX" />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Department</label>
                                <select className="form-select" name="department_id" value={formData.department_id} onChange={handleInputChange}>
                                    <option value="">Select Department...</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Equipment Group</label>
                                <select className="form-select" name="equipment_group_id" value={formData.equipment_group_id} onChange={handleInputChange}>
                                    <option value="">Select Equipment Group...</option>
                                    {equipmentGroups.map(eg => <option key={eg.id} value={eg.id}>{eg.name}</option>)}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Original Maker (Brand/Manufacturer)</label>
                                <select className="form-select" name="maker_id" value={formData.maker_id} onChange={handleInputChange}>
                                    <option value="">Select Maker...</option>
                                    {makers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Machinery Model</label>
                                <select className="form-select" name="model_id" value={formData.model_id} onChange={handleInputChange}>
                                    <option value="">Select Model...</option>
                                    {models.filter(m => !formData.maker_id || m.maker_id === formData.maker_id).map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {activeTab === 'parts' && (
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#1a3c63' }}>Spare Parts Inventory</h3>
                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>All registered spare parts linked to this system</p>
                        </div>
                        <button className="btn btn-primary" style={{ background: '#1a3c63', borderColor: '#1a3c63' }} onClick={() => navigate('/catalog/new')}>
                            <Plus size={16} /> Register Spare Part
                        </button>
                    </div>

                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Spare No.</th>
                                    <th>Part Name</th>
                                    <th>OEM Part No</th>
                                    <th>Brand</th>
                                    <th>Qty Available</th>
                                    <th>Location</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parts.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontStyle: 'italic' }}>No spare parts registered under this machinery system.</td>
                                    </tr>
                                ) : (
                                    parts.map(p => (
                                        <tr key={p.id}>
                                            <td style={{ fontWeight: 800 }}>#{p.spare_number}</td>
                                            <td style={{ fontWeight: 600 }}>{p.name}</td>
                                            <td>{p.oem_part_no || '-'}</td>
                                            <td>{p.brand || 'OEM'}</td>
                                            <td style={{ fontWeight: 700 }}>{p.quantity}</td>
                                            <td>{p.stored_location || '-'}</td>
                                            <td>
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    padding: '3px 8px',
                                                    borderRadius: '20px',
                                                    fontWeight: 700,
                                                    background: p.status === 'Active' ? '#ecfdf5' : '#f1f5f9',
                                                    color: p.status === 'Active' ? '#15803d' : '#475569'
                                                }}>{p.status}</span>
                                            </td>
                                            <td>
                                                <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/catalog/${p.id}`)}>Edit Part</button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'documents' && (
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                    <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#1a3c63' }}>Machinery Manuals & Blueprints</h3>
                        <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Link certificates, wiring diagrams, and instruction manuals for the system</p>
                    </div>

                    <form onSubmit={handleAddDocument} style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div className="form-group" style={{ flex: 2, minWidth: '200px', marginBottom: 0 }}>
                                <label className="form-label" style={{ fontSize: '0.78rem' }}>Document Label *</label>
                                <input type="text" className="form-input" value={docInput.name} onChange={e => setDocInput(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. Instruction Manual Vol 1" required />
                            </div>

                            <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                                <label className="form-label" style={{ fontSize: '0.78rem' }}>Type</label>
                                <select className="form-select" value={docInput.type} onChange={e => setDocInput(prev => ({ ...prev, type: e.target.value }))}>
                                    <option value="Manual">Manual</option>
                                    <option value="Wiring Diagram">Wiring Diagram</option>
                                    <option value="Certificate">Certificate</option>
                                    <option value="Datasheet">Datasheet</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>

                            <div className="form-group" style={{ flex: 2, minWidth: '250px', marginBottom: 0 }}>
                                <label className="form-label" style={{ fontSize: '0.78rem' }}>URL / Target Link *</label>
                                <input type="url" className="form-input" value={docInput.url} onChange={e => setDocInput(prev => ({ ...prev, url: e.target.value }))} placeholder="https://..." required />
                            </div>

                            <button type="submit" className="btn btn-primary" style={{ padding: '10px 24px', background: '#1a3c63', borderColor: '#1a3c63' }}>
                                Link File
                            </button>
                        </div>
                    </form>

                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Label</th>
                                    <th>URL</th>
                                    <th>Linked Date</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documents.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontStyle: 'italic' }}>No blueprints linked.</td>
                                    </tr>
                                ) : (
                                    documents.map(doc => (
                                        <tr key={doc.id}>
                                            <td>
                                                <span style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                                    {doc.document_type}
                                                </span>
                                            </td>
                                            <td style={{ fontWeight: 600 }}>{doc.name}</td>
                                            <td>
                                                <a href={doc.file_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)', fontWeight: 600 }}>
                                                    <ExternalLink size={14} /> Open File
                                                </a>
                                            </td>
                                            <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                                            <td>
                                                <button className="btn btn-danger btn-sm" style={{ padding: '6px', background: '#fef2f2', color: '#ef4444', borderColor: '#fee2e2' }} onClick={() => handleDeleteDocument(doc.id)}>
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'photos' && (
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                    <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#1a3c63' }}>Gallery & System Layout Photos</h3>
                        <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Upload or link photos of the machinery layout or nameplate</p>
                    </div>

                    <form onSubmit={handleAddPhoto} style={{ display: 'flex', gap: '12px', marginBottom: '28px' }}>
                        <input type="url" className="form-input" value={photoUrlInput} onChange={e => setPhotoUrlInput(e.target.value)} placeholder="Enter photo image URL..." style={{ flex: 1 }} />
                        <button type="submit" className="btn btn-primary" style={{ background: '#1a3c63', borderColor: '#1a3c63' }}>Add Photo</button>
                    </form>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                        {photos.map(p => (
                            <div key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: '#fff' }}>
                                <img src={p.url} alt="System Layout" style={{ width: '100%', height: '150px', objectFit: 'cover' }} />
                                <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(p.created_at).toLocaleDateString()}</span>
                                    <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px', background: '#fef2f2', color: '#ef4444', borderColor: '#fee2e2' }} onClick={() => handleDeletePhoto(p.id)}>
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ))}
                        {photos.length === 0 && (
                            <div style={{ gridColumn: '1 / -1', padding: '32px 0', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No photos registered.</div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'maintenance' && (
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#1a3c63' }}>System Maintenance Tasks</h3>
                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>Track scheduling and interval routines for the machinery</p>
                        </div>
                        <button className="btn btn-primary" style={{ background: '#1a3c63', borderColor: '#1a3c63' }} onClick={openNewMaintModal}>
                            <Plus size={16} /> Schedule Task
                        </button>
                    </div>

                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Task Routine Name</th>
                                    <th>Interval (Months)</th>
                                    <th>Last Done</th>
                                    <th>Next Due</th>
                                    <th>Description</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {maintenanceTasks.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontStyle: 'italic' }}>No maintenance tasks scheduled.</td>
                                    </tr>
                                ) : (
                                    maintenanceTasks.map(t => (
                                        <tr key={t.id}>
                                            <td style={{ fontWeight: 700, color: '#1e293b' }}>{t.task_name}</td>
                                            <td style={{ fontWeight: 600 }}>Every {t.interval_months} Mths</td>
                                            <td>{t.last_done_date || '-'}</td>
                                            <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{t.next_due_date || '-'}</td>
                                            <td style={{ fontSize: '0.82rem' }}>{t.description || '-'}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => openEditMaintModal(t)}>Edit</button>
                                                    <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px', background: '#fef2f2', color: '#ef4444', borderColor: '#fee2e2' }} onClick={() => handleDeleteMaintTask(t.id)}>Remove</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'audit_logs' && (
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                    <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#1a3c63' }}>Audit History Trail</h3>
                        <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Track modifications, updates, and creation logs for security and validation</p>
                    </div>

                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>Action</th>
                                    <th>User ID / PIC</th>
                                    <th>Details / Fields Changed</th>
                                </tr>
                            </thead>
                            <tbody>
                                {auditLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontStyle: 'italic' }}>No audit history records available.</td>
                                    </tr>
                                ) : (
                                    auditLogs.map(log => (
                                        <tr key={log.id}>
                                            <td>{new Date(log.created_at).toLocaleString()}</td>
                                            <td>
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    padding: '3px 8px',
                                                    borderRadius: '4px',
                                                    fontWeight: 700,
                                                    background: log.action === 'CREATE' ? '#d1fae5' : '#fef3c7',
                                                    color: log.action === 'CREATE' ? '#065f46' : '#92400e'
                                                }}>{log.action}</span>
                                            </td>
                                            <td>{log.user_id || 'System Process'}</td>
                                            <td style={{ fontSize: '0.82rem' }}><code>{JSON.stringify(log.changed_fields)}</code></td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Maintenance Scheduling Modal */}
            {showMaintModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '24px', background: '#fff', borderRadius: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                            <h3 style={{ margin: 0, fontWeight: 800 }}>{editingMaintId ? 'Edit Maintenance Task' : 'Schedule Maintenance Task'}</h3>
                            <button className="btn btn-secondary" style={{ padding: '6px', minWidth: 'auto' }} onClick={() => setShowMaintModal(false)}><X size={16} /></button>
                        </div>

                        <form onSubmit={handleSaveMaintTask}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div className="form-group">
                                    <label className="form-label">Task routine Name *</label>
                                    <input type="text" className="form-input" value={maintInput.task_name} onChange={e => setMaintInput(prev => ({ ...prev, task_name: e.target.value }))} required placeholder="e.g. Major Overhaul, Gasket Replacement" />
                                </div>

                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Interval (Months)</label>
                                        <input type="number" className="form-input" value={maintInput.interval_months} onChange={e => setMaintInput(prev => ({ ...prev, interval_months: e.target.value }))} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Last Done Date</label>
                                        <input type="date" className="form-input" value={maintInput.last_done_date} onChange={e => setMaintInput(prev => ({ ...prev, last_done_date: e.target.value }))} />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Next Due Date</label>
                                    <input type="date" className="form-input" value={maintInput.next_due_date} onChange={e => setMaintInput(prev => ({ ...prev, next_due_date: e.target.value }))} />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Description / Instructions</label>
                                    <textarea className="form-textarea" value={maintInput.description} onChange={e => setMaintInput(prev => ({ ...prev, description: e.target.value }))} rows="3" placeholder="Provide overhaul instructions or notes..." />
                                </div>

                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowMaintModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" style={{ background: '#1a3c63', borderColor: '#1a3c63' }}>Save Routine</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SystemForm;
