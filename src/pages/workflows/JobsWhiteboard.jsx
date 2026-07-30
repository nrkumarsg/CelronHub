import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { fetchWhiteboardJobs, updateJobPipelineStage } from '../../lib/workflowV2Service';
import ModuleSwitcherHeader from '../../components/common/ModuleSwitcherHeader';
import {
    Kanban, Search, RefreshCw, Plus, Clock, AlertTriangle, CheckCircle,
    FileText, ArrowRight, Filter, ChevronRight, Layers, Eye, Smartphone,
    QrCode, Sparkles, Building2, Calendar, DollarSign, ShieldAlert, Archive
} from 'lucide-react';

const STAGES = [
    {
        id: 'New Enquiry',
        title: '📥 New Enquiry / Scan',
        color: '#3b82f6', // blue
        bg: '#eff6ff',
        border: '#93c5fd',
        matchStatuses: ['Enquiry', 'Draft', 'New', 'Landing Note']
    },
    {
        id: 'Costing & Quote Draft',
        title: '📝 Costing & Quote Draft',
        color: '#f59e0b', // amber
        bg: '#fffbeb',
        border: '#fde68a',
        matchStatuses: ['Quotation Draft', 'Draft Quote', 'Costing']
    },
    {
        id: 'Quote Sent',
        title: '📤 Quote Sent',
        color: '#8b5cf6', // purple
        bg: '#f5f3ff',
        border: '#ddd6fe',
        matchStatuses: ['Sent', 'Quotation Sent', 'Awaiting PO']
    },
    {
        id: 'Job Initiated',
        title: '🚀 Job Initiated (PO Recd)',
        color: '#0284c7', // sky
        bg: '#f0f9ff',
        border: '#bae6fd',
        matchStatuses: ['Job', 'Confirmed', 'Ongoing', 'PO Approved']
    },
    {
        id: 'Supplier Orders Placed',
        title: '📦 Supplier Orders Placed',
        color: '#d97706', // orange
        bg: '#fff7ed',
        border: '#fed7aa',
        matchStatuses: ['Supplier PO', 'PO 2 Suppliers', 'Ordered']
    },
    {
        id: 'In Execution',
        title: '🛠️ In Execution & DO',
        color: '#059669', // emerald
        bg: '#ecfdf5',
        border: '#a7f3d0',
        matchStatuses: ['Active', 'Delivery Order', 'Service Report', 'In Progress']
    },
    {
        id: 'Billed / Invoiced',
        title: '🧾 Billed / Invoiced',
        color: '#7c3aed', // violet
        bg: '#f5f3ff',
        border: '#ddd6fe',
        matchStatuses: ['Tax Invoice', 'Proforma Invoice', 'Billed']
    },
    {
        id: 'Paid & Closed',
        title: '💰 Paid & Closed',
        color: '#10b981', // green
        bg: '#f0fdf4',
        border: '#bbf7d0',
        matchStatuses: ['Paid', 'Completed', 'Closed', 'Archived']
    }
];

