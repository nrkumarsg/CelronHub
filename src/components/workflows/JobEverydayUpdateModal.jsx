import React, { useState, useEffect } from 'react';
import { 
    X, Save, Loader2, Calendar, User, DollarSign, Tag, Info, 
    Upload, ExternalLink, Plus, Clock, CheckCircle2, AlertCircle, 
    Trash2, Sparkles, Building2, Ship, MapPin, FileText, ArrowRight,
    History, CheckSquare, RefreshCw
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { 
    saveWorkflowDocument, 
    uploadJobAttachment, 
    generateDocNumber,
    deleteWorkflowDocument,
    getWorkflowDocumentsByJob
} from '../../lib/workflowV2Service';
import { useVesselsStore } from '../../lib/vesselsStore';
import { openGoogleCalendarWeb, createGoogleCalendarApiEvent } from '../../lib/googleCalendarService';
import { isTokenValid } from '../../lib/googleAuthService';
import { getPartners } from '../../lib/store';
import SearchableSelect from '../common/SearchableSelect';
import toast from 'react-hot-toast';

// Available Pipeline Stages and Status Tells
const PIPELINE_STATUSES = [
    { id: 'Job Initiated', label: 'Job Initiated (PO Recd)', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', icon: '🚀' },
    { id: 'Supplier Orders Placed', label: 'Supplier PO Placed', color: '#d97706', bg: '#fff7ed', border: '#fed7aa', icon: '📦' },
    { id: 'In Execution', label: 'In Execution & DO', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', icon: '🛠️' },
    { id: 'Billed / Invoiced', label: 'Billed / Invoiced', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', icon: '🧾' },
    { id: 'Paid & Closed', label: 'Paid & Closed', color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0', icon: '💰' },
    { id: 'On Hold', label: 'On Hold / Pending', color: '#ea580c', bg: '#fff7ed', border: '#fdba74', icon: '⏸️' },
    { id: 'Cancelled', label: 'Cancelled', color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: '❌' }
];

export default function JobEverydayUpdateModal({
    job = null,
    allJobs = [],
    isOpen = true,
    onClose,
    onSave,
    onNavigateToJob
}) {
    const { user, profile, activeCompanyId, activeCompany } = useAuth();
    const effectiveCompanyId = activeCompanyId || profile?.company_id || activeCompany?.id;
    const authorName = profile?.full_name || user?.email?.split('@')[0] || 'Operator';

    const { vessels, fetchVessels } = useVesselsStore();
    const [partners, setPartners] = useState([]);
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);

    // Mode: 'existing' or 'new'
    const [mode, setMode] = useState(() => (job ? 'existing' : 'new'));
    const [selectedJob, setSelectedJob] = useState(job);

    // Primary Job Form State
    const [formData, setFormData] = useState({
        document_no: '',
        partner_id: '',
        contact_id: '',
        vessel_id: '',
        subject: '',
        status: 'Job Initiated',
        customer_po_no: '',
        customer_po_date: '',
        customer_po_by_id: '',
        po_description: '',
        total_amount: 0,
        expiry_date: '', // Target completion / delivery date
        customer_po_attachment_url: ''
    });

    // Everyday Update State
    const [dailyNote, setDailyNote] = useState('');
    const [nextActionDate, setNextActionDate] = useState('');
    const [syncWithGoogleCalendar, setSyncWithGoogleCalendar] = useState(false);
    const [calendarTime, setCalendarTime] = useState('09:00');
    const [dailyUpdatesHistory, setDailyUpdatesHistory] = useState([]);

    // Load partners & vessels on mount using full pagination (resolves 1000-row cutoff like TECHSMART)
    useEffect(() => {
        const loadMetadata = async () => {
            try {
                fetchVessels();
                const allPartners = await getPartners(profile);
                if (allPartners && allPartners.length > 0) {
                    setPartners(allPartners.map(p => ({
                        id: p.id,
                        name: p.name,
                        label: p.name,
                        category: Array.isArray(p.types) ? p.types.join(', ') : (p.types || '')
                    })));
                } else {
                    let q = supabase.from('partners').select('id, name, types').order('name').limit(3000);
                    if (effectiveCompanyId && profile?.role !== 'superadmin') {
                        q = q.or(`company_id.eq.${effectiveCompanyId},is_shared.eq.true,company_id.is.null`);
                    }
                    const { data } = await q;
                    if (data) {
                        setPartners(data.map(p => ({
                            id: p.id,
                            name: p.name,
                            label: p.name
                        })));
                    }
                }
            } catch (err) {
                console.warn('Error loading partners/vessels:', err);
            }
        };
        loadMetadata();
    }, [effectiveCompanyId, profile]);

    // Handle job selection or initialization
    useEffect(() => {
        if (selectedJob) {
            setMode('existing');
            const targetDoc = selectedJob.masterJob || selectedJob;
            const dv = targetDoc.delivery_verification || {};

            setFormData({
                id: targetDoc.id,
                document_no: targetDoc.document_no || targetDoc.assigned_job_no || '',
                partner_id: targetDoc.partner_id || '',
                contact_id: targetDoc.contact_id || '',
                vessel_id: targetDoc.vessel_id || '',
                subject: targetDoc.subject || dv.po_description || '',
                status: targetDoc.status || 'Job Initiated',
                customer_po_no: targetDoc.customer_po_no || '',
                customer_po_date: targetDoc.customer_po_date ? targetDoc.customer_po_date.split('T')[0] : '',
                customer_po_by_id: targetDoc.customer_po_by_id || '',
                po_description: dv.po_description || targetDoc.subject || '',
                total_amount: targetDoc.total_amount || dv.po_value || 0,
                expiry_date: targetDoc.expiry_date ? targetDoc.expiry_date.split('T')[0] : '',
                customer_po_attachment_url: targetDoc.customer_po_attachment_url || ''
            });

            // Extract historical updates
            const history = Array.isArray(dv.daily_updates) ? dv.daily_updates : [];
            setDailyUpdatesHistory(history);
            
            // If the latest update had a next action date, prefill next action
            if (history.length > 0 && history[0].next_action_date) {
                setNextActionDate(history[0].next_action_date);
            }
        } else {
            setMode('new');
            setDailyUpdatesHistory([]);
            setDailyNote('');
            setNextActionDate('');

            // Auto-generate Job No for new job
            const initNewJobNo = async () => {
                try {
                    const generatedNo = await generateDocNumber(effectiveCompanyId, 'Job');
                    setFormData({
                        document_no: generatedNo,
                        partner_id: '',
                        contact_id: '',
                        vessel_id: '',
                        subject: '',
                        status: 'Job Initiated',
                        customer_po_no: '',
                        customer_po_date: new Date().toISOString().split('T')[0],
                        customer_po_by_id: '',
                        po_description: '',
                        total_amount: 0,
                        expiry_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
                        customer_po_attachment_url: ''
                    });
                } catch (err) {
                    console.error('Failed to generate Job No:', err);
                }
            };
            initNewJobNo();
        }
    }, [selectedJob, effectiveCompanyId]);

    // Load contacts when partner changes
    useEffect(() => {
        if (formData.partner_id) {
            const fetchContacts = async () => {
                const { data } = await supabase
                    .from('contacts')
                    .select('id, first_name, last_name')
                    .eq('partner_id', formData.partner_id);
                if (data) {
                    setContacts(data.map(c => ({
                        id: c.id,
                        name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unnamed Contact'
                    })));
                } else {
                    setContacts([]);
                }
            };
            fetchContacts();
        } else {
            setContacts([]);
        }
    }, [formData.partner_id]);

    if (!isOpen) return null;

    const handleFieldChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleStatusSelect = (newStatusId) => {
        const oldStatus = formData.status;
        setFormData(prev => ({ ...prev, status: newStatusId }));
        
        // If changing status and no note yet, auto-suggest status transition note
        if (!dailyNote.trim() && oldStatus !== newStatusId) {
            setDailyNote(`Status updated from "${oldStatus}" to "${newStatusId}".`);
        }
    };

    const applyOffsetDays = (days) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        setNextActionDate(d.toISOString().split('T')[0]);
    };

    // Trigger Google Calendar Sync
    const triggerCalendarEventCreation = async ({ title, description, location, dateStr, timeStr }) => {
        const start = new Date(`${dateStr}T${timeStr}:00`);
        const end = new Date(start.getTime() + 3600000); // 1 hour

        // Try direct API if token is valid, otherwise open 1-click Web Intent
        if (isTokenValid()) {
            try {
                await createGoogleCalendarApiEvent({
                    title,
                    description,
                    location,
                    startDate: start,
                    endDate: end
                });
                toast.success('Event synced directly to your Google Calendar!', { icon: '📅' });
                return true;
            } catch (apiErr) {
                console.warn('Direct Calendar API failed, falling back to Web Intent:', apiErr);
            }
        }

        // Web intent fallback
        openGoogleCalendarWeb({
            title,
            description,
            location,
            startDate: start,
            endDate: end
        });
        toast.success('Opened in Google Calendar!');
        return true;
    };

    // Save Form Handler (Full CRUD + Everyday Update + Calendar)
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const isNew = mode === 'new';
            let attachmentUrl = formData.customer_po_attachment_url;

            if (selectedFile) {
                setUploading(true);
                attachmentUrl = await uploadJobAttachment(selectedFile, effectiveCompanyId);
                setUploading(false);
            }

            // Customer Name & Vessel Name for references
            const selectedPartner = partners.find(p => p.id === formData.partner_id);
            const customerName = selectedPartner?.name || 'Customer';
            const selectedVessel = vessels.find(v => v.id === formData.vessel_id);
            const vesselName = selectedVessel?.vessel_name || '';

            // Construct new daily update entry if note or follow-up date provided
            let updatedDailyUpdates = [...dailyUpdatesHistory];
            let calendarSyncedThisTurn = false;

            if (dailyNote.trim() || nextActionDate) {
                const newUpdateEntry = {
                    id: crypto.randomUUID ? crypto.randomUUID() : `upd-${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    author: authorName,
                    status: formData.status,
                    notes: dailyNote.trim() || 'Routine daily checkpoint logged.',
                    next_action_date: nextActionDate || null,
                    calendar_synced: syncWithGoogleCalendar && Boolean(nextActionDate)
                };

                updatedDailyUpdates = [newUpdateEntry, ...updatedDailyUpdates];

                // Trigger Google Calendar if user selected or toggled
                if (syncWithGoogleCalendar && nextActionDate) {
                    const calTitle = `[${formData.document_no}] ${vesselName ? `${vesselName} - ` : ''}${customerName}`;
                    const calDesc = `Job No: ${formData.document_no}\nCustomer: ${customerName}\nStatus: ${formData.status}\n\nToday's Update:\n${dailyNote || 'Follow-up checkpoint'}\n\nCelronHub App Reference: ${window.location.origin}/workflows/editor/job/${formData.id || ''}`;
                    
                    calendarSyncedThisTurn = await triggerCalendarEventCreation({
                        title: calTitle,
                        description: calDesc,
                        location: vesselName || 'Anchorage / Shipyard',
                        dateStr: nextActionDate,
                        timeStr: calendarTime
                    });
                }
            }

            // Prepare Master Job Document payload for saveWorkflowDocument
            const existingDv = (selectedJob?.masterJob?.delivery_verification || selectedJob?.delivery_verification) || {};

            const jobDocPayload = {
                ...(isNew ? {} : { id: formData.id }),
                company_id: effectiveCompanyId,
                document_type: 'Job',
                document_no: formData.document_no,
                assigned_job_no: formData.document_no,
                is_job: true,
                partner_id: formData.partner_id || null,
                contact_id: formData.contact_id || null,
                vessel_id: formData.vessel_id || null,
                subject: formData.subject || 'Marine Service & Supply Job',
                status: formData.status,
                customer_po_no: formData.customer_po_no,
                customer_po_date: formData.customer_po_date || null,
                customer_po_by_id: formData.customer_po_by_id || null,
                customer_po_attachment_url: attachmentUrl,
                expiry_date: formData.expiry_date || null,
                total_amount: parseFloat(formData.total_amount) || 0,
                delivery_verification: {
                    ...existingDv,
                    po_description: formData.po_description || formData.subject,
                    po_value: parseFloat(formData.total_amount) || 0,
                    pipeline_stage: formData.status,
                    daily_updates: updatedDailyUpdates,
                    last_daily_update_at: new Date().toISOString(),
                    last_daily_update_by: authorName
                }
            };

            const { data: savedDoc, error } = await saveWorkflowDocument(jobDocPayload);
            if (error) throw error;

            toast.success(isNew ? `🎉 Job ${formData.document_no} created successfully!` : `✅ Job ${formData.document_no} & Daily Update saved!`);
            
            if (onSave) {
                await onSave(savedDoc);
            }
            onClose();
        } catch (err) {
            console.error('Error saving job & daily update:', err);
            toast.error('Failed to save job: ' + (err.message || 'Unknown error'));
        } finally {
            setLoading(false);
        }
    };

    // Delete Job Handler
    const handleDeleteJob = async () => {
        if (!formData.id && !selectedJob?.id) return;
        const jobNo = formData.document_no;
        if (!window.confirm(`Are you sure you want to permanently delete Job ${jobNo} and all its suite records?\n\nThis cannot be undone.`)) {
            return;
        }

        setLoading(true);
        try {
            const targetId = formData.id || selectedJob?.id;
            const { data: jobDocs } = await getWorkflowDocumentsByJob(targetId);
            if (jobDocs && jobDocs.length > 0) {
                const docIds = new Set(jobDocs.map(d => d.id));
                const rootDocs = jobDocs.filter(jd => !jd.original_document_id || !docIds.has(jd.original_document_id));
                await Promise.all(rootDocs.map(jd => deleteWorkflowDocument(jd.id)));
            } else {
                await deleteWorkflowDocument(targetId);
            }
            toast.success(`Job ${jobNo} deleted successfully.`);
            if (onSave) await onSave(null);
            onClose();
        } catch (err) {
            console.error('Failed to delete job:', err);
            toast.error('Delete failed: ' + (err.message || 'Error deleting job'));
        } finally {
            setLoading(false);
        }
    };

    // Current status object for styling
    const currentStatusConfig = PIPELINE_STATUSES.find(s => s.id === formData.status) || {
        id: formData.status,
        label: formData.status,
        color: '#6366f1',
        bg: '#eef2ff',
        border: '#c7d2fe',
        icon: '📌'
    };

    return (
        <div className="modal-backdrop" style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)'
        }}>
            <div className="modal-content" style={{
                background: '#ffffff',
                borderRadius: '18px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                width: '100%',
                maxWidth: '920px',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                animation: 'modalSlideIn 0.2s ease-out'
            }}>
                {/* Sleek Dark Header with Mode Selector */}
                <div style={{
                    padding: '18px 24px',
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #334155'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '12px',
                            background: 'rgba(59, 130, 246, 0.2)',
                            color: '#38bdf8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid rgba(56, 189, 248, 0.4)'
                        }}>
                            <Tag size={22} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc' }}>
                                    {mode === 'new' ? 'New Job Entry' : `Job Daily Update — ${formData.document_no}`}
                                </h2>
                                <span style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    background: currentStatusConfig.bg,
                                    color: currentStatusConfig.color,
                                    border: `1px solid ${currentStatusConfig.border}`
                                }}>
                                    {currentStatusConfig.icon} {currentStatusConfig.label}
                                </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                                Live status tracking, everyday technician/sales log, full CRUD, and Google Calendar sync
                            </p>
                        </div>
                    </div>

                    {/* Mode Toggle & Close */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {allJobs && allJobs.length > 0 && (
                            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '2px' }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedJob(null);
                                        setMode('new');
                                    }}
                                    style={{
                                        background: mode === 'new' ? 'var(--accent, #3b82f6)' : 'transparent',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '5px 12px',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        borderRadius: '6px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    + New Job
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!selectedJob && allJobs[0]) setSelectedJob(allJobs[0]);
                                        setMode('existing');
                                    }}
                                    style={{
                                        background: mode === 'existing' ? 'var(--accent, #3b82f6)' : 'transparent',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '5px 12px',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        borderRadius: '6px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Update Existing
                                </button>
                            </div>
                        )}

                        <button onClick={onClose} className="btn-icon" style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.05)' }}>
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* If mode is existing and user wants to switch which job to update */}
                {mode === 'existing' && allJobs.length > 0 && (
                    <div style={{ padding: '10px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                            Select Job to Update:
                        </span>
                        <select
                            className="form-input"
                            style={{ fontSize: '0.8rem', padding: '6px 12px', flex: 1 }}
                            value={selectedJob?.jobNo || selectedJob?.document_no || ''}
                            onChange={(e) => {
                                const targetNo = e.target.value;
                                const found = allJobs.find(j => (j.jobNo === targetNo || j.document_no === targetNo || j.assigned_job_no === targetNo));
                                if (found) setSelectedJob(found);
                            }}
                        >
                            {allJobs.map((j) => {
                                const no = j.jobNo || j.document_no || j.assigned_job_no;
                                const cust = j.customer || j.partners?.name || 'Walk-in';
                                const sub = j.description || j.subject || '';
                                return (
                                    <option key={no || j.id} value={no}>
                                        {no} • {cust} {sub ? `(${sub.slice(0, 30)}...)` : ''} — [{j.status || 'Active'}]
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                )}

                {/* Scrollable Body */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
                    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        
                        {/* 1. STATUS TELLS PIPELINE BAR */}
                        <div style={{
                            background: '#f8fafc',
                            padding: '14px 18px',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, color: '#1e293b' }}>
                                    <Sparkles size={16} color="#f59e0b" />
                                    STATUS TELLS & PIPELINE STAGE
                                </div>
                                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                    Click any stage to instantly transition this job's status
                                </span>
                            </div>

                            {/* Horizontal Interactive Status Tells Pills */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {PIPELINE_STATUSES.map(stage => {
                                    const isSelected = formData.status === stage.id;
                                    return (
                                        <button
                                            key={stage.id}
                                            type="button"
                                            onClick={() => handleStatusSelect(stage.id)}
                                            style={{
                                                background: isSelected ? stage.color : stage.bg,
                                                color: isSelected ? '#ffffff' : stage.color,
                                                border: `1.5px solid ${stage.border}`,
                                                boxShadow: isSelected ? `0 4px 10px ${stage.border}` : 'none',
                                                padding: '6px 14px',
                                                borderRadius: '20px',
                                                fontSize: '0.76rem',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <span>{stage.icon}</span>
                                            <span>{stage.label}</span>
                                            {isSelected && <CheckCircle2 size={13} style={{ marginLeft: '2px' }} />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 2. CORE JOB DETAILS (FULL CRUD) */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                            gap: '16px',
                            background: '#ffffff',
                            padding: '16px',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0'
                        }}>
                            {/* Job No */}
                            <div className="form-item">
                                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>CEL Job Number</span>
                                    <span style={{ fontSize: '0.7rem', color: '#6366f1', fontWeight: 600 }}>Auto-Generated</span>
                                </label>
                                <input
                                    type="text"
                                    name="document_no"
                                    className="form-input"
                                    value={formData.document_no}
                                    readOnly={mode === 'existing'}
                                    onChange={handleFieldChange}
                                    style={{ fontWeight: 800, color: '#0f172a', background: mode === 'existing' ? '#f8fafc' : '#ffffff' }}
                                    placeholder="CEL-2609-XXXX"
                                    required
                                />
                            </div>

                            {/* Customer Selector (SearchableSelect) */}
                            <div className="form-item">
                                <label className="form-label">Customer / Partner *</label>
                                <SearchableSelect
                                    options={partners}
                                    value={formData.partner_id}
                                    name="partner_id"
                                    onChange={handleFieldChange}
                                    placeholder="Search or select customer (e.g. Techsmart)..."
                                    onAddNew={async (typedName) => {
                                        if (!typedName?.trim()) return;
                                        const cleanName = typedName.trim();
                                        try {
                                            const { data: newP, error } = await supabase.from('partners').insert([{
                                                name: cleanName,
                                                company_id: effectiveCompanyId,
                                                types: ['Customer']
                                            }]).select('id, name').single();
                                            if (error) throw error;
                                            if (newP) {
                                                const partnerObj = { id: newP.id, name: newP.name, label: newP.name };
                                                setPartners(prev => [partnerObj, ...prev]);
                                                setFormData(prev => ({ ...prev, partner_id: newP.id }));
                                                toast.success(`Created & selected "${newP.name}"!`);
                                            }
                                        } catch (e) {
                                            console.error('Failed to create partner:', e);
                                            const tempId = `custom-${Date.now()}`;
                                            const partnerObj = { id: tempId, name: cleanName, label: cleanName };
                                            setPartners(prev => [partnerObj, ...prev]);
                                            setFormData(prev => ({ ...prev, partner_id: tempId, po_description: cleanName }));
                                            toast.success(`Using customer "${cleanName}"`);
                                        }
                                    }}
                                    addNewText="+ Add New Customer"
                                />
                            </div>

                            {/* Vessel / Location */}
                            <div className="form-item">
                                <label className="form-label">Vessel / Location</label>
                                <SearchableSelect
                                    options={vessels.map(v => ({
                                        id: v.id,
                                        name: `${v.vessel_name}${v.imo_number ? ` (IMO: ${v.imo_number})` : ''}`,
                                        label: v.vessel_name
                                    }))}
                                    value={formData.vessel_id}
                                    name="vessel_id"
                                    onChange={handleFieldChange}
                                    placeholder="Search or select vessel / workplace..."
                                    onAddNew={async (typedVessel) => {
                                        if (!typedVessel?.trim()) return;
                                        const cleanName = typedVessel.trim();
                                        try {
                                            const { data: newV, error } = await supabase.from('vessels').insert([{
                                                vessel_name: cleanName,
                                                company_id: effectiveCompanyId
                                            }]).select('id, vessel_name').single();
                                            if (error) throw error;
                                            if (newV) {
                                                fetchVessels();
                                                setFormData(prev => ({ ...prev, vessel_id: newV.id }));
                                                toast.success(`Added vessel/workplace "${newV.vessel_name}"!`);
                                            }
                                        } catch (e) {
                                            console.error('Failed to create vessel:', e);
                                            const tempId = `vessel-${Date.now()}`;
                                            setFormData(prev => ({ ...prev, vessel_id: tempId }));
                                            toast.success(`Using workplace "${cleanName}"`);
                                        }
                                    }}
                                    addNewText="+ Add New Vessel / Workplace"
                                />
                            </div>

                            {/* Customer PO No */}
                            <div className="form-item">
                                <label className="form-label">Customer PO Reference</label>
                                <input
                                    type="text"
                                    name="customer_po_no"
                                    className="form-input"
                                    value={formData.customer_po_no}
                                    onChange={handleFieldChange}
                                    placeholder="e.g. PO-88992 / Email Ref"
                                />
                            </div>

                            {/* PO Date */}
                            <div className="form-item">
                                <label className="form-label">PO / Confirmation Date</label>
                                <input
                                    type="date"
                                    name="customer_po_date"
                                    className="form-input"
                                    value={formData.customer_po_date}
                                    onChange={handleFieldChange}
                                />
                            </div>

                            {/* Job Value (SGD) */}
                            <div className="form-item">
                                <label className="form-label">Job Value (SGD)</label>
                                <div style={{ position: 'relative' }}>
                                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: '#64748b', fontSize: '0.8rem' }}>SGD</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        name="total_amount"
                                        className="form-input"
                                        style={{ paddingLeft: '45px', fontWeight: 700 }}
                                        value={formData.total_amount}
                                        onChange={handleFieldChange}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            {/* Contact Person */}
                            <div className="form-item">
                                <label className="form-label">Customer Contact Person</label>
                                <select
                                    name="contact_id"
                                    className="form-input"
                                    value={formData.contact_id}
                                    onChange={handleFieldChange}
                                >
                                    <option value="">Select Contact...</option>
                                    {contacts.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Target Delivery / Completion Date */}
                            <div className="form-item">
                                <label className="form-label">Target Completion / Delivery Date</label>
                                <input
                                    type="date"
                                    name="expiry_date"
                                    className="form-input"
                                    value={formData.expiry_date}
                                    onChange={handleFieldChange}
                                />
                            </div>

                            {/* Subject / Scope of Work */}
                            <div className="form-item" style={{ gridColumn: '1 / -1' }}>
                                <label className="form-label">Subject / Scope of Work</label>
                                <input
                                    type="text"
                                    name="subject"
                                    className="form-input"
                                    value={formData.subject}
                                    onChange={handleFieldChange}
                                    placeholder="Brief summary of service or supply requirement..."
                                />
                            </div>
                        </div>

                        {/* 3. EVERYDAY UPDATE LOG & GOOGLE CALENDAR ENGINE */}
                        <div style={{
                            background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)',
                            borderRadius: '14px',
                            border: '1.5px solid #bbf7d0',
                            padding: '18px 20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Clock size={18} color="#16a34a" />
                                    <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#166534' }}>
                                        Everyday Operational Log & Google Calendar Sync
                                    </h3>
                                </div>
                                <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: '12px', fontWeight: 700 }}>
                                    Logged by: {authorName} • Today: {new Date().toLocaleDateString('en-SG')}
                                </span>
                            </div>

                            {/* Daily Note Input */}
                            <div>
                                <label className="form-label" style={{ color: '#15803d', fontWeight: 700 }}>
                                    Today's Progress / Remarks / Work Performed:
                                </label>
                                <textarea
                                    className="form-input"
                                    rows={3}
                                    value={dailyNote}
                                    onChange={(e) => setDailyNote(e.target.value)}
                                    placeholder="e.g. Technician boarded vessel at Marina South Pier. Disassembled booster pump, replaced mechanical seal. System running test-run successfully..."
                                    style={{ borderColor: '#86efac', background: '#ffffff', fontSize: '0.84rem' }}
                                />
                            </div>

                            {/* Next Action & Google Calendar Controls */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                gap: '14px',
                                background: '#ffffff',
                                padding: '14px',
                                borderRadius: '10px',
                                border: '1px solid #dcfce7'
                            }}>
                                {/* Next Action Date */}
                                <div>
                                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                                        Next Action / Follow-Up Date:
                                    </label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={nextActionDate}
                                        onChange={(e) => setNextActionDate(e.target.value)}
                                    />
                                    {/* Presets */}
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                        {[
                                            { label: 'Tomorrow', days: 1 },
                                            { label: '+3 Days', days: 3 },
                                            { label: '+1 Week', days: 7 }
                                        ].map(preset => (
                                            <button
                                                key={preset.label}
                                                type="button"
                                                onClick={() => applyOffsetDays(preset.days)}
                                                style={{
                                                    background: '#f1f5f9',
                                                    border: '1px solid #e2e8f0',
                                                    color: '#334155',
                                                    fontSize: '0.68rem',
                                                    fontWeight: 700,
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Calendar Sync Toggle & Time */}
                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                                        <input
                                            type="checkbox"
                                            checked={syncWithGoogleCalendar}
                                            onChange={(e) => setSyncWithGoogleCalendar(e.target.checked)}
                                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                        />
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Calendar size={15} color="#2563eb" />
                                            Add to Google Calendar
                                        </span>
                                    </label>

                                    {syncWithGoogleCalendar && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Time:</span>
                                            <input
                                                type="time"
                                                value={calendarTime}
                                                onChange={(e) => setCalendarTime(e.target.value)}
                                                className="form-input"
                                                style={{ padding: '4px 8px', fontSize: '0.78rem', width: '120px' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!nextActionDate) {
                                                        toast.error('Please pick a Next Action Date first');
                                                        return;
                                                    }
                                                    const cust = partners.find(p => p.id === formData.partner_id)?.name || 'Customer';
                                                    const vess = vessels.find(v => v.id === formData.vessel_id)?.vessel_name || '';
                                                    triggerCalendarEventCreation({
                                                        title: `[${formData.document_no}] ${vess ? `${vess} - ` : ''}${cust}`,
                                                        description: `Job: ${formData.document_no}\n${dailyNote || 'Follow-up appointment'}`,
                                                        location: vess || 'Singapore',
                                                        dateStr: nextActionDate,
                                                        timeStr: calendarTime
                                                    });
                                                }}
                                                className="btn btn-sm btn-secondary"
                                                style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px', borderColor: '#93c5fd', color: '#1d4ed8' }}
                                            >
                                                <ExternalLink size={12} /> Test Sync
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 4. HISTORICAL DAILY UPDATES AUDIT TIMELINE */}
                        {dailyUpdatesHistory.length > 0 && (
                            <div style={{
                                background: '#f8fafc',
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0',
                                padding: '16px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                    <History size={16} color="#6366f1" />
                                    <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#334155' }}>
                                        Daily Progress Log History ({dailyUpdatesHistory.length} {dailyUpdatesHistory.length === 1 ? 'entry' : 'entries'})
                                    </h4>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                                    {dailyUpdatesHistory.map((entry, idx) => {
                                        const entryDate = entry.timestamp ? new Date(entry.timestamp).toLocaleString('en-SG', { dateStyle: 'short', timeStyle: 'short' }) : 'Earlier';
                                        return (
                                            <div
                                                key={entry.id || idx}
                                                style={{
                                                    background: '#ffffff',
                                                    padding: '10px 14px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #e2e8f0',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '4px'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f172a' }}>
                                                            {entry.author || 'Operator'}
                                                        </span>
                                                        <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                                                            {entryDate}
                                                        </span>
                                                    </div>
                                                    {entry.status && (
                                                        <span style={{ fontSize: '0.68rem', fontWeight: 700, background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: '4px' }}>
                                                            {entry.status}
                                                        </span>
                                                    )}
                                                </div>
                                                <p style={{ margin: 0, fontSize: '0.78rem', color: '#334155', lineHeight: '1.4' }}>
                                                    {entry.notes}
                                                </p>
                                                {entry.next_action_date && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#2563eb', fontWeight: 600 }}>
                                                        <Calendar size={11} /> Next Action: {entry.next_action_date}
                                                        {entry.calendar_synced && <span style={{ color: '#16a34a' }}>• Calendar Synced</span>}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* 5. PO ATTACHMENT UPLOAD */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                            <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', padding: '6px 12px' }}>
                                <Upload size={14} />
                                {selectedFile ? selectedFile.name : (formData.customer_po_attachment_url ? 'Replace PO Document' : 'Upload PO Copy / Attachment')}
                                <input type="file" style={{ display: 'none' }} onChange={handleFileChange} accept=".pdf,image/*" />
                            </label>
                            {formData.customer_po_attachment_url && !selectedFile && (
                                <a
                                    href={formData.customer_po_attachment_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontSize: '0.75rem', color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                                >
                                    <FileText size={14} /> View Current PO Attachment
                                </a>
                            )}
                        </div>
                    </div>

                    {/* Modal Footer with Full CRUD actions */}
                    <div style={{
                        padding: '16px 24px',
                        background: '#f8fafc',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                    }}>
                        {/* Left Side: Delete or Suite Link */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {mode === 'existing' && (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleDeleteJob}
                                        disabled={loading}
                                        className="btn btn-secondary"
                                        style={{ color: '#ef4444', borderColor: '#fecaca', background: '#fef2f2', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                                        title="Delete this Job suite"
                                    >
                                        <Trash2 size={14} /> Delete Job
                                    </button>

                                    {onNavigateToJob && formData.id && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onClose();
                                                onNavigateToJob(formData.id);
                                            }}
                                            className="btn btn-secondary"
                                            style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                                            title="Open full documents editor suite"
                                        >
                                            <ExternalLink size={14} /> Open Full Suite
                                        </button>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Right Side: Cancel & Save */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                className="btn btn-secondary"
                                disabled={loading}
                                style={{ fontSize: '0.82rem' }}
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={loading || uploading}
                                style={{
                                    fontSize: '0.82rem',
                                    fontWeight: 800,
                                    padding: '8px 20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)'
                                }}
                            >
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                {uploading ? 'Uploading...' : (mode === 'new' ? 'Create Job' : 'Save Everyday Update')}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
