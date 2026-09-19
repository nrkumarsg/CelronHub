/**
 * Unified Supplier Hub — Pro
 * Route: /unified-supplier-hub-pro
 *
 * 5 Tabs:
 *   1. Dashboard  — KPI cards + navigable enquiry list
 *   2. Enquiries  — Card grid + bilateral Drive panel
 *   3. Float RFQ  — Multi-step: Enquiry select → Supplier pick → Email compose → Confirm
 *   4. Compare    — Drive tree + supplier quote comparison table
 *   5. Job Link   — Jobs table linked to Job Control / JobEagleView
 *
 * Integrations:
 *   - Google Drive (bilateral): EnquiryDrivePanelWidget + EagleDriveTreeViewer
 *   - Google Calendar: GoogleCalendarReminderModal (same pattern as JobEagleView)
 *   - Email: FastFloatModal + EmailPreviewModal
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import {
    LayoutDashboard, FileText, Building2, ArrowRightLeft, Briefcase,
    Search, Plus, RefreshCcw, Filter, ChevronRight, ArrowRight,
    FolderOpen, Folder, Send, Calendar, Bell, Eye, Trash2, Copy,
    ExternalLink, Loader2, CheckCircle2, AlertCircle, Package,
    Users, Mail, Phone, Globe, X, ChevronDown, Inbox,
    ShoppingCart, Sparkles, Zap, HardDrive, Tag, Ship,
    DollarSign, TrendingUp, Clock, Activity, MapPin,
    MessageSquare, FileCheck, Receipt, Star, Upload,
    MoreVertical, Edit2, Save, Check, ClipboardList,
    QrCode, Smartphone, Cloud, FolderPlus, Layers,
} from 'lucide-react';
import {
    getEnquiriesWithFullData,
    computeKPIs,
    filterEnquiriesByTab,
    getJobsForHubPro,
    upsertSupplierFromSearch,
    buildSupplierSearchLinks,
    getStatusStyle,
    getJobStatusStyle,
    stripHtml,
    fmtDate,
    STATUS_BUCKETS,
    ensureEnquiryFolderAndSubfolders,
    duplicateEnquiry,
} from '../../lib/supplierHubProService';
import { getDocumentSettings, getPartners, savePartner } from '../../lib/store';
import { COUNTRIES } from '../../lib/constants';
import { isTokenValid, getStoredToken, connectGoogleAPI } from '../../lib/googleAuthService';
import { listFolderContent, uploadFileToDrive, getOrCreateFolder } from '../../lib/driveService';
import { generateEnquiryNo } from '../../lib/enquiryService';
import GoogleCalendarReminderModal from '../../components/common/GoogleCalendarReminderModal';
import EnquiryDrivePanelWidget from '../../components/workflows/EnquiryDrivePanelWidget';
import EagleDriveTreeViewer from '../../components/workflows/EagleDriveTreeViewer';
import FastFloatModal from '../../components/workflows/FastFloatModal';
import EmailPreviewModal from '../../components/workflows/EmailPreviewModal';
import SmartUploadPanel from '../../components/upload/SmartUploadPanel';

// ─── Module tabs ─────────────────────────────────────────────────────────────
const TABS = [
    { id: 'dashboard', label: 'Dashboard',  icon: <LayoutDashboard size={16} />, color: '#6366f1' },
    { id: 'enquiries', label: 'Enquiries',  icon: <FileText        size={16} />, color: '#3b82f6' },
    { id: 'float_rfq', label: 'Float RFQ',  icon: <Send            size={16} />, color: '#f59e0b' },
    { id: 'compare',   label: 'Compare',    icon: <ArrowRightLeft  size={16} />, color: '#10b981' },
    { id: 'job_link',  label: 'Job Link',   icon: <Briefcase       size={16} />, color: '#8b5cf6' },
];

// ─── Dashboard sub-tabs ───────────────────────────────────────────────────────
const DASH_TABS = [
    { id: 'all',     label: 'All'          },
    { id: 'draft',   label: 'Draft'        },
    { id: 'floated', label: 'RFQ Floated'  },
    { id: 'quoted',  label: 'Quotes In'    },
    { id: 'ordered', label: 'Order Placed' },
];

// ─── Job sub-tabs ─────────────────────────────────────────────────────────────
const JOB_TABS = [
    { id: 'ongoing',   label: 'Ongoing'   },
    { id: 'completed', label: 'Completed' },
    { id: 'all',       label: 'All Jobs'  },
];

// ─── Small KPI Card ───────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, color, bg, onClick, active }) {
    return (
        <div
            onClick={onClick}
            style={{
                background: active ? bg : '#ffffff',
                border: `2px solid ${active ? color : '#e2e8f0'}`,
                borderRadius: '16px', padding: '18px 20px',
                cursor: 'pointer', transition: 'all 0.18s',
                display: 'flex', flexDirection: 'column', gap: '6px',
                boxShadow: active ? `0 4px 20px ${color}22` : '0 1px 4px rgba(0,0,0,0.04)',
                flex: '1 1 0',
            }}
            onMouseOver={e => !active && (e.currentTarget.style.borderColor = color)}
            onMouseOut={e => !active && (e.currentTarget.style.borderColor = '#e2e8f0')}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                <span style={{ color, opacity: 0.8 }}>{icon}</span>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: active ? color : '#0f172a', lineHeight: 1 }}>{value}</div>
        </div>
    );
}

// ─── Drive status badge ───────────────────────────────────────────────────────
function DriveBadge({ enquiry, onOpenDrive, onOpenFolder }) {
    if (!enquiry.gdrive_folder_id) {
        return (
            <span style={{
                fontSize: '0.62rem', fontWeight: 700, color: '#b45309',
                background: '#fef3c7', padding: '2px 7px', borderRadius: '6px',
                border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '3px',
            }}>
                <AlertCircle size={10} /> No Folder
            </span>
        );
    }
    return (
        <button
            onClick={e => { e.stopPropagation(); onOpenFolder(enquiry); }}
            title="Open Drive folder"
            style={{
                fontSize: '0.62rem', fontWeight: 700, color: '#2563eb',
                background: '#eff6ff', padding: '2px 7px', borderRadius: '6px',
                border: '1px solid #bfdbfe', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '3px',
            }}
        >
            <FolderOpen size={10} /> Drive
        </button>
    );
}

// ─── Rich Enquiry Card Pro Component (Images 2 & 3) ─────────────────────────
function EnquiryCardPro({
    enq,
    onOpen,
    onDrive,
    onCheckingFacility,
    onFloat,
    onDelete,
    onDuplicate,
    onQuote,
    onPO,
    onOpenRootDrive,
    onCalendar,
    isTargetSelected = false,
    onSelectTarget = null,
}) {
    const navigate = useNavigate();
    const [openMenu, setOpenMenu] = useState(false);
    const status = enq.status || 'Open';
    const sc = getStatusStyle(status);

    const isOverdue = enq.due_date && new Date(enq.due_date) < new Date() && !['Closed', 'Cancelled', 'Job Created'].includes(status);
    const desc = stripHtml(enq.description).substring(0, 80);

    const getRefLabel = (ref, stat) => {
        if (!ref) {
            return stat === 'New' || stat === 'Open' ? 'Ref: Enquiry' : 'Ref: Draft';
        }
        if (ref.toLowerCase().startsWith('ref:')) return ref;
        if (ref.toLowerCase() === 'enquiry') return 'Ref: Enquiry';
        if (ref.toLowerCase() === 'draft') return 'Ref: Draft';
        return ref;
    };

    const getStatusLabel = (stat) => {
        if (stat === 'New' || stat === 'Open') return 'New Enquiry';
        return stat;
    };

    return (
        <div
            style={{
                background: isTargetSelected ? '#f8faff' : '#ffffff',
                border: isTargetSelected ? '2px solid #6366f1' : '1.5px solid #e2e8f0',
                borderLeft: isTargetSelected ? '6px solid #4f46e5' : (isOverdue ? '6px solid #ef4444' : '6px solid #6366f1'),
                borderRadius: '18px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.22s ease',
                boxShadow: isTargetSelected ? '0 4px 20px rgba(99,102,241,0.18)' : '0 2px 8px rgba(99,102,241,0.04)',
                cursor: 'default',
                position: 'relative'
            }}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(99,102,241,0.10)'; }}
            onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = isTargetSelected ? '0 4px 20px rgba(99,102,241,0.18)' : '0 2px 8px rgba(99,102,241,0.04)'; }}
        >
            {/* Top Row: ENQ Badge + Status + Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {onSelectTarget && (
                        <label
                            onClick={e => e.stopPropagation()}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '3px 8px',
                                borderRadius: '7px',
                                background: isTargetSelected ? '#e0e7ff' : '#f8fafc',
                                border: `1.5px solid ${isTargetSelected ? '#6366f1' : '#cbd5e1'}`,
                                cursor: 'pointer',
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                color: isTargetSelected ? '#4338ca' : '#64748b',
                                transition: 'all 0.15s',
                                userSelect: 'none',
                            }}
                            title={isTargetSelected ? `Currently selected as Target Upload Folder for ${enq.enquiry_no}` : `Click tickbox to select ${enq.enquiry_no} as Target Upload Folder`}
                        >
                            <input
                                type="checkbox"
                                checked={isTargetSelected}
                                onChange={() => onSelectTarget(enq)}
                                style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#4f46e5', margin: 0 }}
                            />
                            <span>{isTargetSelected ? 'TARGET ACTIVE' : 'SET TARGET'}</span>
                        </label>
                    )}
                    <div onClick={() => onOpen(enq)} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} title="Click to view/edit details">
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 11px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, background: '#eef2ff', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            <FileText size={12} /> ENQ
                        </span>
                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#4f46e5', letterSpacing: '0.01em', textDecoration: 'underline' }}>
                            {enq.enquiry_no || '—'}
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isOverdue && (
                        <span style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 800, background: '#fee2e2', color: '#b91c1c' }}>
                            Overdue
                        </span>
                    )}
                    <span style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                        {getStatusLabel(status)}
                    </span>
                    {/* More Menu */}
                    <div style={{ position: 'relative' }}>
                        <button onClick={e => { e.stopPropagation(); setOpenMenu(!openMenu); }}
                            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            <MoreVertical size={16} color="#64748b" />
                        </button>
                        {openMenu && (
                            <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: 0, top: '34px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, minWidth: '180px', padding: '6px' }}>
                                {[
                                    { label: 'View / Edit Details', icon: <Eye size={14} />, action: () => onOpen(enq) },
                                    { label: 'Check Live Drive Tree', icon: <FolderOpen size={14} />, action: () => onCheckingFacility(enq) },
                                    { label: 'Set Calendar Reminder', icon: <Calendar size={14} />, action: () => onCalendar(enq) },
                                    { label: 'Duplicate Enquiry', icon: <Copy size={14} />, action: () => onDuplicate(enq) },
                                    { label: 'Delete Enquiry', icon: <Trash2 size={14} />, action: () => onDelete(enq), danger: true },
                                ].map(item => (
                                    <button key={item.label} onClick={() => { item.action(); setOpenMenu(false); }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '9px 12px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: item.danger ? '#dc2626' : '#374151', textAlign: 'left' }}>
                                        {item.icon} {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Customer + Description */}
            <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '1.0rem', fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>
                    {enq.customer?.name || enq.customer_name || 'Walk-in'}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.4, marginBottom: '8px', minHeight: '36px' }}>
                    {desc || <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>No description</span>}
                </div>
                {/* Meta row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {(enq.vessel || enq.vessel_name || enq.location) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#64748b' }}>
                            <Ship size={12} color="#6366f1" />
                            {enq.vessel || enq.vessel_name || enq.location}
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#d97706', fontWeight: 600 }}>
                        <Tag size={12} color="#d97706" />
                        {getRefLabel(enq.customer_ref, status)}
                    </div>
                    {enq.source_type?.toLowerCase() === 'whatsapp' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>
                            <MessageSquare size={13} color="#16a34a" /> WhatsApp
                        </div>
                    ) : enq.source_type?.toLowerCase() === 'email' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#2563eb', fontWeight: 600 }}>
                            <Mail size={13} color="#2563eb" /> Email
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
                            <Inbox size={13} color="#475569" /> {enq.source_type || 'Unknown'}
                        </div>
                    )}
                </div>
            </div>

            {/* Dates */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
                <div>
                    <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Received</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151' }}>{fmtDate(enq.enquiry_date || enq.created_at)}</div>
                </div>
                <div>
                    <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Due Date</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isOverdue ? '#ef4444' : '#374151' }}>{fmtDate(enq.due_date)}</div>
                </div>
            </div>

            {/* Floated Suppliers & Status */}
            {enq.supplier_quotes && enq.supplier_quotes.length > 0 && (
                <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '10px 14px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.67rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supplier Activity</span>
                        <span style={{ fontSize: '0.67rem', color: '#94a3b8' }}>{enq.supplier_quotes.length} floated</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {enq.supplier_quotes.map((q, idx) => {
                            const supplierName = q.supplier?.name || 'Unknown Supplier';
                            const stat = q.status || 'Pending';
                            let statusColor = '#94a3b8';
                            let statusBg = '#f1f5f9';

                            if (stat === 'Sent' || stat === 'Pending') {
                                statusColor = '#2563eb';
                                statusBg = '#dbeafe';
                            } else if (stat === 'Received') {
                                statusColor = '#d97706';
                                statusBg = '#fef3c7';
                            } else if (stat === 'Shortlisted') {
                                statusColor = '#16a34a';
                                statusBg = '#dcfce7';
                            } else if (stat === 'Rejected') {
                                statusColor = '#dc2626';
                                statusBg = '#fee2e2';
                            }

                            return (
                                <div key={q.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                                    <span style={{ color: '#334155', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }} title={supplierName}>
                                        {supplierName}
                                    </span>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: statusColor, background: statusBg, padding: '2px 8px', borderRadius: '9999px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                        {stat}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Linked Documents (Quotation / PO) */}
            {enq.workflow_documents && enq.workflow_documents.length > 0 && (
                <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '10px 14px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.67rem', fontWeight: 800, color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Document Pipeline</span>
                        <span style={{ fontSize: '0.67rem', color: '#94a3b8' }}>{enq.workflow_documents.length} document(s)</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {enq.workflow_documents.map((doc, idx) => {
                            let docIcon = <FileText size={12} color="#6366f1" />;
                            let editorPath = doc.document_type === 'Enquiry' 
                                ? `/workflows/enquiry/${doc.id}` 
                                : `/workflows/editor/${doc.document_type.toLowerCase().replace(/ /g, '-')}/${doc.id}`;
                            let labelColor = '#475569';
                            let statusColor = '#64748b';
                            let statusBg = '#f1f5f9';

                            if (doc.document_type === 'Quotation') {
                                docIcon = <FileText size={12} color="#6366f1" />;
                                labelColor = '#4f46e5';
                                if (doc.status === 'Approved' || doc.status === 'Sent') {
                                    statusColor = '#16a34a';
                                    statusBg = '#dcfce7';
                                } else if (doc.status === 'Draft') {
                                    statusColor = '#64748b';
                                    statusBg = '#f1f5f9';
                                }
                            } else if (doc.document_type === 'Purchase Order') {
                                docIcon = <ShoppingCart size={12} color="#10b981" />;
                                labelColor = '#059669';
                                if (doc.status === 'Approved' || doc.status === 'Sent') {
                                    statusColor = '#16a34a';
                                    statusBg = '#dcfce7';
                                } else if (doc.status === 'Draft') {
                                    statusColor = '#64748b';
                                    statusBg = '#f1f5f9';
                                }
                            }

                            return (
                                <div key={doc.id || idx} onClick={() => navigate(editorPath)}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', cursor: 'pointer', padding: '4px', borderRadius: '6px', background: 'transparent', transition: 'background 0.1s' }}
                                    onMouseOver={e => e.currentTarget.style.background = '#e2e8f0'}
                                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                    title={`Click to view/edit ${doc.document_type}`}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }}>
                                        {docIcon}
                                        <span style={{ color: labelColor, fontWeight: 700 }}>
                                            {doc.document_no}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>
                                            ${Number(doc.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                        <span style={{ fontSize: '0.62rem', fontWeight: 800, color: statusColor, background: statusBg, padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                            {doc.status}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Quick Entry Tray */}
            <div style={{ marginTop: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
                    Quick Entry Sections
                </span>
                <div className="enq-quick-links">
                    <button className="enq-ql-btn enq-ql-lines" onClick={() => onOpen(enq, 'lines')} title="Enquiry Lines">
                        <ClipboardList size={12} /> Lines
                    </button>
                    <button className="enq-ql-btn enq-ql-drive" onClick={() => onDrive(enq)} title="Open GDrive Folder">
                        <Folder size={12} /> Explorer
                    </button>
                    <button className="enq-ql-btn enq-ql-float" onClick={() => onFloat(enq)} title="Float RFQ">
                        <Send size={12} /> Float RFQ
                    </button>
                    <button className="enq-ql-btn enq-ql-quotes" onClick={() => onOpen(enq, 'supplier-quotes')} title="Supplier Quotes">
                        <Inbox size={12} /> Quotes
                    </button>
                    <button className="enq-ql-btn enq-ql-q2c" onClick={() => onQuote(enq)} title="Quote2Customer">
                        <FileText size={12} /> Quote2Cust
                    </button>
                    <button className="enq-ql-btn enq-ql-po" onClick={() => onPO(enq)} title="Order2Supplier">
                        <ShoppingCart size={12} /> Order2Supp
                    </button>
                    <button 
                        className="enq-ql-btn enq-ql-workflow" 
                        onClick={() => navigate(`/workflows/eagle-view/${enq.id}`)} 
                        title="Open Enquiry 360° Eagle View"
                        style={{ gridColumn: 'span 3', background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)', color: '#ffffff', borderColor: '#4338ca', fontWeight: 800 }}
                    >
                        <Layers size={13} /> 🦅 Eagle View 360°
                    </button>
                </div>
            </div>

            {/* Dotted Divider */}
            <div style={{ borderTop: '1px dotted #e2e8f0', margin: '14px 0' }}></div>

            {/* Footer details */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                    Date: {fmtDate(enq.enquiry_date || enq.created_at)}
                </span>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {/* Google Drive Specific Folder Button (Yellow) */}
                    <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDrive(enq); }}
                        style={{ 
                            background: enq.gdrive_folder_id ? '#fffbeb' : '#f8fafc', 
                            color: enq.gdrive_folder_id ? '#d97706' : '#6366f1', 
                            padding: '7px 8px', 
                            borderRadius: '8px', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: enq.gdrive_folder_id ? '1px solid #fde68a' : '1px solid #e2e8f0'
                        }}
                        title={enq.gdrive_folder_id ? "Open Google Drive Folder" : "Provision Google Drive Folder"}
                    >
                        <Folder size={15} fill={enq.gdrive_folder_id ? "#f59e0b" : "transparent"} />
                    </button>

                    {/* Google Drive Root Folder Button (Blue) */}
                    <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenRootDrive(); }}
                        style={{ 
                            background: '#eff6ff', 
                            color: '#2563eb', 
                            padding: '7px 8px', 
                            borderRadius: '8px', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid #bfdbfe'
                        }}
                        title="Open Enquiries Root Folder"
                    >
                        <FolderOpen size={15} fill="#2563eb" fillOpacity={0.15} />
                    </button>

                    {/* Google Calendar Reminder Button (Green) */}
                    <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCalendar(enq); }}
                        style={{ 
                            background: '#f0fdf4', 
                            color: '#15803d', 
                            padding: '7px 8px', 
                            borderRadius: '8px', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid #bbf7d0'
                        }}
                        title="Add Google Calendar Reminder"
                    >
                        <Calendar size={15} />
                    </button>

                    {/* Copy Button */}
                    <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDuplicate(enq); }}
                        style={{ 
                            background: '#f1f5f9', 
                            color: '#475569', 
                            padding: '7px 8px', 
                            borderRadius: '8px', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid #e2e8f0'
                        }}
                        title="Duplicate Enquiry (Copy)"
                    >
                        <Copy size={15} />
                    </button>

                    {/* Delete Button */}
                    <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(enq); }}
                        style={{ 
                            background: '#fef2f2', 
                            color: '#ef4444', 
                            padding: '7px 8px', 
                            borderRadius: '8px', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid #fecaca'
                        }}
                        title="Delete Enquiry"
                    >
                        <Trash2 size={15} />
                    </button>

                    {/* Review Link */}
                    <button
                        onClick={() => onOpen(enq)}
                        style={{ 
                            background: 'transparent', 
                            border: 'none', 
                            color: '#6366f1', 
                            fontWeight: 700, 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.84rem',
                            padding: '4px 6px'
                        }}
                    >
                        Review <ArrowRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function UnifiedSupplierHubPro() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // ─── Active Tab ───────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'dashboard');

    // ─── Global Data ──────────────────────────────────────────────────────────
    const [enquiries, setEnquiries]   = useState([]);
    const [jobs,      setJobs]        = useState([]);
    const [suppliers, setSuppliers]   = useState([]);
    const [settings,  setSettings]    = useState(null);
    const [loading,   setLoading]     = useState(true);

    // ─── Dashboard Tab State ──────────────────────────────────────────────────
    const [dashTab,      setDashTab]      = useState('all');
    const [dashSearch,   setDashSearch]   = useState('');
    const [kpiFilter,    setKpiFilter]    = useState(null); // 'draft' | 'floated' | 'quoted' | 'ordered' | null

    // ─── Enquiries Tab State ──────────────────────────────────────────────────
    const [enqSearch,       setEnqSearch]       = useState('');
    const [enqStatusFilter, setEnqStatusFilter] = useState('All');
    const [drivePanel,      setDrivePanel]      = useState({ open: false, enquiry: null });

    // ─── Float RFQ State ──────────────────────────────────────────────────────
    const [rfqStep,           setRfqStep]           = useState(1); // 1=Select ENQ, 2=Select Suppliers, 3=Compose, 4=Confirm
    const [rfqEnquiry,        setRfqEnquiry]         = useState(null);
    const [rfqEnqSearch,      setRfqEnqSearch]       = useState('');
    const [rfqSupplierSearch, setRfqSupplierSearch]  = useState('');
    const [rfqSelected,       setRfqSelected]        = useState([]);  // selected supplier IDs
    const [rfqPartSearch,     setRfqPartSearch]       = useState('');  // part name for web search
    const [rfqPartNo,         setRfqPartNo]           = useState('');
    const [addSupplierForm,   setAddSupplierForm]     = useState(null); // null | {}
    const [savingSupplier,    setSavingSupplier]       = useState(false);
    const [fastFloatOpen,     setFastFloatOpen]        = useState(false);
    const [rfqSentCount,      setRfqSentCount]         = useState(0);

    // ─── Compare Tab State ────────────────────────────────────────────────────
    const [compareEnquiry,  setCompareEnquiry]  = useState(null);
    const [compareSearch,   setCompareSearch]   = useState('');
    const [quoteRows,       setQuoteRows]       = useState([]);  // [{item, suppliers: {suppId: {price, qty}}}]

    // ─── Job Link Tab State ───────────────────────────────────────────────────
    const [jobTab,    setJobTab]    = useState('ongoing');
    const [jobSearch, setJobSearch] = useState('');

    // ─── Indicator (1) Smart Upload & Checking Facility State ─────────────────
    const [showSmartUpload, setShowSmartUpload] = useState(true);
    const [gatewayViewMode, setGatewayViewMode] = useState('upload'); // 'upload' | 'viewer'
    const [uploadTargetEnquiryId, setUploadTargetEnquiryId] = useState('');
    const [checkingModal, setCheckingModal] = useState({ isOpen: false, enquiry: null });
    const [allPartners, setAllPartners] = useState([]);
    const [syncingPartners, setSyncingPartners] = useState(false);
    const [showNewFolderModal, setShowNewFolderModal] = useState(false);
    const [customerSearchTerm, setCustomerSearchTerm] = useState('');
    const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
    const [newFolderForm, setNewFolderForm] = useState({
        enquiryNo: '',
        customerId: '',
        customerName: '',
        isNewCustomer: false,
        customerEmail: '',
        customerPhone: '',
        customerCountry: 'Singapore',
        customerAddress: '',
        customerWeblink: '',
        customerNotes: '',
        contactPersonName: '',
        contactPersonEmail: '',
        contactPersonPhone: '',
        description: '',
        customerRef: '',
        autoCreateDrive: true,
    });
    const [creatingFolder, setCreatingFolder] = useState(false);

    // ─── Indicator (2) Enquiry Cards Grid State ───────────────────────────────
    const [cardYearFilter, setCardYearFilter] = useState('All');
    const [cardStatusFilter, setCardStatusFilter] = useState('All');
    const [cardSearch, setCardSearch] = useState('');

    // ─── Calendar Modal ───────────────────────────────────────────────────────
    const [calendarModal, setCalendarModal] = useState({
        isOpen: false, title: '', date: '', description: '',
        location: '', activityType: 'Enquiry Reminder', enquiryNo: '',
    });
    const openCalendarModal = (params = {}) => {
        setCalendarModal({ isOpen: true, activityType: 'Enquiry Reminder', enquiryNo: '', ...params });
    };

    // ─── Synchronize Partners & Customers across Database, Jobs & Enquiries ──
    const syncAllPartners = useCallback(async (showToast = false) => {
        setSyncingPartners(true);
        try {
            const [pProfile, pGlobal] = await Promise.allSettled([
                profile?.company_id ? getPartners(profile) : Promise.resolve([]),
                getPartners()
            ]);
            let fetched = [];
            if (pProfile.status === 'fulfilled' && Array.isArray(pProfile.value)) {
                fetched = [...fetched, ...pProfile.value];
            }
            if (pGlobal.status === 'fulfilled' && Array.isArray(pGlobal.value)) {
                fetched = [...fetched, ...pGlobal.value];
            }

            // Also harvest customer names & IDs from active jobs and enquiries
            const extraFromJobs = (jobs || []).map(j => ({
                id: j.partners?.id || j.partner_id || `job-cust-${j.id}`,
                name: j.partners?.name || j.customer_name,
                country: 'Singapore',
                types: ['Customer'],
                isFromJob: true
            })).filter(p => p.name && p.name.trim());

            const extraFromEnqs = (enquiries || []).map(e => ({
                id: e.customer?.id || e.customer_id || `enq-cust-${e.id}`,
                name: e.customer?.name || e.customer_name,
                country: e.customer?.country || 'Singapore',
                types: ['Customer'],
                isFromEnq: true
            })).filter(p => p.name && p.name.trim());

            const combined = [...fetched, ...extraFromJobs, ...extraFromEnqs];

            // Deduplicate by normalized name and ID
            const seen = new Set();
            const deduplicated = [];
            for (const item of combined) {
                if (!item || !item.name) continue;
                const norm = item.name.toLowerCase().replace(/[\s\-_.,()/]/g, '');
                const key = item.id ? `${item.id}-${norm}` : norm;
                if (!seen.has(key) && !seen.has(norm)) {
                    seen.add(key);
                    seen.add(norm);
                    deduplicated.push(item);
                }
            }

            deduplicated.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setAllPartners(deduplicated);
            setSuppliers(deduplicated.filter(p => (p.types || []).includes('Supplier')));

            if (showToast) {
                toast.success(`Synchronized ${deduplicated.length} partners & customers!`);
            }
            return deduplicated;
        } catch (err) {
            console.error('[HubPro] syncAllPartners error:', err);
            if (showToast) toast.error('Failed to sync partners: ' + (err.message || err));
            return [];
        } finally {
            setSyncingPartners(false);
        }
    }, [profile?.company_id, jobs, enquiries]);

    // ─── Load All Data ────────────────────────────────────────────────────────
    const loadAll = useCallback(async () => {
        if (!profile?.company_id) return;
        setLoading(true);
        try {
            const [enqRes, jobRes, suppRes, settingsRes] = await Promise.allSettled([
                getEnquiriesWithFullData(profile.company_id),
                getJobsForHubPro(profile.company_id),
                getPartners(profile).then(async data => (data && data.length > 0 ? data : await getPartners())),
                getDocumentSettings(profile.company_id),
            ]);

            let loadedJobs = [];
            let loadedEnqs = [];

            if (enqRes.status === 'fulfilled') {
                loadedEnqs = enqRes.value || [];
                setEnquiries(loadedEnqs);
            } else {
                console.error('[HubPro] Enquiries error:', enqRes.reason);
            }

            if (jobRes.status === 'fulfilled') {
                loadedJobs = jobRes.value || [];
                setJobs(loadedJobs);
            } else {
                console.error('[HubPro] Jobs error:', jobRes.reason);
            }

            if (suppRes.status === 'fulfilled') {
                const suppData = suppRes.value || [];
                // Merge customers from loaded jobs and enquiries into partner directory
                const extraFromJobs = loadedJobs.map(j => ({
                    id: j.partners?.id || j.partner_id || `job-cust-${j.id}`,
                    name: j.partners?.name || j.customer_name,
                    country: 'Singapore',
                    types: ['Customer'],
                    isFromJob: true
                })).filter(p => p.name && p.name.trim());

                const extraFromEnqs = loadedEnqs.map(e => ({
                    id: e.customer?.id || e.customer_id || `enq-cust-${e.id}`,
                    name: e.customer?.name || e.customer_name,
                    country: e.customer?.country || 'Singapore',
                    types: ['Customer'],
                    isFromEnq: true
                })).filter(p => p.name && p.name.trim());

                const combined = [...suppData, ...extraFromJobs, ...extraFromEnqs];
                const seen = new Set();
                const deduplicated = [];
                for (const item of combined) {
                    if (!item || !item.name) continue;
                    const norm = item.name.toLowerCase().replace(/[\s\-_.,()/]/g, '');
                    const key = item.id ? `${item.id}-${norm}` : norm;
                    if (!seen.has(key) && !seen.has(norm)) {
                        seen.add(key);
                        seen.add(norm);
                        deduplicated.push(item);
                    }
                }
                deduplicated.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                setAllPartners(deduplicated);
                setSuppliers(deduplicated.filter(p => (p.types || []).includes('Supplier')));
            } else {
                console.error('[HubPro] Partners error:', suppRes.reason);
            }

            if (settingsRes.status === 'fulfilled') {
                setSettings(settingsRes.value);
            } else {
                console.error('[HubPro] Settings error:', settingsRes.reason);
            }
        } catch (err) {
            console.error('[HubPro] loadAll unexpected error:', err);
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    }, [profile?.company_id]);

    useEffect(() => { loadAll(); }, [loadAll]);

    // ─── KPIs ─────────────────────────────────────────────────────────────────
    const kpis = useMemo(() => computeKPIs(enquiries), [enquiries]);

    // ─── Filtered Enquiries (Dashboard) ──────────────────────────────────────
    const dashEnquiries = useMemo(() => {
        const tab = kpiFilter || dashTab;
        return filterEnquiriesByTab(enquiries, tab, dashSearch);
    }, [enquiries, kpiFilter, dashTab, dashSearch]);

    // ─── Filtered Enquiries (Enquiries card grid) ─────────────────────────────
    const cardEnquiries = useMemo(() => {
        let filtered = enquiries;
        if (enqStatusFilter !== 'All') {
            filtered = filtered.filter(e => e.status === enqStatusFilter);
        }
        if (enqSearch.trim()) {
            const q = enqSearch.toLowerCase();
            filtered = filtered.filter(e =>
                (e.enquiry_no || '').toLowerCase().includes(q) ||
                (e.customer?.name || '').toLowerCase().includes(q) ||
                (e.customer_ref || '').toLowerCase().includes(q) ||
                (stripHtml(e.description) || '').toLowerCase().includes(q) ||
                (e.supplier_quotes || []).some(sq => (sq.supplier?.name || '').toLowerCase().includes(q)) ||
                (e.workflow_documents || []).some(wd => (wd.document_no || '').toLowerCase().includes(q))
            );
        }
        return filtered;
    }, [enquiries, enqStatusFilter, enqSearch]);

    // ─── Filtered Jobs ────────────────────────────────────────────────────────
    const filteredJobs = useMemo(() => {
        let list = jobs;
        if (jobTab === 'ongoing')   list = list.filter(j => !['Completed', 'Paid', 'Cancelled'].includes(j.status));
        if (jobTab === 'completed') list = list.filter(j => ['Completed', 'Paid'].includes(j.status));
        if (jobSearch.trim()) {
            const q = jobSearch.toLowerCase();
            list = list.filter(j =>
                (j.document_no || '').toLowerCase().includes(q) ||
                (j.assigned_job_no || '').toLowerCase().includes(q) ||
                (j.partners?.name || '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [jobs, jobTab, jobSearch]);

    // ─── Filtered suppliers for Float RFQ ────────────────────────────────────
    const filteredSuppliers = useMemo(() => {
        if (!rfqSupplierSearch.trim()) return suppliers;
        const q = rfqSupplierSearch.toLowerCase();
        return suppliers.filter(s =>
            (s.name || '').toLowerCase().includes(q) ||
            (s.email || '').toLowerCase().includes(q) ||
            (s.country || '').toLowerCase().includes(q)
        );
    }, [suppliers, rfqSupplierSearch]);

    // ─── Web search links for Float RFQ ──────────────────────────────────────
    const webSearchLinks = useMemo(() =>
        buildSupplierSearchLinks(rfqPartSearch, rfqPartNo),
        [rfqPartSearch, rfqPartNo]
    );

    // ─── Active Upload Enquiry for Indicator (1) ─────────────────────────────
    const activeUploadEnquiry = useMemo(() => {
        if (uploadTargetEnquiryId) {
            return enquiries.find(e => e.id === uploadTargetEnquiryId) || null;
        }
        return enquiries[0] || null;
    }, [enquiries, uploadTargetEnquiryId]);

    // ─── Available Years for Indicator (2) Card Grid ─────────────────────────
    const availableYears = useMemo(() => {
        const years = new Set(
            enquiries
                .map(e => e.enquiry_date || e.created_at)
                .filter(Boolean)
                .map(d => new Date(d).getFullYear().toString())
        );
        return ['All', ...Array.from(years).sort((a, b) => b - a)];
    }, [enquiries]);

    // ─── Filtered Enquiries for Indicator (2) Card Grid ───────────────────────
    const filteredCardsEnquiries = useMemo(() => {
        return enquiries.filter(e => {
            const yr = new Date(e.enquiry_date || e.created_at || new Date()).getFullYear().toString();
            const matchYear = cardYearFilter === 'All' || yr === cardYearFilter;
            const matchStatus = cardStatusFilter === 'All' || e.status === cardStatusFilter;
            const term = (cardSearch || dashSearch || '').trim().toLowerCase();
            const matchSearch = !term ||
                (e.enquiry_no || '').toLowerCase().includes(term) ||
                (e.customer?.name || '').toLowerCase().includes(term) ||
                (e.customer_ref || '').toLowerCase().includes(term) ||
                (stripHtml(e.description) || '').toLowerCase().includes(term) ||
                (e.supplier_quotes || []).some(sq => (sq.supplier?.name || '').toLowerCase().includes(term)) ||
                (e.workflow_documents || []).some(wd => (wd.document_no || '').toLowerCase().includes(term));
            return matchYear && matchStatus && matchSearch;
        });
    }, [enquiries, cardYearFilter, cardStatusFilter, cardSearch, dashSearch]);

    // ─── Handler: Update enquiry Drive folder in local state ─────────────────
    const handleFolderProvisioned = (enquiryId, folderId) => {
        setEnquiries(prev => prev.map(e => e.id === enquiryId ? { ...e, gdrive_folder_id: folderId } : e));
        if (drivePanel.enquiry?.id === enquiryId) {
            setDrivePanel(prev => ({ ...prev, enquiry: { ...prev.enquiry, gdrive_folder_id: folderId } }));
        }
    };

    // ─── Handler: Open Drive folder in new tab or provision if missing ───────
    const openDriveFolder = async (enquiry) => {
        if (enquiry.gdrive_folder_id) {
            window.open(`https://drive.google.com/drive/folders/${enquiry.gdrive_folder_id}`, '_blank', 'noopener,noreferrer');
            return;
        }
        if (!window.confirm(`No Google Drive folder linked for ${enquiry.enquiry_no}. Would you like to provision standard subfolders now?`)) return;

        if (!isTokenValid()) {
            if (window.confirm('Google connection required. Connect now?')) {
                sessionStorage.setItem('google_auth_return_url', window.location.pathname);
                connectGoogleAPI();
            }
            return;
        }

        const accessToken = localStorage.getItem('google_access_token');
        const celronRootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
        if (!celronRootId) { toast.error('Google Drive Root Folder not configured in Settings'); return; }

        const tId = toast.loading(`Creating Drive folders for ${enquiry.enquiry_no}...`);
        try {
            const res = await ensureEnquiryFolderAndSubfolders(accessToken, celronRootId, enquiry, true);
            setEnquiries(prev => prev.map(e => e.id === enquiry.id ? { ...e, gdrive_folder_id: res.enqFolderId } : e));
            toast.dismiss(tId);
            toast.success('Folder & standard subfolders created!');
            window.open(res.webViewLink, '_blank', 'noopener,noreferrer');
        } catch (err) {
            toast.dismiss(tId);
            toast.error('Provisioning failed: ' + err.message);
        }
    };

    // ─── Open New Enquiry & Folder Modal ──────────────────────────────────────
    const handleOpenNewFolderModal = async () => {
        let nextNo = 'ENQ-' + new Date().getFullYear().toString().slice(2) + '01-0001';
        try {
            if (profile?.company_id) {
                nextNo = await generateEnquiryNo(profile.company_id);
            }
        } catch (err) {
            console.warn('Could not auto-generate enquiry number:', err);
        }
        setNewFolderForm({
            enquiryNo: nextNo,
            customerId: '',
            customerName: '',
            isNewCustomer: false,
            customerEmail: '',
            customerPhone: '',
            customerCountry: 'Singapore',
            customerAddress: '',
            customerWeblink: '',
            customerNotes: '',
            contactPersonName: '',
            contactPersonEmail: '',
            contactPersonPhone: '',
            description: '',
            customerRef: '',
            autoCreateDrive: true,
        });
        setCustomerSearchTerm('');
        setCustomerDropdownOpen(false);
        syncAllPartners(false);
        setShowNewFolderModal(true);
    };

    // ─── Create New Enquiry & Provision Drive Folders ─────────────────────────
    const handleCreateNewFolder = async (e) => {
        e?.preventDefault?.();
        if (!profile?.company_id) {
            toast.error('Company ID not found in user profile');
            return;
        }
        if (!newFolderForm.enquiryNo.trim()) {
            toast.error('Please enter an Enquiry Number');
            return;
        }

        const effectiveCustName = newFolderForm.isNewCustomer 
            ? newFolderForm.customerName.trim() 
            : (allPartners.find(p => p.id === newFolderForm.customerId)?.name || newFolderForm.customerName.trim() || 'Walk-in');

        setCreatingFolder(true);
        const toastId = toast.loading(`Creating enquiry ${newFolderForm.enquiryNo}...`);

        try {
            let partnerId = newFolderForm.customerId || null;
            let primaryContactId = null;

            // If partner was selected from existing job/enquiry harvest, ensure database UUID
            if (partnerId && (partnerId.startsWith('job-cust-') || partnerId.startsWith('enq-cust-'))) {
                try {
                    const { data: dbPartner } = await supabase
                        .from('partners')
                        .select('id, name')
                        .ilike('name', effectiveCustName)
                        .maybeSingle();
                    if (dbPartner?.id) {
                        partnerId = dbPartner.id;
                    } else {
                        const { data: newP } = await supabase
                            .from('partners')
                            .insert([{
                                name: effectiveCustName,
                                company_id: profile.company_id,
                                types: ['Customer'],
                                country: 'Singapore',
                                status: 'active'
                            }])
                            .select('id, name')
                            .single();
                        if (newP?.id) partnerId = newP.id;
                    }
                } catch (e) {
                    console.warn('Could not auto-link harvested partner:', e);
                }
            }

            if (newFolderForm.isNewCustomer && effectiveCustName && effectiveCustName !== 'Walk-in') {
                try {
                    // Check if a partner with this name already exists in memory or DB
                    const existingPartner = allPartners.find(
                        p => p.name?.trim().toLowerCase() === effectiveCustName.toLowerCase()
                    );

                    if (existingPartner) {
                        partnerId = existingPartner.id;
                        // Ensure partner has 'Customer' type added if missing + fill in missing info if user provided it
                        const curTypes = Array.isArray(existingPartner.types) ? existingPartner.types : [];
                        const updatePayload = { id: existingPartner.id };
                        let hasUpdates = false;

                        if (!curTypes.some(t => t?.toLowerCase() === 'customer')) {
                            updatePayload.types = [...curTypes, 'Customer'];
                            hasUpdates = true;
                        }
                        if (newFolderForm.customerEmail?.trim() && !existingPartner.email1) {
                            updatePayload.email1 = newFolderForm.customerEmail.trim();
                            hasUpdates = true;
                        }
                        if (newFolderForm.customerPhone?.trim() && !existingPartner.phone1) {
                            updatePayload.phone1 = newFolderForm.customerPhone.trim();
                            hasUpdates = true;
                        }
                        if (newFolderForm.customerCountry && !existingPartner.country) {
                            updatePayload.country = newFolderForm.customerCountry;
                            hasUpdates = true;
                        }
                        if (newFolderForm.customerAddress?.trim() && !existingPartner.address) {
                            updatePayload.address = newFolderForm.customerAddress.trim();
                            hasUpdates = true;
                        }
                        if (newFolderForm.customerWeblink?.trim() && !existingPartner.weblink) {
                            updatePayload.weblink = newFolderForm.customerWeblink.trim();
                            hasUpdates = true;
                        }

                        if (hasUpdates) {
                            await savePartner(updatePayload);
                            setAllPartners(prev => prev.map(p => p.id === existingPartner.id ? { ...p, ...updatePayload } : p));
                        }
                    } else {
                        // Persist clean new record into 'partners' table with ALL elaborated details
                        const createdPartner = await savePartner({
                            company_id: profile.company_id,
                            name: effectiveCustName,
                            email1: newFolderForm.customerEmail.trim() || null,
                            phone1: newFolderForm.customerPhone.trim() || null,
                            country: newFolderForm.customerCountry || null,
                            address: newFolderForm.customerAddress.trim() || null,
                            weblink: newFolderForm.customerWeblink.trim() || null,
                            info: newFolderForm.customerNotes.trim() || null,
                            types: ['Customer'],
                            status: 'active'
                        });

                        if (createdPartner?.id) {
                            partnerId = createdPartner.id;
                            setAllPartners(prev => [createdPartner, ...prev]);

                            // Optional: If primary contact person was entered, save to contacts table
                            if (newFolderForm.contactPersonName.trim()) {
                                try {
                                    const { data: createdContact } = await supabase
                                        .from('contacts')
                                        .insert([{
                                            company_id: profile.company_id,
                                            partnerId: createdPartner.id,
                                            name: newFolderForm.contactPersonName.trim(),
                                            email: newFolderForm.contactPersonEmail.trim() || null,
                                            handphone: newFolderForm.contactPersonPhone.trim() || null,
                                        }])
                                        .select()
                                        .single();
                                    if (createdContact?.id) {
                                        primaryContactId = createdContact.id;
                                    }
                                } catch (cErr) {
                                    console.warn('[NewEnquiry] Contact creation note:', cErr);
                                }
                            }

                            toast.success(`Saved new customer "${effectiveCustName}" with full details into Partners directory!`);
                        }
                    }
                } catch (pErr) {
                    console.error('[NewEnquiry] Customer partner creation note:', pErr);
                    toast.error(`Partner directory sync note: ${pErr.message || pErr}`);
                }
            } else if (!newFolderForm.isNewCustomer && partnerId) {
                // If existing partner selected, ensure 'Customer' type is marked if not present
                const existingPartner = allPartners.find(p => p.id === partnerId);
                if (existingPartner) {
                    const curTypes = Array.isArray(existingPartner.types) ? existingPartner.types : [];
                    if (!curTypes.some(t => t?.toLowerCase() === 'customer')) {
                        const updatedTypes = [...curTypes, 'Customer'];
                        savePartner({ id: existingPartner.id, types: updatedTypes }).then(() => {
                            setAllPartners(prev => prev.map(p => p.id === existingPartner.id ? { ...p, types: updatedTypes } : p));
                        }).catch(e => console.warn('Partner type update note:', e));
                    }
                }
            }

            // 1. Insert enquiry into customer_enquiries
            const newRecord = {
                company_id: profile.company_id,
                enquiry_no: newFolderForm.enquiryNo.trim(),
                customer_id: partnerId,
                contact_id: primaryContactId,
                customer_name: effectiveCustName,
                description: newFolderForm.description.trim() || 'New Customer Enquiry',
                customer_ref: newFolderForm.customerRef.trim() || '',
                status: 'New',
                enquiry_date: new Date().toISOString().split('T')[0],
            };

            const { data: createdEnq, error: enqError } = await supabase
                .from('customer_enquiries')
                .insert([newRecord])
                .select(`
                    *,
                    customer:partners(id, name, email:email1, country),
                    contact:contacts(id, name, email, handphone),
                    supplier_quotes(id, status, quote_amount, supplier:partners(id, name, email:email1)),
                    workflow_documents(id, document_type, document_no, status, total_amount)
                `)
                .single();

            if (enqError) throw enqError;

            let finalEnq = createdEnq;

            // 2. Provision Google Drive folder & 7 subfolders if requested
            if (newFolderForm.autoCreateDrive) {
                const token = getStoredToken();
                const rootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
                
                if (token && rootId) {
                    toast.loading(`Provisioning Google Drive folder & 7 standard subfolders...`, { id: toastId });
                    try {
                        const driveRes = await ensureEnquiryFolderAndSubfolders(token, rootId, createdEnq, true);
                        finalEnq = {
                            ...createdEnq,
                            gdrive_folder_id: driveRes.enqFolderId,
                            gdrive_file_link: driveRes.webViewLink,
                        };
                    } catch (driveErr) {
                        console.warn('[NewEnquiry] Drive folder creation warning:', driveErr);
                        toast.error(`Drive folder creation error: ${driveErr.message}. Enquiry record was created!`, { duration: 5000 });
                    }
                } else if (!token) {
                    toast.error('Google account not connected. Folder can be provisioned after connecting Drive.', { duration: 5000 });
                }
            }

            // 3. Update state
            setEnquiries(prev => [finalEnq, ...prev]);
            setUploadTargetEnquiryId(finalEnq.id);
            setShowSmartUpload(true);
            setShowNewFolderModal(false);

            toast.dismiss(toastId);
            toast.success(`Enquiry ${finalEnq.enquiry_no} initialized! Target folder is ready.`);
        } catch (err) {
            console.error('[NewEnquiry] Error:', err);
            toast.dismiss(toastId);
            toast.error(`Failed to create enquiry: ${err.message || 'Unknown error'}`);
        } finally {
            setCreatingFolder(false);
        }
    };

    // ─── Subfolder Resolver for Smart Upload ─────────────────────────────────
    const resolveEnquirySubfolder = (suggestions, file) => {
        const catId = suggestions?.docCategory?.id || '';
        const name = (file?.name || '').toLowerCase();

        if (catId === 'customer_enquiry' || name.includes('rfq') || name.includes('enquiry') || name.includes('inquiry')) {
            return '01_ENQUIRY_PO_RFQ';
        }
        if (catId === 'customer_quote' || name.includes('quotation') || name.includes('quote') || name.includes('qtn')) {
            return '02_CUSTOMER_QUOTES';
        }
        if (catId === 'supplier_po' || name.includes('spo') || name.includes('vendor') || name.includes('supplier')) {
            return '03_SUPPLIER_QUOTES_PO';
        }
        if (catId === 'delivery_order' || name.includes('do') || name.includes('invoice') || name.includes('inv') || name.includes('delivery')) {
            return '04_DELIVERY_INVOICE';
        }
        if (file?.type?.startsWith('image/') || catId === 'photo' || name.includes('photo') || name.includes('img') || name.includes('pic')) {
            return 'Photos & Gallery';
        }
        if (name.includes('bill') || name.includes('receipt') || name.includes('expense')) {
            return 'SupplierBills&Expenses';
        }
        if (suggestions?.targetSubfolder && suggestions.targetSubfolder !== 'ROOT') {
            return suggestions.targetSubfolder;
        }
        return '01_ENQUIRY_PO_RFQ';
    };

    // ─── Smart Upload File Handler ───────────────────────────────────────────
    const handleSmartUploadFile = async (file, suggestions) => {
        if (!file) return;

        let targetEnq = activeUploadEnquiry;
        if (!targetEnq) {
            toast.error('No target Enquiry selected. Please initialize an Enquiry folder first.');
            handleOpenNewFolderModal();
            return;
        }

        if (!isTokenValid()) {
            if (window.confirm('Google Drive connection required to upload documents. Connect now?')) {
                sessionStorage.setItem('google_auth_return_url', window.location.pathname);
                connectGoogleAPI();
            }
            return;
        }

        const accessToken = getStoredToken();
        const celronRootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
        if (!celronRootId) {
            toast.error('Google Drive Root Folder not configured in Settings');
            return;
        }

        const toastId = toast.loading(`Preparing upload for ${file.name}...`);
        try {
            // 1. Ensure Enquiry folder & 7 subfolders exist
            let enqFolderId = targetEnq.gdrive_folder_id;
            if (!enqFolderId) {
                toast.loading(`Creating Google Drive folder for ${targetEnq.enquiry_no}...`, { id: toastId });
                const provResult = await ensureEnquiryFolderAndSubfolders(accessToken, celronRootId, targetEnq, true);
                enqFolderId = provResult.enqFolderId;
                handleFolderProvisioned(targetEnq.id, enqFolderId);
            }

            // 2. Resolve target subfolder inside the enquiry
            const targetSubName = resolveEnquirySubfolder(suggestions, file);
            toast.loading(`Routing to subfolder "${targetSubName}"...`, { id: toastId });
            const targetSubfolderId = await getOrCreateFolder(accessToken, targetSubName, enqFolderId);

            // 3. Upload file to Google Drive
            toast.loading(`Uploading ${file.name} to Drive...`, { id: toastId });
            const uploadRes = await uploadFileToDrive(accessToken, file, {
                folderId: targetSubfolderId,
                title: file.name,
            });

            toast.dismiss(toastId);
            toast.success(
                (t) => (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <span style={{ fontWeight: 800, color: '#166534' }}>
                            ✓ Uploaded to {targetSubName}!
                        </span>
                        <span style={{ fontSize: '0.74rem', color: '#475569' }}>{file.name}</span>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '2px', alignItems: 'center' }}>
                            <button
                                onClick={() => { setGatewayViewMode('viewer'); setShowSmartUpload(true); toast.dismiss(t.id); }}
                                style={{
                                    background: '#059669', color: '#ffffff', border: 'none',
                                    borderRadius: '6px', padding: '3px 9px', fontSize: '0.72rem',
                                    fontWeight: 700, cursor: 'pointer'
                                }}
                            >
                                Open in Tree Viewer 👁
                            </button>
                            {uploadRes?.webViewLink && (
                                <a
                                    href={uploadRes.webViewLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#2563eb', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'underline' }}
                                >
                                    Drive ↗
                                </a>
                            )}
                        </div>
                    </div>
                ),
                { duration: 8000 }
            );
        } catch (err) {
            console.error('[HubPro] Upload error:', err);
            toast.dismiss(toastId);
            toast.error(`Upload failed: ${err.message || 'Unknown error'}`);
        }
    };

    // ─── Open checking facility modal (Image 5) ───────────────────────────────
    const handleOpenCheckingFacility = async (enquiry) => {
        let enq = enquiry || activeUploadEnquiry || enquiries[0];
        if (!enq) {
            toast.error('No enquiry available. Please initialize a New Enquiry Folder first!');
            handleOpenNewFolderModal();
            return;
        }

        if (!enq.gdrive_folder_id) {
            if (!isTokenValid()) {
                if (window.confirm('Google connection required to view Drive repository. Connect now?')) {
                    sessionStorage.setItem('google_auth_return_url', window.location.pathname);
                    connectGoogleAPI();
                }
                return;
            }
            const accessToken = localStorage.getItem('google_access_token');
            const celronRootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
            if (!celronRootId) {
                toast.error('Google Drive Root Folder not configured in Settings.');
                return;
            }
            const tId = toast.loading(`Provisioning Drive folders for ${enq.enquiry_no}...`);
            try {
                const res = await ensureEnquiryFolderAndSubfolders(accessToken, celronRootId, enq);
                enq = { ...enq, gdrive_folder_id: res.enqFolderId };
                setEnquiries(prev => prev.map(e => e.id === enq.id ? enq : e));
                toast.dismiss(tId);
                toast.success('Drive folder & standard subfolders created!');
            } catch (err) {
                toast.dismiss(tId);
                toast.error('Folder provisioning failed: ' + err.message);
                return;
            }
        }

        setCheckingModal({ isOpen: true, enquiry: enq });
    };

    // ─── Open Root Drive Folder in new tab ────────────────────────────────────
    const handleOpenRootDrive = () => {
        const rootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
        if (rootId) {
            window.open(rootId.includes('http') ? rootId : `https://drive.google.com/drive/folders/${rootId}`, '_blank');
        } else {
            toast.error('Drive root folder not configured in Settings');
        }
    };

    // ─── Duplicate Enquiry ───────────────────────────────────────────────────
    const handleDuplicateEnquiry = async (enq) => {
        try {
            const newRecord = await duplicateEnquiry(enq, profile.company_id);
            toast.success(`Duplicated as ${newRecord.enquiry_no}!`);
            await loadAll();
            navigate(`/workflows/enquiry/${newRecord.id}`);
        } catch (err) {
            console.error('Duplication error:', err);
            toast.error('Duplicate failed: ' + err.message);
        }
    };

    // ─── Delete Enquiry ──────────────────────────────────────────────────────
    const handleDeleteEnquiry = async (enq) => {
        if (!window.confirm(`Are you sure you want to delete ${enq.enquiry_no}? This cannot be undone.`)) return;
        try {
            const { error } = await supabase.from('customer_enquiries').delete().eq('id', enq.id);
            if (error) throw error;
            toast.success('Enquiry deleted successfully.');
            loadAll();
        } catch (err) {
            toast.error('Delete failed: ' + err.message);
        }
    };

    // ─── Quote2Cust and Order2Supplier Handlers ──────────────────────────────
    const handleQuote2Cust = (enq) => {
        navigate(`/quotations?create=1&enquiry_id=${enq.id}&enquiry_no=${enq.enquiry_no}`);
    };

    const handleOrder2Supplier = (enq) => {
        navigate(`/purchase-orders?create=1&enquiry_id=${enq.id}&enquiry_no=${enq.enquiry_no}`);
    };

    // ─── Handler: Save new supplier from inline form ──────────────────────────
    const handleSaveNewSupplier = async () => {
        if (!addSupplierForm?.name?.trim()) { toast.error('Supplier name is required'); return; }
        setSavingSupplier(true);
        try {
            const { data, isNew } = await upsertSupplierFromSearch(addSupplierForm, profile.company_id);
            toast.success(isNew ? `${data.name} added as supplier` : `${data.name} already exists — updated`);
            setSuppliers(prev => {
                const exists = prev.find(p => p.id === data.id);
                return exists ? prev.map(p => p.id === data.id ? { ...p, ...data } : p) : [data, ...prev];
            });
            setAddSupplierForm(null);
        } catch (err) {
            toast.error('Failed to save supplier: ' + err.message);
        } finally {
            setSavingSupplier(false);
        }
    };

    // ─── Navigate to enquiry details ──────────────────────────────────────────
    const goToEnquiry = (enquiry, tab = '') => {
        navigate(tab ? `/workflows/enquiry/${enquiry.id}?tab=${tab}` : `/workflows/enquiry/${enquiry.id}`);
    };

    // ─── Navigate to job eagle view ───────────────────────────────────────────
    const goToJob = (job) => navigate(`/workflows/eagle/${job.id}`);

    // ─── Render: Loading state ────────────────────────────────────────────────
    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', flexDirection: 'column', gap: '12px' }}>
                <Loader2 size={36} color="#6366f1" className="animate-spin" />
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#64748b' }}>Loading Supplier Hub Pro...</span>
            </div>
        );
    }

    // =========================================================================
    // RENDER
    // =========================================================================
    return (
        <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'Inter, system-ui, sans-serif' }}>
            <style>{`
                .enq-quick-links {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 5px;
                    margin-top: 12px;
                }
                .enq-ql-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 5px;
                    padding: 7px 6px;
                    border-radius: 8px;
                    font-size: 0.72rem;
                    font-weight: 700;
                    border: 1px solid transparent;
                    cursor: pointer;
                    transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
                    white-space: nowrap;
                }
                .enq-ql-btn:hover { transform: translateY(-1px); }
                .enq-ql-lines  { background: #eef2ff; color: #4f46e5; border-color: #c7d2fe; }
                .enq-ql-lines:hover { background: #e0e7ff; }
                .enq-ql-drive  { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
                .enq-ql-drive:hover { background: #dbeafe; }
                .enq-ql-float  { background: #faf5ff; color: #7c3aed; border-color: #ddd6fe; }
                .enq-ql-float:hover { background: #ede9fe; }
                .enq-ql-quotes { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
                .enq-ql-quotes:hover { background: #dcfce7; }
                .enq-ql-q2c    { background: #fffbeb; color: #b45309; border-color: #fde68a; }
                .enq-ql-q2c:hover { background: #fef3c7; }
                .enq-ql-po     { background: #fff1f2; color: #be123c; border-color: #fecdd3; }
                .enq-ql-po:hover { background: #ffe4e6; }
                .enq-ql-workflow { background: #eef2ff; color: #4f46e5; border-color: #c7d2fe; }
                .enq-ql-workflow:hover { background: #e0e7ff; }
            `}</style>

            {/* ─── Page Header ─── */}
            <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #312e81 100%)',
                padding: '20px 32px 0', borderBottom: '1px solid #334155',
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                            <Zap size={22} color="#f59e0b" />
                            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                                Unified Supplier Hub <span style={{ color: '#f59e0b' }}>Pro</span>
                            </h1>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                            Enquiry → Float RFQ → Compare → Quote2Customer → PO2Supplier → Job Control → <span style={{ color: '#38bdf8', fontWeight: 700 }}>🦅 Eagle View</span>
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            onClick={() => navigate('/workflows/eagle-control')}
                            style={{
                                background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                                color: '#ffffff', border: 'none', borderRadius: '10px', padding: '8px 14px',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                fontSize: '0.78rem', fontWeight: 800, transition: 'all 0.15s',
                                boxShadow: '0 2px 8px rgba(79,70,229,0.35)'
                            }}
                        >
                            🦅 Eagle Control Center
                        </button>
                        <button
                            onClick={loadAll}
                            style={{
                                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                                color: '#94a3b8', borderRadius: '10px', padding: '8px 14px',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                fontSize: '0.78rem', fontWeight: 700, transition: 'all 0.15s',
                            }}
                            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                        >
                            <RefreshCcw size={14} /> Refresh
                        </button>
                    </div>
                </div>

                {/* Tab Bar */}
                <div style={{ display: 'flex', gap: '2px' }}>
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '7px',
                                padding: '10px 20px', border: 'none', cursor: 'pointer',
                                borderRadius: '10px 10px 0 0', fontWeight: 700, fontSize: '0.82rem',
                                transition: 'all 0.15s',
                                background: activeTab === tab.id ? '#f1f5f9' : 'transparent',
                                color: activeTab === tab.id ? tab.color : '#94a3b8',
                                borderBottom: activeTab === tab.id ? `3px solid ${tab.color}` : '3px solid transparent',
                            }}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ─── Tab Content ─── */}
            <div style={{ padding: '24px 32px', maxWidth: '1600px' }}>

                {/* ═══════════════════════════════════════════════════════════════
                    TAB 1 — DASHBOARD
                ═══════════════════════════════════════════════════════════════ */}
                {activeTab === 'dashboard' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                        {/* KPI Cards */}
                        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                            <KpiCard label="Draft Enquiries" value={kpis.draft}   icon={<FileText size={18} />}      color="#6366f1" bg="#eef2ff"
                                active={kpiFilter === 'draft'}   onClick={() => { setKpiFilter(kpiFilter === 'draft'   ? null : 'draft');   setDashTab('all'); }} />
                            <KpiCard label="RFQ Floated"     value={kpis.floated} icon={<Send size={18} />}          color="#f59e0b" bg="#fffbeb"
                                active={kpiFilter === 'floated'} onClick={() => { setKpiFilter(kpiFilter === 'floated' ? null : 'floated'); setDashTab('all'); }} />
                            <KpiCard label="Quotes Received" value={kpis.quoted}  icon={<Inbox size={18} />}         color="#10b981" bg="#ecfdf5"
                                active={kpiFilter === 'quoted'}  onClick={() => { setKpiFilter(kpiFilter === 'quoted'  ? null : 'quoted');  setDashTab('all'); }} />
                            <KpiCard label="Orders Placed"   value={kpis.ordered} icon={<CheckCircle2 size={18} />}  color="#8b5cf6" bg="#f5f3ff"
                                active={kpiFilter === 'ordered'} onClick={() => { setKpiFilter(kpiFilter === 'ordered' ? null : 'ordered'); setDashTab('all'); }} />
                            {kpis.overdue > 0 && (
                                <KpiCard label="Overdue" value={kpis.overdue} icon={<AlertCircle size={18} />} color="#ef4444" bg="#fef2f2"
                                    active={false} onClick={() => {}} />
                            )}
                        </div>

                        {/* ─── INDICATOR (1): SMART DOCUMENT UPLOAD & LIVE CHECKING GATEWAY ─── */}
                        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                            {/* Gateway Header Bar */}
                            <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }}>
                                        <Cloud size={20} />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                                                Smart Document Upload &amp; Live Drive Checking Gateway
                                            </h3>
                                            <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: '#e0e7ff', color: '#4338ca' }}>
                                                BILATERAL DRIVE
                                            </span>
                                        </div>
                                        <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                                            Upload via Files, Mobile QR, WhatsApp chat with auto-subfolder routing &amp; live document inspection
                                        </p>
                                    </div>
                                </div>

                                {/* Controls: Target Selector & Action Buttons */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    {/* Target Enquiry Select */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '5px 10px' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>Target ENQ:</span>
                                        <select
                                            value={activeUploadEnquiry?.id || ''}
                                            onChange={e => {
                                                if (e.target.value === '__NEW__') {
                                                    handleOpenNewFolderModal();
                                                } else {
                                                    setUploadTargetEnquiryId(e.target.value);
                                                }
                                            }}
                                            style={{ border: 'none', background: 'transparent', fontSize: '0.78rem', fontWeight: 800, color: '#4338ca', outline: 'none', cursor: 'pointer', maxWidth: '240px' }}
                                        >
                                            {enquiries.length === 0 && <option value="">No Enquiries Available (Click + New Folder)</option>}
                                            {enquiries.map(enq => (
                                                <option key={enq.id} value={enq.id}>
                                                    {enq.enquiry_no} - {enq.customer?.name || 'Walk-in'}
                                                </option>
                                            ))}
                                            <option value="__NEW__" style={{ fontWeight: 800, color: '#4f46e5' }}>
                                                ➕ Initialize New Enquiry Folder...
                                            </option>
                                        </select>
                                    </div>

                                    {/* Quick New Enquiry / New Folder Initializer */}
                                    <button
                                        onClick={handleOpenNewFolderModal}
                                        style={{
                                            background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                                            color: '#ffffff',
                                            border: 'none',
                                            borderRadius: '8px',
                                            padding: '7px 12px',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            boxShadow: '0 2px 6px rgba(99,102,241,0.25)',
                                            transition: 'all 0.15s',
                                        }}
                                        title="Create a new Enquiry record and automatically provision its bilateral Google Drive folder & 7 standard subfolders"
                                    >
                                        <Plus size={14} /> New Folder
                                    </button>

                                    {/* View Switcher: Uploader vs Tree Viewer */}
                                    <div style={{ display: 'flex', background: '#e2e8f0', padding: '3px', borderRadius: '8px', gap: '3px' }}>
                                        <button
                                            onClick={() => { setGatewayViewMode('upload'); setShowSmartUpload(true); }}
                                            style={{
                                                padding: '5px 12px', borderRadius: '6px', border: 'none',
                                                fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer',
                                                background: gatewayViewMode === 'upload' ? '#ffffff' : 'transparent',
                                                color: gatewayViewMode === 'upload' ? '#4f46e5' : '#64748b',
                                                boxShadow: gatewayViewMode === 'upload' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s'
                                            }}
                                        >
                                            <Upload size={13} /> Uploader
                                        </button>
                                        <button
                                            onClick={() => { setGatewayViewMode('viewer'); setShowSmartUpload(true); }}
                                            style={{
                                                padding: '5px 12px', borderRadius: '6px', border: 'none',
                                                fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer',
                                                background: gatewayViewMode === 'viewer' ? '#ffffff' : 'transparent',
                                                color: gatewayViewMode === 'viewer' ? '#059669' : '#64748b',
                                                boxShadow: gatewayViewMode === 'viewer' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s'
                                            }}
                                        >
                                            <Eye size={13} /> 📁 Tree &amp; Viewer
                                        </button>
                                    </div>

                                    {/* Check Drive Repository Fullscreen Modal Button */}
                                    <button
                                        onClick={() => handleOpenCheckingFacility(activeUploadEnquiry)}
                                        style={{
                                            background: 'linear-gradient(135deg, #10b981, #059669)',
                                            color: '#ffffff',
                                            border: 'none',
                                            borderRadius: '8px',
                                            padding: '7px 14px',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            boxShadow: '0 2px 8px rgba(16,185,129,0.25)',
                                            transition: 'all 0.15s',
                                        }}
                                        title="Open live interactive Google Drive tree viewer and document inspection in full dialog"
                                    >
                                        <Eye size={14} /> Fullscreen Viewer
                                    </button>

                                    {/* Open Root Drive Button */}
                                    <button
                                        onClick={handleOpenRootDrive}
                                        style={{
                                            background: '#eff6ff',
                                            color: '#2563eb',
                                            border: '1px solid #bfdbfe',
                                            borderRadius: '8px',
                                            padding: '7px 12px',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                        }}
                                        title="Open Enquiries Root Google Drive Folder"
                                    >
                                        <FolderOpen size={14} /> Root Drive
                                    </button>

                                    {/* Toggle Panel */}
                                    <button
                                        onClick={() => setShowSmartUpload(prev => !prev)}
                                        style={{
                                            background: showSmartUpload ? '#eef2ff' : '#ffffff',
                                            color: '#4f46e5',
                                            border: '1px solid #c7d2fe',
                                            borderRadius: '8px',
                                            padding: '7px 12px',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                        }}
                                    >
                                        <Upload size={14} /> {showSmartUpload ? 'Hide Panel' : 'Show Panel'}
                                    </button>
                                </div>
                            </div>

                            {/* Embedded Gateway Body (Uploader OR Live Tree Viewer) */}
                            {showSmartUpload && (
                                <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                                    {gatewayViewMode === 'upload' ? (
                                        <SmartUploadPanel
                                            isOpen={true}
                                            embedded={true}
                                            activeFolderId={activeUploadEnquiry?.gdrive_folder_id || settings?.gdrive_celron_root_id || settings?.google_drive_folder_id}
                                            activeFolderName={activeUploadEnquiry ? `${activeUploadEnquiry.enquiry_no} - ${activeUploadEnquiry.customer?.name || 'Enquiry'}` : 'Enquiries Workspace'}
                                            runningEnquiryNo={activeUploadEnquiry?.enquiry_no || 'ENQ-WORKSPACE'}
                                            onSelect={handleSmartUploadFile}
                                            onClose={() => setShowSmartUpload(false)}
                                        />
                                    ) : (
                                        <div style={{ minHeight: '660px', overflow: 'hidden' }}>
                                            {activeUploadEnquiry?.gdrive_folder_id ? (
                                                <EagleDriveTreeViewer
                                                    jobFolderId={activeUploadEnquiry.gdrive_folder_id}
                                                    jobNo={activeUploadEnquiry.enquiry_no}
                                                    customerName={activeUploadEnquiry.customer?.name || ''}
                                                    companyId={profile?.company_id}
                                                />
                                            ) : (
                                                <div style={{ padding: '50px 20px', textAlign: 'center', background: '#ffffff', minHeight: '440px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
                                                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <FolderOpen size={30} />
                                                    </div>
                                                    <div>
                                                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                                                            {activeUploadEnquiry ? `No Google Drive Folder Linked for ${activeUploadEnquiry.enquiry_no}` : 'No Enquiry Selected'}
                                                        </h4>
                                                        <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#64748b', maxWidth: '440px' }}>
                                                            Provision the bilateral Google Drive folder with 7 standard subfolders to inspect files and view documents live in the tree.
                                                        </p>
                                                    </div>
                                                    {activeUploadEnquiry ? (
                                                        <button
                                                            onClick={() => openDriveFolder(activeUploadEnquiry)}
                                                            style={{
                                                                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#ffffff',
                                                                padding: '9px 18px', borderRadius: '8px', border: 'none', fontWeight: 700,
                                                                fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                                                boxShadow: '0 2px 8px rgba(37,99,235,0.3)'
                                                            }}
                                                        >
                                                            <Plus size={15} /> Provision Drive Folders Now
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={handleOpenNewFolderModal}
                                                            style={{
                                                                background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: '#ffffff',
                                                                padding: '9px 18px', borderRadius: '8px', border: 'none', fontWeight: 700,
                                                                fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                                                boxShadow: '0 2px 8px rgba(79,70,229,0.3)'
                                                            }}
                                                        >
                                                            <Plus size={15} /> ➕ Initialize New Enquiry Folder
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Search + Sub-tabs */}
                        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                {/* Sub-tabs */}
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    {DASH_TABS.map(dt => (
                                        <button key={dt.id} onClick={() => { setDashTab(dt.id); setKpiFilter(null); }}
                                            style={{
                                                padding: '6px 14px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700,
                                                cursor: 'pointer', border: 'none', transition: 'all 0.12s',
                                                background: dashTab === dt.id && !kpiFilter ? '#6366f1' : '#f1f5f9',
                                                color: dashTab === dt.id && !kpiFilter ? '#ffffff' : '#475569',
                                            }}
                                        >{dt.label}</button>
                                    ))}
                                </div>
                                {/* Search */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '7px 12px', flex: 1, minWidth: '200px' }}>
                                    <Search size={14} color="#94a3b8" />
                                    <input
                                        value={dashSearch}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setDashSearch(val);
                                            setCardSearch(val);
                                        }}
                                        placeholder="Search by ENQ No, customer, description..."
                                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', color: '#1e293b', flex: 1 }}
                                    />
                                    {dashSearch && (
                                        <button
                                            onClick={() => { setDashSearch(''); setCardSearch(''); }}
                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}
                                            title="Clear search"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                                <button onClick={() => navigate('/workflows/enquiry/new')} style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                                    background: '#6366f1', color: '#ffffff', border: 'none', borderRadius: '10px',
                                    fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                                }}>
                                    <Plus size={14} /> New Enquiry
                                </button>
                            </div>

                            {/* Enquiry Table */}
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            <th style={{ width: '56px', padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.05em' }} title="Single-select tickbox to set enquiry as the Target Upload Folder">
                                                Target
                                            </th>
                                            {['ENQ No', 'Customer', 'Description', 'Status', 'Due Date', 'Drive', '📅', 'Actions'].map(h => (
                                                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dashEnquiries.length === 0 && (
                                            <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '0.85rem' }}>No enquiries found</td></tr>
                                        )}
                                        {dashEnquiries.map(enq => {
                                            const sc = getStatusStyle(enq.status);
                                            const isOverdue = enq.due_date && new Date(enq.due_date) < new Date() && !['Closed', 'Cancelled', 'Job Created'].includes(enq.status);
                                            const isTargetSelected = activeUploadEnquiry?.id === enq.id;

                                            const handleSelectTarget = (e) => {
                                                if (e) e.stopPropagation();
                                                setUploadTargetEnquiryId(enq.id);
                                                setShowSmartUpload(true);
                                                toast.success(`Target saving folder set to ${enq.enquiry_no}`, { id: 'target-folder-switch', duration: 2500 });
                                            };

                                            return (
                                                <tr
                                                    key={enq.id}
                                                    onClick={handleSelectTarget}
                                                    style={{
                                                        borderBottom: '1px solid #f1f5f9',
                                                        cursor: 'pointer',
                                                        background: isTargetSelected ? '#eef2ff' : (isOverdue ? '#fff5f5' : 'transparent'),
                                                        boxShadow: isTargetSelected ? 'inset 4px 0 0 #4f46e5' : 'none',
                                                        transition: 'background 0.12s',
                                                    }}
                                                    onMouseOver={e => e.currentTarget.style.background = isTargetSelected ? '#e0e7ff' : '#f8faff'}
                                                    onMouseOut={e => e.currentTarget.style.background = isTargetSelected ? '#eef2ff' : (isOverdue ? '#fff5f5' : 'transparent')}
                                                >
                                                    {/* Target Tickbox Column */}
                                                    <td style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                                                        <label
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                cursor: 'pointer',
                                                                padding: '4px',
                                                                borderRadius: '6px',
                                                                background: isTargetSelected ? '#e0e7ff' : 'transparent',
                                                                transition: 'all 0.15s',
                                                            }}
                                                            title={isTargetSelected ? `Active Target Folder: ${enq.enquiry_no}` : `Click tickbox to set ${enq.enquiry_no} as Target Upload Folder`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={isTargetSelected}
                                                                onChange={handleSelectTarget}
                                                                style={{
                                                                    width: '18px',
                                                                    height: '18px',
                                                                    cursor: 'pointer',
                                                                    accentColor: '#4f46e5',
                                                                    margin: 0,
                                                                }}
                                                            />
                                                        </label>
                                                    </td>

                                                    {/* ENQ No */}
                                                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                            <span
                                                                onClick={(e) => { e.stopPropagation(); goToEnquiry(enq); }}
                                                                style={{ fontWeight: 800, color: '#4f46e5', fontSize: '0.78rem', textDecoration: 'underline', cursor: 'pointer' }}
                                                                title="Click to view/edit details"
                                                            >
                                                                {enq.enquiry_no || '—'}
                                                            </span>
                                                            {isTargetSelected && (
                                                                <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: '#4f46e5', color: '#ffffff', letterSpacing: '0.04em' }}>
                                                                    TARGET
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {/* Customer */}
                                                    <td style={{ padding: '10px 16px', maxWidth: '160px' }}>
                                                        <div style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {enq.customer?.name || 'Walk-in'}
                                                        </div>
                                                    </td>
                                                    {/* Description */}
                                                    <td style={{ padding: '10px 16px', maxWidth: '240px' }}>
                                                        <span style={{ color: '#64748b', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                            {stripHtml(enq.description) || <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>No description</span>}
                                                        </span>
                                                    </td>
                                                    {/* Status */}
                                                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                                                        <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                                                            {sc.label || enq.status}
                                                        </span>
                                                    </td>
                                                    {/* Due Date */}
                                                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', color: isOverdue ? '#ef4444' : '#475569', fontWeight: isOverdue ? 700 : 500 }}>
                                                        {fmtDate(enq.due_date)}
                                                    </td>
                                                    {/* Drive Badge */}
                                                    <td style={{ padding: '10px 16px' }}>
                                                        <DriveBadge enquiry={enq} onOpenFolder={openDriveFolder} />
                                                    </td>
                                                    {/* Calendar */}
                                                    <td style={{ padding: '10px 16px' }}>
                                                        <button
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                openCalendarModal({
                                                                    title: `[${enq.enquiry_no}] Follow-up Reminder`,
                                                                    date: enq.due_date || '',
                                                                    description: `Enquiry: ${enq.enquiry_no}\nCustomer: ${enq.customer?.name || 'Walk-in'}\nStatus: ${enq.status}\n\nOpen: ${window.location.origin}/workflows/enquiry/${enq.id}`,
                                                                    activityType: 'Enquiry Follow-up',
                                                                    enquiryNo: enq.enquiry_no,
                                                                });
                                                            }}
                                                            title="Set Google Calendar reminder"
                                                            style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '4px 6px', cursor: 'pointer', color: '#15803d' }}
                                                        >
                                                            <Calendar size={13} />
                                                        </button>
                                                    </td>
                                                    {/* Actions */}
                                                    <td style={{ padding: '10px 16px' }}>
                                                        <div style={{ display: 'flex', gap: '5px' }} onClick={e => e.stopPropagation()}>
                                                            <button onClick={() => goToEnquiry(enq)} title="View enquiry"
                                                                style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#2563eb', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                <Eye size={11} /> View
                                                            </button>
                                                            <button
                                                                onClick={() => { setRfqEnquiry(enq); setRfqStep(2); setActiveTab('float_rfq'); }}
                                                                title="Float RFQ for this enquiry"
                                                                style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#92400e', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                <Send size={11} /> RFQ
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {dashEnquiries.length > 0 && (
                                <div style={{ padding: '10px 20px', borderTop: '1px solid #f1f5f9', fontSize: '0.72rem', color: '#94a3b8' }}>
                                    Showing {dashEnquiries.length} of {enquiries.length} enquiries
                                </div>
                            )}
                        </div>

                        {/* ─── INDICATOR (2): RICH ENQUIRY CARDS GRID (IMAGES 2 & 3) ─── */}
                        <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Card Grid Header & Control Bar */}
                            <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                                {/* Left: Title & Year Filters */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <FileText size={18} />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#1e293b' }}>
                                                Customer Enquiries Card Explorer
                                            </h3>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                Detailed lifecycle cards with Supplier Activity, Document Pipeline &amp; Quick Entry
                                            </span>
                                        </div>
                                    </div>

                                    {/* Year Filter Pills */}
                                    <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '10px' }}>
                                        {availableYears.map(yr => (
                                            <button
                                                key={yr}
                                                onClick={() => setCardYearFilter(yr)}
                                                style={{
                                                    padding: '5px 12px',
                                                    borderRadius: '7px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 700,
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    background: cardYearFilter === yr ? '#ffffff' : 'transparent',
                                                    color: cardYearFilter === yr ? '#4f46e5' : '#64748b',
                                                    boxShadow: cardYearFilter === yr ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                                                    transition: 'all 0.12s'
                                                }}
                                            >
                                                {yr}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Right: Status Dropdown & Search */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    {/* Status Select */}
                                    <div style={{ position: 'relative' }}>
                                        <select
                                            value={cardStatusFilter}
                                            onChange={e => setCardStatusFilter(e.target.value)}
                                            style={{
                                                padding: '7px 28px 7px 12px',
                                                borderRadius: '10px',
                                                fontSize: '0.78rem',
                                                fontWeight: 700,
                                                border: '1px solid #e2e8f0',
                                                background: '#ffffff',
                                                color: '#334155',
                                                cursor: 'pointer',
                                                outline: 'none',
                                                appearance: 'none',
                                            }}
                                        >
                                            <option value="All">All Statuses</option>
                                            <option value="New">New Enquiry</option>
                                            <option value="RFQ Floated">RFQ Floated</option>
                                            <option value="Quote Sent">Quote Sent</option>
                                            <option value="Quoted">Quoted</option>
                                            <option value="Job Created">Job Created</option>
                                            <option value="Closed">Closed</option>
                                            <option value="Cancelled">Cancelled</option>
                                        </select>
                                        <ChevronDown size={14} color="#94a3b8" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                                    </div>

                                    {/* Search Input */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '6px 12px', minWidth: '200px' }}>
                                        <Search size={14} color="#94a3b8" />
                                        <input
                                            value={cardSearch || dashSearch}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setCardSearch(val);
                                                setDashSearch(val);
                                            }}
                                            placeholder="Search enquiries..."
                                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.78rem', color: '#1e293b', width: '100%' }}
                                        />
                                        {(cardSearch || dashSearch) && (
                                            <button
                                                onClick={() => { setCardSearch(''); setDashSearch(''); }}
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}
                                                title="Clear search"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>

                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700 }}>
                                        {filteredCardsEnquiries.length} card(s)
                                    </span>
                                </div>
                            </div>

                            {/* Cards Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                                {/* Empty State if search yields no cards */}
                                {filteredCardsEnquiries.length === 0 && (dashSearch || cardSearch) && (
                                    <div style={{
                                        padding: '24px',
                                        borderRadius: '18px',
                                        border: '1.5px dashed #cbd5e1',
                                        background: '#f8fafc',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        minHeight: '380px',
                                        textAlign: 'center'
                                    }}>
                                        <Search size={32} color="#94a3b8" style={{ marginBottom: '12px' }} />
                                        <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 700, color: '#475569' }}>
                                            No matching cards
                                        </h4>
                                        <p style={{ margin: '0 0 14px 0', fontSize: '0.82rem', color: '#94a3b8', maxWidth: '240px' }}>
                                            No customer enquiries match "{cardSearch || dashSearch}".
                                        </p>
                                        <button
                                            onClick={() => { setDashSearch(''); setCardSearch(''); }}
                                            style={{
                                                padding: '6px 16px',
                                                borderRadius: '8px',
                                                background: '#e0e7ff',
                                                color: '#4338ca',
                                                border: 'none',
                                                fontSize: '0.78rem',
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Clear Search
                                        </button>
                                    </div>
                                )}
                                {/* "+ New Customer Enquiry" dashed card */}
                                <div
                                    onClick={() => navigate('/workflows/enquiry/new')}
                                    style={{
                                        padding: '24px',
                                        borderRadius: '18px',
                                        border: '1.5px dashed #6366f1',
                                        background: 'rgba(99,102,241,0.02)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        minHeight: '380px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        textAlign: 'center'
                                    }}
                                    onMouseOver={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.06)'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
                                    onMouseOut={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.02)'; e.currentTarget.style.transform = 'none'; }}
                                >
                                    <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#eef2ff', border: '1.5px solid #c7d2fe', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px', transition: 'transform 0.2s' }}>
                                        <Plus size={26} />
                                    </div>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '6px' }}>New Customer Enquiry</h3>
                                    <p style={{ color: '#64748b', fontSize: '0.85rem', maxWidth: '180px' }}>Log a new enquiry and start the RFQ lifecycle.</p>
                                </div>

                                {/* Mapped Enquiry Cards */}
                                {filteredCardsEnquiries.map(enq => (
                                    <EnquiryCardPro
                                        key={enq.id}
                                        enq={enq}
                                        isTargetSelected={activeUploadEnquiry?.id === enq.id}
                                        onSelectTarget={(targetEnq) => {
                                            setUploadTargetEnquiryId(targetEnq.id);
                                            setShowSmartUpload(true);
                                            toast.success(`Target saving folder set to ${targetEnq.enquiry_no}`, { id: 'target-folder-switch', duration: 2500 });
                                        }}
                                        onOpen={(enq, tab) => goToEnquiry(enq, tab)}
                                        onDrive={openDriveFolder}
                                        onCheckingFacility={handleOpenCheckingFacility}
                                        onFloat={(enq) => { setRfqEnquiry(enq); setFastFloatOpen(true); }}
                                        onDelete={handleDeleteEnquiry}
                                        onDuplicate={handleDuplicateEnquiry}
                                        onQuote={handleQuote2Cust}
                                        onPO={handleOrder2Supplier}
                                        onOpenRootDrive={handleOpenRootDrive}
                                        onCalendar={(enq) => openCalendarModal({
                                            title: `[${enq.enquiry_no}] Follow-up Reminder`,
                                            date: enq.due_date || '',
                                            description: `Enquiry: ${enq.enquiry_no}\nCustomer: ${enq.customer?.name || 'Walk-in'}\nStatus: ${enq.status}\n\nOpen: ${window.location.origin}/workflows/enquiry/${enq.id}`,
                                            activityType: 'Enquiry Follow-up',
                                            enquiryNo: enq.enquiry_no,
                                        })}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════
                    TAB 2 — ENQUIRIES CARD GRID
                ═══════════════════════════════════════════════════════════════ */}
                {activeTab === 'enquiries' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                        {/* Toolbar */}
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 14px', flex: 1, minWidth: '200px' }}>
                                <Search size={15} color="#94a3b8" />
                                <input value={enqSearch} onChange={e => setEnqSearch(e.target.value)}
                                    placeholder="Search enquiries..."
                                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', flex: 1 }} />
                            </div>
                            {/* Status filter pills */}
                            {['All', 'New', 'RFQ Floated', 'Quoted', 'Job Created'].map(s => (
                                <button key={s} onClick={() => setEnqStatusFilter(s)} style={{
                                    padding: '7px 14px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700,
                                    cursor: 'pointer', border: enqStatusFilter === s ? '2px solid #6366f1' : '1.5px solid #e2e8f0',
                                    background: enqStatusFilter === s ? '#6366f1' : '#ffffff',
                                    color: enqStatusFilter === s ? '#ffffff' : '#64748b',
                                }}>{s}</button>
                            ))}
                            <button onClick={() => navigate('/workflows/enquiry/new')} style={{
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                                background: '#6366f1', color: '#ffffff', border: 'none', borderRadius: '10px',
                                fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                            }}>
                                <Plus size={14} /> New Enquiry
                            </button>
                        </div>

                        {/* Card Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                            {cardEnquiries.map(enq => {
                                const sc = getStatusStyle(enq.status);
                                const isOverdue = enq.due_date && new Date(enq.due_date) < new Date() && !['Closed', 'Cancelled', 'Job Created'].includes(enq.status);
                                const desc = stripHtml(enq.description).substring(0, 100);
                                const drivePanelActive = drivePanel.open && drivePanel.enquiry?.id === enq.id;

                                return (
                                    <div key={enq.id} style={{
                                        background: '#ffffff',
                                        border: `1.5px solid ${isOverdue ? '#fca5a5' : drivePanelActive ? '#6366f1' : '#e2e8f0'}`,
                                        borderLeft: `6px solid ${isOverdue ? '#ef4444' : '#6366f1'}`,
                                        borderRadius: '16px', padding: '18px',
                                        display: 'flex', flexDirection: 'column', gap: '10px',
                                        boxShadow: drivePanelActive ? '0 0 0 3px rgba(99,102,241,0.15)' : '0 2px 8px rgba(0,0,0,0.04)',
                                        transition: 'all 0.18s',
                                    }}>
                                        {/* Top row */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <label
                                                    onClick={e => e.stopPropagation()}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        padding: '2px 6px',
                                                        borderRadius: '6px',
                                                        background: activeUploadEnquiry?.id === enq.id ? '#e0e7ff' : '#f8fafc',
                                                        border: `1.5px solid ${activeUploadEnquiry?.id === enq.id ? '#6366f1' : '#cbd5e1'}`,
                                                        cursor: 'pointer',
                                                        fontSize: '0.68rem',
                                                        fontWeight: 800,
                                                        color: activeUploadEnquiry?.id === enq.id ? '#4338ca' : '#64748b',
                                                        userSelect: 'none',
                                                    }}
                                                    title={activeUploadEnquiry?.id === enq.id ? `Active Target Folder: ${enq.enquiry_no}` : `Click to set ${enq.enquiry_no} as Target Upload Folder`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={activeUploadEnquiry?.id === enq.id}
                                                        onChange={() => {
                                                            setUploadTargetEnquiryId(enq.id);
                                                            toast.success(`Target saving folder set to ${enq.enquiry_no}`, { id: 'target-folder-switch', duration: 2500 });
                                                        }}
                                                        style={{ width: '13px', height: '13px', cursor: 'pointer', accentColor: '#4f46e5', margin: 0 }}
                                                    />
                                                    <span>{activeUploadEnquiry?.id === enq.id ? 'TARGET' : 'SET TARGET'}</span>
                                                </label>
                                                <div onClick={() => goToEnquiry(enq)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#4f46e5', textTransform: 'uppercase' }}>ENQ</span>
                                                    <span style={{ fontWeight: 800, color: '#4f46e5', fontSize: '0.88rem', textDecoration: 'underline' }}>{enq.enquiry_no}</span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {isOverdue && <span style={{ fontSize: '0.65rem', fontWeight: 800, background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '6px' }}>Overdue</span>}
                                                <span style={{ fontSize: '0.7rem', fontWeight: 700, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, padding: '3px 9px', borderRadius: '6px' }}>{sc.label || enq.status}</span>
                                            </div>
                                        </div>

                                        {/* Customer */}
                                        <div>
                                            <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>{enq.customer?.name || 'Walk-in'}</div>
                                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>{desc || <em style={{ color: '#cbd5e1' }}>No description</em>}</div>
                                        </div>

                                        {/* Dates */}
                                        <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: '#64748b' }}>
                                            <span>📅 {fmtDate(enq.enquiry_date || enq.created_at)}</span>
                                            {enq.due_date && <span style={{ color: isOverdue ? '#ef4444' : '#64748b', fontWeight: isOverdue ? 700 : 400 }}>⏰ {fmtDate(enq.due_date)}</span>}
                                        </div>

                                        {/* Supplier quotes summary */}
                                        {enq.supplier_quotes?.length > 0 && (
                                            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '7px 10px', fontSize: '0.72rem', color: '#64748b', border: '1px solid #e2e8f0' }}>
                                                {enq.supplier_quotes.length} supplier{enq.supplier_quotes.length > 1 ? 's' : ''} contacted
                                                {enq.supplier_quotes.filter(q => q.status === 'Received').length > 0 && (
                                                    <span style={{ marginLeft: '8px', color: '#16a34a', fontWeight: 700 }}>
                                                        · {enq.supplier_quotes.filter(q => q.status === 'Received').length} quote(s) received
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* Action Row */}
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
                                            <button onClick={() => goToEnquiry(enq)} style={{ flex: 1, padding: '7px', background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                <Eye size={12} /> View
                                            </button>
                                            <button onClick={() => { setRfqEnquiry(enq); setRfqStep(2); setActiveTab('float_rfq'); }}
                                                style={{ flex: 1, padding: '7px', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                <Send size={12} /> Float RFQ
                                            </button>
                                            {/* Drive Button */}
                                            <button
                                                onClick={() => setDrivePanel({ open: true, enquiry: enq })}
                                                title="Open Drive panel"
                                                style={{
                                                    padding: '7px 10px', borderRadius: '8px', cursor: 'pointer',
                                                    background: drivePanelActive ? '#4f46e5' : '#f0f9ff',
                                                    color: drivePanelActive ? '#ffffff' : '#0284c7',
                                                    border: `1px solid ${drivePanelActive ? '#4f46e5' : '#bae6fd'}`,
                                                    display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 700,
                                                }}
                                            >
                                                <HardDrive size={12} /> Drive
                                            </button>
                                            {/* Calendar */}
                                            <button
                                                onClick={() => openCalendarModal({
                                                    title: `[${enq.enquiry_no}] Quote Follow-up`,
                                                    date: enq.due_date || '',
                                                    description: `Enquiry: ${enq.enquiry_no}\nCustomer: ${enq.customer?.name || 'Walk-in'}\nStatus: ${enq.status}`,
                                                    location: enq.vessel || enq.vessel_name || '',
                                                    activityType: 'Enquiry Follow-up',
                                                    enquiryNo: enq.enquiry_no,
                                                })}
                                                style={{ padding: '7px 9px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                                <Calendar size={13} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {cardEnquiries.length === 0 && (
                                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', color: '#94a3b8', fontSize: '0.9rem' }}>
                                    No enquiries found
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════
                    TAB 3 — FLOAT RFQ
                ═══════════════════════════════════════════════════════════════ */}
                {activeTab === 'float_rfq' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                        {/* Step progress indicator */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px 24px', overflow: 'hidden' }}>
                            {[
                                { n: 1, label: 'Select Enquiry'  },
                                { n: 2, label: 'Select Suppliers' },
                                { n: 3, label: 'Compose & Send'  },
                                { n: 4, label: 'Confirmation'    },
                            ].map((s, i) => (
                                <React.Fragment key={s.n}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{
                                            width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.8rem', fontWeight: 800, flexShrink: 0,
                                            background: rfqStep > s.n ? '#10b981' : rfqStep === s.n ? '#6366f1' : '#f1f5f9',
                                            color: rfqStep >= s.n ? '#ffffff' : '#94a3b8',
                                        }}>
                                            {rfqStep > s.n ? <Check size={14} /> : s.n}
                                        </div>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: rfqStep === s.n ? '#1e293b' : '#94a3b8', whiteSpace: 'nowrap' }}>{s.label}</span>
                                    </div>
                                    {i < 3 && <div style={{ flex: 1, height: '2px', background: rfqStep > s.n ? '#10b981' : '#e2e8f0', margin: '0 10px' }} />}
                                </React.Fragment>
                            ))}
                        </div>

                        {/* ── Step 1: Select Enquiry ── */}
                        {rfqStep === 1 && (
                            <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px' }}>
                                <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>Step 1 — Select an Enquiry</h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '9px 14px', marginBottom: '14px' }}>
                                    <Search size={15} color="#94a3b8" />
                                    <input value={rfqEnqSearch} onChange={e => setRfqEnqSearch(e.target.value)}
                                        placeholder="Search by ENQ No or customer name..."
                                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', flex: 1 }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '400px', overflowY: 'auto' }}>
                                    {enquiries
                                        .filter(e => !['Closed', 'Cancelled', 'Job Created'].includes(e.status))
                                        .filter(e => !rfqEnqSearch.trim() || (e.enquiry_no || '').toLowerCase().includes(rfqEnqSearch.toLowerCase()) || (e.customer?.name || '').toLowerCase().includes(rfqEnqSearch.toLowerCase()))
                                        .map(enq => {
                                            const sc = getStatusStyle(enq.status);
                                            const selected = rfqEnquiry?.id === enq.id;
                                            return (
                                                <div key={enq.id} onClick={() => setRfqEnquiry(enq)}
                                                    style={{
                                                        padding: '12px 16px', borderRadius: '10px', cursor: 'pointer',
                                                        border: `2px solid ${selected ? '#6366f1' : '#e2e8f0'}`,
                                                        background: selected ? '#eef2ff' : '#fafafa',
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                        transition: 'all 0.12s',
                                                    }}>
                                                    <div>
                                                        <span style={{ fontWeight: 800, color: '#4f46e5', fontSize: '0.82rem' }}>{enq.enquiry_no}</span>
                                                        <span style={{ marginLeft: '10px', color: '#475569', fontSize: '0.82rem' }}>{enq.customer?.name || 'Walk-in'}</span>
                                                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>{stripHtml(enq.description).substring(0, 80)}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, padding: '2px 8px', borderRadius: '6px' }}>{enq.status}</span>
                                                        {selected && <Check size={16} color="#6366f1" />}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                                    <button onClick={() => rfqEnquiry && setRfqStep(2)} disabled={!rfqEnquiry}
                                        style={{ padding: '10px 24px', background: rfqEnquiry ? '#6366f1' : '#e2e8f0', color: rfqEnquiry ? '#ffffff' : '#94a3b8', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: rfqEnquiry ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        Next: Select Suppliers <ArrowRight size={15} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── Step 2: Select Suppliers ── */}
                        {rfqStep === 2 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* Selected Enquiry banner */}
                                <div style={{ background: '#eef2ff', borderRadius: '12px', padding: '12px 16px', border: '1px solid #c7d2fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase' }}>Enquiry</span>
                                        <span style={{ marginLeft: '8px', fontWeight: 800, color: '#1e293b' }}>{rfqEnquiry?.enquiry_no}</span>
                                        <span style={{ marginLeft: '10px', color: '#64748b', fontSize: '0.82rem' }}>{rfqEnquiry?.customer?.name}</span>
                                    </div>
                                    <button onClick={() => setRfqStep(1)} style={{ background: 'none', border: 'none', color: '#6366f1', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}>Change</button>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '16px' }}>
                                    {/* Supplier List */}
                                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '10px', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 12px', flex: 1 }}>
                                                <Search size={14} color="#94a3b8" />
                                                <input value={rfqSupplierSearch} onChange={e => setRfqSupplierSearch(e.target.value)}
                                                    placeholder="Search suppliers by name, email, country..."
                                                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', flex: 1 }} />
                                            </div>
                                            <button onClick={() => setAddSupplierForm({ name: '', email: '', phone: '', website: '', country: '' })}
                                                style={{ padding: '7px 12px', background: '#ecfdf5', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <Plus size={13} /> Add New
                                            </button>
                                        </div>

                                        {rfqSelected.length > 0 && (
                                            <div style={{ padding: '8px 16px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', fontSize: '0.75rem', color: '#15803d', fontWeight: 700 }}>
                                                ✓ {rfqSelected.length} supplier{rfqSelected.length > 1 ? 's' : ''} selected
                                            </div>
                                        )}

                                        {/* Add Supplier Form */}
                                        {addSupplierForm && (
                                            <div style={{ padding: '16px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#15803d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    Add New Supplier
                                                    <button onClick={() => setAddSupplierForm(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={15} /></button>
                                                </div>
                                                {['name', 'email', 'phone', 'website', 'country'].map(field => (
                                                    <input key={field}
                                                        placeholder={field.charAt(0).toUpperCase() + field.slice(1) + (field === 'name' ? ' *' : '')}
                                                        value={addSupplierForm[field] || ''}
                                                        onChange={e => setAddSupplierForm(prev => ({ ...prev, [field]: e.target.value }))}
                                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }} />
                                                ))}
                                                <button onClick={handleSaveNewSupplier} disabled={savingSupplier}
                                                    style={{ padding: '8px', background: '#15803d', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                    {savingSupplier ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Supplier
                                                </button>
                                            </div>
                                        )}

                                        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                            {filteredSuppliers.map(s => {
                                                const isSelected = rfqSelected.includes(s.id);
                                                return (
                                                    <div key={s.id}
                                                        onClick={() => setRfqSelected(prev => isSelected ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                                                        style={{
                                                            padding: '11px 16px', borderBottom: '1px solid #f1f5f9',
                                                            display: 'flex', alignItems: 'center', gap: '12px',
                                                            cursor: 'pointer', background: isSelected ? '#f0fdf4' : 'transparent',
                                                            transition: 'background 0.12s',
                                                        }}
                                                        onMouseOver={e => !isSelected && (e.currentTarget.style.background = '#f8faff')}
                                                        onMouseOut={e => !isSelected && (e.currentTarget.style.background = 'transparent')}
                                                    >
                                                        <div style={{
                                                            width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0,
                                                            border: `2px solid ${isSelected ? '#10b981' : '#cbd5e1'}`,
                                                            background: isSelected ? '#10b981' : 'transparent',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            {isSelected && <Check size={12} color="#ffffff" />}
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{s.name}</div>
                                                            <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                                {s.email && <span><Mail size={10} style={{ verticalAlign: 'middle' }} /> {s.email}</span>}
                                                                {s.phone && <span><Phone size={10} style={{ verticalAlign: 'middle' }} /> {s.phone}</span>}
                                                                {s.country && <span>🌍 {s.country}</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Web Search Panel */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px' }}>
                                            <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1e293b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                                                <Globe size={15} color="#3b82f6" /> Online Supplier Search
                                            </div>
                                            <input value={rfqPartSearch} onChange={e => setRfqPartSearch(e.target.value)}
                                                placeholder="Part name (e.g. Electronic Governor)"
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.82rem', outline: 'none', marginBottom: '8px', boxSizing: 'border-box' }} />
                                            <input value={rfqPartNo} onChange={e => setRfqPartNo(e.target.value)}
                                                placeholder="Part No (optional)"
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.82rem', outline: 'none', marginBottom: '12px', boxSizing: 'border-box' }} />
                                            {webSearchLinks.length > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    {webSearchLinks.map(link => (
                                                        <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                                padding: '8px 12px', borderRadius: '8px', textDecoration: 'none',
                                                                background: '#f8fafc', border: '1px solid #e2e8f0',
                                                                fontSize: '0.78rem', fontWeight: 700, color: link.color,
                                                                transition: 'all 0.12s',
                                                            }}
                                                            onMouseOver={e => e.currentTarget.style.background = '#f0f4ff'}
                                                            onMouseOut={e => e.currentTarget.style.background = '#f8fafc'}
                                                        >
                                                            <span>{link.icon}</span> {link.label} <ExternalLink size={11} style={{ marginLeft: 'auto', opacity: 0.5 }} />
                                                        </a>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', padding: '12px' }}>
                                                    Enter a part name to see search links
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                    <button onClick={() => setRfqStep(1)} style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>Back</button>
                                    <button onClick={() => { if (rfqSelected.length > 0) setFastFloatOpen(true); else toast.error('Select at least one supplier'); }}
                                        disabled={rfqSelected.length === 0}
                                        style={{ padding: '10px 24px', background: rfqSelected.length > 0 ? '#f59e0b' : '#e2e8f0', color: rfqSelected.length > 0 ? '#ffffff' : '#94a3b8', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: rfqSelected.length > 0 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Send size={15} /> Float RFQ to {rfqSelected.length} Supplier{rfqSelected.length !== 1 ? 's' : ''}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── Step 4: Confirmation ── */}
                        {rfqStep === 4 && (
                            <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                                <CheckCircle2 size={48} color="#10b981" />
                                <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: '#1e293b' }}>RFQ Sent Successfully!</h2>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                                    Enquiry <strong>{rfqEnquiry?.enquiry_no}</strong> has been floated to <strong>{rfqSentCount}</strong> supplier{rfqSentCount !== 1 ? 's' : ''}.
                                </p>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                    <button
                                        onClick={() => openCalendarModal({
                                            title: `[${rfqEnquiry?.enquiry_no}] Supplier Quote Follow-up`,
                                            date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
                                            description: `RFQ floated for: ${rfqEnquiry?.enquiry_no}\nCustomer: ${rfqEnquiry?.customer?.name}\nSuppliers contacted: ${rfqSelected.length}`,
                                            activityType: 'RFQ Follow-up',
                                            enquiryNo: rfqEnquiry?.enquiry_no,
                                        })}
                                        style={{ padding: '10px 20px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px' }}>
                                        <Calendar size={16} /> Set Follow-up Reminder
                                    </button>
                                    <button onClick={() => { setActiveTab('compare'); setCompareEnquiry(rfqEnquiry); }}
                                        style={{ padding: '10px 20px', background: '#ecfdf5', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>
                                        Compare Quotes
                                    </button>
                                    <button onClick={() => { setActiveTab('dashboard'); setRfqStep(1); setRfqEnquiry(null); setRfqSelected([]); }}
                                        style={{ padding: '10px 20px', background: '#6366f1', color: '#ffffff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>
                                        Back to Dashboard
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════
                    TAB 4 — COMPARE
                ═══════════════════════════════════════════════════════════════ */}
                {activeTab === 'compare' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Enquiry Selector */}
                        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Enquiry:</span>
                            <div style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 12px' }}>
                                <Search size={14} color="#94a3b8" />
                                <input value={compareSearch} onChange={e => setCompareSearch(e.target.value)}
                                    placeholder="Search by ENQ No..."
                                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', flex: 1 }} />
                            </div>
                            {enquiries.filter(e => !compareSearch.trim() || (e.enquiry_no || '').toLowerCase().includes(compareSearch.toLowerCase())).slice(0, 6).map(e => (
                                <button key={e.id} onClick={() => setCompareEnquiry(e)}
                                    style={{
                                        padding: '6px 14px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                                        border: compareEnquiry?.id === e.id ? '2px solid #10b981' : '1.5px solid #e2e8f0',
                                        background: compareEnquiry?.id === e.id ? '#ecfdf5' : '#f8fafc',
                                        color: compareEnquiry?.id === e.id ? '#15803d' : '#475569',
                                    }}>{e.enquiry_no}</button>
                            ))}
                            {/* Calendar button */}
                            {compareEnquiry && (
                                <button onClick={() => openCalendarModal({
                                    title: `[${compareEnquiry.enquiry_no}] Quote Comparison Due`,
                                    date: compareEnquiry.due_date || '',
                                    description: `Compare supplier quotes for: ${compareEnquiry.enquiry_no}\nCustomer: ${compareEnquiry.customer?.name}`,
                                    activityType: 'Quote Comparison',
                                    enquiryNo: compareEnquiry.enquiry_no,
                                })}
                                    style={{ padding: '7px 12px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 700 }}>
                                    <Calendar size={13} /> Set Reminder
                                </button>
                            )}
                        </div>

                        {compareEnquiry ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '16px', alignItems: 'flex-start' }}>
                                {/* Drive Tree Viewer */}
                                <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', fontWeight: 800, fontSize: '0.82rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                                        <span><HardDrive size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} />Drive Files</span>
                                        {compareEnquiry.gdrive_folder_id && (
                                            <button onClick={() => window.open(`https://drive.google.com/drive/folders/${compareEnquiry.gdrive_folder_id}`, '_blank', 'noopener,noreferrer')}
                                                style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', color: '#2563eb', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <ExternalLink size={11} /> Open Folder
                                            </button>
                                        )}
                                    </div>
                                    <EagleDriveTreeViewer
                                        jobFolderId={compareEnquiry.gdrive_folder_id}
                                        jobNo={compareEnquiry.enquiry_no}
                                        customerName={compareEnquiry.customer?.name || ''}
                                        companyId={profile?.company_id}
                                    />
                                </div>

                                {/* Quote Comparison Table */}
                                <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e293b' }}>Supplier Quote Comparison — {compareEnquiry.enquiry_no}</div>
                                        <button onClick={() => navigate(`/workflows/editor/quotation/new?enquiry_id=${compareEnquiry.id}`)}
                                            style={{ padding: '7px 14px', background: '#6366f1', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <FileText size={13} /> Generate Quote2Customer
                                        </button>
                                    </div>

                                    {/* Supplier quotes */}
                                    {compareEnquiry.supplier_quotes?.length > 0 ? (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                                <thead>
                                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 800, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase' }}>Supplier</th>
                                                        <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 800, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase' }}>Quote Amount</th>
                                                        <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 800, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase' }}>Status</th>
                                                        <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 800, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase' }}>Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {compareEnquiry.supplier_quotes.map((q, i) => {
                                                        const isShortlisted = q.status === 'Shortlisted';
                                                        return (
                                                            <tr key={q.id || i} style={{ borderBottom: '1px solid #f1f5f9', background: isShortlisted ? '#f0fdf4' : 'transparent' }}>
                                                                <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1e293b' }}>{q.supplier?.name || 'Unknown'}</td>
                                                                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#1e293b' }}>
                                                                    {q.quote_amount ? `$${Number(q.quote_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : <span style={{ color: '#94a3b8' }}>Pending</span>}
                                                                </td>
                                                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                                    <span style={{
                                                                        fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px', borderRadius: '6px',
                                                                        background: isShortlisted ? '#dcfce7' : q.status === 'Received' ? '#fef3c7' : '#f1f5f9',
                                                                        color: isShortlisted ? '#166534' : q.status === 'Received' ? '#92400e' : '#64748b',
                                                                    }}>{q.status || 'Pending'}</span>
                                                                </td>
                                                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                                    <button style={{
                                                                        padding: '4px 12px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                                                                        background: isShortlisted ? '#15803d' : '#f0fdf4',
                                                                        color: isShortlisted ? '#ffffff' : '#15803d',
                                                                        border: '1px solid #bbf7d0',
                                                                    }}>
                                                                        {isShortlisted ? '✓ Shortlisted' : 'Shortlist'}
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                            <Inbox size={32} style={{ display: 'block', margin: '0 auto 10px', color: '#cbd5e1' }} />
                                            No supplier quotes yet for this enquiry.<br />
                                            <button onClick={() => { setRfqEnquiry(compareEnquiry); setRfqStep(2); setActiveTab('float_rfq'); }}
                                                style={{ marginTop: '10px', padding: '7px 14px', background: '#f59e0b', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}>
                                                Float RFQ Now
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                                <ArrowRightLeft size={36} style={{ display: 'block', margin: '0 auto 12px', color: '#cbd5e1' }} />
                                Select an enquiry above to compare supplier quotes and Drive files.
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════
                    TAB 5 — JOB LINK
                ═══════════════════════════════════════════════════════════════ */}
                {activeTab === 'job_link' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                {JOB_TABS.map(jt => (
                                    <button key={jt.id} onClick={() => setJobTab(jt.id)} style={{
                                        padding: '8px 16px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700,
                                        cursor: 'pointer', border: 'none',
                                        background: jobTab === jt.id ? '#8b5cf6' : '#f1f5f9',
                                        color: jobTab === jt.id ? '#ffffff' : '#475569',
                                    }}>{jt.label}</button>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 14px' }}>
                                    <Search size={14} color="#94a3b8" />
                                    <input value={jobSearch} onChange={e => setJobSearch(e.target.value)}
                                        placeholder="Search jobs..."
                                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', width: '180px' }} />
                                </div>
                                <button onClick={() => navigate('/workflows/jobs-dashboard')}
                                    style={{ padding: '8px 16px', background: '#8b5cf6', color: '#ffffff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Briefcase size={14} /> Full Job Control <ExternalLink size={12} />
                                </button>
                            </div>
                        </div>

                        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            {['Job No', 'Customer', 'Description', 'Status', 'Value', 'Due Date', '📅', 'Open'].map(h => (
                                                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredJobs.length === 0 && (
                                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No jobs found</td></tr>
                                        )}
                                        {filteredJobs.map(job => {
                                            const js = getJobStatusStyle(job.status);
                                            const jobNo = job.assigned_job_no || job.document_no;
                                            return (
                                                <tr key={job.id}
                                                    onClick={() => goToJob(job)}
                                                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.1s' }}
                                                    onMouseOver={e => e.currentTarget.style.background = '#f8faff'}
                                                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                                                        <span style={{ fontWeight: 800, color: '#7c3aed' }}>{jobNo}</span>
                                                    </td>
                                                    <td style={{ padding: '11px 16px', maxWidth: '150px' }}>
                                                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
                                                            {job.partners?.name || '—'}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '11px 16px', maxWidth: '220px' }}>
                                                        <span style={{ color: '#64748b', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                            {job.customer_ref || '—'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                                                        <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, background: js.bg, color: js.text, border: `1px solid ${js.border}` }}>
                                                            {job.status || 'Active'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>
                                                        {job.total_amount ? `$${Number(job.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                                                    </td>
                                                    <td style={{ padding: '11px 16px', whiteSpace: 'nowrap', color: '#64748b' }}>
                                                        {fmtDate(job.expiry_date)}
                                                    </td>
                                                    <td style={{ padding: '11px 16px' }} onClick={e => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => openCalendarModal({
                                                                title: `[${jobNo}] Job Status Follow-up`,
                                                                date: job.expiry_date || new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
                                                                description: `Job: ${jobNo}\nCustomer: ${job.partners?.name || '—'}\nStatus: ${job.status || 'Active'}\n\nOpen: ${window.location.origin}/workflows/eagle/${job.id}`,
                                                                activityType: 'Job Follow-up',
                                                                enquiryNo: jobNo,
                                                            })}
                                                            style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '5px 7px', cursor: 'pointer', color: '#15803d' }}>
                                                            <Calendar size={13} />
                                                        </button>
                                                    </td>
                                                    <td style={{ padding: '11px 16px' }} onClick={e => e.stopPropagation()}>
                                                        <button onClick={() => goToJob(job)}
                                                            style={{ padding: '5px 12px', background: '#8b5cf6', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <ExternalLink size={11} /> Open
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {filteredJobs.length > 0 && (
                                <div style={{ padding: '10px 20px', borderTop: '1px solid #f1f5f9', fontSize: '0.72rem', color: '#94a3b8' }}>
                                    Showing {filteredJobs.length} of {jobs.length} jobs
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>

            {/* ─── Drive Panel Slide-out ─── */}
            {drivePanel.open && drivePanel.enquiry && (
                <>
                    {/* Backdrop */}
                    <div
                        onClick={() => setDrivePanel({ open: false, enquiry: null })}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 8999 }}
                    />
                    <EnquiryDrivePanelWidget
                        enquiry={drivePanel.enquiry}
                        isOpen={drivePanel.open}
                        onClose={() => setDrivePanel({ open: false, enquiry: null })}
                        companyId={profile?.company_id}
                        onFolderProvisioned={(folderId) => handleFolderProvisioned(drivePanel.enquiry?.id, folderId)}
                    />
                </>
            )}

            {/* ─── Fast Float Modal (for Float RFQ step 3) ─── */}
            <FastFloatModal
                isOpen={fastFloatOpen}
                onClose={() => setFastFloatOpen(false)}
                enquiry={rfqEnquiry}
                onConfirm={(sentCount) => {
                    setFastFloatOpen(false);
                    setRfqSentCount(sentCount || rfqSelected.length);
                    setRfqStep(4);
                }}
            />

            {/* ─── Drive Tree Checking Facility Modal (Image 5) ─── */}
            {checkingModal.isOpen && checkingModal.enquiry && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div style={{ background: '#ffffff', borderRadius: '20px', width: '100%', maxWidth: '1360px', height: '90vh', maxHeight: '920px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px -15px rgba(0,0,0,0.4)', border: '1px solid #e2e8f0' }}>
                        {/* Modal Top Bar */}
                        <div style={{ padding: '14px 22px', background: '#0f172a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: '#3b82f6', color: '#ffffff', padding: '6px', borderRadius: '8px' }}>
                                    <FolderOpen size={18} />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '1rem', fontWeight: 800 }}>Google Drive Folder Tree &amp; Document Stream</span>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: '#1e293b', color: '#38bdf8', border: '1px solid #0284c7' }}>
                                            {checkingModal.enquiry.enquiry_no}
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                        Interactive repository tree with live document viewer &amp; full checking facility
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <button
                                    onClick={() => openDriveFolder(checkingModal.enquiry)}
                                    style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '8px', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                                >
                                    <ExternalLink size={13} /> Open in Google Drive
                                </button>
                                <button
                                    onClick={() => setCheckingModal({ isOpen: false, enquiry: null })}
                                    style={{ background: '#334155', border: 'none', color: '#ffffff', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body: EagleDriveTreeViewer */}
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <EagleDriveTreeViewer
                                jobFolderId={checkingModal.enquiry.gdrive_folder_id}
                                jobNo={checkingModal.enquiry.enquiry_no}
                                customerName={checkingModal.enquiry.customer?.name || ''}
                                companyId={profile?.company_id}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Google Calendar Modal ─── */}
            <GoogleCalendarReminderModal
                isOpen={calendarModal.isOpen}
                onClose={() => setCalendarModal(prev => ({ ...prev, isOpen: false }))}
                defaultTitle={calendarModal.title}
                defaultDate={calendarModal.date}
                defaultDescription={calendarModal.description}
                defaultLocation={calendarModal.location}
                jobNo={calendarModal.enquiryNo}
                activityType={calendarModal.activityType}
            />

            {/* ─── Initialize New Enquiry & Drive Folder Modal ─── */}
            {showNewFolderModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                }}>
                    <div style={{
                        background: '#ffffff', borderRadius: '20px', width: '100%',
                        maxWidth: newFolderForm.isNewCustomer ? '680px' : '580px',
                        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
                        overflow: 'hidden', boxShadow: '0 25px 60px -15px rgba(0,0,0,0.4)',
                        border: '1px solid #e2e8f0', animation: 'scaleIn 0.2s ease-out'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '16px 22px', background: '#0f172a', color: '#ffffff',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ background: '#4f46e5', color: '#ffffff', padding: '7px', borderRadius: '10px' }}>
                                    <FolderPlus size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc' }}>
                                        Initialize New Enquiry &amp; Drive Folder
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#94a3b8' }}>
                                        Create enquiry record &amp; auto-provision standard bilateral Drive subfolders
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowNewFolderModal(false)}
                                style={{ background: '#334155', border: 'none', color: '#ffffff', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleCreateNewFolder} style={{ padding: '22px', overflowY: 'auto', flex: 1 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                                {/* Google Drive Hierarchy Preview Banner */}
                                <div style={{
                                    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px',
                                    padding: '12px 14px', fontSize: '0.74rem', color: '#475569'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#4338ca', marginBottom: '4px' }}>
                                        <HardDrive size={14} /> Bilateral Google Drive Folder Structure:
                                    </div>
                                    <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', background: '#ffffff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', color: '#0f172a' }}>
                                        CELRONHUB / 01. TIME_BASED / {new Date().getFullYear()} / Enquiries / <b>{newFolderForm.enquiryNo || 'ENQ-XXXX'} - {newFolderForm.isNewCustomer ? (newFolderForm.customerName || 'Customer') : (allPartners.find(p => p.id === newFolderForm.customerId)?.name || 'Customer')}</b>
                                    </div>
                                    <div style={{ marginTop: '6px', fontSize: '0.68rem', color: '#64748b' }}>
                                        Standard subfolders: 01_ENQUIRY_PO_RFQ • 02_CUSTOMER_QUOTES • 03_SUPPLIER_QUOTES_PO • 04_DELIVERY_INVOICE • Photos &amp; Gallery • SupportDocs • SupplierBills&amp;Expenses
                                    </div>
                                </div>

                                {/* Field: Enquiry No */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                        Enquiry Number <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            type="text"
                                            required
                                            value={newFolderForm.enquiryNo}
                                            onChange={e => setNewFolderForm(prev => ({ ...prev, enquiryNo: e.target.value }))}
                                            placeholder="e.g. ENQ-CEL-2609-0001"
                                            style={{
                                                flex: 1, padding: '9px 12px', borderRadius: '8px',
                                                border: '1.5px solid #cbd5e1', fontSize: '0.84rem', fontWeight: 700,
                                                color: '#0f172a', outline: 'none', background: '#f8fafc'
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (profile?.company_id) {
                                                    const next = await generateEnquiryNo(profile.company_id);
                                                    setNewFolderForm(prev => ({ ...prev, enquiryNo: next }));
                                                }
                                            }}
                                            title="Re-generate next enquiry number"
                                            style={{
                                                padding: '0 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                                                background: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                                                fontSize: '0.74rem', fontWeight: 700, color: '#475569'
                                            }}
                                        >
                                            <RefreshCcw size={13} /> Auto No
                                        </button>
                                    </div>
                                </div>

                                {/* Field: Customer */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                        <label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#334155' }}>
                                            Customer / Client <span style={{ color: '#ef4444' }}>*</span>
                                        </label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <button
                                                type="button"
                                                onClick={() => syncAllPartners(true)}
                                                disabled={syncingPartners}
                                                title="Synchronize all customers from database, jobs, and enquiries"
                                                style={{
                                                    background: '#e0e7ff', border: '1px solid #c7d2fe', color: '#4338ca',
                                                    fontSize: '0.70rem', fontWeight: 700, borderRadius: '6px',
                                                    padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                                }}
                                            >
                                                <RefreshCcw size={11} className={syncingPartners ? 'animate-spin' : ''} />
                                                {syncingPartners ? 'Syncing...' : 'Sync Customers'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNewFolderForm(prev => ({
                                                    ...prev,
                                                    isNewCustomer: !prev.isNewCustomer,
                                                    customerId: '',
                                                    customerName: '',
                                                    customerEmail: '',
                                                    customerPhone: '',
                                                    customerCountry: 'Singapore',
                                                    customerAddress: '',
                                                    customerWeblink: '',
                                                    customerNotes: '',
                                                    contactPersonName: '',
                                                    contactPersonEmail: '',
                                                    contactPersonPhone: '',
                                                }))}
                                                style={{
                                                    background: 'transparent', border: 'none', color: '#4f46e5',
                                                    fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline'
                                                }}
                                            >
                                                {newFolderForm.isNewCustomer ? '← Choose Existing Customer' : '+ Type New Customer (Full Details)'}
                                            </button>
                                        </div>
                                    </div>

                                    {newFolderForm.isNewCustomer ? (
                                        <div style={{
                                            background: '#f8fafc', border: '1.5px solid #c7d2fe', borderRadius: '12px',
                                            padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#3730a3', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <Building2 size={14} /> New Customer Master Profile
                                                </span>
                                                <span style={{ fontSize: '0.68rem', color: '#4338ca', background: '#e0e7ff', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                                                    Auto-saves to Partners directory
                                                </span>
                                            </div>

                                            {/* Company Name */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                                    Company / Customer Name <span style={{ color: '#ef4444' }}>*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    required
                                                    list="new-enquiry-partners-list"
                                                    value={newFolderForm.customerName}
                                                    onChange={e => setNewFolderForm(prev => ({ ...prev, customerName: e.target.value }))}
                                                    placeholder="Enter customer / client company name..."
                                                    style={{
                                                        width: '100%', padding: '9px 12px', borderRadius: '8px',
                                                        border: '1.5px solid #818cf8', fontSize: '0.84rem',
                                                        color: '#0f172a', outline: 'none', boxSizing: 'border-box',
                                                        background: '#ffffff'
                                                    }}
                                                />
                                                <datalist id="new-enquiry-partners-list">
                                                    {allPartners.map(p => (
                                                        <option key={p.id} value={p.name}>
                                                            {p.country ? `${p.name} (${p.country})` : p.name}
                                                        </option>
                                                    ))}
                                                </datalist>
                                            </div>

                                            {/* Email & Phone */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                                        Email Address
                                                    </label>
                                                    <input
                                                        type="email"
                                                        value={newFolderForm.customerEmail}
                                                        onChange={e => setNewFolderForm(prev => ({ ...prev, customerEmail: e.target.value }))}
                                                        placeholder="e.g. procurement@marinecorp.com"
                                                        style={{
                                                            width: '100%', padding: '8px 10px', borderRadius: '8px',
                                                            border: '1px solid #cbd5e1', fontSize: '0.80rem',
                                                            color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#ffffff'
                                                        }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                                        Phone / Mobile
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={newFolderForm.customerPhone}
                                                        onChange={e => setNewFolderForm(prev => ({ ...prev, customerPhone: e.target.value }))}
                                                        placeholder="e.g. +65 6123 4567"
                                                        style={{
                                                            width: '100%', padding: '8px 10px', borderRadius: '8px',
                                                            border: '1px solid #cbd5e1', fontSize: '0.80rem',
                                                            color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#ffffff'
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Country & Website */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                                        Country
                                                    </label>
                                                    <select
                                                        value={newFolderForm.customerCountry}
                                                        onChange={e => setNewFolderForm(prev => ({ ...prev, customerCountry: e.target.value }))}
                                                        style={{
                                                            width: '100%', padding: '8px 10px', borderRadius: '8px',
                                                            border: '1px solid #cbd5e1', fontSize: '0.80rem',
                                                            color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#ffffff'
                                                        }}
                                                    >
                                                        <option value="">-- Select Country --</option>
                                                        {COUNTRIES.map(c => (
                                                            <option key={c} value={c}>{c}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                                        Website / Web Link
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={newFolderForm.customerWeblink}
                                                        onChange={e => setNewFolderForm(prev => ({ ...prev, customerWeblink: e.target.value }))}
                                                        placeholder="e.g. https://marinecorp.com"
                                                        style={{
                                                            width: '100%', padding: '8px 10px', borderRadius: '8px',
                                                            border: '1px solid #cbd5e1', fontSize: '0.80rem',
                                                            color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#ffffff'
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Billing / Physical Address */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                                    Billing / Physical Street Address
                                                </label>
                                                <input
                                                    type="text"
                                                    value={newFolderForm.customerAddress}
                                                    onChange={e => setNewFolderForm(prev => ({ ...prev, customerAddress: e.target.value }))}
                                                    placeholder="e.g. 10 Anson Road, #15-02 International Plaza, Singapore 079903"
                                                    style={{
                                                        width: '100%', padding: '8px 10px', borderRadius: '8px',
                                                        border: '1px solid #cbd5e1', fontSize: '0.80rem',
                                                        color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#ffffff'
                                                    }}
                                                />
                                            </div>

                                            {/* Primary Contact Person (Optional) */}
                                            <div style={{
                                                background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0',
                                                padding: '10px 12px'
                                            }}>
                                                <span style={{ display: 'block', fontSize: '0.70rem', fontWeight: 800, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                    Primary Contact Person (Optional)
                                                </span>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '8px' }}>
                                                    <div>
                                                        <input
                                                            type="text"
                                                            value={newFolderForm.contactPersonName}
                                                            onChange={e => setNewFolderForm(prev => ({ ...prev, contactPersonName: e.target.value }))}
                                                            placeholder="Contact Person Name"
                                                            style={{
                                                                width: '100%', padding: '7px 9px', borderRadius: '6px',
                                                                border: '1px solid #cbd5e1', fontSize: '0.78rem',
                                                                color: '#0f172a', outline: 'none', boxSizing: 'border-box'
                                                            }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <input
                                                            type="email"
                                                            value={newFolderForm.contactPersonEmail}
                                                            onChange={e => setNewFolderForm(prev => ({ ...prev, contactPersonEmail: e.target.value }))}
                                                            placeholder="Direct Email"
                                                            style={{
                                                                width: '100%', padding: '7px 9px', borderRadius: '6px',
                                                                border: '1px solid #cbd5e1', fontSize: '0.78rem',
                                                                color: '#0f172a', outline: 'none', boxSizing: 'border-box'
                                                            }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <input
                                                            type="text"
                                                            value={newFolderForm.contactPersonPhone}
                                                            onChange={e => setNewFolderForm(prev => ({ ...prev, contactPersonPhone: e.target.value }))}
                                                            placeholder="Direct Mobile"
                                                            style={{
                                                                width: '100%', padding: '7px 9px', borderRadius: '6px',
                                                                border: '1px solid #cbd5e1', fontSize: '0.78rem',
                                                                color: '#0f172a', outline: 'none', boxSizing: 'border-box'
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Notes / Terms */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                                    Customer Notes / Terms (Optional)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={newFolderForm.customerNotes}
                                                    onChange={e => setNewFolderForm(prev => ({ ...prev, customerNotes: e.target.value }))}
                                                    placeholder="e.g. 30 days payment terms; vessel overhaul specialist"
                                                    style={{
                                                        width: '100%', padding: '8px 10px', borderRadius: '8px',
                                                        border: '1px solid #cbd5e1', fontSize: '0.80rem',
                                                        color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#ffffff'
                                                    }}
                                                />
                                            </div>

                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                fontSize: '0.70rem', color: '#15803d', background: '#f0fdf4',
                                                padding: '6px 10px', borderRadius: '6px', border: '1px solid #bbf7d0'
                                            }}>
                                                <Sparkles size={13} style={{ flexShrink: 0, color: '#16a34a' }} />
                                                <span>
                                                    {newFolderForm.customerName.trim()
                                                        ? <>Saving <strong>"{newFolderForm.customerName.trim()}"</strong> with all details directly into your <strong>Partners table</strong> with type <code>Customer</code>.</>
                                                        : 'All elaborated details will be saved directly into your Partners table with type Customer.'
                                                    }
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ position: 'relative' }}>
                                            {/* Search Input Container */}
                                            <div style={{
                                                display: 'flex', alignItems: 'center', border: '1.5px solid #cbd5e1',
                                                borderRadius: '8px', background: '#ffffff', padding: '0 10px',
                                                borderColor: customerDropdownOpen ? '#6366f1' : '#cbd5e1',
                                                boxShadow: customerDropdownOpen ? '0 0 0 3px rgba(99, 102, 241, 0.15)' : 'none'
                                            }}>
                                                <Search size={15} style={{ color: '#94a3b8', marginRight: '8px', flexShrink: 0 }} />
                                                <input
                                                    type="text"
                                                    value={customerSearchTerm !== '' ? customerSearchTerm : (newFolderForm.customerName || '')}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        setCustomerSearchTerm(val);
                                                        setCustomerDropdownOpen(true);
                                                        if (!val) {
                                                            setNewFolderForm(prev => ({ ...prev, customerId: '', customerName: '' }));
                                                        }
                                                    }}
                                                    onFocus={() => setCustomerDropdownOpen(true)}
                                                    placeholder={`Search ${allPartners.length > 0 ? allPartners.length + '+' : ''} partners by company name, country, address, or email...`}
                                                    style={{
                                                        flex: 1, padding: '9px 0', border: 'none', outline: 'none',
                                                        fontSize: '0.84rem', color: '#0f172a', background: 'transparent'
                                                    }}
                                                />
                                                {newFolderForm.customerId && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setNewFolderForm(prev => ({ ...prev, customerId: '', customerName: '' }));
                                                            setCustomerSearchTerm('');
                                                        }}
                                                        style={{
                                                            background: '#f1f5f9', border: 'none', borderRadius: '50%',
                                                            width: '20px', height: '20px', display: 'flex', alignItems: 'center',
                                                            justifyContent: 'center', cursor: 'pointer', color: '#64748b', marginRight: '6px'
                                                        }}
                                                        title="Clear selection"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setCustomerDropdownOpen(prev => !prev)}
                                                    style={{
                                                        background: 'transparent', border: 'none', cursor: 'pointer',
                                                        color: '#64748b', display: 'flex', alignItems: 'center', padding: '4px'
                                                    }}
                                                >
                                                    <ChevronDown size={15} style={{ transform: customerDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                </button>
                                            </div>

                                            {/* Floating Dropdown Results */}
                                            {customerDropdownOpen && (
                                                <>
                                                    <div
                                                        style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
                                                        onClick={() => setCustomerDropdownOpen(false)}
                                                    />
                                                    <div style={{
                                                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                                                        maxHeight: '270px', overflowY: 'auto', background: '#ffffff',
                                                        borderRadius: '10px', border: '1px solid #e2e8f0',
                                                        boxShadow: '0 12px 30px -5px rgba(0,0,0,0.2)', zIndex: 10001
                                                    }}>
                                                        {/* Quick option: Add as new customer if term is typed */}
                                                        {customerSearchTerm.trim() && (
                                                            <div
                                                                onClick={() => {
                                                                    setNewFolderForm(prev => ({
                                                                        ...prev,
                                                                        isNewCustomer: true,
                                                                        customerId: '',
                                                                        customerName: customerSearchTerm.trim(),
                                                                    }));
                                                                    setCustomerDropdownOpen(false);
                                                                }}
                                                                style={{
                                                                    padding: '10px 14px', borderBottom: '1px solid #e2e8f0',
                                                                    background: '#eff6ff', cursor: 'pointer', display: 'flex',
                                                                    alignItems: 'center', gap: '8px', fontSize: '0.80rem', color: '#1d4ed8', fontWeight: 700
                                                                }}
                                                            >
                                                                <Plus size={15} /> Add "{customerSearchTerm.trim()}" as New Customer (Fill full details)
                                                            </div>
                                                        )}

                                                        {(() => {
                                                            const term = customerSearchTerm.toLowerCase().trim();
                                                            const termNoSpaces = term.replace(/[\s\-_.,/]+/g, '');
                                                            const tokens = term.split(/\s+/).filter(Boolean);

                                                            const filtered = allPartners.filter(p => {
                                                                if (!term) return true;
                                                                const name = (p.name || '').toLowerCase();
                                                                const country = (p.country || '').toLowerCase();
                                                                const address = (p.address || '').toLowerCase();
                                                                const email = (p.email1 || '').toLowerCase();
                                                                const phone = (p.phone1 || '').toLowerCase();
                                                                const contacts = Array.isArray(p.contactPersons)
                                                                    ? p.contactPersons.map(cp => `${cp.name || ''} ${cp.email || ''}`).join(' ').toLowerCase()
                                                                    : '';
                                                                const combined = `${name} ${country} ${address} ${email} ${phone} ${contacts}`;

                                                                // 1. Direct standard substring
                                                                if (combined.includes(term)) return true;

                                                                // 2. Space/punctuation-insensitive match (e.g. "sea gull" matches "seagull" and vice-versa)
                                                                if (termNoSpaces) {
                                                                    const nameNoSpaces = name.replace(/[\s\-_.,/]+/g, '');
                                                                    if (nameNoSpaces.includes(termNoSpaces)) return true;
                                                                    const combinedNoSpaces = combined.replace(/[\s\-_.,/]+/g, '');
                                                                    if (combinedNoSpaces.includes(termNoSpaces)) return true;
                                                                }

                                                                // 3. Multi-token / all-words match (e.g. "marine seagull" matches "Seagull Marine Pte Ltd")
                                                                if (tokens.length > 1) {
                                                                    const allTokensMatch = tokens.every(tk => {
                                                                        const tkClean = tk.replace(/[\s\-_.,/]+/g, '');
                                                                        return combined.includes(tk) || (tkClean && name.replace(/[\s\-_.,/]+/g, '').includes(tkClean));
                                                                    });
                                                                    if (allTokensMatch) return true;
                                                                }

                                                                return false;
                                                            }).slice(0, 100); // Top 100 matches for ultra-fast rendering

                                                            if (filtered.length === 0) {
                                                                return (
                                                                    <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '0.78rem' }}>
                                                                        No partners match "{customerSearchTerm}".
                                                                        <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => syncAllPartners(true)}
                                                                                disabled={syncingPartners}
                                                                                style={{
                                                                                    background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1',
                                                                                    borderRadius: '6px', padding: '6px 12px', fontSize: '0.74rem',
                                                                                    fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                                                                                }}
                                                                            >
                                                                                <RefreshCcw size={12} className={syncingPartners ? 'animate-spin' : ''} />
                                                                                {syncingPartners ? 'Syncing...' : 'Resync Customers'}
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setNewFolderForm(prev => ({
                                                                                        ...prev,
                                                                                        isNewCustomer: true,
                                                                                        customerId: '',
                                                                                        customerName: customerSearchTerm.trim(),
                                                                                    }));
                                                                                    setCustomerDropdownOpen(false);
                                                                                }}
                                                                                style={{
                                                                                    background: '#4f46e5', color: '#ffffff', border: 'none',
                                                                                    borderRadius: '6px', padding: '6px 14px', fontSize: '0.76rem',
                                                                                    fontWeight: 700, cursor: 'pointer'
                                                                                }}
                                                                            >
                                                                                + Register "{customerSearchTerm}" as New Customer
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }

                                                            return (
                                                                <div>
                                                                    <div style={{
                                                                        padding: '6px 12px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9',
                                                                        fontSize: '0.68rem', fontWeight: 700, color: '#64748b', display: 'flex', justifyContent: 'space-between'
                                                                    }}>
                                                                        <span>SEARCH RESULTS ({filtered.length}{allPartners.length > 100 ? ' of ' + allPartners.length : ''})</span>
                                                                        <span>Click to select</span>
                                                                    </div>
                                                                    {filtered.map(p => {
                                                                        const isSelected = newFolderForm.customerId === p.id;
                                                                        const isCust = Array.isArray(p.types) && p.types.some(t => t?.toLowerCase() === 'customer');
                                                                        return (
                                                                            <div
                                                                                key={p.id}
                                                                                onClick={() => {
                                                                                    setNewFolderForm(prev => ({
                                                                                        ...prev,
                                                                                        customerId: p.id,
                                                                                        customerName: p.name,
                                                                                        isNewCustomer: false
                                                                                    }));
                                                                                    setCustomerSearchTerm('');
                                                                                    setCustomerDropdownOpen(false);
                                                                                }}
                                                                                style={{
                                                                                    padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                                                                                    background: isSelected ? '#e0e7ff' : '#ffffff',
                                                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                                                                }}
                                                                                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
                                                                                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = '#ffffff'; }}
                                                                            >
                                                                                <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                                                                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                        {p.name}
                                                                                    </div>
                                                                                    <div style={{ fontSize: '0.70rem', color: '#64748b', display: 'flex', gap: '8px', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                        {p.country && <span>📍 {p.country}</span>}
                                                                                        {p.address && <span title={p.address}>🏢 {p.address}</span>}
                                                                                        {p.email1 && <span>✉️ {p.email1}</span>}
                                                                                        {p.phone1 && <span>📞 {p.phone1}</span>}
                                                                                    </div>
                                                                                </div>
                                                                                <span style={{
                                                                                    fontSize: '0.66rem', fontWeight: 700, padding: '2px 6px', borderRadius: '6px',
                                                                                    background: isCust ? '#dcfce7' : '#f1f5f9',
                                                                                    color: isCust ? '#15803d' : '#475569', flexShrink: 0
                                                                                }}>
                                                                                    {isCust ? 'Customer' : 'Supplier/Partner'}
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </>
                                            )}

                                            {/* Read-only preview chip of existing partner details from database */}
                                            {(() => {
                                                const selectedPartner = allPartners.find(p => p.id === newFolderForm.customerId);
                                                if (!selectedPartner) return null;
                                                return (
                                                    <div style={{
                                                        marginTop: '8px', padding: '9px 12px', borderRadius: '8px',
                                                        background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.74rem', color: '#475569',
                                                        display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span style={{ fontWeight: 700, color: '#334155' }}>📍 Country:</span>
                                                            <span>{selectedPartner.country || 'N/A'}</span>
                                                        </div>
                                                        {selectedPartner.email1 && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span style={{ fontWeight: 700, color: '#334155' }}>✉️ Email:</span>
                                                                <span>{selectedPartner.email1}</span>
                                                            </div>
                                                        )}
                                                        {selectedPartner.phone1 && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span style={{ fontWeight: 700, color: '#334155' }}>📞 Phone:</span>
                                                                <span>{selectedPartner.phone1}</span>
                                                            </div>
                                                        )}
                                                        {selectedPartner.address && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
                                                                <span style={{ fontWeight: 700, color: '#334155' }}>🏢 Address:</span>
                                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedPartner.address}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>

                                {/* Field: Subject / Scope Description */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                        Subject / Scope Description
                                    </label>
                                    <input
                                        type="text"
                                        value={newFolderForm.description}
                                        onChange={e => setNewFolderForm(prev => ({ ...prev, description: e.target.value }))}
                                        placeholder="e.g. Engine Overhaul Spares &amp; Filters RFQ"
                                        style={{
                                            width: '100%', padding: '9px 12px', borderRadius: '8px',
                                            border: '1.5px solid #cbd5e1', fontSize: '0.84rem',
                                            color: '#0f172a', outline: 'none', boxSizing: 'border-box'
                                        }}
                                    />
                                </div>

                                {/* Field: Customer Ref / RFQ No */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                        Customer Ref / RFQ No (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={newFolderForm.customerRef}
                                        onChange={e => setNewFolderForm(prev => ({ ...prev, customerRef: e.target.value }))}
                                        placeholder="e.g. RFQ-2026-SEP-018"
                                        style={{
                                            width: '100%', padding: '9px 12px', borderRadius: '8px',
                                            border: '1.5px solid #cbd5e1', fontSize: '0.84rem',
                                            color: '#0f172a', outline: 'none', boxSizing: 'border-box'
                                        }}
                                    />
                                </div>

                                {/* Checkbox: Auto-create Google Drive folder & subfolders */}
                                <label style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                                    background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 12px'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={newFolderForm.autoCreateDrive}
                                        onChange={e => setNewFolderForm(prev => ({ ...prev, autoCreateDrive: e.target.checked }))}
                                        style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                                    />
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e40af' }}>
                                            Automatically provision Google Drive folder &amp; 7 standard subfolders
                                        </span>
                                        <span style={{ fontSize: '0.68rem', color: '#60a5fa' }}>
                                            Creates folder immediately in Drive and links bilateral live viewer
                                        </span>
                                    </div>
                                </label>

                            </div>

                            {/* Modal Footer Buttons */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
                                <button
                                    type="button"
                                    disabled={creatingFolder}
                                    onClick={() => setShowNewFolderModal(false)}
                                    style={{
                                        padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1',
                                        background: '#ffffff', color: '#475569', fontSize: '0.82rem', fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={creatingFolder}
                                    style={{
                                        padding: '9px 18px', borderRadius: '8px', border: 'none',
                                        background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                                        color: '#ffffff', fontSize: '0.82rem', fontWeight: 800,
                                        cursor: creatingFolder ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        boxShadow: '0 4px 12px rgba(79,70,229,0.3)',
                                        opacity: creatingFolder ? 0.7 : 1
                                    }}
                                >
                                    {creatingFolder ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" /> Initializing Folder...
                                        </>
                                    ) : (
                                        <>
                                            <FolderPlus size={16} /> Create &amp; Initialize Folder
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