export default function JobsWhiteboard() {
    const { currentCompany } = useAuth();
    const navigate = useNavigate();

    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCompanyFilter, setSelectedCompanyFilter] = useState('All');
    const [showArchived, setShowArchived] = useState(false);
    const [draggedCardId, setDraggedCardId] = useState(null);
    const [updatingId, setUpdatingId] = useState(null);

    const loadJobs = async () => {
        setLoading(true);
        try {
            const data = await fetchWhiteboardJobs(currentCompany?.id);
            setJobs(data || []);
        } catch (err) {
            console.error('Failed to load whiteboard jobs:', err);
            toast.error('Failed to load whiteboard jobs');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadJobs();

        // Realtime Supabase Channel Subscription for Multi-User Sync
        const channel = supabase
            .channel('whiteboard_realtime_sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'workflow_documents' },
                (payload) => {
                    if (payload.eventType === 'UPDATE') {
                        setJobs((prev) =>
                            prev.map((job) => (job.id === payload.new.id ? { ...job, ...payload.new } : job))
                        );
                    } else if (payload.eventType === 'INSERT') {
                        setJobs((prev) => [payload.new, ...prev]);
                    } else if (payload.eventType === 'DELETE') {
                        setJobs((prev) => prev.filter((j) => j.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentCompany?.id]);

    // Map doc_status / document_type into one of the 8 whiteboard stage IDs
    const mapJobToStage = (job) => {
        const status = (job.doc_status || '').toLowerCase();
        const type = (job.document_type || '').toLowerCase();

        if (status.includes('paid') || status.includes('completed') || status.includes('closed') || status.includes('archived')) {
            return 'Paid & Closed';
        }
        if (type.includes('invoice') || status.includes('invoiced') || status.includes('billed')) {
            return 'Billed / Invoiced';
        }
        if (type.includes('delivery') || type.includes('service') || status.includes('execution') || status.includes('active')) {
            return 'In Execution';
        }
        if (type.includes('purchase order') || type.includes('supplier') || status.includes('supplier')) {
            return 'Supplier Orders Placed';
        }
        if (type === 'job' || status.includes('job') || status.includes('ongoing') || status.includes('confirmed')) {
            return 'Job Initiated';
        }
        if (type.includes('quotation') && (status.includes('sent') || status.includes('awaiting'))) {
            return 'Quote Sent';
        }
        if (type.includes('quotation') && (status.includes('draft') || status.includes('costing'))) {
            return 'Costing & Quote Draft';
        }
        return 'New Enquiry';
    };

    // Calculate SLA Warning Badges
    const getSlaBadge = (job, stageId) => {
        const createdDate = new Date(job.created_at);
        const hoursAgo = (new Date() - createdDate) / (1000 * 60 * 60);

        if (stageId === 'Costing & Quote Draft' && hoursAgo > 48) {
            return { label: '🔴 Overdue Quote (>48h)', color: '#ef4444', bg: '#fef2f2' };
        }
        if (stageId === 'Quote Sent' && hoursAgo > 168) { // >7 days
            return { label: '🟡 Awaiting PO (>7d)', color: '#d97706', bg: '#fffbeb' };
        }
        if (stageId === 'New Enquiry' && hoursAgo > 24) {
            return { label: '🔴 Unprocessed (>24h)', color: '#ef4444', bg: '#fef2f2' };
        }
        return null;
    };

    // Filter jobs based on search & archive rules
    const filteredJobs = jobs.filter((job) => {
        const stageId = mapJobToStage(job);
        const createdDate = new Date(job.created_at || Date.now());
        const daysOld = (new Date() - createdDate) / (1000 * 60 * 60 * 24);

        // Auto-archive filter: if Paid & Closed over 30 days and showArchived is false, hide card
        if (stageId === 'Paid & Closed' && daysOld > 30 && !showArchived) {
            return false;
        }

        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const docNo = (job.document_no || '').toLowerCase();
        const jobNo = (job.job_no || '').toLowerCase();
        const partnerName = (job.partners?.name || '').toLowerCase();
        const title = (job.title || '').toLowerCase();

        return docNo.includes(q) || jobNo.includes(q) || partnerName.includes(q) || title.includes(q);
    });

    const handleStageChange = async (jobId, newStage) => {
        setUpdatingId(jobId);
        const res = await updateJobPipelineStage(jobId, newStage, true, 'Updated via Jobs Whiteboard');
        setUpdatingId(null);
        if (res.success) {
            toast.success(`Job stage updated to "${newStage}"`);
            setJobs((prev) =>
                prev.map((j) => (j.id === jobId ? { ...j, doc_status: newStage } : j))
            );
        } else {
            toast.error(res.error || 'Failed to update stage');
        }
    };

    const handleDragStart = (e, jobId) => {
        setDraggedCardId(jobId);
        e.dataTransfer.setData('text/plain', jobId);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = async (e, targetStageId) => {
        e.preventDefault();
        const jobId = e.dataTransfer.getData('text/plain') || draggedCardId;
        if (jobId) {
            await handleStageChange(jobId, targetStageId);
        }
        setDraggedCardId(null);
    };

    return (
        <div style={{ background: '#f8fafc', minHeight: '100vh', paddingBottom: '40px' }}>
            {/* Top Navigation Switcher Bar */}
            <ModuleSwitcherHeader activeTab="whiteboard" />

            <div style={{ maxWidth: '1800px', margin: '0 auto', padding: '20px 24px' }}>
                {/* Header Title & Mobile Quick Launch */}
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                    marginBottom: '20px',
                    background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                    padding: '20px 24px',
                    borderRadius: '16px',
                    color: '#ffffff',
                    boxShadow: '0 4px 20px rgba(49, 46, 129, 0.25)'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <span style={{
                                background: 'rgba(255, 255, 255, 0.15)',
                                padding: '6px 12px',
                                borderRadius: '20px',
                                fontSize: '11px',
                                fontWeight: '700',
                                color: '#38bdf8',
                                letterSpacing: '0.5px'
                            }}>
                                📌 INTERACTIVE WHITEBOARD STATUS ENGINE
                            </span>
                            <span style={{ background: '#10b981', width: '8px', height: '8px', borderRadius: '50%' }} />
                            <span style={{ fontSize: '12px', color: '#a7f3d0', fontWeight: '600' }}>Supabase Realtime Live</span>
                        </div>
                        <h1 style={{ fontSize: '24px', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>
                            Jobs & Enquiry Status Whiteboard
                        </h1>
                        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#c7d2fe' }}>
                            Realtime status pipeline with manual drag-and-drop & automatic event-driven wizard triggers.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <Link
                            to="/scan-gateway"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: '#38bdf8',
                                color: '#0f172a',
                                padding: '10px 16px',
                                borderRadius: '10px',
                                fontWeight: '700',
                                fontSize: '13px',
                                textDecoration: 'none'
                            }}
                        >
                            <QrCode size={16} /> Start From Scan Gateway
                        </Link>
                        <Link
                            to="/workflows/wizard"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: '#6366f1',
                                color: '#ffffff',
                                padding: '10px 16px',
                                borderRadius: '10px',
                                fontWeight: '700',
                                fontSize: '13px',
                                textDecoration: 'none'
                            }}
                        >
                            <Sparkles size={16} /> Open Job Wizard
                        </Link>
                    </div>
                </div>

                {/* Filter & Control Bar */}
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    background: '#ffffff',
                    padding: '14px 20px',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    marginBottom: '20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input
                                type="text"
                                placeholder="Search by Job No, Enquiry No, Customer or Title..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px 8px 36px',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '13px',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={showArchived}
                                onChange={(e) => setShowArchived(e.target.checked)}
                                style={{ accentColor: '#6366f1' }}
                            />
                            <Archive size={14} /> Show Archived (&gt;30d Closed)
                        </label>

                        <button
                            onClick={loadJobs}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#f1f5f9',
                                color: '#334155',
                                border: '1px solid #cbd5e1',
                                padding: '8px 14px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
                        </button>
                    </div>
                </div>

                {/* Whiteboard Kanban Columns */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
                        <RefreshCw size={32} className="spin" style={{ marginBottom: '12px', color: '#6366f1' }} />
                        <p style={{ fontWeight: '600', margin: 0 }}>Loading Whiteboard Jobs & Enquiries...</p>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        gap: '16px',
                        alignItems: 'start'
                    }}>
                        {STAGES.map((stage) => {
                            const stageJobs = filteredJobs.filter((j) => mapJobToStage(j) === stage.id);

                            return (
                                <div
                                    key={stage.id}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, stage.id)}
                                    style={{
                                        background: '#ffffff',
                                        borderRadius: '14px',
                                        border: `1.5px solid ${stage.border}`,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        maxHeight: '80vh',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                                    }}
                                >
                                    {/* Column Header */}
                                    <div style={{
                                        padding: '14px 16px',
                                        background: stage.bg,
                                        borderTopLeftRadius: '12px',
                                        borderTopRightRadius: '12px',
                                        borderBottom: `1px solid ${stage.border}`,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>
                                            {stage.title}
                                        </span>
                                        <span style={{
                                            background: stage.color,
                                            color: '#ffffff',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            fontSize: '11px',
                                            fontWeight: '700'
                                        }}>
                                            {stageJobs.length}
                                        </span>
                                    </div>

                                    {/* Column Card Stream */}
                                    <div style={{ padding: '12px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {stageJobs.length === 0 ? (
                                            <div style={{
                                                padding: '24px 12px',
                                                textAlign: 'center',
                                                color: '#94a3b8',
                                                fontSize: '12px',
                                                border: '1.5px dashed #e2e8f0',
                                                borderRadius: '10px'
                                            }}>
                                                No jobs in this stage
                                            </div>
                                        ) : (
                                            stageJobs.map((job) => {
                                                const slaBadge = getSlaBadge(job, stage.id);
                                                const displayNo = job.job_no || job.document_no || 'ENQ-Draft';
                                                const partnerName = job.partners?.name || 'Walk-in Customer';

                                                return (
                                                    <div
                                                        key={job.id}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, job.id)}
                                                        style={{
                                                            background: '#ffffff',
                                                            borderRadius: '10px',
                                                            border: '1px solid #cbd5e1',
                                                            padding: '12px 14px',
                                                            cursor: 'grab',
                                                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                                            transition: 'all 0.15s ease',
                                                            position: 'relative'
                                                        }}
                                                    >
                                                        {/* SLA Warning Badge */}
                                                        {slaBadge && (
                                                            <div style={{
                                                                background: slaBadge.bg,
                                                                color: slaBadge.color,
                                                                padding: '4px 8px',
                                                                borderRadius: '6px',
                                                                fontSize: '10px',
                                                                fontWeight: '700',
                                                                marginBottom: '8px',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}>
                                                                <AlertTriangle size={12} /> {slaBadge.label}
                                                            </div>
                                                        )}

                                                        {/* Card Header: Job No */}
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                            <span style={{
                                                                fontSize: '13px',
                                                                fontWeight: '800',
                                                                color: '#0f172a'
                                                            }}>
                                                                {displayNo}
                                                            </span>
                                                            <span style={{
                                                                fontSize: '10px',
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                background: '#f1f5f9',
                                                                color: '#64748b',
                                                                fontWeight: '600'
                                                            }}>
                                                                {job.document_type || 'Job'}
                                                            </span>
                                                        </div>

                                                        {/* Partner / Title */}
                                                        <p style={{ margin: '0 0 6px 0', fontSize: '12px', fontWeight: '600', color: '#334155' }}>
                                                            🏢 {partnerName}
                                                        </p>
                                                        {job.title && (
                                                            <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#64748b', lineHeight: '1.3' }}>
                                                                {job.title}
                                                            </p>
                                                        )}

                                                        {/* Quick Stage Move Bar */}
                                                        <div style={{
                                                            marginTop: '10px',
                                                            paddingTop: '8px',
                                                            borderTop: '1px solid #f1f5f9',
                                                            display: 'flex',
                                                            justify: 'space-between',
                                                            alignItems: 'center'
                                                        }}>
                                                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                                                                {new Date(job.created_at).toLocaleDateString()}
                                                            </span>

                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <button
                                                                    onClick={() => navigate(`/workflows/wizard?docId=${job.id}`)}
                                                                    title="Open in Wizard"
                                                                    style={{
                                                                        background: '#eff6ff',
                                                                        color: '#2563eb',
                                                                        border: 'none',
                                                                        padding: '4px 8px',
                                                                        borderRadius: '6px',
                                                                        fontSize: '11px',
                                                                        fontWeight: '700',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    Open Wizard ➔
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
