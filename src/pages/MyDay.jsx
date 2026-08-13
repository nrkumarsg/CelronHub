import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Sun, Moon, TrendingUp, AlertCircle, Clock, CheckCircle2, Package,
    Plus, Upload, Camera, Mail, Clipboard, FileText, CreditCard,
    Truck, DollarSign, BookOpen, Loader2, X, ChevronRight, ChevronDown,
    RotateCcw, Archive, RefreshCw, Search, Zap, Bell, Calendar,
    ArrowRight, ExternalLink, MoreVertical, Sparkles, Building2,
    MessageSquare, Award, Ruler, Image, QrCode, Folder, Filter
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getWorkflowDocuments } from '../lib/workflowV2Service';
import { getDocumentSettings } from '../lib/store';
import { runDocumentPipeline } from '../lib/ai/documentPipeline';
import { getStoredToken, isTokenValid, connectGoogleAPI, performOCR } from '../lib/googleAuthService';
import { uploadFileToDrive, getOrCreateFolder, listFolderContent } from '../lib/driveService';
import FolderTargetSelector from '../components/myday/FolderTargetSelector';
import SmartUploadPanel from '../components/upload/SmartUploadPanel';
import toast from 'react-hot-toast';

// ─── Stage Configuration ────────────────────────────────────────────────────
const STAGES = [
    { key: 'ENQ', label: 'Enquiry',   color: '#3b82f6', bg: '#eff6ff', docType: null },
    { key: 'QTN', label: 'Quoted',    color: '#f59e0b', bg: '#fffbeb', docType: 'Quotation' },
    { key: 'PO',  label: 'Ordered',   color: '#f97316', bg: '#fff7ed', docType: 'Job' },
    { key: 'SRC', label: 'Sourced',   color: '#8b5cf6', bg: '#f5f3ff', docType: 'Purchase Order' },
    { key: 'DEL', label: 'Delivered', color: '#06b6d4', bg: '#ecfeff', docType: 'Delivery Order' },
    { key: 'INV', label: 'Invoiced',  color: '#10b981', bg: '#ecfdf5', docType: 'Tax Invoice' },
    { key: 'PAID', label: 'Paid',     color: '#22c55e', bg: '#f0fdf4', docType: 'Payment Received' },
];

// Capture types config
const CAPTURE_TYPES = [
    { id: 'enquiry',     label: 'Enquiry',    icon: MessageSquare, color: '#3b82f6', driveFolder: 'auto', shortcut: 'E' },
    { id: 'bizcard',     label: 'Biz Card',   icon: CreditCard,   color: '#8b5cf6', driveFolder: 'CelronBuzcards', shortcut: 'C' },
    { id: 'invoice',     label: 'Invoice',    icon: FileText,     color: '#f59e0b', driveFolder: 'Celron_Invoices', shortcut: 'I' },
    { id: 'delivery',    label: 'Delivery',   icon: Truck,        color: '#06b6d4', driveFolder: 'Celron_Deliveries', shortcut: 'D' },
    { id: 'payment',     label: 'Payment',    icon: DollarSign,   color: '#22c55e', driveFolder: 'auto', shortcut: 'P' },
    { id: 'manual',      label: 'Manual/Cert', icon: BookOpen,    color: '#6366f1', driveFolder: 'manual', shortcut: 'M' },
    { id: 'expense',     label: 'Expense',    icon: CreditCard,   color: '#ef4444', driveFolder: 'Celron_Expenses', shortcut: 'X' },
    { id: 'note',        label: 'Note',       icon: Clipboard,    color: '#94a3b8', driveFolder: null, shortcut: 'N' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────
const getToday = () => new Date().toISOString().split('T')[0];
const formatDate = (d) => new Date(d).toLocaleDateString('en-SG', { day: '2-digit', month: 'short' });
const getDayAge = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return '1d ago';
    return `${days}d ago`;
};
const fileToBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.readAsDataURL(file);
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
});

// Helper to determine if a job/invoice is fully Paid
const isJobPaid = (job) => {
    if (!job) return false;
    // 1. Check for explicit Payment Received document
    if (job.allDocs?.some(d => d.document_type === 'Payment Received')) return true;
    // 2. Check if any document (Tax Invoice, Job, etc.) has status 'Paid' or payment_status 'Paid'
    if (job.allDocs?.some(d => (d.status && String(d.status).toLowerCase() === 'paid') || (d.payment_status && String(d.payment_status).toLowerCase() === 'paid'))) return true;
    // 3. Check if master job or overall group status is Paid, Completed, Closed, or Archived
    const groupStatus = String(job.status || job.masterJob?.status || '').toLowerCase();
    if (['paid', 'completed', 'closed', 'archived'].includes(groupStatus)) return true;
    return false;
};

// ─── Sub-Components ─────────────────────────────────────────────────────────

// Stage segment in the activity bar
function StageSegment({ stage, status, doc, onClick }) {
    const { key, label, color, bg } = stage;
    const isDone = status === 'done';
    const isActive = status === 'active';
    const isIdle = status === 'idle';

    return (
        <button
            onClick={() => onClick(doc)}
            title={`${label}${isDone ? ' — Completed' : key === 'PAID' ? ' — Click to mark as PAID' : doc ? ' — Click to open' : ' — Not reached'}`}
            style={{
                flex: 1, minWidth: 0, padding: '6px 4px', borderRadius: 6, border: 'none',
                background: isDone ? color : isActive ? bg : '#f1f5f9',
                cursor: (doc || key === 'PAID') ? 'pointer' : 'default',
                transition: 'all 0.2s',
                position: 'relative',
                outline: isActive ? `2px solid ${color}` : 'none',
            }}
        >
            <div style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                color: isDone ? '#fff' : isActive ? color : '#94a3b8',
                lineHeight: 1.2,
            }}>
                {key}
            </div>
            {isActive && (
                <div style={{
                    position: 'absolute', top: 2, right: 2, width: 5, height: 5,
                    borderRadius: '50%', background: color,
                    animation: 'pulse-dot 1.5s ease-in-out infinite',
                }} />
            )}
        </button>
    );
}

