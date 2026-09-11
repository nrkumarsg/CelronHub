import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams, useParams, Link } from 'react-router-dom';
import { 
    Search, Filter, Calendar, Layers, FileText, ShoppingCart, Briefcase, 
    ArrowRight, RefreshCcw, Loader2, Sparkles, Building2, Ship, 
    CreditCard, TrendingUp, CheckCircle2, Clock, AlertCircle, Plus, 
    ExternalLink, ArrowUpDown, ChevronRight, ChevronLeft, Eye, Check, ArrowDown, ArrowUp,
    CheckSquare, Square, Maximize2, Minimize2, Kanban, Cloud, FolderOpen, FolderCheck
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { searchMasterWorkflowLedger, getEnquiryEagleViewSuite } from '../../lib/workflowV2Service';
import { getStoredToken } from '../../lib/googleAuthService';
import { getDocumentSettings } from '../../lib/store';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import EnquiryEagleView from './EnquiryEagleView';
import SmartUploadPanel from '../../components/upload/SmartUploadPanel';
import EagleDriveTreeViewer from '../../components/workflows/EagleDriveTreeViewer';

const PERIOD_PRESETS = [
    { id: 'this_month', label: 'This Month' },
    { id: 'last_30',    label: 'Last 30 Days' },
    { id: 'this_quarter', label: 'This Quarter' },
    { id: 'ytd',        label: 'Year to Date (YTD)' },
    { id: 'all_time',   label: 'All Time' },
    { id: 'custom',     label: 'Custom Range' },
];

const CATEGORIES = [
    { id: 'all',        label: 'All Records',       icon: <Layers size={15} /> },
    { id: 'enquiries',  label: 'Only Enquiries',    icon: <FileText size={15} color="#3b82f6" /> },
    { id: 'jobs',       label: 'Matured Jobs (CEL-26)', icon: <Briefcase size={15} color="#10b981" /> },
    { id: 'quotations', label: 'Quote2Customers',   icon: <Sparkles size={15} color="#f59e0b" /> },
    { id: 'pos',        label: 'PO2 Suppliers',     icon: <ShoppingCart size={15} color="#f97316" /> },
];

export default function MasterControlLedger() {
    const navigate = useNavigate();
    const { id: routeId } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const { profile } = useAuth();

    // Filters
    const [category, setCategory] = useState(searchParams.get('category') || 'all');
    const [query, setQuery] = useState(searchParams.get('q') || '');
    const [period, setPeriod] = useState(searchParams.get('period') || 'this_month');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // Data State
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState([]);

    // Record Limit & Height Controls (Default: Limit 6 records)
    const [isExpanded, setIsExpanded] = useState(false);
    const [page, setPage] = useState(1);
    const pageSize = 6;

    // Master-Detail Selected Target ID
    const [selectedRecordId, setSelectedRecordId] = useState(
        routeId || searchParams.get('id') || searchParams.get('enquiry_id') || ''
    );

    // Collapsible Image 2 Tools above Table (Smart Upload Hub & Bilateral Drive Tree)
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [isDriveOpen, setIsDriveOpen] = useState(false);
    const [driveRefreshKey, setDriveRefreshKey] = useState(0);

    // Selected Target Record Suite Data for Target Folder resolution
    const [suiteData, setSuiteData] = useState(null);
    const [loadingSuite, setLoadingSuite] = useState(false);

    // DOM Scroll Refs
    const topTableRef = useRef(null);
    const eagleViewRef = useRef(null);
    const targetToolsRef = useRef(null);

    // Reset pagination to page 1 whenever filters change
    useEffect(() => {
        setPage(1);
    }, [category, query, period, statusFilter]);

    // Calculate start and end date based on preset
    useEffect(() => {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');

        if (period === 'this_month') {
            setDateFrom(`${yyyy}-${mm}-01`);
            setDateTo(`${yyyy}-${mm}-${dd}`);
        } else if (period === 'last_30') {
            const past30 = new Date(Date.now() - 30 * 86400000);
            setDateFrom(past30.toISOString().split('T')[0]);
            setDateTo(`${yyyy}-${mm}-${dd}`);
        } else if (period === 'this_quarter') {
            const currentQuarter = Math.floor(now.getMonth() / 3);
            const startMonth = String(currentQuarter * 3 + 1).padStart(2, '0');
            setDateFrom(`${yyyy}-${startMonth}-01`);
            setDateTo(`${yyyy}-${mm}-${dd}`);
        } else if (period === 'ytd') {
            setDateFrom(`${yyyy}-01-01`);
            setDateTo(`${yyyy}-${mm}-${dd}`);
        } else if (period === 'all_time') {
            setDateFrom('');
            setDateTo('');
        }
    }, [period]);

    // Fetch records whenever filters change
    useEffect(() => {
        fetchRecords();
    }, [category, dateFrom, dateTo, statusFilter]);

    // Sync routeId if changed in URL
    useEffect(() => {
        if (routeId) {
            setSelectedRecordId(routeId);
        }
    }, [routeId]);

    const fetchRecords = async () => {
        setLoading(true);
        try {
            const res = await searchMasterWorkflowLedger({
                category,
                query,
                dateFrom: dateFrom || null,
                dateTo: dateTo || null,
                status: statusFilter,
                companyId: profile?.company_id
            });
            if (res.success) {
                const data = res.data || [];
                setRecords(data);

                // Auto-select first record if no active selection
                if (!selectedRecordId && data.length > 0) {
                    const first = data[0].enquiryId || data[0].jobId || data[0].id || data[0].refNo;
                    setSelectedRecordId(first);
                }
            }
        } catch (err) {
            console.error('Error fetching master ledger:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearchSubmit = (e) => {
        e?.preventDefault();
        fetchRecords();
    };

    // Selection handler
    const handleSelectRecord = (r, shouldScroll = false) => {
        const targetId = r.enquiryId || r.jobId || r.id || r.refNo;
        setSelectedRecordId(targetId);

        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('id', targetId);
            return next;
        }, { replace: true });

        if (shouldScroll && eagleViewRef.current) {
            setTimeout(() => {
                eagleViewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
        }
    };

    // Fetch Eagle Suite Data for the active selected target to resolve live Google Drive folders
    useEffect(() => {
        if (!selectedRecordId) {
            setSuiteData(null);
            return;
        }
        let isCurrent = true;
        setLoadingSuite(true);
        getEnquiryEagleViewSuite(selectedRecordId)
            .then(res => {
                if (isCurrent && res?.success) {
                    setSuiteData(res.data);
                }
            })
            .catch(err => {
                console.error('Failed to load eagle suite for selected target:', err);
            })
            .finally(() => {
                if (isCurrent) setLoadingSuite(false);
            });
        return () => { isCurrent = false; };
    }, [selectedRecordId]);

    // Active Selected Record from current ledger search records
    const selectedRecord = useMemo(() => {
        return records.find(r => 
            (r.enquiryId && r.enquiryId === selectedRecordId) ||
            (r.jobId && r.jobId === selectedRecordId) ||
            (r.id && r.id === selectedRecordId) ||
            (r.refNo && r.refNo === selectedRecordId)
        ) || null;
    }, [records, selectedRecordId]);

    // Live Target Reference Number (handles Quotation, PO, Job, Enquiry)
    const targetRefNo = suiteData?.enquiry?.enquiry_no || 
        suiteData?.primaryDoc?.document_no || 
        (suiteData?.quotationDocs && suiteData?.quotationDocs[0]?.document_no) || 
        selectedRecord?.refNo || 
        selectedRecordId || 
        'Draft Enquiry';

    // Live Target Customer / Partner Name
    const targetCustomer = suiteData?.enquiry?.customer?.name || 
        suiteData?.job?.customer?.name || 
        suiteData?.primaryDoc?.partners?.name || 
        (suiteData?.quotationDocs && suiteData?.quotationDocs[0]?.partners?.name) || 
        selectedRecord?.client || 
        'Walk-in Client';

    // Live Target Google Drive Folder ID
    const targetFolderId = suiteData?.enquiry?.gdrive_folder_id || 
        suiteData?.job?.gdrive_folder_id || 
        suiteData?.primaryDoc?.gdrive_folder_id || 
        suiteData?.primaryDoc?.drive_folder_id || 
        (suiteData?.quotationDocs && suiteData?.quotationDocs[0]?.gdrive_folder_id) || 
        selectedRecord?.gdrive_folder_id || 
        null;

    // Smart Upload Document Handler for the Active Selected Record
    const handleSmartUploadSelect = async (file, metadata) => {
        if (!file) return;
        const targetSubfolder = metadata?.docCategory?.subfolder || metadata?.targetSubfolder || 'SupportDocs';
        const categoryId = metadata?.docCategory?.id || '';
        const docType = metadata?.docCategory?.docType || '';

        const loadToast = toast.loading(`Uploading ${file.name || 'document'} to [${targetSubfolder}] for ${targetRefNo}...`);
        try {
            const token = getStoredToken();
            if (!token) {
                toast.dismiss(loadToast);
                toast.error('Google Drive is not authenticated. Please connect Google Drive first.');
                return;
            }

            const { provisionFullProjectStructure, getOrCreateFolder, copyFile, uploadFileToDrive } = await import('../../lib/driveService');

            let rootId = targetFolderId;

            if (!rootId) {
                const docSettings = await getDocumentSettings(profile?.company_id);
                let celronRootId = docSettings?.gdrive_celron_root_id || docSettings?.google_drive_folder_id || '1GPr3g5mq6_TotBzM8gDz_atJPR7TgbB-';
                if (celronRootId && celronRootId.includes('drive.google.com')) {
                    const match = celronRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || celronRootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (match) celronRootId = match[1];
                }
                const year = new Date(selectedRecord?.date || new Date()).getFullYear().toString();
                const cleanTitle = `${targetRefNo} - ${targetCustomer}`;
                rootId = await provisionFullProjectStructure(token, celronRootId, year, cleanTitle);

                if (rootId) {
                    if (suiteData?.enquiry?.id) {
                        await supabase.from('customer_enquiries').update({ gdrive_folder_id: rootId }).eq('id', suiteData.enquiry.id);
                    }
                    if (suiteData?.job?.id) {
                        await supabase.from('workflow_documents').update({ gdrive_folder_id: rootId, drive_folder_id: rootId }).eq('id', suiteData.job.id);
                    }
                    if (suiteData?.primaryDoc?.id) {
                        await supabase.from('workflow_documents').update({ gdrive_folder_id: rootId, drive_folder_id: rootId }).eq('id', suiteData.primaryDoc.id);
                    }
                    if (selectedRecord?.enquiryId) {
                        await supabase.from('customer_enquiries').update({ gdrive_folder_id: rootId }).eq('id', selectedRecord.enquiryId);
                    }
                    if (selectedRecord?.id) {
                        await supabase.from('workflow_documents').update({ gdrive_folder_id: rootId, drive_folder_id: rootId }).eq('id', selectedRecord.id);
                    }
                }
            }

            let targetId = metadata?.targetFolder?.id || metadata?.targetFolder?.folderId;
            if (!targetId && rootId) {
                if (targetSubfolder === 'ROOT' || targetSubfolder === 'Root' || !targetSubfolder) {
                    targetId = rootId;
                } else {
                    targetId = await getOrCreateFolder(token, targetSubfolder, rootId);
                }
            } else if (!targetId) {
                targetId = rootId;
            }

            let uploadedResult;
            if (file.isGoogleDrive) {
                uploadedResult = await copyFile(token, file.id, targetId);
            } else {
                uploadedResult = await uploadFileToDrive(token, file, { 
                    folderId: targetId, 
                    title: file.name 
                });
            }

            const fileId = uploadedResult?.id || file.id;
            const fileLink = fileId ? `https://drive.google.com/file/d/${fileId}/view` : (uploadedResult?.webViewLink || '');

            if (suiteData?.enquiry?.id) {
                const currentAttachments = Array.isArray(suiteData.enquiry.attachment_urls) ? suiteData.enquiry.attachment_urls : [];
                const updatedAttachments = fileLink && !currentAttachments.includes(fileLink)
                    ? [...currentAttachments, fileLink]
                    : currentAttachments;
                await supabase.from('customer_enquiries').update({ attachment_urls: updatedAttachments }).eq('id', suiteData.enquiry.id);
            }

            toast.dismiss(loadToast);
            toast.success(`Successfully uploaded "${file.name}" to folder [${targetSubfolder}]!`);
            setDriveRefreshKey(prev => prev + 1);

            if (selectedRecordId) {
                const refreshed = await getEnquiryEagleViewSuite(selectedRecordId);
                if (refreshed?.success) setSuiteData(refreshed.data);
            }
            fetchRecords();
        } catch (err) {
            console.error('Smart upload error:', err);
            toast.dismiss(loadToast);
            toast.error(`Upload failed: ${err.message || 'Unknown error'}`);
        }
    };

    // Derived statistics
    const stats = useMemo(() => {
        const total = records.length;
        const enqCount = records.filter(r => r.type === 'Enquiry').length;
        const jobCount = records.filter(r => r.type === 'Job').length;
        const paidCount = records.filter(r => r.paymentStatus === 'Received' || r.status === 'Paid').length;
        return { total, enqCount, jobCount, paidCount };
    }, [records]);

    // Pagination & View Slicing (Default: 6 records)
    const totalPages = Math.ceil(records.length / pageSize) || 1;
    const visibleRecords = useMemo(() => {
        if (isExpanded) {
            return records;
        }
        const start = (page - 1) * pageSize;
        return records.slice(start, start + pageSize);
    }, [records, isExpanded, page]);

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', padding: '24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
            <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Header Title & Actions */}
                <div ref={topTableRef} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #1e2544 0%, #312e81 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 4px 14px rgba(30,37,68,0.3)' }}>
                                <Layers size={22} />
                            </div>
                            <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                                Master Operations Control Center
                            </h1>
                        </div>
                        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                            Universal search, period ledger, and unified 360° Eagle View Cockpit in one page.
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <Link
                            to="/workflows/whiteboard"
                            style={{ 
                                background: '#fffbeb', 
                                color: '#b45309', 
                                border: '1px solid #fde68a', 
                                padding: '9px 14px', 
                                borderRadius: '10px', 
                                fontSize: '0.82rem', 
                                fontWeight: 700, 
                                textDecoration: 'none', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '6px',
                                boxShadow: '0 1px 3px rgba(245, 158, 11, 0.1)'
                            }}
                            title="Open Interactive Whiteboard Status Pipeline"
                        >
                            <Kanban size={14} color="#d97706" /> 📌 Status Whiteboard
                        </Link>
                        <button
                            onClick={fetchRecords}
                            style={{ background: '#ffffff', color: '#475569', border: '1px solid #cbd5e1', padding: '9px 14px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                        </button>
                        <button
                            onClick={() => {
                                setIsDriveOpen(true);
                                targetToolsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }}
                            style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '9px 14px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <FolderOpen size={14} /> Drive & Upload Hub
                        </button>
                        <button
                            onClick={() => eagleViewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                            style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)', color: '#ffffff', border: 'none', padding: '9px 18px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}
                        >
                            🦅 Scroll to Eagle Cockpit <ArrowDown size={14} />
                        </button>
                    </div>
                </div>

                {/* KPI Overview Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                            <Layers size={20} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Records Found</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>{stats.total}</div>
                        </div>
                    </div>

                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                            <FileText size={20} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Enquiries Sourced</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#2563eb' }}>{stats.enqCount}</div>
                        </div>
                    </div>

                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                            <Briefcase size={20} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Matured Jobs (CEL-26)</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#059669' }}>{stats.jobCount}</div>
                        </div>
                    </div>

                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                            <CheckCircle2 size={20} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Settled / Paid</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#16a34a' }}>{stats.paidCount}</div>
                        </div>
                    </div>
                </div>

                {/* Target Concern Folder Bar & Image 2 Tools (Smart Upload Hub + Bilateral Drive Tree) */}
                <div ref={targetToolsRef} style={{ display: 'flex', flexDirection: 'column', gap: '14px', scrollMarginTop: '20px' }}>
                    
                    {/* Active Concern Target Banner */}
                    <div style={{
                        background: 'linear-gradient(135deg, #1e2544 0%, #2e1065 100%)',
                        border: '1px solid #4338ca',
                        borderRadius: '16px',
                        padding: '14px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '14px',
                        boxShadow: '0 4px 16px rgba(30, 37, 68, 0.15)',
                        color: '#ffffff'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                background: 'rgba(255, 255, 255, 0.12)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#38bdf8'
                            }}>
                                <FolderCheck size={20} />
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.92rem', fontWeight: 900, letterSpacing: '-0.01em' }}>
                                        Concern Folder Target:
                                    </span>
                                    <span style={{
                                        background: '#38bdf8',
                                        color: '#0f172a',
                                        fontWeight: 900,
                                        fontSize: '0.78rem',
                                        padding: '2px 10px',
                                        borderRadius: '6px',
                                        letterSpacing: '0.02em'
                                    }}>
                                        {targetRefNo}
                                    </span>
                                    <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                                        &bull; Client: <strong style={{ color: '#ffffff' }}>{targetCustomer}</strong>
                                    </span>
                                    {selectedRecord?.vessel && selectedRecord.vessel !== '—' && (
                                        <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                                            &bull; Vessel: <strong style={{ color: '#e2e8f0' }}>{selectedRecord.vessel}</strong>
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>Target Folder:</span>
                                    {targetFolderId ? (
                                        <span style={{ color: '#4ade80', fontWeight: 700 }}>
                                            ✓ Logged & Locked ({targetFolderId})
                                        </span>
                                    ) : (
                                        <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                                            ⚡ Auto-Provision on Ingestion ({targetRefNo})
                                        </span>
                                    )}
                                    {loadingSuite && <span style={{ color: '#93c5fd' }}>&bull; Synchronizing suite...</span>}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {targetFolderId && (
                                <button
                                    type="button"
                                    onClick={() => window.open(`https://drive.google.com/drive/folders/${targetFolderId}`, '_blank')}
                                    style={{
                                        background: 'rgba(255,255,255,0.12)',
                                        color: '#ffffff',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        padding: '7px 12px',
                                        borderRadius: '8px',
                                        fontSize: '0.76rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px'
                                    }}
                                >
                                    <ExternalLink size={13} /> Open in Drive
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={() => setIsUploadOpen(prev => !prev)}
                                style={{
                                    background: isUploadOpen ? '#ffffff' : 'rgba(99, 102, 241, 0.25)',
                                    color: isUploadOpen ? '#1e2544' : '#c7d2fe',
                                    border: `1px solid ${isUploadOpen ? '#ffffff' : '#6366f1'}`,
                                    padding: '7px 14px',
                                    borderRadius: '8px',
                                    fontSize: '0.76rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <Cloud size={14} />
                                {isUploadOpen ? <><Minimize2 size={13} /> Minimize Upload Hub</> : <><Maximize2 size={13} /> Smart Upload Hub</>}
                            </button>

                            <button
                                type="button"
                                onClick={() => setIsDriveOpen(prev => !prev)}
                                style={{
                                    background: isDriveOpen ? '#ffffff' : 'rgba(56, 189, 248, 0.2)',
                                    color: isDriveOpen ? '#1e2544' : '#bae6fd',
                                    border: `1px solid ${isDriveOpen ? '#ffffff' : '#38bdf8'}`,
                                    padding: '7px 14px',
                                    borderRadius: '8px',
                                    fontSize: '0.76rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <FolderOpen size={14} />
                                {isDriveOpen ? <><Minimize2 size={13} /> Minimize Drive Tree</> : <><Maximize2 size={13} /> Bilateral Drive Tree</>}
                            </button>
                        </div>
                    </div>

                    {/* Component 1: Smart Document Ingestion Hub (Collapsible) */}
                    {isUploadOpen && (
                        <div>
                            <SmartUploadPanel
                                isOpen={true}
                                embedded={true}
                                documentType="Technical & Commercial Documentation"
                                accept="*/*"
                                activeFolderId={targetFolderId || null}
                                activeFolderName={`${targetRefNo} > Root Folder (${selectedRecord?.type || 'Record'})`}
                                runningEnquiryNo={targetRefNo}
                                onSelect={handleSmartUploadSelect}
                                onToggleMinimize={() => setIsUploadOpen(false)}
                            />
                        </div>
                    )}

                    {/* Component 2: Bilateral Google Drive Folder Tree (Collapsible) */}
                    {isDriveOpen && (
                        <div style={{
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '16px',
                            overflow: 'hidden',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.04)'
                        }}>
                            <div style={{
                                padding: '14px 20px',
                                background: '#f8fafc',
                                borderBottom: '1px solid #e2e8f0',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '12px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{
                                        width: '34px',
                                        height: '34px',
                                        borderRadius: '10px',
                                        background: '#eff6ff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#3b82f6'
                                    }}>
                                        <FolderOpen size={18} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            Bilateral Google Drive Folder Tree
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                                                Logged: {targetRefNo}
                                            </span>
                                            <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>
                                                ({targetCustomer})
                                            </span>
                                        </h3>
                                        <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                                            Target Folder: <strong style={{ color: '#1e293b' }}>{targetFolderId ? `Logged (${targetFolderId})` : 'Auto-Provision on Ingestion'}</strong>
                                        </span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {targetFolderId && (
                                        <button
                                            type="button"
                                            onClick={() => window.open(`https://drive.google.com/drive/folders/${targetFolderId}`, '_blank')}
                                            style={{ background: '#ffffff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                        >
                                            <ExternalLink size={13} /> Open in Drive
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setDriveRefreshKey(prev => prev + 1)}
                                        title="Reload Drive Tree"
                                        style={{ background: '#ffffff', color: '#475569', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                    >
                                        <RefreshCcw size={13} /> Refresh Tree
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsDriveOpen(false)}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            background: '#ffffff',
                                            color: '#475569',
                                            border: '1px solid #cbd5e1',
                                            padding: '6px 14px',
                                            borderRadius: '8px',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <Minimize2 size={13} /> Minimize Tree
                                    </button>
                                </div>
                            </div>

                            <div style={{ padding: '20px' }}>
                                <EagleDriveTreeViewer
                                    key={`${targetFolderId || ''}-${targetRefNo}-${driveRefreshKey}`}
                                    enquiry={suiteData?.enquiry || { enquiry_no: targetRefNo, customer_name: targetCustomer, gdrive_folder_id: targetFolderId }}
                                    jobNo={targetRefNo}
                                    folderId={targetFolderId}
                                    jobFolderId={targetFolderId}
                                    customerName={targetCustomer}
                                    companyId={profile?.company_id}
                                    readOnly={false}
                                />
                            </div>
                        </div>
                    )}

                </div>

                {/* Master Filter & Search Panel */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                    {/* Category Selection Tabs */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                        {CATEGORIES.map(cat => {
                            const active = category === cat.id;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => setCategory(cat.id)}
                                    style={{
                                        background: active ? '#1e2544' : '#f8fafc',
                                        color: active ? '#ffffff' : '#475569',
                                        border: `1.5px solid ${active ? '#1e2544' : '#e2e8f0'}`,
                                        padding: '8px 14px',
                                        borderRadius: '10px',
                                        fontSize: '0.8rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        whiteSpace: 'nowrap',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    {cat.icon}
                                    <span>{cat.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Search & Period Filter Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', alignItems: 'center' }}>
                        {/* Keyword / Part description input */}
                        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '10px', padding: '2px 12px' }}>
                            <Search size={16} color="#94a3b8" style={{ marginRight: '8px' }} />
                            <input
                                type="text"
                                placeholder="Search part description, item, subject, vessel..."
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                style={{ background: 'transparent', border: 'none', outline: 'none', padding: '8px 0', fontSize: '0.85rem', width: '100%', color: '#1e293b' }}
                            />
                            <button
                                type="submit"
                                style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', marginLeft: '6px' }}
                            >
                                Search
                            </button>
                        </form>

                        {/* Period Presets */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Calendar size={16} color="#64748b" />
                            <select
                                value={period}
                                onChange={e => setPeriod(e.target.value)}
                                style={{ flex: 1, padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', background: '#f8fafc', fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}
                            >
                                {PERIOD_PRESETS.map(p => (
                                    <option key={p.id} value={p.id}>{p.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Status Filter */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Filter size={16} color="#64748b" />
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                style={{ flex: 1, padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', background: '#f8fafc', fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}
                            >
                                <option value="all">All Statuses</option>
                                <option value="Open">Open</option>
                                <option value="Converted">Won / Converted</option>
                                <option value="Closed">Closed / Settled</option>
                                <option value="Paid">Paid (Received)</option>
                                <option value="Pending">Pending Payment</option>
                            </select>
                        </div>
                    </div>

                    {/* Custom Date Range if selected */}
                    {period === 'custom' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#f1f5f9', padding: '10px 14px', borderRadius: '10px' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569' }}>Date Range:</span>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={e => setDateFrom(e.target.value)}
                                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                            />
                            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>➔</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={e => setDateTo(e.target.value)}
                                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                            />
                            <button
                                onClick={fetchRecords}
                                style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}
                            >
                                Apply
                            </button>
                        </div>
                    )}
                </div>

                {/* Master Records Ledger Table */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                    {/* Table Control Header Bar */}
                    <div style={{ padding: '12px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>Records Ledger</span>
                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                                    {isExpanded 
                                        ? `(Showing all ${records.length} records)` 
                                        : `(Showing ${records.length === 0 ? 0 : (page - 1) * pageSize + 1}–${Math.min(records.length, page * pageSize)} of ${records.length})`}
                                </span>
                            </div>

                            {/* Expand / Shrink Height Toggle Button */}
                            <button
                                onClick={() => setIsExpanded(prev => !prev)}
                                style={{
                                    background: isExpanded ? '#e0e7ff' : '#ffffff',
                                    color: isExpanded ? '#4338ca' : '#475569',
                                    border: `1.5px solid ${isExpanded ? '#c7d2fe' : '#cbd5e1'}`,
                                    padding: '5px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.74rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                    transition: 'all 0.15s'
                                }}
                                title={isExpanded ? 'Shrink height back to 6 records' : 'Expand height to view all records'}
                            >
                                {isExpanded ? (
                                    <>
                                        <Minimize2 size={13} color="#4338ca" /> Shrink Height (Limit 6 Rows)
                                    </>
                                ) : (
                                    <>
                                        <Maximize2 size={13} color="#6366f1" /> Expand Height ({records.length} records)
                                    </>
                                )}
                            </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                            {selectedRecordId && (
                                <div style={{ fontSize: '0.74rem', color: '#4f46e5', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Check size={13} strokeWidth={3} /> Selected Target: <strong>{selectedRecordId}</strong>
                                </div>
                            )}

                            {/* Header Quick Pagination (Compact mode) */}
                            {!isExpanded && totalPages > 1 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <button
                                        disabled={page <= 1}
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        style={{
                                            background: '#ffffff',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '6px',
                                            padding: '4px 8px',
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            color: page <= 1 ? '#cbd5e1' : '#334155',
                                            cursor: page <= 1 ? 'not-allowed' : 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <ChevronLeft size={13} />
                                    </button>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', padding: '0 4px' }}>
                                        {page} / {totalPages}
                                    </span>
                                    <button
                                        disabled={page >= totalPages}
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        style={{
                                            background: '#ffffff',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '6px',
                                            padding: '4px 8px',
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            color: page >= totalPages ? '#cbd5e1' : '#334155',
                                            cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <ChevronRight size={13} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Table View Container (Constrained Height when expanded, compact 6 rows when shrunk) */}
                    <div style={{
                        overflowX: 'auto',
                        maxHeight: isExpanded ? '480px' : 'none',
                        overflowY: isExpanded ? 'auto' : 'visible'
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', color: '#64748b', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                                    <th style={{ padding: '12px 18px', fontWeight: 800, width: '110px' }}>TARGET</th>
                                    <th style={{ padding: '12px 18px', fontWeight: 800 }}>Document / Ref #</th>
                                    <th style={{ padding: '12px 18px', fontWeight: 800 }}>Type</th>
                                    <th style={{ padding: '12px 18px', fontWeight: 800 }}>Client / Partner</th>
                                    <th style={{ padding: '12px 18px', fontWeight: 800 }}>Vessel</th>
                                    <th style={{ padding: '12px 18px', fontWeight: 800 }}>Description Snippet</th>
                                    <th style={{ padding: '12px 18px', fontWeight: 800 }}>Date</th>
                                    <th style={{ padding: '12px 18px', fontWeight: 800, textAlign: 'right' }}>Amount</th>
                                    <th style={{ padding: '12px 18px', fontWeight: 800, textAlign: 'center' }}>Lifecycle</th>
                                    <th style={{ padding: '12px 18px', fontWeight: 800, textAlign: 'center' }}>Payment</th>
                                    <th style={{ padding: '12px 18px', fontWeight: 800, textAlign: 'center' }}>Control Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={11} style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                                            <Loader2 size={28} className="animate-spin text-indigo-600" style={{ margin: '0 auto 8px' }} />
                                            <div>Loading ledger records...</div>
                                        </td>
                                    </tr>
                                ) : records.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                                            <AlertCircle size={32} color="#94a3b8" style={{ margin: '0 auto 8px' }} />
                                            <div style={{ fontWeight: 800, color: '#1e293b' }}>No transactions found</div>
                                            <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>Try broadening your search term or date range.</div>
                                        </td>
                                    </tr>
                                ) : (
                                    visibleRecords.map((r, idx) => {
                                        const targetId = r.enquiryId || r.jobId || r.id || r.refNo;
                                        const isSelected = selectedRecordId && (
                                            selectedRecordId === r.enquiryId || 
                                            selectedRecordId === r.jobId || 
                                            selectedRecordId === r.id || 
                                            selectedRecordId === r.refNo
                                        );

                                        return (
                                            <tr
                                                key={idx}
                                                style={{
                                                    borderBottom: '1px solid #f1f5f9',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.12s',
                                                    background: isSelected ? '#eff6ff' : 'transparent',
                                                    borderLeft: isSelected ? '4px solid #4f46e5' : '4px solid transparent'
                                                }}
                                                onMouseOver={e => !isSelected && (e.currentTarget.style.background = '#f8fafc')}
                                                onMouseOut={e => !isSelected && (e.currentTarget.style.background = 'transparent')}
                                                onClick={() => handleSelectRecord(r, false)}
                                            >
                                                {/* Target indicator cell */}
                                                <td style={{ padding: '14px 18px' }} onClick={e => { e.stopPropagation(); handleSelectRecord(r, false); }}>
                                                    {isSelected ? (
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#4f46e5', color: '#ffffff', padding: '3px 8px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 800 }}>
                                                            <Check size={12} strokeWidth={3} /> TARGET
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#94a3b8', padding: '3px 8px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 600, border: '1px solid #e2e8f0', background: '#ffffff' }}>
                                                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', border: '1px solid #cbd5e1' }} />
                                                            Select
                                                        </div>
                                                    )}
                                                </td>

                                                <td style={{ padding: '14px 18px', fontWeight: 800, color: '#4f46e5' }}>
                                                    {r.refNo}
                                                </td>
                                                <td style={{ padding: '14px 18px' }}>
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        fontWeight: 800,
                                                        padding: '3px 8px',
                                                        borderRadius: '6px',
                                                        background: r.type === 'Enquiry' ? '#eff6ff' : (r.type === 'Job' ? '#ecfdf5' : (r.type === 'Quotation' ? '#fffbeb' : '#fff7ed')),
                                                        color: r.type === 'Enquiry' ? '#1d4ed8' : (r.type === 'Job' ? '#059669' : (r.type === 'Quotation' ? '#d97706' : '#ea580c'))
                                                    }}>
                                                        {r.type}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '14px 18px', fontWeight: 600, color: '#1e293b' }}>
                                                    {r.client}
                                                </td>
                                                <td style={{ padding: '14px 18px', color: '#475569' }}>
                                                    {r.vessel}
                                                </td>
                                                <td style={{ padding: '14px 18px', color: '#64748b', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>
                                                    {r.description || '—'}
                                                </td>
                                                <td style={{ padding: '14px 18px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                                    {r.date ? new Date(r.date).toLocaleDateString() : '—'}
                                                </td>
                                                <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                                                    {r.amount || '—'}
                                                </td>
                                                <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                                                    <span style={{
                                                        fontSize: '0.68rem',
                                                        fontWeight: 800,
                                                        padding: '2px 8px',
                                                        borderRadius: '10px',
                                                        background: r.lifecycle === 'Won / Converted' ? '#dcfce7' : (r.lifecycle === 'Closed' ? '#f1f5f9' : '#ecfeff'),
                                                        color: r.lifecycle === 'Won / Converted' ? '#166534' : (r.lifecycle === 'Closed' ? '#475569' : '#0e7490')
                                                    }}>
                                                        {r.lifecycle || r.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                                                    <span style={{
                                                        fontSize: '0.68rem',
                                                        fontWeight: 800,
                                                        padding: '2px 8px',
                                                        borderRadius: '10px',
                                                        background: r.paymentStatus === 'Received' ? '#dcfce7' : '#fee2e2',
                                                        color: r.paymentStatus === 'Received' ? '#166534' : '#991b1b'
                                                    }}>
                                                        {r.paymentStatus || 'Pending'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '14px 18px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => handleSelectRecord(r, true)}
                                                        style={{
                                                            background: isSelected ? '#1e2544' : '#4f46e5',
                                                            color: '#ffffff',
                                                            border: 'none',
                                                            padding: '6px 12px',
                                                            borderRadius: '8px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 800,
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            boxShadow: '0 2px 6px rgba(79,70,229,0.25)',
                                                            transition: 'all 0.15s'
                                                        }}
                                                    >
                                                        🦅 View Below <ArrowDown size={12} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Table Footer: Pagination & Height Controls */}
                    {!isExpanded && totalPages > 1 && (
                        <div style={{
                            padding: '12px 18px',
                            background: '#f8fafc',
                            borderTop: '1px solid #e2e8f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '10px',
                            fontSize: '0.76rem',
                            color: '#64748b'
                        }}>
                            <div>
                                Showing <strong>6</strong> records per page &bull; Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({records.length} total)
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    disabled={page <= 1}
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    style={{
                                        padding: '5px 12px',
                                        borderRadius: '7px',
                                        border: '1px solid #cbd5e1',
                                        background: page <= 1 ? '#f1f5f9' : '#ffffff',
                                        color: page <= 1 ? '#94a3b8' : '#1e293b',
                                        fontWeight: 700,
                                        cursor: page <= 1 ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <ChevronLeft size={14} /> Previous 6
                                </button>
                                <button
                                    disabled={page >= totalPages}
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    style={{
                                        padding: '5px 12px',
                                        borderRadius: '7px',
                                        border: '1px solid #cbd5e1',
                                        background: page >= totalPages ? '#f1f5f9' : '#ffffff',
                                        color: page >= totalPages ? '#94a3b8' : '#1e293b',
                                        fontWeight: 700,
                                        cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    Next 6 <ChevronRight size={14} />
                                </button>

                                <button
                                    onClick={() => setIsExpanded(true)}
                                    style={{
                                        marginLeft: '6px',
                                        padding: '5px 12px',
                                        borderRadius: '7px',
                                        border: '1px solid #c7d2fe',
                                        background: '#eff6ff',
                                        color: '#4338ca',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Maximize2 size={12} /> Expand All ({records.length})
                                </button>
                            </div>
                        </div>
                    )}

                    {isExpanded && records.length > 6 && (
                        <div style={{
                            padding: '10px 18px',
                            background: '#f8fafc',
                            borderTop: '1px solid #e2e8f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '0.76rem',
                            color: '#64748b'
                        }}>
                            <span>All {records.length} records are expanded with scrollable height.</span>
                            <button
                                onClick={() => setIsExpanded(false)}
                                style={{
                                    padding: '5px 12px',
                                    borderRadius: '7px',
                                    border: '1px solid #cbd5e1',
                                    background: '#ffffff',
                                    color: '#334155',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                <Minimize2 size={12} /> Shrink Height (Limit 6 Rows)
                            </button>
                        </div>
                    )}
                </div>

                {/* 360° Eagle View Cockpit for the Selected Target (Image 3 Logic) */}
                <div ref={eagleViewRef} style={{ scrollMarginTop: '20px', marginTop: '10px' }}>
                    <EnquiryEagleView 
                        selectedId={selectedRecordId}
                        embedded={true}
                        hideDriveAndUpload={true}
                        onScrollToTable={() => topTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    />
                </div>

            </div>
        </div>
    );
}
