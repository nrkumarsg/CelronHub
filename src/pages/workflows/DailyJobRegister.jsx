import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { 
    Clock, Plus, Search, RefreshCw, Calendar, DollarSign, 
    ExternalLink, Eye, Trash2, Tag, Ship, Building2, 
    FileText, CheckCircle2, AlertCircle, Sparkles, Filter, 
    ChevronDown, ChevronUp, History, Kanban, LayoutDashboard, X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { 
    getWorkflowDocuments, 
    deleteWorkflowDocument, 
    getWorkflowDocumentsByJob 
} from '../../lib/workflowV2Service';
import { openGoogleCalendarWeb, createGoogleCalendarApiEvent } from '../../lib/googleCalendarService';
import { isTokenValid } from '../../lib/googleAuthService';
import ModuleSwitcherHeader from '../../components/common/ModuleSwitcherHeader';
import JobEverydayUpdateForm from '../../components/workflows/JobEverydayUpdateForm';
import toast from 'react-hot-toast';

export default function DailyJobRegister() {
    const { profile, activeCompanyId, activeCompany } = useAuth();
    const effectiveCompanyId = activeCompanyId || profile?.company_id || activeCompany?.id;
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatusTab, setSelectedStatusTab] = useState('All');

    // Date Search & Filter States
    const [dateSearchMode, setDateSearchMode] = useState('single'); // 'single' | 'range'
    const [singleDate, setSingleDate] = useState(''); // 'YYYY-MM-DD'
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [datePreset, setDatePreset] = useState('all'); // 'all' | 'today' | 'yesterday' | 'last7days' | 'this_month' | 'custom'
    const [dateFieldType, setDateFieldType] = useState('any'); // 'any' | 'update_date' | 'job_date' | 'next_action'

    const handleClearDateFilter = () => {
        setDatePreset('all');
        setSingleDate('');
        setStartDate('');
        setEndDate('');
        setDateFieldType('any');
        setDateSearchMode('single');
    };

    // Inline Form State (NO MODAL BACKDROP)
    const [activeFormJob, setActiveFormJob] = useState(null); // null = closed, {} = new, { ...job } = edit
    const formRef = useRef(null);

    const loadJobs = async () => {
        if (!effectiveCompanyId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await getWorkflowDocuments(effectiveCompanyId, null, true, true);
            if (error) throw error;
            setDocuments(data || []);
        } catch (err) {
            console.error('Failed to load daily jobs:', err);
            toast.error('Failed to load jobs list');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadJobs();
    }, [effectiveCompanyId]);

    // Group & format jobs for table list
    const processedJobs = useMemo(() => {
        const jobGroups = {};
        const suiteDocs = documents.filter(d => d.assigned_job_no || d.document_type === 'Job');

        suiteDocs.forEach(doc => {
            const jobNo = doc.assigned_job_no || doc.document_no;
            if (!jobGroups[jobNo]) {
                jobGroups[jobNo] = {
                    id: doc.id,
                    jobNo,
                    masterJob: null,
                    allDocs: [],
                    customer: 'Walk-in',
                    vesselLocation: '—',
                    description: '—',
                    customerPoNo: '—',
                    customerPoDate: null,
                    issueDate: doc.issue_date || doc.created_at,
                    expiryDate: doc.expiry_date,
                    status: 'Job Initiated',
                    totalValue: 0,
                    dailyUpdates: [],
                    lastDailyNote: '',
                    lastDailyUpdateAt: null,
                    lastDailyUpdateBy: '',
                    nextActionDate: null,
                    calendarSynced: false
                };
            }

            const g = jobGroups[jobNo];
            g.allDocs.push(doc);

            if (doc.document_type === 'Job') {
                g.masterJob = doc;
                g.id = doc.id;
                g.customer = doc.partners?.name || doc.delivery_verification?.po_description || 'Walk-in';
                g.vesselLocation = doc.vessels?.vessel_name || doc.work_locations?.location_name || '—';
                g.description = doc.subject || '—';
                g.customerPoNo = doc.customer_po_no || '—';
                g.customerPoDate = doc.customer_po_date;
                g.status = doc.status || 'Job Initiated';
                g.totalValue = parseFloat(doc.total_amount) || parseFloat(doc.delivery_verification?.po_value) || 0;
                
                const dv = doc.delivery_verification || {};
                g.dailyUpdates = Array.isArray(dv.daily_updates) ? dv.daily_updates : [];
                g.lastDailyNote = dv.last_daily_note || (g.dailyUpdates[0]?.notes) || '';
                g.lastDailyUpdateAt = dv.last_daily_update_at || (g.dailyUpdates[0]?.timestamp) || null;
                g.lastDailyUpdateBy = dv.last_daily_update_by || (g.dailyUpdates[0]?.author) || '';
                g.nextActionDate = g.dailyUpdates[0]?.next_action_date || null;
                g.calendarSynced = Boolean(g.dailyUpdates[0]?.calendar_synced);
            } else if (!g.masterJob) {
                if (doc.partners?.name) g.customer = doc.partners.name;
                if (doc.vessels?.vessel_name) g.vesselLocation = doc.vessels.vessel_name;
                if (doc.subject) g.description = doc.subject;
                if (doc.customer_po_no) g.customerPoNo = doc.customer_po_no;
                if (doc.total_amount) g.totalValue = parseFloat(doc.total_amount) || g.totalValue;
            }
        });

        return Object.values(jobGroups).sort((a, b) => {
            const dateA = new Date(a.lastDailyUpdateAt || a.issueDate || 0);
            const dateB = new Date(b.lastDailyUpdateAt || b.issueDate || 0);
            return dateB - dateA;
        });
    }, [documents]);

    // Filter jobs based on search & status tabs + date search
    const filteredJobs = useMemo(() => {
        return processedJobs.filter(j => {
            const query = searchQuery.toLowerCase().trim();
            if (query) {
                const dateMatches = (dStr) => {
                    if (!dStr) return false;
                    const d = new Date(dStr);
                    if (isNaN(d.getTime())) return dStr.toLowerCase().includes(query);
                    const iso = dStr.toLowerCase();
                    const sg = d.toLocaleDateString('en-SG');
                    const us = d.toLocaleDateString('en-US');
                    const full = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toLowerCase();
                    return iso.includes(query) || sg.includes(query) || us.includes(query) || full.includes(query);
                };

                const matchesSearch = 
                    j.jobNo.toLowerCase().includes(query) ||
                    j.customer.toLowerCase().includes(query) ||
                    j.vesselLocation.toLowerCase().includes(query) ||
                    j.description.toLowerCase().includes(query) ||
                    j.customerPoNo.toLowerCase().includes(query) ||
                    j.lastDailyNote.toLowerCase().includes(query) ||
                    dateMatches(j.issueDate) ||
                    dateMatches(j.lastDailyUpdateAt) ||
                    dateMatches(j.customerPoDate) ||
                    dateMatches(j.nextActionDate);

                if (!matchesSearch) return false;
            }

            // Status Tab Filtering
            if (selectedStatusTab === 'Ongoing') {
                if (['Paid & Closed', 'Paid', 'Completed', 'Closed', 'Archived', 'Cancelled'].includes(j.status)) return false;
            } else if (selectedStatusTab === 'In Execution') {
                if (!j.status.includes('Execution') && !j.status.includes('DO')) return false;
            } else if (selectedStatusTab === 'Billed') {
                if (!j.status.includes('Billed') && !j.status.includes('Invoice')) return false;
            } else if (selectedStatusTab === 'Closed') {
                if (!['Paid & Closed', 'Paid', 'Completed', 'Closed', 'Archived'].includes(j.status)) return false;
            } else if (selectedStatusTab === 'On Hold') {
                if (!j.status.includes('Hold') && !j.status.includes('Pending')) return false;
            }

            // Date Range & Preset Filtering
            const isDateFilteringActive = (datePreset !== 'all' && datePreset !== 'custom') || singleDate || startDate || endDate;
            if (isDateFilteringActive) {
                let rangeStart = null;
                let rangeEnd = null;

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                if (singleDate) {
                    rangeStart = new Date(`${singleDate}T00:00:00`);
                    rangeEnd = new Date(`${singleDate}T23:59:59.999`);
                } else if (startDate || endDate) {
                    if (startDate) {
                        rangeStart = new Date(`${startDate}T00:00:00`);
                    }
                    if (endDate) {
                        rangeEnd = new Date(`${endDate}T23:59:59.999`);
                    }
                } else if (datePreset === 'today') {
                    rangeStart = new Date(today);
                    rangeEnd = new Date(today);
                    rangeEnd.setHours(23, 59, 59, 999);
                } else if (datePreset === 'yesterday') {
                    rangeStart = new Date(today);
                    rangeStart.setDate(rangeStart.getDate() - 1);
                    rangeEnd = new Date(rangeStart);
                    rangeEnd.setHours(23, 59, 59, 999);
                } else if (datePreset === 'last7days') {
                    rangeStart = new Date(today);
                    rangeStart.setDate(rangeStart.getDate() - 6);
                    rangeEnd = new Date(today);
                    rangeEnd.setHours(23, 59, 59, 999);
                } else if (datePreset === 'this_month') {
                    rangeStart = new Date(today.getFullYear(), today.getMonth(), 1);
                    rangeEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
                }

                if (rangeStart || rangeEnd) {
                    const candidateDates = [];

                    if (dateFieldType === 'any' || dateFieldType === 'update_date') {
                        if (j.lastDailyUpdateAt) candidateDates.push(new Date(j.lastDailyUpdateAt));
                        if (Array.isArray(j.dailyUpdates)) {
                            j.dailyUpdates.forEach(upd => {
                                if (upd.timestamp) candidateDates.push(new Date(upd.timestamp));
                                if (upd.date) candidateDates.push(new Date(upd.date.length === 10 ? `${upd.date}T00:00:00` : upd.date));
                            });
                        }
                    }
                    if (dateFieldType === 'any' || dateFieldType === 'job_date') {
                        if (j.issueDate) candidateDates.push(new Date(j.issueDate.length === 10 ? `${j.issueDate}T00:00:00` : j.issueDate));
                        if (j.customerPoDate) candidateDates.push(new Date(j.customerPoDate.length === 10 ? `${j.customerPoDate}T00:00:00` : j.customerPoDate));
                    }
                    if (dateFieldType === 'any' || dateFieldType === 'next_action') {
                        if (j.nextActionDate) candidateDates.push(new Date(`${j.nextActionDate}T00:00:00`));
                        if (Array.isArray(j.dailyUpdates)) {
                            j.dailyUpdates.forEach(upd => {
                                if (upd.next_action_date) candidateDates.push(new Date(`${upd.next_action_date}T00:00:00`));
                            });
                        }
                    }

                    const hasMatchingDate = candidateDates.some(d => {
                        if (isNaN(d.getTime())) return false;
                        if (rangeStart && d < rangeStart) return false;
                        if (rangeEnd && d > rangeEnd) return false;
                        return true;
                    });

                    if (!hasMatchingDate) return false;
                }
            }

            return true;
        });
    }, [processedJobs, searchQuery, selectedStatusTab, datePreset, dateFieldType, dateSearchMode, singleDate, startDate, endDate]);

    // Handle opening inline form
    const handleOpenCreateForm = () => {
        setActiveFormJob({});
        setTimeout(() => {
            if (formRef.current) {
                formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 50);
    };

    const handleOpenEditForm = (job) => {
        setActiveFormJob(job.masterJob || job);
        setTimeout(() => {
            if (formRef.current) {
                formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 50);
    };

    const handleCloseForm = () => {
        setActiveFormJob(null);
    };

    const handleSaveForm = async () => {
        setActiveFormJob(null);
        await loadJobs();
    };

    // Quick 1-click Google Calendar sync from table row
    const handleRowCalendarSync = async (e, job) => {
        e.stopPropagation();
        const targetDate = job.nextActionDate || job.expiryDate || new Date(Date.now() + 86400000).toISOString().split('T')[0];
        const title = `[${job.jobNo}] ${job.vesselLocation !== '—' ? `${job.vesselLocation} - ` : ''}${job.customer}`;
        const desc = `Job Reference: ${job.jobNo}\nCustomer: ${job.customer}\nStatus: ${job.status}\n\nLatest Daily Update:\n${job.lastDailyNote || job.description}\n\nOpen in CelronHub: ${window.location.origin}/workflows/editor/job/${job.id}`;

        if (isTokenValid()) {
            try {
                await createGoogleCalendarApiEvent({
                    title,
                    description: desc,
                    location: job.vesselLocation !== '—' ? job.vesselLocation : 'Singapore',
                    startDate: new Date(`${targetDate}T09:00:00`),
                    endDate: new Date(`${targetDate}T10:00:00`)
                });
                toast.success('Synced directly to your Google Calendar!', { icon: '📅' });
                return;
            } catch (err) {
                console.warn('Direct Calendar API sync failed, opening web:', err);
            }
        }

        openGoogleCalendarWeb({
            title,
            description: desc,
            location: job.vesselLocation !== '—' ? job.vesselLocation : 'Singapore',
            startDate: new Date(`${targetDate}T09:00:00`),
            endDate: new Date(`${targetDate}T10:00:00`)
        });
        toast.success('Opened in Google Calendar!');
    };

    // Quick delete from table row
    const handleRowDelete = async (e, job) => {
        e.stopPropagation();
        if (!window.confirm(`Are you sure you want to delete Job ${job.jobNo} and its suite records?`)) return;

        try {
            setLoading(true);
            const { data: jobDocs } = await getWorkflowDocumentsByJob(job.id);
            if (jobDocs && jobDocs.length > 0) {
                const docIds = new Set(jobDocs.map(d => d.id));
                const rootDocs = jobDocs.filter(jd => !jd.original_document_id || !docIds.has(jd.original_document_id));
                await Promise.all(rootDocs.map(jd => deleteWorkflowDocument(jd.id)));
            } else {
                await deleteWorkflowDocument(job.id);
            }
            toast.success(`Job ${job.jobNo} deleted successfully.`);
            await loadJobs();
        } catch (err) {
            console.error('Delete failed:', err);
            toast.error('Failed to delete: ' + (err.message || 'Error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: '24px 32px', maxWidth: '1600px', margin: '0 auto' }}>
            <ModuleSwitcherHeader currentModule="workflows" />

            {/* Top Page Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                marginBottom: '24px'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{
                            background: '#ecfdf5',
                            color: '#059669',
                            border: '1px solid #a7f3d0',
                            padding: '3px 10px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            <Clock size={13} /> EVERYDAY OPERATIONS REGISTER
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {processedJobs.length} Total Registered Jobs
                        </span>
                    </div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Clock size={30} color="#10b981" /> Daily Job Entry & Operations Table
                    </h1>
                    <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.95rem' }}>
                        Table list of all active jobs with live status tells, everyday progress notes, full CRUD, and Google Calendar sync.
                    </p>
                </div>

                {/* Top Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleOpenCreateForm}
                        className="btn btn-primary"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontWeight: 800,
                            padding: '10px 20px',
                            fontSize: '0.9rem',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            border: 'none',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)'
                        }}
                    >
                        <Plus size={18} /> + New Job Entry
                    </button>

                    <button
                        onClick={loadJobs}
                        className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
                        title="Reload Job List"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>

                    <Link
                        to="/workflows/whiteboard"
                        className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#b45309', borderColor: '#fde68a', background: '#fffbeb' }}
                    >
                        <Kanban size={16} /> Jobs Whiteboard
                    </Link>

                    <Link
                        to="/workflows/jobs-dashboard"
                        className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
                    >
                        <LayoutDashboard size={16} /> Full Dashboard
                    </Link>
                </div>
            </div>

            {/* INLINE FORM (SHOWN WHEN USER CLICKS + NEW JOB OR EDIT ON ANY ROW - NO POPUP MODAL) */}
            {activeFormJob && (
                <div ref={formRef} style={{ marginBottom: '24px', animation: 'fadeIn 0.2s ease-out' }}>
                    <JobEverydayUpdateForm
                        job={activeFormJob?.id ? activeFormJob : null}
                        allJobs={processedJobs}
                        isInline={true}
                        onClose={handleCloseForm}
                        onSave={handleSaveForm}
                        onNavigateToJob={(id) => navigate(`/workflows/editor/job/${id}`)}
                    />
                </div>
            )}

            {/* Status Filter Tabs & Dedicated Date Search Toolbar */}
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: '16px 20px 0 20px',
                marginBottom: '18px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                overflow: 'hidden'
            }}>
                {/* Row 1: Status Tabs & Keyword Search */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    {/* Status Tabs */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[
                            { id: 'All', label: 'All Jobs', count: processedJobs.length },
                            { id: 'Ongoing', label: 'Ongoing', count: processedJobs.filter(j => !['Paid & Closed', 'Paid', 'Completed', 'Closed', 'Archived', 'Cancelled'].includes(j.status)).length },
                            { id: 'In Execution', label: 'In Execution', count: processedJobs.filter(j => j.status.includes('Execution') || j.status.includes('DO')).length },
                            { id: 'Billed', label: 'Billed', count: processedJobs.filter(j => j.status.includes('Billed') || j.status.includes('Invoice')).length },
                            { id: 'Closed', label: 'Paid & Closed', count: processedJobs.filter(j => ['Paid & Closed', 'Paid', 'Completed', 'Closed', 'Archived'].includes(j.status)).length },
                            { id: 'On Hold', label: 'On Hold', count: processedJobs.filter(j => j.status.includes('Hold') || j.status.includes('Pending')).length }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setSelectedStatusTab(tab.id)}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '8px',
                                    border: selectedStatusTab === tab.id ? '1.5px solid #10b981' : '1px solid #e2e8f0',
                                    background: selectedStatusTab === tab.id ? '#ecfdf5' : '#f8fafc',
                                    color: selectedStatusTab === tab.id ? '#047857' : '#475569',
                                    fontWeight: selectedStatusTab === tab.id ? 800 : 600,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <span>{tab.label}</span>
                                <span style={{
                                    fontSize: '0.7rem',
                                    padding: '1px 6px',
                                    borderRadius: '10px',
                                    background: selectedStatusTab === tab.id ? '#10b981' : '#e2e8f0',
                                    color: selectedStatusTab === tab.id ? '#ffffff' : '#64748b',
                                    fontWeight: 700
                                }}>
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Text Search Box (Job No, Customer, Vessel, PO, Notes, Date) */}
                    <div style={{ position: 'relative', minWidth: '280px', flex: '1 1 280px', maxWidth: '420px' }}>
                        <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search Job No, customer, vessel, notes, PO, date..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: '34px', fontSize: '0.82rem', width: '100%', height: '38px', borderRadius: '10px' }}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                style={{
                                    position: 'absolute',
                                    right: '10px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    border: 'none',
                                    background: 'none',
                                    color: '#94a3b8',
                                    cursor: 'pointer'
                                }}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Row 2: DEDICATED DATE SEARCH BAR (Prominent, Multi-field, Presets + Pickers) */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    borderTop: '1px solid #f1f5f9',
                    background: '#f8fafc',
                    margin: '0 -20px 0 -20px',
                    padding: '12px 20px',
                    borderBottomLeftRadius: '16px',
                    borderBottomRightRadius: '16px'
                }}>
                    {/* Left: Header Label & Quick Date Preset Pills */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            color: '#1e293b',
                            marginRight: '2px',
                            letterSpacing: '0.02em'
                        }}>
                            <Calendar size={15} color="#059669" /> DATE SEARCH:
                        </span>

                        {[
                            { id: 'all', label: 'All Dates' },
                            { id: 'today', label: '⚡ Today' },
                            { id: 'yesterday', label: 'Yesterday' },
                            { id: 'last7days', label: 'Last 7 Days' },
                            { id: 'this_month', label: 'This Month' }
                        ].map(preset => {
                            const isActive = datePreset === preset.id && !singleDate && !startDate && !endDate;
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => {
                                        setDatePreset(preset.id);
                                        setSingleDate('');
                                        setStartDate('');
                                        setEndDate('');
                                    }}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: '8px',
                                        fontSize: '0.75rem',
                                        fontWeight: isActive ? 800 : 600,
                                        border: isActive ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                                        background: isActive ? '#ecfdf5' : '#ffffff',
                                        color: isActive ? '#047857' : '#475569',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    {preset.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Right: Date Picker Inputs (Single / Range) & Field Target */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Mode Toggle Pill */}
                        <div style={{
                            display: 'flex',
                            background: '#e2e8f0',
                            borderRadius: '8px',
                            padding: '2px',
                            gap: '2px'
                        }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setDateSearchMode('single');
                                    if (startDate) {
                                        setSingleDate(startDate);
                                        setStartDate('');
                                        setEndDate('');
                                    }
                                }}
                                style={{
                                    padding: '3px 8px',
                                    fontSize: '0.72rem',
                                    fontWeight: dateSearchMode === 'single' ? 800 : 500,
                                    border: 'none',
                                    borderRadius: '6px',
                                    background: dateSearchMode === 'single' ? '#ffffff' : 'transparent',
                                    color: dateSearchMode === 'single' ? '#047857' : '#64748b',
                                    cursor: 'pointer',
                                    boxShadow: dateSearchMode === 'single' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                Exact Date
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setDateSearchMode('range');
                                    if (singleDate) {
                                        setStartDate(singleDate);
                                        setEndDate(singleDate);
                                        setSingleDate('');
                                    }
                                }}
                                style={{
                                    padding: '3px 8px',
                                    fontSize: '0.72rem',
                                    fontWeight: dateSearchMode === 'range' ? 800 : 500,
                                    border: 'none',
                                    borderRadius: '6px',
                                    background: dateSearchMode === 'range' ? '#ffffff' : 'transparent',
                                    color: dateSearchMode === 'range' ? '#047857' : '#64748b',
                                    cursor: 'pointer',
                                    boxShadow: dateSearchMode === 'range' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                Date Range
                            </button>
                        </div>

                        {/* Interactive Native Date Picker */}
                        {dateSearchMode === 'single' ? (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#ffffff',
                                padding: '3px 10px',
                                borderRadius: '8px',
                                border: singleDate ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                                boxShadow: singleDate ? '0 2px 6px rgba(16,185,129,0.15)' : 'none'
                            }}>
                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>Pick Date:</span>
                                <input
                                    type="date"
                                    value={singleDate}
                                    onChange={(e) => {
                                        setSingleDate(e.target.value);
                                        setDatePreset('custom');
                                    }}
                                    style={{
                                        border: 'none',
                                        outline: 'none',
                                        fontSize: '0.78rem',
                                        color: '#0f172a',
                                        fontWeight: 600,
                                        background: 'transparent'
                                    }}
                                />
                                {singleDate && (
                                    <button
                                        type="button"
                                        onClick={() => { setSingleDate(''); setDatePreset('all'); }}
                                        style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                                        title="Clear date"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#ffffff',
                                padding: '3px 10px',
                                borderRadius: '8px',
                                border: (startDate || endDate) ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                                boxShadow: (startDate || endDate) ? '0 2px 6px rgba(16,185,129,0.15)' : 'none'
                            }}>
                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>From:</span>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => {
                                        setStartDate(e.target.value);
                                        setDatePreset('custom');
                                    }}
                                    style={{ border: 'none', outline: 'none', fontSize: '0.78rem', color: '#0f172a', fontWeight: 600, background: 'transparent' }}
                                />
                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>To:</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => {
                                        setEndDate(e.target.value);
                                        setDatePreset('custom');
                                    }}
                                    style={{ border: 'none', outline: 'none', fontSize: '0.78rem', color: '#0f172a', fontWeight: 600, background: 'transparent' }}
                                />
                                {(startDate || endDate) && (
                                    <button
                                        type="button"
                                        onClick={() => { setStartDate(''); setEndDate(''); setDatePreset('all'); }}
                                        style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                                        title="Clear date range"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Date Field Selector (Any Date, Daily Update Date, Job Date, Next Due Date) */}
                        <select
                            value={dateFieldType}
                            onChange={(e) => setDateFieldType(e.target.value)}
                            style={{
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                padding: '4px 8px',
                                fontSize: '0.75rem',
                                color: '#334155',
                                fontWeight: 600,
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                            title="Filter jobs by matching specific date field"
                        >
                            <option value="any">Search in: Any Date</option>
                            <option value="update_date">Daily Update Date</option>
                            <option value="job_date">Job / PO Date</option>
                            <option value="next_action">Next Action Due Date</option>
                        </select>

                        {/* Clear / Reset Date Button */}
                        {(datePreset !== 'all' || singleDate || startDate || endDate || dateFieldType !== 'any') && (
                            <button
                                type="button"
                                onClick={handleClearDateFilter}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: '#fee2e2',
                                    border: '1px solid #fecaca',
                                    color: '#b91c1c',
                                    padding: '4px 10px',
                                    borderRadius: '8px',
                                    fontSize: '0.73rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                }}
                                title="Reset all date filters to show all jobs"
                            >
                                <X size={13} /> Reset Date
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* UPDATED TABLE LIST (ALWAYS SHOWN FIRST AS REQUESTED) */}
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
                overflow: 'hidden'
            }}>
                <div style={{ overflowX: 'auto' }}>
                    <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 800, textAlign: 'left' }}>
                                <th style={{ padding: '12px 16px', minWidth: '130px' }}>CEL JOB NO</th>
                                <th style={{ padding: '12px 14px', minWidth: '150px' }}>STATUS TELL</th>
                                <th style={{ padding: '12px 14px', minWidth: '200px' }}>CUSTOMER & VESSEL</th>
                                <th style={{ padding: '12px 14px', minWidth: '160px' }}>PURCHASE ORDER</th>
                                <th style={{ padding: '12px 14px', minWidth: '120px', textAlign: 'right' }}>VALUE (SGD)</th>
                                <th style={{ padding: '12px 14px', minWidth: '240px' }}>LATEST EVERYDAY UPDATE</th>
                                <th style={{ padding: '12px 14px', minWidth: '140px' }}>NEXT ACTION</th>
                                <th style={{ padding: '12px 16px', textAlign: 'right', minWidth: '180px' }}>CRUD ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#10b981' }} />
                                        Loading jobs list...
                                    </td>
                                </tr>
                            ) : filteredJobs.length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', padding: '50px 20px', color: '#94a3b8' }}>
                                        <Clock size={32} style={{ margin: '0 auto 10px auto', display: 'block', opacity: 0.5 }} />
                                        <p style={{ margin: '0 0 8px 0', fontSize: '1rem', fontWeight: 700, color: '#334155' }}>No jobs match this filter</p>
                                        <button onClick={handleOpenCreateForm} className="btn btn-sm btn-primary">
                                            <Plus size={14} /> Create New Job Entry Now
                                        </button>
                                    </td>
                                </tr>
                            ) : (
                                filteredJobs.map((job) => {
                                    // Status styling
                                    let statusColor = '#0284c7';
                                    let statusBg = '#f0f9ff';
                                    let statusBorder = '#bae6fd';
                                    let statusIcon = '🚀';

                                    const s = (job.status || '').toLowerCase();
                                    if (s.includes('execution') || s.includes('do')) {
                                        statusColor = '#059669'; statusBg = '#ecfdf5'; statusBorder = '#a7f3d0'; statusIcon = '🛠️';
                                    } else if (s.includes('billed') || s.includes('invoice')) {
                                        statusColor = '#7c3aed'; statusBg = '#f5f3ff'; statusBorder = '#ddd6fe'; statusIcon = '🧾';
                                    } else if (s.includes('paid') || s.includes('closed') || s.includes('completed')) {
                                        statusColor = '#10b981'; statusBg = '#f0fdf4'; statusBorder = '#bbf7d0'; statusIcon = '💰';
                                    } else if (s.includes('hold') || s.includes('pending')) {
                                        statusColor = '#ea580c'; statusBg = '#fff7ed'; statusBorder = '#fdba74'; statusIcon = '⏸️';
                                    } else if (s.includes('supplier') || s.includes('po placed')) {
                                        statusColor = '#d97706'; statusBg = '#fff7ed'; statusBorder = '#fed7aa'; statusIcon = '📦';
                                    } else if (s.includes('cancel')) {
                                        statusColor = '#ef4444'; statusBg = '#fef2f2'; statusBorder = '#fecaca'; statusIcon = '❌';
                                    }

                                    return (
                                        <tr 
                                            key={job.id || job.jobNo}
                                            style={{
                                                borderBottom: '1px solid #f1f5f9',
                                                transition: 'background 0.15s'
                                            }}
                                            className="hover:bg-slate-50"
                                        >
                                            {/* Job No & Date (Enlarged Date Size) */}
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <span style={{
                                                        fontFamily: 'monospace',
                                                        fontWeight: 900,
                                                        fontSize: '0.96rem',
                                                        color: '#0f172a',
                                                        letterSpacing: '0.02em'
                                                    }}>
                                                        {job.jobNo}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.86rem',
                                                        fontWeight: 800,
                                                        color: '#334155',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '5px'
                                                    }}>
                                                        <Calendar size={13} color="#059669" />
                                                        {job.issueDate ? new Date(job.issueDate).toLocaleDateString('en-SG', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Status Tell Badge */}
                                            <td style={{ padding: '12px 14px' }}>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    fontSize: '0.74rem',
                                                    fontWeight: 800,
                                                    padding: '3px 10px',
                                                    borderRadius: '12px',
                                                    background: statusBg,
                                                    color: statusColor,
                                                    border: `1px solid ${statusBorder}`,
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    <span>{statusIcon}</span>
                                                    <span>{job.status}</span>
                                                </span>
                                            </td>

                                            {/* Customer & Vessel */}
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.84rem' }}>
                                                        {job.customer}
                                                    </span>
                                                    {job.vesselLocation && job.vesselLocation !== '—' && (
                                                        <span style={{ fontSize: '0.74rem', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                                                            <Ship size={11} /> {job.vesselLocation}
                                                        </span>
                                                    )}
                                                    {job.description && job.description !== '—' && (
                                                        <span style={{ fontSize: '0.72rem', color: '#64748b', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.description}>
                                                            {job.description}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* PO Details */}
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <span style={{ fontWeight: 700, color: '#4f46e5', fontSize: '0.8rem' }}>
                                                        {job.customerPoNo !== '—' ? job.customerPoNo : 'No PO Ref'}
                                                    </span>
                                                    {job.customerPoDate && (
                                                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                            {new Date(job.customerPoDate).toLocaleDateString('en-SG')}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Value SGD */}
                                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#0f172a', fontSize: '0.86rem' }}>
                                                SGD {job.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>

                                            {/* Latest Everyday Update Log */}
                                            <td style={{ padding: '12px 14px' }}>
                                                {job.lastDailyNote ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxWidth: '260px' }}>
                                                        <p style={{ margin: 0, fontSize: '0.78rem', color: '#1e293b', lineHeight: '1.3', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }} title={job.lastDailyNote}>
                                                            {job.lastDailyNote}
                                                        </p>
                                                        <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                                                            By: {job.lastDailyUpdateBy || 'Operator'} • {job.lastDailyUpdateAt ? new Date(job.lastDailyUpdateAt).toLocaleDateString('en-SG') : 'Recently'}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                                        No update logged yet
                                                    </span>
                                                )}
                                            </td>

                                            {/* Next Action & Calendar Sync Status */}
                                            <td style={{ padding: '12px 14px' }}>
                                                {job.nextActionDate ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            <Calendar size={12} /> {job.nextActionDate}
                                                        </span>
                                                        {job.calendarSynced ? (
                                                            <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                <CheckCircle2 size={10} /> Calendar Synced
                                                            </span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => handleRowCalendarSync(e, job)}
                                                                style={{
                                                                    background: 'none',
                                                                    border: 'none',
                                                                    padding: 0,
                                                                    color: '#0284c7',
                                                                    fontSize: '0.7rem',
                                                                    cursor: 'pointer',
                                                                    textAlign: 'left',
                                                                    textDecoration: 'underline'
                                                                }}
                                                            >
                                                                + Add to Calendar
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>—</span>
                                                )}
                                            </td>

                                            {/* CRUD ACTIONS */}
                                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                    {/* Update / Edit */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenEditForm(job)}
                                                        className="btn btn-sm btn-secondary"
                                                        style={{
                                                            padding: '4px 10px',
                                                            fontSize: '0.74rem',
                                                            fontWeight: 700,
                                                            color: '#047857',
                                                            background: '#ecfdf5',
                                                            borderColor: '#a7f3d0',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                        title="Edit Job Details & Post Everyday Update"
                                                    >
                                                        <Clock size={12} /> Update / Edit
                                                    </button>

                                                    {/* Calendar 1-Click Sync */}
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleRowCalendarSync(e, job)}
                                                        className="btn btn-sm btn-secondary"
                                                        style={{ padding: '4px 8px', color: '#2563eb' }}
                                                        title="Schedule in Google Calendar"
                                                    >
                                                        <Calendar size={13} />
                                                    </button>

                                                    {/* Open Full Suite */}
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(`/workflows/editor/job/${job.id}`)}
                                                        className="btn btn-sm btn-secondary"
                                                        style={{ padding: '4px 8px' }}
                                                        title="Open in Workflow Editor"
                                                    >
                                                        <Eye size={13} />
                                                    </button>

                                                    {/* Delete */}
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleRowDelete(e, job)}
                                                        className="btn btn-sm btn-secondary"
                                                        style={{ padding: '4px 8px', color: '#ef4444', borderColor: '#fecaca', background: '#fef2f2' }}
                                                        title="Delete Job"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer Totals */}
                {filteredJobs.length > 0 && (
                    <div style={{
                        padding: '12px 20px',
                        background: '#f8fafc',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: '#475569'
                    }}>
                        <span>Showing {filteredJobs.length} of {processedJobs.length} Jobs</span>
                        <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 800 }}>
                            Total Filtered Value: SGD {filteredJobs.reduce((sum, j) => sum + (j.totalValue || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