// Single job row with 7-stage bar
function ActivityRow({ job, onNavigate }) {
    const [expanded, setExpanded] = useState(false);

    const getStageStatus = (stage) => {
        if (stage.key === 'ENQ') return job.allDocs.length > 0 ? 'done' : 'idle';
        if (stage.key === 'PAID') return isJobPaid(job) ? 'done' : 'idle';

        const matchedDoc = job.allDocs.find(d => d.document_type === stage.docType);
        if (!matchedDoc) {
            const stageIdx = STAGES.findIndex(s => s.key === stage.key);
            const prevDone = stageIdx > 0 && getStageStatus(STAGES[stageIdx - 1]) === 'done';
            if (isJobPaid(job)) return 'done';
            const laterTypes = STAGES.slice(stageIdx + 1).map(s => s.docType).filter(Boolean);
            const hasLater = laterTypes.some(t => job.allDocs.find(d => d.document_type === t));
            if (hasLater) return 'done';
            return prevDone ? 'active' : 'idle';
        }
        const stageIdx = STAGES.findIndex(s => s.key === stage.key);
        if (isJobPaid(job)) return 'done';
        const laterTypes = STAGES.slice(stageIdx + 1).map(s => s.docType).filter(Boolean);
        const hasLater = laterTypes.some(t => job.allDocs.find(d => d.document_type === t));
        return hasLater ? 'done' : 'active';
    };

    const currentStageIdx = (() => {
        for (let i = STAGES.length - 1; i >= 0; i--) {
            if (getStageStatus(STAGES[i]) !== 'idle') return i;
        }
        return 0;
    })();

    const currentStage = STAGES[currentStageIdx];
    const dayAge = getDayAge(job.issueDate || job.created_at);
    const isUrgent = job.followUpDays >= 3;
    const isWarning = job.followUpDays >= 1 && job.followUpDays < 3;

    const handleStageClick = async (doc, stageKey) => {
        if (stageKey === 'PAID' && !isJobPaid(job)) {
            if (window.confirm(`Mark job ${job.jobNo} (${job.customer}) as PAID?`)) {
                try {
                    await supabase.from('workflow_documents').insert({
                        company_id: job.allDocs[0]?.company_id,
                        document_type: 'Payment Received',
                        assigned_job_no: job.jobNo,
                        total_amount: job.customerInvoiceAmount || 0,
                        issue_date: getToday(),
                        status: 'Paid',
                        subject: `Payment Received for ${job.jobNo}`,
                    });
                    await supabase
                        .from('workflow_documents')
                        .update({ status: 'Paid' })
                        .eq('assigned_job_no', job.jobNo)
                        .eq('document_type', 'Tax Invoice');

                    toast.success(`✅ Job ${job.jobNo} marked as PAID`);
                    window.location.reload();
                } catch (e) {
                    console.error(e);
                    toast.error('Failed to mark as paid');
                }
            }
            return;
        }
        if (!doc) return;
        onNavigate(`/workflows/editor/job/${doc.id}`);
    };

    return (
        <div style={{
            background: '#fff', borderRadius: 10, border: '1px solid #f1f5f9',
            marginBottom: 8, overflow: 'hidden',
            boxShadow: isUrgent ? '0 0 0 1.5px #ef444440' : '0 1px 3px rgba(0,0,0,0.05)',
            transition: 'all 0.2s',
        }}>
            <div style={{ padding: '10px 14px' }}>
                {/* Row Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    {/* Job No */}
                    <div style={{ minWidth: 90 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', fontFamily: 'monospace' }}>
                            {job.jobNo}
                        </span>
                    </div>
                    {/* Customer */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                            {job.customer}
                        </span>
                        {job.description && job.description !== '-' && (
                            <span style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                {job.description}
                            </span>
                        )}
                    </div>
                    {/* Age / Status Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                            background: isUrgent ? '#fef2f2' : isWarning ? '#fffbeb' : '#f0fdf4',
                            color: isUrgent ? '#ef4444' : isWarning ? '#f59e0b' : '#10b981',
                        }}>
                            {dayAge}
                        </span>
                        <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 20,
                            background: currentStage.bg, color: currentStage.color, fontWeight: 600,
                        }}>
                            {currentStage.label}
                        </span>
                        <button onClick={() => onNavigate(`/workflows/editor/job/${job.masterJob?.id || job.allDocs[0]?.id}`)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2, display: 'flex' }}>
                            <ExternalLink size={13} />
                        </button>
                        <button onClick={() => setExpanded(!expanded)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2, display: 'flex' }}>
                            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </button>
                    </div>
                </div>

                {/* 7-Stage Activity Bar */}
                <div style={{ display: 'flex', gap: 3 }}>
                    {STAGES.map(stage => {
                        const doc = job.allDocs.find(d => d.document_type === stage.docType);
                        return (
                            <StageSegment
                                key={stage.key}
                                stage={stage}
                                status={getStageStatus(stage)}
                                doc={doc || (stage.key === 'ENQ' ? job.allDocs[0] : null)}
                                onClick={(doc) => handleStageClick(doc, stage.key)}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Expanded Details */}
            {expanded && (
                <div style={{ borderTop: '1px solid #f8fafc', padding: '10px 14px', background: '#fafafa' }}>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {job.customerInvoiceAmount > 0 && (
                            <div><span style={{ fontSize: 11, color: '#94a3b8' }}>Invoice:</span> <span style={{ fontSize: 13, fontWeight: 600, color: '#10b981' }}>SGD {job.customerInvoiceAmount.toFixed(2)}</span></div>
                        )}
                        {job.vesselLocation && job.vesselLocation !== '-' && (
                            <div><span style={{ fontSize: 11, color: '#94a3b8' }}>Vessel/Location:</span> <span style={{ fontSize: 13, color: '#374151' }}>{job.vesselLocation}</span></div>
                        )}
                        {job.customerPoNo && job.customerPoNo !== '-' && (
                            <div><span style={{ fontSize: 11, color: '#94a3b8' }}>Cust. PO:</span> <span style={{ fontSize: 13, color: '#374151' }}>{job.customerPoNo}</span></div>
                        )}
                        {job.allDocs.length > 0 && (
                            <div style={{ width: '100%' }}>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>Documents ({job.allDocs.length}):</span>
                                <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {job.allDocs.map(doc => (
                                        <button key={doc.id} onClick={() => onNavigate(`/workflows/editor/job/${doc.id}`)}
                                            style={{ padding: '3px 10px', borderRadius: 20, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <FileText size={10} /> {doc.document_no || doc.document_type}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// AI Confirm Card (shown after upload parsing)
function AiConfirmCard({ result, captureType, onConfirm, onEdit, onRetry, onDismiss }) {
    const [editMode, setEditMode] = useState(false);
    const [editData, setEditData] = useState(result?.extracted_data || {});
    const [linkEnquiry, setLinkEnquiry] = useState('');

    const confidence = result?.confidence_metrics?.confidence_score || 0;
    const confidencePct = Math.round(confidence * 100);
    const action = result?.confidence_metrics?.pipeline_action;

    const typeLabels = {
        bizcard: '📇 Business Card Detected',
        invoice: '🧾 Supplier Invoice Detected',
        delivery: '🚚 Delivery Order Detected',
        enquiry: '📋 Enquiry Document Detected',
        manual: '📖 Manual / Document Detected',
        expense: '💰 Expense Detected',
        payment: '💳 Payment Record Detected',
    };

    return (
        <div style={{ background: '#fff', border: '1.5px solid #6366f1', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 24px rgba(99,102,241,0.15)' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(90deg, #6366f115, #8b5cf615)', borderBottom: '1px solid #e0e7ff', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={15} color="#6366f1" />
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#6366f1' }}>{typeLabels[captureType] || '📄 Document Detected'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Confidence bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 60, height: 5, background: '#e2e8f0', borderRadius: 99 }}>
                            <div style={{ width: `${confidencePct}%`, height: '100%', borderRadius: 99, background: confidencePct >= 80 ? '#10b981' : confidencePct >= 60 ? '#f59e0b' : '#ef4444', transition: 'width 0.4s' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{confidencePct}%</span>
                    </div>
                    <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={14} /></button>
                </div>
            </div>

            {/* Extracted Data */}
            <div style={{ padding: '12px 14px' }}>
                {!editMode ? (
                    <div style={{ display: 'grid', gap: 5 }}>
                        {Object.entries(editData).slice(0, 6).map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, minWidth: 90, textTransform: 'capitalize', paddingTop: 1 }}>{k.replace(/_/g, ' ')}</span>
                                <span style={{ fontSize: 12, color: '#374151', flex: 1 }}>{typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 80)}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                        {Object.entries(editData).map(([k, v]) => typeof v !== 'object' && (
                            <div key={k}>
                                <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'capitalize', display: 'block', marginBottom: 2 }}>{k.replace(/_/g, ' ')}</label>
                                <input value={String(v)} onChange={e => setEditData(prev => ({ ...prev, [k]: e.target.value }))}
                                    style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                        ))}
                    </div>
                )}

                {/* Link to Job/Enquiry */}
                <div style={{ marginTop: 10 }}>
                    <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }}>Link to Job/Enquiry (optional)</label>
                    <input value={linkEnquiry} onChange={e => setLinkEnquiry(e.target.value)}
                        placeholder="e.g. CEL-2608-0012" style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
            </div>

            {/* Actions */}
            <div style={{ borderTop: '1px solid #f1f5f9', padding: '10px 14px', display: 'flex', gap: 8 }}>
                <button onClick={() => onConfirm({ ...editData }, linkEnquiry)}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, background: '#6366f1', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <CheckCircle2 size={14} /> Save & File
                </button>
                <button onClick={() => setEditMode(!editMode)}
                    style={{ padding: '8px 14px', borderRadius: 8, background: '#f1f5f9', border: 'none', color: '#475569', fontSize: 13, cursor: 'pointer' }}>
                    ✏️ Edit
                </button>
                <button onClick={onRetry}
                    style={{ padding: '8px 14px', borderRadius: 8, background: '#f1f5f9', border: 'none', color: '#475569', fontSize: 13, cursor: 'pointer' }}>
                    <RotateCcw size={13} />
                </button>
            </div>
        </div>
    );
}

// ─── Payment Entry Form ─────────────────────────────────────────────────────
function PaymentEntryForm({ jobs, onSave, onCancel, captureFile, onFileChange, fileInputRef }) {
    const today = new Date().toISOString().split('T')[0];
    const [direction, setDirection] = useState('in'); // 'in' = received, 'out' = spent
    const [amount, setAmount]       = useState('');
    const [date, setDate]           = useState(today);
    const [reference, setReference] = useState('');
    const [jobNo, setJobNo]         = useState('');
    const [supplier, setSupplier]   = useState('');
    const [method, setMethod]       = useState('paynow'); // 'paynow' | 'bank' | 'cash' | 'cheque'
    const [notes, setNotes]         = useState('');
    const [saving, setSaving]       = useState(false);
    const [jobSearch, setJobSearch] = useState('');
    const [showJobDrop, setShowJobDrop] = useState(false);

    const isIn = direction === 'in';
    const accentColor = isIn ? '#22c55e' : '#f97316';
    const accentBg    = isIn ? '#f0fdf4' : '#fff7ed';

    const filteredJobs = jobs.filter(j =>
        jobSearch.trim() === '' ||
        j.jobNo.toLowerCase().includes(jobSearch.toLowerCase()) ||
        j.customer.toLowerCase().includes(jobSearch.toLowerCase())
    ).slice(0, 6);

    const handleSubmit = async () => {
        if (!amount) return;
        setSaving(true);
        await onSave({ direction, amount, date, reference, jobNo, supplier, method, notes });
        setSaving(false);
    };

    const labelStyle = { fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' };
    const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff' };
    const inputFocus = (e) => { e.target.style.borderColor = accentColor; };
    const inputBlur  = (e) => { e.target.style.borderColor = '#e2e8f0'; };

    return (
        <div>
            {/* Direction Toggle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
                {[
                    { val: 'in',  label: '💰 Money IN',  sub: 'Customer paid you',   color: '#22c55e', bg: '#f0fdf4' },
                    { val: 'out', label: '💸 Money OUT', sub: 'You paid supplier',    color: '#f97316', bg: '#fff7ed' },
                ].map(opt => (
                    <button key={opt.val} onClick={() => setDirection(opt.val)}
                        style={{ padding: '10px 8px', borderRadius: 10, border: `2px solid ${direction === opt.val ? opt.color : '#e2e8f0'}`, background: direction === opt.val ? opt.bg : '#f8fafc', cursor: 'pointer', textAlign: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: direction === opt.val ? opt.color : '#64748b' }}>{opt.label}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{opt.sub}</div>
                    </button>
                ))}
            </div>

            {/* Amount + Date row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                    <label style={labelStyle}>Amount (SGD) *</label>
                    <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                        placeholder="0.00" type="number" min="0" step="0.01" autoFocus
                        onFocus={inputFocus} onBlur={inputBlur}
                        style={{ ...inputStyle, fontWeight: 700, fontSize: 15, color: accentColor, borderColor: amount ? accentColor : '#e2e8f0' }} />
                </div>
                <div>
                    <label style={labelStyle}>Date</label>
                    <input value={date} onChange={e => setDate(e.target.value)} type="date"
                        onFocus={inputFocus} onBlur={inputBlur} style={inputStyle} />
                </div>
            </div>

            {/* Payment Method */}
            <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Payment Method</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                        { val: 'paynow', label: '📲 PayNow' },
                        { val: 'bank',   label: '🏦 Bank Transfer' },
                        { val: 'cash',   label: '💵 Cash' },
                        { val: 'cheque', label: '📋 Cheque' },
                    ].map(m => (
                        <button key={m.val} onClick={() => setMethod(m.val)}
                            style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${method === m.val ? accentColor : '#e2e8f0'}`, background: method === m.val ? accentBg : '#f8fafc', fontSize: 12, fontWeight: method === m.val ? 700 : 400, color: method === m.val ? accentColor : '#64748b', cursor: 'pointer' }}>
                            {m.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Reference / PayNow ID */}
            <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>{method === 'paynow' ? 'PayNow Ref / UEN' : 'Reference / Cheque No'}</label>
                <input value={reference} onChange={e => setReference(e.target.value)}
                    placeholder={method === 'paynow' ? 'e.g. 202611223344' : 'e.g. CHQ-001'}
                    onFocus={inputFocus} onBlur={inputBlur} style={inputStyle} />
            </div>

            {/* Link to Job */}
            <div style={{ marginBottom: 10, position: 'relative' }}>
                <label style={labelStyle}>{isIn ? 'Link to Invoice / Job No *' : 'Link to Purchase Order / Job No'}</label>
                <input value={jobNo || jobSearch} onChange={e => { setJobNo(''); setJobSearch(e.target.value); setShowJobDrop(true); }}
                    placeholder="e.g. CEL-2608-001 or search customer..."
                    onFocus={e => { inputFocus(e); setShowJobDrop(true); }}
                    onBlur={e => { inputBlur(e); setTimeout(() => setShowJobDrop(false), 150); }}
                    style={inputStyle} />
                {showJobDrop && filteredJobs.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 99, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: 160, overflowY: 'auto' }}>
                        {filteredJobs.map(j => (
                            <button key={j.jobNo} onClick={() => { setJobNo(j.jobNo); setJobSearch(j.jobNo); setShowJobDrop(false); }}
                                style={{ width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f8fafc' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: accentColor, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{j.jobNo}</span>
                                <span style={{ fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.customer}</span>
                                {j.customerInvoiceAmount > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#10b981', fontWeight: 600, whiteSpace: 'nowrap' }}>SGD {j.customerInvoiceAmount.toFixed(0)}</span>}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Supplier name (for OUT only) */}
            {!isIn && (
                <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>Supplier Name</label>
                    <input value={supplier} onChange={e => setSupplier(e.target.value)}
                        placeholder="e.g. ABC Marine Pte Ltd"
                        onFocus={inputFocus} onBlur={inputBlur} style={inputStyle} />
                </div>
            )}

            {/* Notes */}
            <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Notes (optional)</label>
                <input value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Part payment, balance pending..."
                    onFocus={inputFocus} onBlur={inputBlur} style={inputStyle} />
            </div>

            {/* Attach PayNow Screenshot */}
            <div style={{ marginBottom: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px dashed #cbd5e1' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>📎 Attach screenshot (optional)</span>
                    <button onClick={() => fileInputRef.current?.click()}
                        style={{ padding: '4px 12px', borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 12, color: '#475569' }}>
                        Browse
                    </button>
                </div>
                {captureFile && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#10b981', fontWeight: 600 }}>✓ {captureFile.name}</div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={onFileChange} style={{ display: 'none' }} />
            </div>

            {/* Submit */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <button onClick={handleSubmit} disabled={saving || !amount}
                    style={{ padding: '10px', borderRadius: 9, background: accentColor, border: 'none', color: '#fff', fontWeight: 800, fontSize: 13, cursor: amount ? 'pointer' : 'not-allowed', opacity: amount ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                    {isIn ? 'Record Payment Received' : 'Record Payment Sent'}
                </button>
                <button onClick={onCancel}
                    style={{ padding: '10px', borderRadius: 9, background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}

// ─── Main MyDay Component ───────────────────────────────────────────────────
export default function MyDay() {
    const navigate = useNavigate();
    const { profile } = useAuth();

    // Data state
    const [jobs, setJobs]           = useState([]);
    const [archivedJobs, setArchivedJobs] = useState([]);
    const [settings, setSettings]   = useState(null);
    const [loading, setLoading]     = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Pipeline state
    const [pipelineTab, setPipelineTab]       = useState('active'); // 'active' | 'archive'
    const [pipelineSearch, setPipelineSearch] = useState('');
    const [stageFilter, setStageFilter]       = useState('ALL'); // 'ALL' | 'ENQ' | 'QTN' | 'PO' | 'SRC' | 'DEL' | 'INV' | 'PAID'

    // Upload Hub Modal state
    const [isUploadHubOpen, setIsUploadHubOpen]   = useState(false);
    const [uploadHubTab, setUploadHubTab]         = useState('recent');
    const [uploadHubDocType, setUploadHubDocType] = useState('manual');

    // Upload/Capture state
    const [captureMode, setCaptureMode]       = useState(null); // which type is active
    const [captureFile, setCaptureFile]       = useState(null);
    const [captureText, setCaptureText]       = useState('');
    const [capturing, setCapturing]           = useState(false);
    const [confirmResult, setConfirmResult]   = useState(null);
    const [confirmType, setConfirmType]       = useState(null);
    const [showFolderPicker, setShowFolderPicker] = useState(false);
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [recentCaptures, setRecentCaptures] = useState([]);

    // Follow-up state
    const [followUps, setFollowUps] = useState([]);

    // Stats
    const [todayStats, setTodayStats] = useState({ revenue: 0, profit: 0, orders: 0, quotes: 0, overdue: 0 });

    const fileInputRef = useRef(null);
    const textAreaRef  = useRef(null);

    // ─── Data Loading ──────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        if (!profile?.company_id) return;
        try {
            setLoading(true);
            const [docSettings, { data: docs }] = await Promise.all([
                getDocumentSettings(profile.company_id),
                getWorkflowDocuments(profile.company_id, null, true),
            ]);
            setSettings(docSettings);

            // Group documents by assigned_job_no
            const grouped = {};
            (docs || []).filter(d => d.assigned_job_no).forEach(doc => {
                const key = doc.assigned_job_no;
                if (!grouped[key]) {
                    grouped[key] = {
                        jobNo: key, allDocs: [],
                        masterJob: null, customer: 'Walk-in',
                        vesselLocation: '-', description: '-',
                        customerPoNo: '-', issueDate: doc.created_at,
                        customerInvoiceAmount: 0, followUpDays: 0,
                        status: 'Active',
                    };
                }
                grouped[key].allDocs.push(doc);
                if (doc.document_type === 'Job') {
                    grouped[key].masterJob = doc;
                    grouped[key].customer = doc.partners?.name || 'Walk-in';
                    grouped[key].vesselLocation = doc.vessels?.vessel_name || doc.work_locations?.location_name || '-';
                    grouped[key].description = doc.subject || '-';
                    grouped[key].customerPoNo = doc.customer_po_no || '-';
                    grouped[key].issueDate = doc.issue_date || doc.created_at;
                    grouped[key].status = doc.status || 'Active';
                }
                if (doc.document_type === 'Tax Invoice') {
                    grouped[key].customerInvoiceAmount += parseFloat(doc.total_amount) || 0;
                }
            });

            // Calculate follow-up days for each group
            Object.values(grouped).forEach(g => {
                const quoteDocs = g.allDocs.filter(d => d.document_type === 'Quotation');
                const hasOrder = g.allDocs.some(d => d.document_type === 'Job' && d.status !== 'Draft');
                if (quoteDocs.length > 0 && !hasOrder) {
                    const latestQuote = quoteDocs.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b);
                    g.followUpDays = Math.floor((Date.now() - new Date(latestQuote.created_at)) / 86400000);
                }
            });

            const allJobs = Object.values(grouped).sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate));

            // Separate active vs archived (Paid/Completed/Closed jobs go to Archived tab)
            const active = allJobs.filter(j => !isJobPaid(j) && j.status !== 'Completed' && j.status !== 'Cancelled');
            const archived = allJobs.filter(j => isJobPaid(j) || j.status === 'Completed' || j.status === 'Cancelled');

            setJobs(active);
            setArchivedJobs(archived);

            // Follow-up queue: quotes with no order, older than 0 days
            const followUpList = active
                .filter(j => j.followUpDays >= 0 && j.allDocs.some(d => d.document_type === 'Quotation') && !j.allDocs.some(d => d.document_type === 'Job' && d.status !== 'Draft'))
                .sort((a, b) => b.followUpDays - a.followUpDays)
                .slice(0, 8);
            setFollowUps(followUpList);

            // Stats (from today's activity)
            const today = getToday();
            const todayDocs = (docs || []).filter(d => (d.created_at || '').startsWith(today));
            setTodayStats({
                orders: todayDocs.filter(d => d.document_type === 'Job').length,
                quotes: todayDocs.filter(d => d.document_type === 'Quotation').length,
                revenue: todayDocs.filter(d => d.document_type === 'Tax Invoice').reduce((s, d) => s + (parseFloat(d.total_amount) || 0), 0),
                profit: todayDocs.filter(d => d.document_type === 'Tax Invoice').reduce((s, d) => s + (parseFloat(d.total_amount) || 0) * 0.3, 0),
                overdue: active.filter(j => j.followUpDays >= 2).length,
            });

        } catch (err) {
            console.error('MyDay load error:', err);
            toast.error('Failed to load activity data');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [profile?.company_id]);

    useEffect(() => { loadData(); }, [loadData]);

    // ─── Smart Upload Hub Selection Callback ────────────────────────────────
    const handleHubFileSelected = async (file, suggestions) => {
        setIsUploadHubOpen(false);
        if (!file) return;
        setCapturing(true);
        const toastId = toast.loading(`Processing "${file.name}"...`);
        try {
            const token = getStoredToken();
            const targetFolderId = suggestions?.targetFolder?.folderId || settings?.gdrive_99_id || settings?.google_drive_folder_id;
            
            let driveFileId = null;
            if (token && targetFolderId && file.size > 0) {
                const uploaded = await uploadFileToDrive(token, file, { folderId: targetFolderId, title: file.name });
                driveFileId = uploaded?.id || null;
            }

            await supabase.from('daily_captures').insert({
                company_id: profile.company_id,
                type: suggestions?.category || uploadHubDocType || 'document',
                raw_input: file.name,
                ai_result: suggestions || {},
                drive_file_id: driveFileId,
                drive_folder_path: suggestions?.targetFolder?.path || null,
                status: 'confirmed',
            });

            toast.success(`✅ Saved "${file.name}" to Drive & MyDay`, { id: toastId });
            loadData();
        } catch (err) {
            console.error('Hub upload error:', err);
            toast.error('Failed to process upload', { id: toastId });
        } finally {
            setCapturing(false);
        }
    };

    // ─── Capture Logic ─────────────────────────────────────────────────────
    const handleCaptureSelect = (type) => {
        if (type.id === 'payment' || type.id === 'note') {
            setCaptureMode(type.id);
            setConfirmResult(null);
            setSelectedFolder(null);
            setCaptureFile(null);
            setCaptureText('');
        } else {
            const typeTabMap = {
                enquiry: 'clipboard',
                bizcard: 'ocr',
                invoice: 'ocr',
                delivery: 'downloads',
                manual: 'gdrive',
                expense: 'ocr',
            };
            setUploadHubDocType(type.id);
            setUploadHubTab(typeTabMap[type.id] || 'recent');
            setIsUploadHubOpen(true);
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCaptureFile(file);
        await processCapture(file, null);
    };

    const processCapture = async (file, text) => {
        setCapturing(true);
        setConfirmResult(null);
        try {
            const token = getStoredToken();
            if (!token) {
                toast.error('Google Drive not connected. Connect Drive first.');
                return;
            }

            const sourceFolder = captureMode === 'bizcard' ? 'Raw_Bus_Cards'
                : captureMode === 'invoice' || captureMode === 'expense' ? 'Raw_Supplier_Invoices'
                : 'Raw_Other_Documents';

            let payload, inputType;
            if (file) {
                const b64 = await fileToBase64(file);
                payload = b64;
                inputType = 'image_vision';
            } else {
                payload = text;
                inputType = 'text_file';
            }

            const result = await runDocumentPipeline(token, sourceFolder, null, inputType, payload);
            setConfirmResult(result);
            setConfirmType(captureMode);

            // Add to recent captures
            setRecentCaptures(prev => [{
                type: captureMode, label: file?.name || 'Text input',
                time: new Date(), confidence: result?.confidence_metrics?.confidence_score,
            }, ...prev].slice(0, 5));

        } catch (err) {
            console.error('Capture error:', err);
            toast.error('AI parsing failed. Try again.');
        } finally {
            setCapturing(false);
        }
    };

    const handleConfirmSave = async (data, linkJobNo) => {
        try {
            const token = getStoredToken();
            // Save to daily_captures in Supabase
            await supabase.from('daily_captures').insert({
                company_id: profile.company_id,
                type: confirmType,
                raw_input: captureText || captureFile?.name || null,
                ai_result: data,
                drive_file_id: null,
                status: 'confirmed',
            });

            // Upload file to Drive if we have one and a folder target
            if (captureFile && token && selectedFolder?.folderId) {
                await uploadFileToDrive(token, captureFile, { folderId: selectedFolder.folderId, title: captureFile.name });
            }

            toast.success('✅ Saved & filed successfully');
            setConfirmResult(null);
            setCaptureMode(null);
            setCaptureFile(null);
            setCaptureText('');
            setSelectedFolder(null);
            loadData();
        } catch (err) {
            console.error('Save error:', err);
            toast.error('Failed to save. Try again.');
        }
    };

    const handleNoteQuickSave = async () => {
        if (!captureText.trim()) return;
        try {
            await supabase.from('notes').insert({ company_id: profile.company_id, title: captureText.slice(0, 60), content: captureText });
            toast.success('Note saved');
            setCaptureText('');
            setCaptureMode(null);
        } catch { toast.error('Failed to save note'); }
    };

    // ─── Payment Save Handler ──────────────────────────────────────────────
    const handlePaymentSave = async (payData) => {
        try {
            const isIncoming = payData.direction === 'in'; // customer paid us
            const token = getStoredToken();

            if (isIncoming) {
                // 1. Record Payment Received document linked to the job
                if (payData.jobNo) {
                    const { data: jobDoc } = await supabase
                        .from('workflow_documents')
                        .select('id, company_id, assigned_job_no, partners')
                        .eq('assigned_job_no', payData.jobNo)
                        .eq('document_type', 'Tax Invoice')
                        .maybeSingle();

                    if (jobDoc) {
                        await supabase.from('workflow_documents').insert({
                            company_id: profile.company_id,
                            document_type: 'Payment Received',
                            assigned_job_no: payData.jobNo,
                            total_amount: parseFloat(payData.amount) || 0,
                            issue_date: payData.date || getToday(),
                            status: 'Paid',
                            subject: `Payment received — ${payData.reference || 'PayNow/Bank Transfer'}`,
                            notes: payData.notes || '',
                        });
                    }
                }
                // 2. Log in daily_captures
                await supabase.from('daily_captures').insert({
                    company_id: profile.company_id,
                    type: 'payment',
                    ai_result: payData,
                    status: 'confirmed',
                });

                // 3. Upload PayNow screenshot if any
                if (captureFile && token) {
                    const folder = settings?.gdrive_payments_in_id || settings?.google_drive_folder_id;
                    if (folder) await uploadFileToDrive(token, captureFile, { folderId: folder, title: `PaymentIN_${payData.jobNo || 'misc'}_${payData.date || getToday()}_${captureFile.name}` });
                }

                toast.success(`✅ Payment of SGD ${payData.amount} recorded — Job moved to PAID`);

            } else {
                // OUTGOING: Supplier payment — log as expense + update PO status
                await supabase.from('daily_captures').insert({
                    company_id: profile.company_id,
                    type: 'expense',
                    ai_result: { ...payData, category: 'Supplier Payment' },
                    status: 'confirmed',
                });

                // If linked PO exists, update its status to Paid
                if (payData.jobNo) {
                    await supabase
                        .from('workflow_documents')
                        .update({ status: 'Paid', notes: `Paid via PayNow/Transfer on ${payData.date || getToday()}. Ref: ${payData.reference || '-'}` })
                        .eq('assigned_job_no', payData.jobNo)
                        .eq('document_type', 'Purchase Order');
                }

                // Upload receipt to Drive
                if (captureFile && token) {
                    const folder = settings?.gdrive_payments_out_id || settings?.google_drive_folder_id;
                    if (folder) await uploadFileToDrive(token, captureFile, { folderId: folder, title: `PaymentOUT_${payData.supplier || 'supplier'}_${payData.date || getToday()}_${captureFile.name}` });
                }

                toast.success(`✅ Supplier payment of SGD ${payData.amount} recorded`);
            }

            setCaptureMode(null);
            setCaptureFile(null);
            loadData();
        } catch (err) {
            console.error('Payment save error:', err);
            toast.error('Failed to save payment. Try again.');
        }
    };

    // Helper: Determine job's current stage key
    const getJobStageKey = (job) => {
        if (isJobPaid(job)) return 'PAID';
        for (let i = STAGES.length - 1; i >= 0; i--) {
            const stage = STAGES[i];
            if (stage.key === 'ENQ') {
                if (job.allDocs.length > 0) {
                    const hasLater = STAGES.slice(1).some(s => s.docType && job.allDocs.some(d => d.document_type === s.docType));
                    if (!hasLater) return 'ENQ';
                }
            } else if (stage.docType && job.allDocs.some(d => d.document_type === stage.docType)) {
                return stage.key;
            }
        }
        return 'ENQ';
    };

    // Filtered pipeline data & stage counts
    const currentTabJobs = pipelineTab === 'active' ? jobs : archivedJobs;

    const stageCounts = currentTabJobs.reduce((acc, j) => {
        const key = getJobStageKey(j);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const filteredJobs = currentTabJobs.filter(j => {
        if (stageFilter !== 'ALL' && getJobStageKey(j) !== stageFilter) {
            return false;
        }
        if (pipelineSearch) {
            const q = pipelineSearch.toLowerCase();
            return j.jobNo.toLowerCase().includes(q) ||
                   j.customer.toLowerCase().includes(q) ||
                   (j.description && j.description.toLowerCase().includes(q)) ||
                   (j.customerPoNo && j.customerPoNo.toLowerCase().includes(q));
        }
        return true;
    });

    // ─── Render ────────────────────────────────────────────────────────────
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? '🌅 Good morning' : hour < 17 ? '☀️ Good afternoon' : '🌙 Good evening';
    const dateStr = now.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12 }}>
                <Loader2 size={24} className="spin" color="#6366f1" />
                <span style={{ color: '#64748b', fontSize: 15 }}>Loading your day...</span>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 0 40px' }}>

            {/* ── Header / Day Greeting ─────────────────────────────────── */}
            <div style={{
                background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a5f 100%)',
                borderRadius: 16, padding: '20px 28px', marginBottom: 20, color: '#fff',
                boxShadow: '0 8px 32px rgba(99,102,241,0.25)',
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontSize: 13, color: '#a5b4fc', marginBottom: 4 }}>{greeting}</div>
                        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#fff' }}>My Day</h1>
                        <div style={{ fontSize: 12, color: '#93c5fd', marginTop: 2 }}>{dateStr}</div>
                    </div>

                    {/* Quick Stats Row */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {[
                            { label: 'Action Needed', value: todayStats.overdue, color: '#f87171', icon: AlertCircle },
                            { label: "Today's Orders", value: todayStats.orders, color: '#34d399', icon: Package },
                            { label: 'Quotes Sent', value: todayStats.quotes, color: '#fbbf24', icon: FileText },
                            { label: "Today's Profit", value: `SGD ${todayStats.profit.toFixed(0)}`, color: '#818cf8', icon: TrendingUp },
                        ].map(stat => {
                            const Icon = stat.icon;
                            return (
                                <div key={stat.label} style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', borderRadius: 10, padding: '10px 16px', minWidth: 110, textAlign: 'center' }}>
                                    <Icon size={14} color={stat.color} style={{ margin: '0 auto 3px' }} />
                                    <div style={{ fontSize: 18, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                                    <div style={{ fontSize: 10, color: '#c7d2fe', fontWeight: 500 }}>{stat.label}</div>
                                </div>
                            );
                        })}
                        <button onClick={() => { setRefreshing(true); loadData(); }}
                            title="Refresh MyDay Data"
                            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, padding: '10px', cursor: 'pointer', color: '#a5b4fc', display: 'flex', alignItems: 'center' }}>
                            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
                        </button>
                        <button onClick={() => { setUploadHubTab('recent'); setIsUploadHubOpen(true); }}
                            title="Open Smart Document Upload Hub"
                            style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: '2px solid #f87171', borderRadius: 10, padding: '9px 14px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 12, boxShadow: '0 0 16px rgba(239,68,68,0.5)', transition: 'all 0.2s' }}>
                            <Cloud size={16} /> HUB
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Main 2-Column Grid ─────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, alignItems: 'start' }}>

                {/* ── LEFT: Activity Pipeline ─────────────────────────── */}
                <div>
                    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                        {/* Pipeline Header */}
                        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: 0 }}>
                                {[
                                    { id: 'active', label: `Active (${jobs.length})` },
                                    { id: 'archive', label: `Archive (${archivedJobs.length})` },
                                ].map(tab => (
                                    <button key={tab.id} onClick={() => { setPipelineTab(tab.id); setStageFilter('ALL'); }}
                                        style={{ padding: '6px 16px', border: 'none', borderRadius: tab.id === 'active' ? '8px 0 0 8px' : '0 8px 8px 0', background: pipelineTab === tab.id ? '#6366f1' : '#f1f5f9', color: pipelineTab === tab.id ? '#fff' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}>
                                        {tab.id === 'archive' && <Archive size={12} style={{ marginRight: 5 }} />}
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
                                {/* ─── Stagewise Filter Selector (before Search) ─── */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Filter size={13} color={stageFilter === 'ALL' ? '#94a3b8' : '#6366f1'} />
                                    <select
                                        value={stageFilter}
                                        onChange={e => setStageFilter(e.target.value)}
                                        style={{
                                            padding: '7px 10px',
                                            borderRadius: 8,
                                            border: `1.5px solid ${stageFilter === 'ALL' ? '#cbd5e1' : (STAGES.find(s => s.key === stageFilter)?.color || '#6366f1')}`,
                                            fontSize: 12,
                                            fontWeight: 700,
                                            color: stageFilter === 'ALL' ? '#475569' : (STAGES.find(s => s.key === stageFilter)?.color || '#6366f1'),
                                            background: stageFilter === 'ALL' ? '#f8fafc' : (STAGES.find(s => s.key === stageFilter)?.bg || '#eff6ff'),
                                            outline: 'none',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <option value="ALL">All Stages ({currentTabJobs.length})</option>
                                        {STAGES.map(s => (
                                            <option key={s.key} value={s.key}>
                                                {s.key} — {s.label} ({stageCounts[s.key] || 0})
                                            </option>
                                        ))}
                                    </select>
                                    {stageFilter !== 'ALL' && (
                                        <button
                                            onClick={() => setStageFilter('ALL')}
                                            title="Clear Stage Filter"
                                            style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>

                                {/* Search Bar */}
                                <div style={{ position: 'relative', width: 180 }}>
                                    <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                    <input value={pipelineSearch} onChange={e => setPipelineSearch(e.target.value)}
                                        placeholder="Search jobs..." style={{ width: '100%', padding: '7px 10px 7px 28px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                                </div>

                                <button onClick={() => navigate('/workflows?type=Job')}
                                    style={{ padding: '7px 12px', borderRadius: 8, background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#475569', whiteSpace: 'nowrap' }}>
                                    <Plus size={13} /> New
                                </button>
                            </div>
                        </div>

                        {/* Interactive Stage Legend */}
                        <div style={{ padding: '8px 18px', borderBottom: '1px solid #f8fafc', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 2 }}>Filter:</span>
                            {STAGES.map(s => {
                                const isSelected = stageFilter === s.key;
                                const count = stageCounts[s.key] || 0;
                                return (
                                    <button
                                        key={s.key}
                                        onClick={() => setStageFilter(isSelected ? 'ALL' : s.key)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            background: isSelected ? s.bg : '#f8fafc',
                                            border: `1px solid ${isSelected ? s.color : '#e2e8f0'}`,
                                            borderRadius: 20,
                                            padding: '2px 8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.color }} />
                                        <span style={{ fontSize: 11, color: isSelected ? s.color : '#64748b', fontWeight: isSelected ? 700 : 500 }}>
                                            {s.label} ({count})
                                        </span>
                                    </button>
                                );
                            })}
                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                                <span style={{ fontSize: 10, color: '#94a3b8' }}>= Overdue follow-up</span>
                            </div>
                        </div>

                        {/* Pipeline Rows */}
                        <div style={{ padding: '12px 14px', maxHeight: 520, overflowY: 'auto' }}>
                            {filteredJobs.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                                    <Package size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                                    <p style={{ fontSize: 14, fontWeight: 500 }}>
                                        {pipelineTab === 'active' ? 'No active jobs today' : 'No archived jobs'}
                                    </p>
                                    {pipelineTab === 'active' && (
                                        <button onClick={() => navigate('/workflows?type=Job')}
                                            style={{ marginTop: 12, padding: '8px 20px', borderRadius: 8, background: '#6366f1', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                                            + Create First Job
                                        </button>
                                    )}
                                </div>
                            ) : (
                                filteredJobs.map(job => (
                                    <ActivityRow key={job.jobNo} job={job} onNavigate={navigate} />
                                ))
                            )}
                        </div>
                    </div>

                    {/* ── Follow-Up Queue ───────────────────────────────── */}
                    {followUps.length > 0 && (
                        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', marginTop: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                            <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Bell size={15} color="#f59e0b" />
                                <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>Follow-Up Queue</span>
                                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>{followUps.length} pending</span>
                            </div>
                            <div style={{ padding: '8px 0' }}>
                                {followUps.map(job => (
                                    <div key={job.jobNo} style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #f8fafc' }}>
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: job.followUpDays >= 3 ? '#ef4444' : job.followUpDays >= 1 ? '#f59e0b' : '#10b981', flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{job.customer}</span>
                                            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{job.jobNo}</span>
                                        </div>
                                        <span style={{ fontSize: 12, color: job.followUpDays >= 3 ? '#ef4444' : '#f59e0b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            {job.followUpDays === 0 ? 'Today' : `${job.followUpDays}d`}
                                        </span>
                                        <button onClick={() => navigate(`/workflows/editor/job/${job.masterJob?.id || job.allDocs[0]?.id}`)}
                                            style={{ padding: '4px 12px', borderRadius: 20, background: '#f1f5f9', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6366f1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                            Follow Up <ArrowRight size={11} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── RIGHT: Smart Upload Panel ────────────────────────── */}
                <div style={{ position: 'sticky', top: 16 }}>
                    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        {/* Panel Header */}
                        <div style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Zap size={16} color="#fff" />
                            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Quick Capture</span>
                            <button onClick={() => { setUploadHubTab('recent'); setIsUploadHubOpen(true); }}
                                style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Cloud size={12} /> Open Hub
                            </button>
                            {!isTokenValid() && (
                                <button onClick={() => connectGoogleAPI('myday')}
                                    style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                                    Connect Drive
                                </button>
                            )}
                        </div>

                        <div style={{ padding: 14 }}>
                            {/* Capture Type Grid */}
                            {!captureMode && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                                    {CAPTURE_TYPES.map(type => {
                                        const Icon = type.icon;
                                        return (
                                            <button key={type.id} onClick={() => handleCaptureSelect(type)}
                                                style={{ padding: '10px 4px', borderRadius: 10, border: '1.5px solid #f1f5f9', background: '#f8fafc', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}
                                                onMouseEnter={e => { e.currentTarget.style.borderColor = type.color; e.currentTarget.style.background = `${type.color}12`; }}
                                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#f1f5f9'; e.currentTarget.style.background = '#f8fafc'; }}>
                                                <Icon size={18} color={type.color} style={{ margin: '0 auto 4px' }} />
                                                <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b', display: 'block', lineHeight: 1.2 }}>{type.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Active Capture UI */}
                            {captureMode && !confirmResult && (
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                                            {CAPTURE_TYPES.find(t => t.id === captureMode)?.label}
                                        </span>
                                        <button onClick={() => { setCaptureMode(null); setShowFolderPicker(false); }}
                                            style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#64748b', display: 'flex' }}>
                                            <X size={14} />
                                        </button>
                                    </div>

                                    {/* Folder Picker for Manual/Cert */}
                                    {showFolderPicker && !selectedFolder && (
                                        <FolderTargetSelector settings={settings}
                                            onSelect={f => { setSelectedFolder(f); setShowFolderPicker(false); }}
                                            onCancel={() => setCaptureMode(null)} />
                                    )}

                                    {/* Folder selected — show confirmation then file input */}
                                    {captureMode === 'manual' && selectedFolder && (
                                        <div style={{ marginBottom: 10, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Folder size={13} color="#10b981" />
                                            <span style={{ fontSize: 12, color: '#065f46', fontWeight: 500 }}>{selectedFolder.path}</span>
                                            <button onClick={() => setShowFolderPicker(true)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}>Change</button>
                                        </div>
                                    )}

                                    {/* Note mode: text area */}
                                    {captureMode === 'note' ? (
                                        <div>
                                            <textarea ref={textAreaRef} value={captureText} onChange={e => setCaptureText(e.target.value)}
                                                placeholder="Type your note..." autoFocus rows={4}
                                                style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                                            <button onClick={handleNoteQuickSave} disabled={!captureText.trim()}
                                                style={{ width: '100%', marginTop: 8, padding: '9px', borderRadius: 8, background: '#6366f1', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                                                Save Note
                                            </button>
                                        </div>
                                    ) : captureMode === 'enquiry' ? (
                                        /* Enquiry mode: paste text */
                                        <div>
                                            <textarea value={captureText} onChange={e => setCaptureText(e.target.value)}
                                                placeholder="Paste enquiry email / WhatsApp message here..." rows={5}
                                                style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                                                <button onClick={() => processCapture(null, captureText)} disabled={!captureText.trim() || capturing}
                                                    style={{ padding: '9px', borderRadius: 8, background: '#6366f1', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                                    {capturing ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} Parse AI
                                                </button>
                                                <button onClick={() => navigate('/workflows?type=Job')}
                                                    style={{ padding: '9px', borderRadius: 8, background: '#f1f5f9', border: 'none', color: '#475569', fontSize: 13, cursor: 'pointer' }}>
                                                    New Enquiry →
                                                </button>
                                            </div>
                                        </div>
                                    ) : captureMode === 'payment' ? (
                                        /* ─── Payment Quick-Entry Form ─── */
                                        <PaymentEntryForm
                                            jobs={jobs}
                                            onSave={handlePaymentSave}
                                            onCancel={() => { setCaptureMode(null); setCaptureFile(null); }}
                                            captureFile={captureFile}
                                            onFileChange={handleFileChange}
                                            fileInputRef={fileInputRef}
                                        />
                                    ) : (captureMode === 'manual' && !selectedFolder) ? null : (
                                        /* File-based modes: show upload options */
                                        <div>
                                            {capturing ? (
                                                <div style={{ textAlign: 'center', padding: '24px', color: '#6366f1' }}>
                                                    <Loader2 size={28} className="spin" style={{ margin: '0 auto 10px' }} />
                                                    <p style={{ fontSize: 13, fontWeight: 600 }}>AI is reading the document...</p>
                                                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Extracting and classifying data</p>
                                                </div>
                                            ) : (
                                                <div>
                                                    {/* Upload Options */}
                                                    <div style={{ display: 'grid', gap: 8 }}>
                                                        <button onClick={() => fileInputRef.current?.click()}
                                                            style={{ padding: '12px', borderRadius: 10, border: '2px dashed #c7d2fe', background: '#f5f3ff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, color: '#6366f1' }}>
                                                            <Upload size={18} color="#6366f1" />
                                                            <div style={{ textAlign: 'left' }}>
                                                                <div style={{ fontSize: 13, fontWeight: 700 }}>Upload File</div>
                                                                <div style={{ fontSize: 11, color: '#94a3b8' }}>PDF, JPG, PNG, DOCX</div>
                                                            </div>
                                                        </button>
                                                        <button onClick={() => fileInputRef.current?.click()}
                                                            style={{ padding: '12px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, color: '#374151' }}>
                                                            <Camera size={18} color="#10b981" />
                                                            <div style={{ textAlign: 'left' }}>
                                                                <div style={{ fontSize: 13, fontWeight: 600 }}>Take Photo / Camera</div>
                                                                <div style={{ fontSize: 11, color: '#94a3b8' }}>Scan with device camera</div>
                                                            </div>
                                                        </button>
                                                    </div>
                                                    <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.docx,.xlsx"
                                                        capture={captureMode === 'bizcard' ? 'environment' : undefined}
                                                        onChange={handleFileChange} style={{ display: 'none' }} />
                                                    {captureFile && (
                                                        <div style={{ marginTop: 8, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, fontSize: 12, color: '#065f46', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <CheckCircle2 size={13} color="#10b981" />
                                                            {captureFile.name}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* AI Confirm Card */}
                            {confirmResult && (
                                <AiConfirmCard
                                    result={confirmResult}
                                    captureType={confirmType}
                                    onConfirm={handleConfirmSave}
                                    onEdit={() => {}}
                                    onRetry={() => { setConfirmResult(null); }}
                                    onDismiss={() => { setConfirmResult(null); setCaptureMode(null); }}
                                />
                            )}
                        </div>

                        {/* Recent Captures */}
                        {recentCaptures.length > 0 && !captureMode && (
                            <div style={{ borderTop: '1px solid #f1f5f9', padding: '10px 14px' }}>
                                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Recent Captures</p>
                                {recentCaptures.map((c, i) => {
                                    const cfg = CAPTURE_TYPES.find(t => t.id === c.type);
                                    const Icon = cfg?.icon || FileText;
                                    return (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < recentCaptures.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                                            <Icon size={12} color={cfg?.color || '#94a3b8'} />
                                            <span style={{ fontSize: 12, color: '#475569', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                                            <span style={{ fontSize: 11, color: '#94a3b8' }}>{Math.round((Date.now() - c.time) / 60000)}m ago</span>
                                            {c.confidence !== undefined && (
                                                <span style={{ fontSize: 10, color: c.confidence >= 0.8 ? '#10b981' : '#f59e0b', fontWeight: 600 }}>{Math.round(c.confidence * 100)}%</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── Financial Alerts Section (Receivables & Payables) ── */}
                    <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
                        {/* Receivables Alert (Customer Collections / SOA) */}
                        <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg, #fef2f2, #fff7ed)', borderRadius: 12, border: '1px solid #fecaca', boxShadow: '0 2px 8px rgba(239,68,68,0.08)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <AlertCircle size={16} color="#ef4444" />
                                <span style={{ fontWeight: 800, fontSize: 13, color: '#991b1b' }}>Accounts Receivable Alert</span>
                            </div>
                            <p style={{ fontSize: 12, color: '#7f1d1d', margin: '0 0 10px 0', lineHeight: '1.4' }}>
                                SGD 40,000+ outstanding — <strong>{todayStats.overdue}</strong> customer jobs need payment collection &amp; SOA follow-up today.
                            </p>
                            <button onClick={() => navigate('/soa')}
                                style={{ width: '100%', padding: '8px 14px', borderRadius: 8, background: '#ef4444', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.15s' }}>
                                View Customer Receivables (SOA) <ArrowRight size={13} />
                            </button>
                        </div>

                        {/* Payables Alert (Supplier Bills / Vendor Payments) */}
                        <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', borderRadius: 12, border: '1px solid #fde68a', boxShadow: '0 2px 8px rgba(245,158,11,0.08)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <Clock size={16} color="#d97706" />
                                <span style={{ fontWeight: 800, fontSize: 13, color: '#92400e' }}>Accounts Payable Alert</span>
                            </div>
                            <p style={{ fontSize: 12, color: '#78350f', margin: '0 0 10px 0', lineHeight: '1.4' }}>
                                Pending supplier bills, vendor PO invoices, and PayNow expenses awaiting verification &amp; payment.
                            </p>
                            <button onClick={() => navigate('/accounts/bills')}
                                style={{ width: '100%', padding: '8px 14px', borderRadius: 8, background: '#f59e0b', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.15s' }}>
                                View Vendor Payables (Bills Portal) <ArrowRight size={13} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Smart Document Upload Hub Modal Layer ───────────────────── */}
            {isUploadHubOpen && (
                <SmartUploadPanel
                    isOpen={isUploadHubOpen}
                    onClose={() => setIsUploadHubOpen(false)}
                    onSelect={handleHubFileSelected}
                    documentType={uploadHubDocType}
                    initialTab={uploadHubTab}
                />
            )}

            {/* ── Pulse animation ─────────────────────────────────────────── */}
            <style>{`
                @keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.6); } }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
