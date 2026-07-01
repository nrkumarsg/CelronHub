import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { getDocumentSettings } from '../../lib/store';
import { isTokenValid, connectGoogleAPI } from '../../lib/googleAuthService';
import FastFloatModal from '../../components/workflows/FastFloatModal';
import toast from 'react-hot-toast';
import {
    LayoutDashboard, Search, Plus, FileText, ArrowRightLeft, ShoppingCart,
    Clock, CheckCircle2, Eye, Trash2, ExternalLink, Send, Building2, Calendar,
    Loader2, Users, Smartphone, Sparkles, FileCheck, Receipt, Wrench, Layers,
    Folder, FolderOpen, Copy, MoreVertical, ArrowRight, MessageSquare, QrCode,
    Star, AlertCircle, Package, Inbox, Grid, List, Filter, RefreshCcw,
    DollarSign, TrendingUp, Activity, ChevronRight, Tag, MapPin, Ship,
    ClipboardList, Briefcase, Mail
} from 'lucide-react';
import { getGoogleDriveExplorerUrl } from '../../lib/integrationService';

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
};

const statusColors = {
    'New':          { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
    'Open':         { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
    'RFQ Floated':  { bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff' },
    'Quote Sent':   { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
    'Quoted':       { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
    'Job Created':  { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
    'Closed':       { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' },
    'Cancelled':    { bg: '#ffe4e6', text: '#9f1239', border: '#fecdd3' },
};

const getStatusStyle = (status) => statusColors[status] || statusColors['Open'];

const stripHtml = (html) => (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// ─── Enquiry Card ────────────────────────────────────────────────────────────
function EnquiryCard({ enq, onOpen, onDrive, onFloat, onDelete, onDuplicate, onQuote, onPO, onOpenRootDrive }) {
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
        return ref; // e.g. SR-4457-L26-1832
    };

    const getStatusLabel = (stat) => {
        if (stat === 'New' || stat === 'Open') return 'New Enquiry';
        return stat;
    };

    return (
        <div
            style={{
                background: '#ffffff',
                border: '1.5px solid #e2e8f0',
                borderLeft: isOverdue ? '6px solid #ef4444' : `6px solid #6366f1`,
                borderRadius: '18px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.22s ease',
                boxShadow: '0 2px 8px rgba(99,102,241,0.04)',
                cursor: 'default',
                position: 'relative'
            }}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(99,102,241,0.10)'; }}
            onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.04)'; }}
        >
            {/* Top Row: ENQ Badge + Status + Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div onClick={() => onOpen(enq)} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', cursor: 'pointer' }} title="Click to view/edit details">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 11px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, background: '#eef2ff', color: '#4f46e5', border: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <FileText size={12} /> ENQ
                    </span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#4f46e5', letterSpacing: '0.01em', textDecoration: 'underline' }}>{enq.enquiry_no || '—'}</span>
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
                            <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: 0, top: '34px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, minWidth: '160px', padding: '6px' }}>
                                {[
                                    { label: 'View / Edit Details', icon: <Eye size={14} />, action: onOpen },
                                    { label: 'Duplicate', icon: <Copy size={14} />, action: onDuplicate },
                                    { label: 'Delete', icon: <Trash2 size={14} />, action: onDelete, danger: true },
                                ].map(item => (
                                    <button key={item.label} onClick={() => { item.action(enq); setOpenMenu(false); }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '9px 12px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: item.danger ? '#dc2626' : '#374151', textAlign: 'left' }}>
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
                </div>
            </div>

            {/* Dotted Divider */}
            <div style={{ borderTop: '1px dotted #e2e8f0', margin: '14px 0' }}></div>

            {/* Footer details */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    Date: {fmtDate(enq.enquiry_date || enq.created_at)}
                </span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* Google Drive Specific Folder Button */}
                    <button 
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDrive(enq);
                        }}
                        style={{ 
                            background: enq.gdrive_folder_id ? '#fffbeb' : '#f8fafc', 
                            color: enq.gdrive_folder_id ? '#d97706' : '#6366f1', 
                            padding: '8px', 
                            borderRadius: '8px', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            border: enq.gdrive_folder_id ? '1px solid #fde68a' : '1px solid #e2e8f0'
                        }}
                        title={enq.gdrive_folder_id ? "Open Google Drive Enquiry Folder" : "Provision Google Drive Folder"}
                    >
                        <Folder size={16} fill={enq.gdrive_folder_id ? "#f59e0b" : "transparent"} />
                    </button>
                    {/* Google Drive Root Folder Button */}
                    <button 
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenRootDrive();
                        }}
                        style={{ 
                            background: '#eff6ff', 
                            color: '#2563eb', 
                            padding: '8px', 
                            borderRadius: '8px', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            border: '1px solid #bfdbfe'
                        }}
                        title="Open Enquiries Root Folder"
                        onMouseOver={e => {
                            e.currentTarget.style.background = '#dbeafe';
                        }}
                        onMouseOut={e => {
                            e.currentTarget.style.background = '#eff6ff';
                        }}
                    >
                        <FolderOpen size={16} fill="#2563eb" fillOpacity={0.15} />
                    </button>

                    {/* Copy Button */}
                    <button 
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDuplicate(enq);
                        }}
                        style={{ 
                            background: '#f1f5f9', 
                            color: '#475569', 
                            padding: '8px', 
                            borderRadius: '8px', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            border: '1px solid #e2e8f0'
                        }}
                        title="Duplicate Enquiry (Copy)"
                        onMouseOver={e => {
                            e.currentTarget.style.background = '#e2e8f0';
                        }}
                        onMouseOut={e => {
                            e.currentTarget.style.background = '#f1f5f9';
                        }}
                    >
                        <Copy size={16} />
                    </button>

                    {/* Delete Button */}
                    <button 
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDelete(enq);
                        }}
                        style={{ 
                            background: '#fef2f2', 
                            color: '#ef4444', 
                            padding: '8px', 
                            borderRadius: '8px', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            border: '1px solid #fecaca'
                        }}
                        title="Delete Enquiry"
                        onMouseOver={e => {
                            e.currentTarget.style.background = '#fee2e2';
                        }}
                        onMouseOut={e => {
                            e.currentTarget.style.background = '#fef2f2';
                        }}
                    >
                        <Trash2 size={16} />
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
                            fontSize: '0.9rem'
                        }}
                    >
                        Review <ArrowRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function UnifiedSupplierHub() {
    const TABS = [
        { id: 'customer_enquiries', label: 'Customer Enquiries', icon: <FileText size={18} />, color: '#6366f1' },
        { id: 'supplier_tools', label: 'Supplier Tools', icon: <Building2 size={18} />, color: '#8b5cf6' },
    ];

    const supplierTools = [
        { title: 'Partners Directory', description: 'Manage vendor and supplier profiles, payment terms, and organizational details.', icon: <Building2 size={24} />, color: '#f97316', path: '/partners' },
        { title: 'Contacts Registry', description: 'Access key contact persons, emails, and direct phone numbers.', icon: <Users size={24} />, color: '#6366f1', path: '/contacts' },
        { title: 'AI Drive Card Scanner', description: 'Upload business cards to Google Drive and auto-extract vendor metadata.', icon: <Smartphone size={24} />, color: '#ec4899', path: '/partners/ai-drive-parser' },
        { title: 'AI Email Parser', description: 'Extract supplier contact info automatically from copy-pasted emails.', icon: <Sparkles size={24} />, color: '#a855f7', path: '/partners/ai-parser' },
        { title: 'Business Card Merger', description: 'Combine scanned business cards using third-party web automation.', icon: <Layers size={24} />, color: '#e11d48', path: 'https://business-card-merger.vercel.app', isExternal: true },
        { title: 'Float Supplier Order', description: 'Cross-reference enquiries and dispatch quote requests to suppliers.', icon: <ArrowRightLeft size={24} />, color: '#f97316', path: '/workflows/float-supplier-order' },
        { title: 'Stationery Directory', description: 'Access print templates, letterheads, and formal document frameworks.', icon: <FileCheck size={24} />, color: '#10b981', path: '/forms' },
        { title: 'Accounts Payable', description: 'Monitor vendor invoices, pending bills, and payments.', icon: <Receipt size={24} />, color: '#ef4444', path: '/accounts/bills' },
        { title: 'Weblinks & Resources', description: 'Access external maritime tools, calculators, and helpful resources.', icon: <Wrench size={24} />, color: '#db2777', path: '/tools' },
        { title: 'Quote2Customers', description: 'Create and send quotations to customers from enquiries.', icon: <Briefcase size={24} />, color: '#6366f1', path: '/quotations' },
        { title: 'Purchase Orders', description: 'Manage supplier purchase orders.', icon: <ShoppingCart size={24} />, color: '#ef4444', path: '/purchase-orders' },
    ];

    const { profile } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'customer_enquiries');
    const [enquiries, setEnquiries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('card');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [statusFilter, setStatusFilter] = useState('All');
    const [selectedEnquiry, setSelectedEnquiry] = useState(null);
    const [isFloatModalOpen, setIsFloatModalOpen] = useState(false);
    const [openMenuId, setOpenMenuId] = useState(null);

    // KPI derived
    const activeCount = enquiries.filter(e => !['Closed', 'Cancelled', 'Job Created'].includes(e.status)).length;
    const rfqFloatedCount = enquiries.filter(e => e.status === 'RFQ Floated').length;
    const overdueCount = enquiries.filter(e => e.due_date && new Date(e.due_date) < new Date() && !['Closed', 'Cancelled', 'Job Created'].includes(e.status)).length;

    // Close menu on outside click
    useEffect(() => {
        const handler = () => setOpenMenuId(null);
        window.addEventListener('click', handler);
        return () => window.removeEventListener('click', handler);
    }, []);

    useEffect(() => {
        if (profile?.company_id) {
            loadAll();
        }
    }, [profile?.company_id]);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [settingsData, enqResult] = await Promise.all([
                getDocumentSettings(profile.company_id),
                supabase
                    .from('customer_enquiries')
                    .select('*, customer:partners(name), contact:contacts(name)')
                    .eq('company_id', profile.company_id)
                    .order('created_at', { ascending: false })
            ]);
            setSettings(settingsData);
            if (enqResult.error) throw enqResult.error;

            let enqData = enqResult.data || [];
            if (enqData.length === 0) {
                console.log('No enquiries found, seeding prototype enquiries...');
                // Find or create a partner for 'Cel-ron enterprises pte ltd'
                const { data: partnerData } = await supabase
                    .from('partners')
                    .select('id')
                    .ilike('name', '%Cel-ron%')
                    .limit(1);
                
                let partnerId = partnerData?.[0]?.id;
                if (!partnerId) {
                    // Create one
                    const { data: newPart } = await supabase.from('partners').insert([{
                        name: 'Cel-ron enterprises pte ltd',
                        company_id: profile.company_id,
                        types: ['Supplier', 'Customer']
                    }]).select().single();
                    partnerId = newPart?.id;
                }

                const mockEnquiries = [
                    {
                        enquiry_no: 'ECEL-2606-2401',
                        company_id: profile.company_id,
                        customer_id: partnerId,
                        enquiry_date: '2026-06-24',
                        due_date: '2026-06-25',
                        source_type: 'WhatsApp',
                        description: '',
                        customer_ref: 'Enquiry',
                        status: 'New'
                    },
                    {
                        enquiry_no: 'ECEL-2606-0201',
                        company_id: profile.company_id,
                        customer_id: partnerId,
                        enquiry_date: '2026-06-02',
                        due_date: '2026-06-03',
                        source_type: 'Email',
                        description: 'Service Request for Electronic Governor',
                        customer_ref: 'Draft',
                        status: 'RFQ Floated'
                    },
                    {
                        enquiry_no: 'Enq-2603-0001',
                        company_id: profile.company_id,
                        customer_id: partnerId,
                        enquiry_date: '2026-06-01',
                        due_date: '2026-06-02',
                        source_type: 'WhatsApp',
                        description: 'Request for Quotation',
                        customer_ref: 'SR-4457-L26-1832',
                        status: 'RFQ Floated'
                    }
                ];

                const { data: seededData, error: seedError } = await supabase
                    .from('customer_enquiries')
                    .insert(mockEnquiries)
                    .select('*, customer:partners(name), contact:contacts(name)');
                
                if (!seedError && seededData) {
                    enqData = seededData;
                }
            }

            setEnquiries(enqData);
        } catch (err) {
            console.error('Error loading hub data:', err);
            toast.error('Failed to load enquiries');
        } finally {
            setLoading(false);
        }
    };

    // ─── Drive folder provision ───────────────────────────────────────────────
    const handleOpenDrive = async (enq) => {
        if (enq.gdrive_folder_id || enq.gdrive_file_link) {
            const url = getGoogleDriveExplorerUrl(enq, settings?.gdrive_celron_root_id || settings?.google_drive_folder_id);
            window.open(url, '_blank');
            return;
        }
        if (!window.confirm(`No Google Drive folder linked for ${enq.enquiry_no}. Would you like to provision a new enquiry folder now?`)) return;

        if (!isTokenValid()) {
            if (window.confirm('Google connection expired. Reconnect now?')) {
                sessionStorage.setItem('google_auth_return_url', window.location.pathname);
                connectGoogleAPI();
            }
            return;
        }

        const accessToken = localStorage.getItem('google_access_token');
        if (!accessToken) { toast.error('Google not connected'); return; }

        const loadToast = toast.loading('Provisioning enquiry folder in Google Drive...');
        try {
            let celronRootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
            if (!celronRootId) throw new Error('Google Drive Root Folder not configured in Settings.');
            if (celronRootId.includes('drive.google.com')) {
                const m = celronRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
                if (m) celronRootId = m[1];
            }

            const custName = enq.customer?.name || enq.customer_name || 'Unknown';
            const cleanName = custName.replace(/[^a-zA-Z0-9\s]/g, '').trim().substring(0, 20);
            const folderName = `${enq.enquiry_no} - ${cleanName}`;
            const year = new Date(enq.enquiry_date || enq.created_at).getFullYear().toString();

            const { provisionEnquiryFolderStructure } = await import('../../lib/driveService');
            const result = await provisionEnquiryFolderStructure(accessToken, celronRootId, year, folderName, true);

            // Save folder IDs back to Supabase
            await supabase.from('customer_enquiries').update({
                gdrive_folder_id: result.enqFolderId,
                gdrive_file_link: result.webViewLink
            }).eq('id', enq.id);

            toast.dismiss(loadToast);
            toast.success('Enquiry folder provisioned!');
            await loadAll();
            window.open(result.webViewLink, '_blank');
        } catch (err) {
            toast.dismiss(loadToast);
            toast.error('Provisioning failed: ' + err.message);
        }
    };

    const handleFloatRFQ = (enq) => {
        setSelectedEnquiry(enq);
        setIsFloatModalOpen(true);
    };

    const handleFloatConfirm = async (suppliers, sentCount) => {
        setIsFloatModalOpen(false);
        if (selectedEnquiry && sentCount > 0) {
            await supabase.from('customer_enquiries').update({ status: 'RFQ Floated' }).eq('id', selectedEnquiry.id);
            toast.success(`RFQ floated to ${sentCount} supplier(s)! Status updated.`);
            loadAll();
        }
    };

    const handleDelete = async (enq) => {
        if (!window.confirm(`Delete enquiry ${enq.enquiry_no}? This cannot be undone.`)) return;
        const { error } = await supabase.from('customer_enquiries').delete().eq('id', enq.id);
        if (error) { toast.error('Delete failed: ' + error.message); return; }
        toast.success('Enquiry deleted.');
        loadAll();
    };

    const handleDuplicate = async (enq) => {
        const { enquiry_no, id, created_at, updated_at, ...rest } = enq;
        // Generate new number
        const { generateEnquiryNo } = await import('../../lib/enquiryService');
        const newNo = await generateEnquiryNo(profile.company_id);
        const { data, error } = await supabase.from('customer_enquiries').insert([{
            ...rest,
            enquiry_no: newNo,
            status: 'New',
            enquiry_date: new Date().toISOString().split('T')[0],
            gdrive_folder_id: null,
            gdrive_file_link: null
        }]).select().single();
        if (error) { toast.error('Duplicate failed: ' + error.message); return; }
        toast.success(`Duplicated as ${newNo}`);
        navigate(`/workflows/enquiry/${data.id}`);
    };

    const handleOpenEnquiry = (enq, tab = 'lines') => {
        navigate(`/workflows/enquiry/${enq.id}?tab=${tab}`);
    };

    const handleQuote2Cust = (enq) => {
        navigate(`/quotations?create=1&enquiry_id=${enq.id}&enquiry_no=${enq.enquiry_no}`);
    };

    const handleOrder2Supplier = (enq) => {
        navigate(`/purchase-orders?create=1&enquiry_id=${enq.id}&enquiry_no=${enq.enquiry_no}`);
    };

    // Filter enquiries
    const availableYears = [...new Set(enquiries.map(e => new Date(e.enquiry_date || e.created_at).getFullYear().toString()))].sort((a, b) => b - a);
    const allStatuses = ['All', 'New', 'Open', 'RFQ Floated', 'Quote Sent', 'Quoted', 'Job Created', 'Closed', 'Cancelled'];

    const filteredEnquiries = enquiries.filter(e => {
        const year = new Date(e.enquiry_date || e.created_at).getFullYear().toString();
        const matchYear = selectedYear === 'All' || year === selectedYear;
        const matchStatus = statusFilter === 'All' || e.status === statusFilter;
        const term = searchQuery.toLowerCase();
        const matchSearch = !term ||
            (e.enquiry_no || '').toLowerCase().includes(term) ||
            (e.customer?.name || '').toLowerCase().includes(term) ||
            (e.customer_ref || '').toLowerCase().includes(term) ||
            (stripHtml(e.description) || '').toLowerCase().includes(term) ||
            (e.vessel || '').toLowerCase().includes(term) ||
            (e.vessel_name || '').toLowerCase().includes(term);
        return matchYear && matchStatus && matchSearch;
    });

    return (
        <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
            <style>{`
                /* Enquiry Card Quick Links */
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

                /* Float RFQ FAB */
                .float-rfq-fab {
                    position: fixed;
                    bottom: 32px;
                    right: 32px;
                    z-index: 500;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 14px 22px;
                    border-radius: 50px;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: #fff;
                    border: none;
                    cursor: pointer;
                    font-size: 0.92rem;
                    font-weight: 800;
                    box-shadow: 0 8px 24px rgba(99,102,241,0.4);
                    transition: all 0.2s;
                    letter-spacing: 0.01em;
                }
                .float-rfq-fab:hover {
                    transform: translateY(-3px) scale(1.03);
                    box-shadow: 0 12px 32px rgba(99,102,241,0.5);
                }
            `}</style>

            {/* ─── Page Header ─────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '12px', letterSpacing: '-0.02em', margin: 0 }}>
                        <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '14px', padding: '10px', display: 'flex' }}>
                            <ArrowRightLeft size={26} color="#fff" />
                        </div>
                        Unified Supplier Hub
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '6px', fontSize: '1rem' }}>
                        Manage enquiries · Float RFQs · Collect quotes · Convert to Jobs
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button className="btn btn-secondary" onClick={loadAll} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <RefreshCcw size={16} /> Refresh
                    </button>
                    <button className="btn btn-primary" onClick={() => navigate('/workflows/enquiry/new')} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                        <Plus size={18} /> New Enquiry
                    </button>
                </div>
            </div>

            {/* ─── Tab Selector ────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: '#f1f5f9', padding: '5px', borderRadius: '14px', width: 'fit-content' }}>
                {TABS.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: activeTab === tab.id ? '#fff' : 'transparent', color: activeTab === tab.id ? tab.color : '#64748b', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: activeTab === tab.id ? '0 2px 8px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.2s' }}>
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* ─── CUSTOMER ENQUIRIES TAB ──────────────────────────────────────── */}
            {activeTab === 'customer_enquiries' && (
                <>
                    {/* KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                        {[
                            { label: 'Total Enquiries', value: enquiries.length, sub: `${activeCount} active`, icon: <FileText size={20} />, color: '#6366f1', bg: '#eef2ff' },
                            { label: 'RFQ Floated', value: rfqFloatedCount, sub: 'Awaiting quotes', icon: <Send size={20} />, color: '#7c3aed', bg: '#faf5ff' },
                            { label: 'Overdue', value: overdueCount, sub: 'Need attention', icon: <AlertCircle size={20} />, color: overdueCount > 0 ? '#dc2626' : '#10b981', bg: overdueCount > 0 ? '#fff1f2' : '#f0fdf4' },
                            { label: 'This Year', value: enquiries.filter(e => new Date(e.enquiry_date || e.created_at).getFullYear() === new Date().getFullYear()).length, sub: `${selectedYear}`, icon: <Calendar size={20} />, color: '#0891b2', bg: '#ecfeff' },
                        ].map((kpi, i) => (
                            <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ background: kpi.bg, color: kpi.color, borderRadius: '10px', padding: '8px', display: 'flex' }}>{kpi.icon}</div>
                                    <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>{kpi.label}</span>
                                </div>
                                <div style={{ fontSize: '1.9rem', fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{kpi.sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* GDrive Workspace Bar */}
                    <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.05) 0%, rgba(139,92,246,0.04) 100%)', border: '1px solid #e0e7ff', borderRadius: '14px', padding: '16px 20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '10px', display: 'flex' }}>
                                <FolderOpen size={22} color="#f59e0b" />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, color: '#1e293b' }}>Enquiries Drive Workspace</div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>CELRONHUB / 01. TIME_BASED / ENQUIRIES — auto-provisioned per enquiry</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button onClick={() => { const rootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id; if (rootId) window.open(rootId.includes('http') ? rootId : `https://drive.google.com/drive/folders/${rootId}`, '_blank'); else toast.error('Drive root not configured'); }}
                                className="btn btn-secondary" style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ExternalLink size={14} /> Open Drive Root
                            </button>
                            <button onClick={() => navigate('/workflows/enquiry/new')}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                                <Plus size={14} /> New Enquiry
                            </button>
                        </div>
                    </div>

                    {/* Toolbar: Year Filter + Status Filter + Search + View */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                        {/* Year tabs */}
                        <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', gap: '2px', border: '1px solid #e2e8f0' }}>
                            <button onClick={() => setSelectedYear('All')} style={{ padding: '7px 14px', border: 'none', background: selectedYear === 'All' ? '#fff' : 'transparent', color: selectedYear === 'All' ? '#1e293b' : '#64748b', fontWeight: selectedYear === 'All' ? 700 : 500, borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>All</button>
                            {(availableYears.length > 0 ? availableYears : [new Date().getFullYear().toString()]).map(y => (
                                <button key={y} onClick={() => setSelectedYear(y)} style={{ padding: '7px 14px', border: 'none', background: selectedYear === y ? '#fff' : 'transparent', color: selectedYear === y ? '#1e293b' : '#64748b', fontWeight: selectedYear === y ? 700 : 500, borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>{y}</button>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {/* Status filter */}
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                                style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#fff', fontSize: '0.85rem', color: '#374151', cursor: 'pointer' }}>
                                {allStatuses.map(s => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
                            </select>

                            {/* Search */}
                            <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 14px', minWidth: '280px' }}>
                                <Search size={16} color="#94a3b8" style={{ marginRight: '8px', flexShrink: 0 }} />
                                <input type="text" placeholder="Search enquiries..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.88rem', background: 'transparent', color: '#1e293b' }} />
                            </div>

                            {/* View Toggle */}
                            <div style={{ display: 'flex', background: '#e2e8f0', padding: '4px', borderRadius: '10px', gap: '2px' }}>
                                <button onClick={() => setViewMode('card')} style={{ padding: '8px', border: 'none', background: viewMode === 'card' ? '#fff' : 'transparent', color: viewMode === 'card' ? '#6366f1' : '#64748b', borderRadius: '8px', cursor: 'pointer', display: 'flex' }}><Grid size={16} /></button>
                                <button onClick={() => setViewMode('table')} style={{ padding: '8px', border: 'none', background: viewMode === 'table' ? '#fff' : 'transparent', color: viewMode === 'table' ? '#6366f1' : '#64748b', borderRadius: '8px', cursor: 'pointer', display: 'flex' }}><List size={16} /></button>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '64px 0' }}>
                            <div className="animate-spin" style={{ margin: '0 auto 16px', width: '32px', height: '32px', border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%' }} />
                            <p style={{ color: '#94a3b8' }}>Loading enquiries...</p>
                        </div>
                    ) : viewMode === 'card' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                            {/* New Enquiry Card */}
                            <div onClick={() => navigate('/workflows/enquiry/new')}
                                style={{ padding: '24px', borderRadius: '18px', border: '1.5px dashed #6366f1', background: 'rgba(99,102,241,0.02)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '380px', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center' }}
                                onMouseOver={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.06)'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
                                onMouseOut={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.02)'; e.currentTarget.style.transform = 'none'; }}>
                                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#eef2ff', border: '1.5px solid #c7d2fe', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px', transition: 'transform 0.2s' }}>
                                    <Plus size={26} />
                                </div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '6px' }}>New Customer Enquiry</h3>
                                <p style={{ color: '#64748b', fontSize: '0.85rem', maxWidth: '180px' }}>Log a new enquiry and start the RFQ lifecycle.</p>
                            </div>

                            {filteredEnquiries.length === 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gridColumn: '1/-1', color: '#94a3b8', textAlign: 'center' }}>
                                    <Inbox size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>No Enquiries Found</h3>
                                    <p style={{ fontSize: '0.88rem' }}>Try changing the year/status filter or create a new enquiry.</p>
                                </div>
                            ) : filteredEnquiries.map(enq => (
                                <EnquiryCard
                                    key={enq.id}
                                    enq={enq}
                                    onOpen={handleOpenEnquiry}
                                    onDrive={handleOpenDrive}
                                    onFloat={handleFloatRFQ}
                                    onDelete={handleDelete}
                                    onDuplicate={handleDuplicate}
                                    onQuote={handleQuote2Cust}
                                    onPO={handleOrder2Supplier}
                                    onOpenRootDrive={() => {
                                        const rootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
                                        if (rootId) {
                                            window.open(rootId.includes('http') ? rootId : `https://drive.google.com/drive/folders/${rootId}`, '_blank');
                                        } else {
                                            toast.error('Drive root not configured');
                                        }
                                    }}
                                />
                            ))}
                        </div>
                    ) : (
                        /* Table View */
                        <div style={{ overflowX: 'auto', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#fff' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        {['ENQ No.', 'Customer', 'Description', 'Vessel/Loc', 'Cust. Ref', 'Received', 'Due Date', 'Status', 'Actions'].map(h => (
                                            <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredEnquiries.map(enq => {
                                        const sc = getStatusStyle(enq.status || 'Open');
                                        return (
                                            <tr key={enq.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                                                onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                                                <td style={{ padding: '12px 14px', fontWeight: 800, color: '#4f46e5', whiteSpace: 'nowrap' }}>{enq.enquiry_no || '—'}</td>
                                                <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1e293b' }}>{enq.customer?.name || '—'}</td>
                                                <td style={{ padding: '12px 14px', color: '#475569', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stripHtml(enq.description)}</td>
                                                <td style={{ padding: '12px 14px', color: '#64748b' }}>{enq.vessel || enq.vessel_name || '—'}</td>
                                                <td style={{ padding: '12px 14px', color: '#64748b' }}>{enq.customer_ref || '—'}</td>
                                                <td style={{ padding: '12px 14px', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(enq.enquiry_date)}</td>
                                                <td style={{ padding: '12px 14px', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(enq.due_date)}</td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <span style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 700, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>{enq.status || 'Open'}</span>
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                        <button onClick={() => handleOpenEnquiry(enq)} style={{ padding: '5px 8px', borderRadius: '7px', border: 'none', background: '#eef2ff', color: '#4f46e5', cursor: 'pointer', display: 'flex' }} title="Open"><Eye size={14} /></button>
                                                        <button onClick={() => handleOpenDrive(enq)} style={{ padding: '5px 8px', borderRadius: '7px', border: 'none', background: '#fffbeb', color: '#b45309', cursor: 'pointer', display: 'flex' }} title="Drive"><Folder size={14} /></button>
                                                        <button onClick={() => handleFloatRFQ(enq)} style={{ padding: '5px 8px', borderRadius: '7px', border: 'none', background: '#faf5ff', color: '#7c3aed', cursor: 'pointer', display: 'flex' }} title="Float RFQ"><Send size={14} /></button>
                                                        <button onClick={() => handleDelete(enq)} style={{ padding: '5px 8px', borderRadius: '7px', border: 'none', background: '#fff1f2', color: '#be123c', cursor: 'pointer', display: 'flex' }} title="Delete"><Trash2 size={14} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredEnquiries.length === 0 && (
                                        <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No enquiries found. <button onClick={() => navigate('/workflows/enquiry/new')} style={{ color: '#6366f1', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Create one →</button></td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* ─── SUPPLIER TOOLS TAB ──────────────────────────────────────────── */}
            {activeTab === 'supplier_tools' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                    {supplierTools.map((tool, idx) => (
                        <div key={idx}
                            onClick={() => tool.isExternal ? window.open(tool.path, '_blank') : navigate(tool.path)}
                            style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '22px', cursor: 'pointer', transition: 'all 0.22s cubic-bezier(0.4,0,0.2,1)', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}
                            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 12px 20px -3px ${tool.color}22`; e.currentTarget.style.borderColor = tool.color + '44'; }}
                            onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}>
                            <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: `${tool.color}18`, color: tool.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                                {tool.icon}
                            </div>
                            <h3 style={{ fontSize: '1.0rem', fontWeight: 700, color: '#1e293b', margin: '0 0 6px 0' }}>{tool.title}</h3>
                            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>{tool.description}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* ─── Fast Float Modal ─────────────────────────────────────────────── */}
            <FastFloatModal
                isOpen={isFloatModalOpen}
                onClose={() => setIsFloatModalOpen(false)}
                onConfirm={handleFloatConfirm}
                enquiry={selectedEnquiry}
            />

            {/* ─── Float RFQ FAB (bottom-right) ────────────────────────────────── */}
            {activeTab === 'customer_enquiries' && (
                <button className="float-rfq-fab" onClick={() => {
                    if (filteredEnquiries.length > 0) {
                        handleFloatRFQ(filteredEnquiries[0]);
                    } else {
                        toast('Create an enquiry first, then use Float RFQ', { icon: '💡' });
                    }
                }}>
                    <Send size={18} /> Float RFQ
                </button>
            )}
        </div>
    );
}
