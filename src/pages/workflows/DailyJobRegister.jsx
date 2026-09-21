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
    const [datePreset, setDatePreset] = useState('all'); // 'all' | 'today' | 'yesterday' | 'last7days' | 'this_month' | 'custom'
    const [dateFieldType, setDateFieldType] = useState('any'); // 'any' | 'update_date' | 'job_date' | 'next_action'
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const handleClearDateFilter = () => {
        setDatePreset('all');
        setStartDate('');
        setEndDate('');
        setDateFieldType('any');
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
            const matchesSearch = !searchQuery.trim() || 
                j.jobNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
                j.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
                j.vesselLocation.toLowerCase().includes(searchQuery.toLowerCase()) ||
                j.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                j.customerPoNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
                j.lastDailyNote.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (j.issueDate && j.issueDate.includes(searchQuery)) ||
                (j.lastDailyUpdateAt && j.lastDailyUpdateAt.includes(searchQuery)) ||
                (j.nextActionDate && j.nextActionDate.includes(searchQuery));

            if (!matchesSearch) return false;

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
            if (datePreset !== 'all' || startDate || endDate) {
                let rangeStart = null;
                let rangeEnd = null;

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                if (datePreset === 'today') {
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
                } else if (datePreset === 'custom' || startDate || endDate) {
                    if (startDate) {
                        rangeStart = new Date(`${startDate}T00:00:00`);
                    }
                    if (endDate) {
                        rangeEnd = new Date(`${endDate}T23:59:59`);
                    }
                }

                if (rangeStart || rangeEnd) {
                    const candidateDates = [];

                    if (dateFieldType === 'any' || dateFieldType === 'update_date') {
                        if (j.lastDailyUpdateAt) candidateDates.push(new Date(j.lastDailyUpdateAt));
                        if (Array.isArray(j.dailyUpdates)) {
                            j.dailyUpdates.forEach(upd => {
                                if (upd.timestamp) candidateDates.push(new Date(upd.timestamp));
                            });
                        }
                    }
                    if (dateFieldType === 'any' || dateFieldType === 'job_date') {
                        if (j.issueDate) candidateDates.push(new Date(j.issueDate));
                        if (j.customerPoDate) candidateDates.push(new Date(j.customerPoDate));
                    }
                    if (dateFieldType === 'any' || dateFieldType === 'next_action') {
                        if (j.nextActionDate) candidateDates.push(new Date(`${j.nextActionDate}T00:00:00`));
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
    }, [processedJobs, searchQuery, selectedStatusTab, datePreset, dateFieldType, startDate, endDate]);

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

            {/* Status Filter Tabs & Search Bar */}
            <div style={{
                background: '#ffffff',
                borderRadius: '14px',
                border: '1px solid #e2e8f0',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                marginBottom: '16px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
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

                {/* Right Controls: Date Search & Keyword Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end' }}>
                    {/* Date Preset Selector */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: '#f8fafc',
                        padding: '4px 10px',
                        borderRadius: '10px',
                        border: datePreset !== 'all' ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                        boxShadow: datePreset !== 'all' ? '0 2px 8px rgba(16, 185, 129, 0.15)' : 'none'
                    }}>
                        <Calendar size={15} color={datePreset !== 'all' ? '#059669' : '#64748b'} />
                        <select
                            value={datePreset}
                            onChange={(e) => {
                                setDatePreset(e.target.value);
                                if (e.target.value !== 'custom') {
                                    setStartDate('');
                                    setEndDate('');
                                }
                            }}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                color: datePreset !== 'all' ? '#047857' : '#334155',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                            title="Filter jobs by date preset"
                        >
                            <option value="all">📅 All Dates</option>
                            <option value="today">Today's Activity</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="last7days">Last 7 Days</option>
                            <option value="this_month">This Month</option>
                            <option value="custom">Custom Date Range...</option>
                        </select>

                        {datePreset !== 'all' && (
                            <select
                                value={dateFieldType}
                                onChange={(e) => setDateFieldType(e.target.value)}
                                style={{
                                    border: 'none',
                                    borderLeft: '1px solid #cbd5e1',
                                    paddingLeft: '6px',
                                    background: 'transparent',
                                    fontSize: '0.72rem',
                                    color: '#475569',
                                    fontWeight: 600,
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                                title="Choose which date field to match"
                            >
                                <option value="any">Any Date</option>
                                <option value="update_date">Daily Update Date</option>
                                <option value="job_date">Job / PO Date</option>
                                <option value="next_action">Next Action Due</option>
                            </select>
                        )}

                        {datePreset !== 'all' && (
                            <button
                                type="button"
                                onClick={handleClearDateFilter}
                                style={{
                                    border: 'none',
                                    background: 'none',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    padding: '2px',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                                title="Clear Date Filter"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Custom Date Range Pickers (if custom selected) */}
                    {datePreset === 'custom' && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: '#ffffff',
                            padding: '3px 10px',
                            borderRadius: '8px',
                            border: '1.5px solid #10b981'
                        }}>
                            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>From:</span>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                style={{ border: 'none', outline: 'none', fontSize: '0.78rem', color: '#0f172a', fontWeight: 600 }}
                            />
                            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>To:</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                style={{ border: 'none', outline: 'none', fontSize: '0.78rem', color: '#0f172a', fontWeight: 600 }}
                            />
                        </div>
                    )}

                    {/* Text Search Box */}
                    <div style={{ position: 'relative', minWidth: '260px', flex: '1 1 260px', maxWidth: '380px' }}>
                        <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search by Job No, customer, vessel, notes, PO..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: '34px', fontSize: '0.82rem', width: '100%', height: '36px' }}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                style={{
                                    position: 'absolute',
                                    right: '8px',
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
                                            {/* Job No */}
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <span style={{
                                                        fontFamily: 'monospace',
                                                        fontWeight: 800,
                                                        fontSize: '0.88rem',
                                                        color: '#0f172a'
                                                    }}>
                                                        {job.jobNo}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                        {job.issueDate ? new Date(job.issueDate).toLocaleDateString('en-SG') : '—'}
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
