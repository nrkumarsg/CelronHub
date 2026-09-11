import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
    ArrowLeft, LayoutDashboard, ShoppingCart, FileText, FolderOpen, 
    DollarSign, TrendingUp, Clock, CheckCircle2, AlertCircle, Plus, 
    Edit3, Trash2, ExternalLink, RefreshCcw, Loader2, Sparkles, Building2, 
    Ship, MapPin, Eye, Printer, Send, Package, Receipt, ChevronDown, 
    Calendar, Check, ShieldCheck, Upload, FileCheck, Layers, Search, 
    CreditCard, ArrowRight, Tag, Phone, Mail, AlertTriangle, X, ArrowUp,
    ChevronUp, Maximize2, Minimize2, Cloud, HardDrive, Smartphone, MessageSquare
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { 
    getEnquiryEagleViewSuite, 
    createJobFromEnquiry, 
    updateEnquiryPaymentAndLifecycle 
} from '../../lib/workflowV2Service';
import { supabase } from '../../lib/supabase';
import EagleDriveTreeViewer from '../../components/workflows/EagleDriveTreeViewer';
import SmartUploadPanel from '../../components/upload/SmartUploadPanel';
import GoogleCalendarReminderModal from '../../components/common/GoogleCalendarReminderModal';
import FastFloatModal from '../../components/workflows/FastFloatModal';
import { getStoredToken } from '../../lib/googleAuthService';
import { getDocumentSettings } from '../../lib/store';
import toast from 'react-hot-toast';

const STAGES = [
    { key: 'ENQ', label: '1. Enquiry', color: '#3b82f6', bg: '#eff6ff' },
    { key: 'RFQ', label: '2. RFQ / Sourcing', color: '#8b5cf6', bg: '#f5f3ff' },
    { key: 'QTN', label: '3. Quote2Customer', color: '#f59e0b', bg: '#fffbeb' },
    { key: 'PO',  label: '4. PO2 Supplier', color: '#f97316', bg: '#fff7ed' },
    { key: 'JOB', label: '5. Job Control', color: '#10b981', bg: '#ecfdf5' },
    { key: 'INV', label: '6. Billing & Paid', color: '#06b6d4', bg: '#ecfeff' },
];

export default function EnquiryEagleView({
    selectedId: propSelectedId = null,
    embedded = false,
    onScrollToTable = null,
    hideDriveAndUpload = false
} = {}) {
    const { id: paramId } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { profile } = useAuth();

    const queryEnquiryId = propSelectedId || searchParams.get('enquiry_id') || searchParams.get('id') || paramId;
    const [activeId, setActiveId] = useState(queryEnquiryId || '');

    const [loading, setLoading] = useState(true);
    const [suiteData, setSuiteData] = useState(null);
    const [convertingJob, setConvertingJob] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);

    // Collapsible Components State (user can minimize/maximize each section)
    const [isPillarsOpen, setIsPillarsOpen] = useState(true);
    const [isUploadOpen, setIsUploadOpen] = useState(true);
    const [isDriveOpen, setIsDriveOpen] = useState(true);
    const [driveRefreshKey, setDriveRefreshKey] = useState(0);

    // Search Switcher Dropdown
    const [searchQuery, setSearchQuery] = useState('');
    const [searchSuggestions, setSearchSuggestions] = useState([]);
    const [searchingSuggestions, setSearchingSuggestions] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchRef = useRef(null);

    // Modals
    const [showFastFloat, setShowFastFloat] = useState(false);
    const [calendarModal, setCalendarModal] = useState({ isOpen: false, title: '', date: '', description: '', location: '', activityType: '', jobNo: '' });
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [selectedPaymentStatus, setSelectedPaymentStatus] = useState('Pending');
    const [paymentProofUrl, setPaymentProofUrl] = useState('');
    const [uploadingProof, setUploadingProof] = useState(false);

    // Lifecycle Status dropdown
    const [showLifecycleDropdown, setShowLifecycleDropdown] = useState(false);
    const lifecycleRef = useRef(null);

    // Active bottom tab: 'drive' | 'items' | 'notes'
    const [bottomTab, setBottomTab] = useState('drive');

    useEffect(() => {
        if (propSelectedId) {
            setActiveId(propSelectedId);
        } else if (queryEnquiryId) {
            setActiveId(queryEnquiryId);
        }
    }, [propSelectedId, queryEnquiryId]);

    useEffect(() => {
        if (activeId) {
            loadEagleSuite(activeId);
        } else if (!embedded) {
            loadDefaultRecentEnquiry();
        } else {
            setLoading(false);
        }
    }, [activeId]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
            if (lifecycleRef.current && !lifecycleRef.current.contains(e.target)) {
                setShowLifecycleDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Live search suggestions for Enquiry Switcher
    useEffect(() => {
        if (!searchQuery || searchQuery.trim().length < 2) {
            setSearchSuggestions([]);
            return;
        }

        const timer = setTimeout(async () => {
            setSearchingSuggestions(true);
            try {
                const term = `%${searchQuery.trim()}%`;
                const [enqRes, jobRes] = await Promise.all([
                    supabase
                        .from('customer_enquiries')
                        .select('id, enquiry_no, subject, customer:partners!customer_id(name), vessel:vessels!vessel_id(vessel_name)')
                        .or(`enquiry_no.ilike.${term},subject.ilike.${term},customer_ref.ilike.${term}`)
                        .limit(6),
                    supabase
                        .from('workflow_documents')
                        .select('id, document_no, assigned_job_no, subject, enquiry_id, partners!partner_id(name)')
                        .or(`document_no.ilike.${term},assigned_job_no.ilike.${term},subject.ilike.${term}`)
                        .limit(4)
                ]);

                const items = [];
                (enqRes.data || []).forEach(e => {
                    items.push({
                        id: e.id,
                        no: e.enquiry_no,
                        title: e.subject || 'Enquiry',
                        client: e.customer?.name || 'Walk-in',
                        vessel: e.vessel?.vessel_name || '',
                        type: 'Enquiry'
                    });
                });
                (jobRes.data || []).forEach(j => {
                    items.push({
                        id: j.enquiry_id || j.id,
                        no: j.assigned_job_no || j.document_no,
                        title: j.subject || 'Job Document',
                        client: j.partners?.name || '—',
                        vessel: '',
                        type: 'Job'
                    });
                });
                setSearchSuggestions(items);
                setShowSuggestions(true);
            } catch (err) {
                console.error('Error fetching suggestions:', err);
            } finally {
                setSearchingSuggestions(false);
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const loadDefaultRecentEnquiry = async () => {
        try {
            setLoading(true);
            const { data } = await supabase
                .from('customer_enquiries')
                .select('id')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (data?.id) {
                setActiveId(data.id);
            } else {
                setLoading(false);
            }
        } catch (err) {
            console.error('Error loading default enquiry:', err);
            setLoading(false);
        }
    };

    const loadEagleSuite = async (identifier) => {
        if (!identifier) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await getEnquiryEagleViewSuite(identifier);
            if (res.success && res.data) {
                setSuiteData(res.data);
                setSelectedPaymentStatus(res.data.paymentStatus || 'Pending');
                setPaymentProofUrl(res.data.paymentProofUrl || '');
            } else {
                setSuiteData(null);
                if (!embedded) toast.error(res.error || 'Record not found');
            }
        } catch (err) {
            console.error('Error loading eagle suite:', err);
            setSuiteData(null);
            if (!embedded) toast.error('Failed to load eagle suite');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectSuggestion = (item) => {
        setShowSuggestions(false);
        setSearchQuery('');
        setActiveId(item.id || item.no);
    };

    // 1-Click Convert to Job
    const handleConvertJob = async () => {
        if (!suiteData?.enquiry?.id) return;
        if (!window.confirm(`Convert Enquiry ${suiteData.enquiry.enquiry_no} into an active project Job with official Job Number?`)) return;

        setConvertingJob(true);
        try {
            const res = await createJobFromEnquiry(suiteData.enquiry.id, profile?.company_id);
            if (res.success) {
                toast.success(`Job ${res.jobNo} created and linked successfully!`);
                await loadEagleSuite(suiteData.enquiry.id);
            }
        } catch (err) {
            console.error('Error converting job:', err);
            toast.error('Failed to create job: ' + err.message);
        } finally {
            setConvertingJob(false);
        }
    };

    // Update Lifecycle
    const handleUpdateLifecycle = async (newLifecycle) => {
        if (!suiteData?.enquiry?.id) return;
        setShowLifecycleDropdown(false);
        setUpdatingStatus(true);
        try {
            await updateEnquiryPaymentAndLifecycle(suiteData.enquiry.id, { lifecycleStatus: newLifecycle });
            toast.success(`Status updated to ${newLifecycle}`);
            setSuiteData(prev => ({ ...prev, lifecycle: newLifecycle }));
        } catch (err) {
            toast.error('Failed to update lifecycle: ' + err.message);
        } finally {
            setUpdatingStatus(false);
        }
    };

    // Save Payment Status & Proof
    const handleSavePaymentStatus = async () => {
        if (!suiteData?.enquiry?.id) return;
        setUpdatingStatus(true);
        try {
            await updateEnquiryPaymentAndLifecycle(suiteData.enquiry.id, {
                paymentStatus: selectedPaymentStatus,
                paymentProofUrl: paymentProofUrl
            });
            toast.success('Payment status updated');
            setSuiteData(prev => ({
                ...prev,
                paymentStatus: selectedPaymentStatus,
                paymentProofUrl: paymentProofUrl
            }));
            setPaymentModalOpen(false);
        } catch (err) {
            toast.error('Failed to update payment: ' + err.message);
        } finally {
            setUpdatingStatus(false);
        }
    };

    // Handle Upload Payment Proof File
    const handleUploadPaymentProof = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingProof(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `proofs/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

            const { data, error } = await supabase.storage
                .from('workflow-attachments')
                .upload(fileName, file);

            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage
                .from('workflow-attachments')
                .getPublicUrl(fileName);

            setPaymentProofUrl(publicUrl);
            toast.success('Proof uploaded! Click "Save Payment Details" to apply.');
        } catch (err) {
            console.error('Upload proof error:', err);
            toast.error('Upload failed: ' + err.message);
        } finally {
            setUploadingProof(false);
        }
    };

    if (loading && !suiteData) {
        if (embedded) {
            return (
                <div style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '48px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    color: '#64748b',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}>
                    <Loader2 size={32} className="animate-spin text-indigo-600" />
                    <div style={{ fontWeight: 800, color: '#1e293b' }}>Loading Eagle View Cockpit...</div>
                    <div style={{ fontSize: '0.8rem' }}>Compiling related Enquiry, RFQs, Quotes, POs, Jobs (CEL-26) and Billing details</div>
                </div>
            );
        }
        return (
            <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', color: '#64748b' }}>
                <Loader2 size={38} className="animate-spin text-indigo-600" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Loading Enquiry 360° Eagle View...</h3>
                <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>Compiling Quotes, Supplier POs, Job records, and Drive folder tree</p>
            </div>
        );
    }

    if (!suiteData && !loading) {
        if (embedded) {
            return (
                <div style={{
                    background: '#ffffff',
                    border: '1.5px dashed #cbd5e1',
                    borderRadius: '16px',
                    padding: '48px 24px',
                    textAlign: 'center',
                    color: '#64748b',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}>
                    <Search size={36} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#334155', margin: '0 0 6px' }}>
                        Select a Record Above to Launch 360° Eagle View Cockpit
                    </h3>
                    <p style={{ fontSize: '0.82rem', margin: 0, color: '#64748b' }}>
                        Click any Enquiry, Matured Job (CEL-26), Quotation, or PO in the table above to inspect all linked documents and actions.
                    </p>
                </div>
            );
        }
        return (
            <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#ffffff', padding: '36px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 10px 30px rgba(0,0,0,0.06)', textAlign: 'center', maxWidth: '480px' }}>
                    <AlertCircle size={44} style={{ color: '#ef4444', margin: '0 auto 12px' }} />
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>No Enquiry Selected</h2>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '12px 0 20px' }}>Select an enquiry from the search bar or return to the control center.</p>
                    <button
                        onClick={() => navigate('/workflows/eagle-control')}
                        style={{ background: '#4f46e5', color: '#ffffff', border: 'none', padding: '10px 22px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                        Go to Master Control Ledger
                    </button>
                </div>
            </div>
        );
    }

    const {
        enquiry, job, jobNo, supplierQuotes, quotationDocs, supplierPoDocs,
        customerPoDocs, doDocs, invoiceDocs, metrics, lifecycle, paymentStatus: currentPaymentStatus,
        primaryDoc
    } = suiteData;

    const enqNo = enquiry?.enquiry_no || primaryDoc?.document_no || (quotationDocs && quotationDocs[0]?.document_no) || (customerPoDocs && customerPoDocs[0]?.document_no) || 'Draft Enquiry';
    const customer = enquiry?.customer?.name || job?.customer?.name || primaryDoc?.partners?.name || (quotationDocs && quotationDocs[0]?.partners?.name) || 'Walk-in Client';
    const vessel = enquiry?.vessel?.vessel_name || job?.vessel?.vessel_name || primaryDoc?.vessels?.vessel_name || '—';
    const activeJobNo = jobNo || job?.job_no || primaryDoc?.assigned_job_no || null;
    const folderId = enquiry?.gdrive_folder_id || job?.gdrive_folder_id || primaryDoc?.gdrive_folder_id || primaryDoc?.drive_folder_id || (quotationDocs && quotationDocs[0]?.gdrive_folder_id) || null;

    // Progress Stage calculation
    const isPaid = currentPaymentStatus === 'Received';
    const hasJob = !!activeJobNo;
    const hasQuote = quotationDocs && quotationDocs.length > 0;
    const hasPo = supplierPoDocs && supplierPoDocs.length > 0;
    const hasRfq = supplierQuotes && supplierQuotes.length > 0;

    // Smart Document Upload Handler for Eagle View
    const handleSmartUploadSelect = async (file, metadata) => {
        if (!file) return;
        const targetSubfolder = metadata?.docCategory?.subfolder || metadata?.targetSubfolder || 'SupportDocs';
        const categoryLabel = metadata?.docCategory?.shortLabel || metadata?.docCategory?.label || 'Document';
        const categoryId = metadata?.docCategory?.id || '';
        const docType = metadata?.docCategory?.docType || '';

        const loadToast = toast.loading(`Uploading ${file.name || 'document'} to [${targetSubfolder}]...`);
        try {
            const token = getStoredToken();
            if (!token) {
                toast.dismiss(loadToast);
                toast.error('Google Drive is not authenticated. Please connect Google Drive first.');
                return;
            }

            const { provisionFullProjectStructure, getOrCreateFolder, copyFile, uploadFileToDrive } = await import('../../lib/driveService');

            let rootId = folderId;

            if (!rootId) {
                const docSettings = await getDocumentSettings(profile?.company_id);
                let celronRootId = docSettings?.gdrive_celron_root_id || docSettings?.google_drive_folder_id || '1GPr3g5mq6_TotBzM8gDz_atJPR7TgbB-';
                if (celronRootId && celronRootId.includes('drive.google.com')) {
                    const match = celronRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || celronRootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (match) celronRootId = match[1];
                }
                const year = new Date(enquiry?.created_at || new Date()).getFullYear().toString();
                const cleanTitle = `${activeJobNo || enqNo} - ${customer}`;
                rootId = await provisionFullProjectStructure(token, celronRootId, year, cleanTitle);

                if (rootId) {
                    if (enquiry?.id) {
                        await supabase.from('customer_enquiries').update({ gdrive_folder_id: rootId }).eq('id', enquiry.id);
                    }
                    if (job?.id) {
                        await supabase.from('workflow_documents').update({ gdrive_folder_id: rootId, drive_folder_id: rootId }).eq('id', job.id);
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

            // Synchronize Database State
            if (enquiry?.id) {
                const currentAttachments = Array.isArray(enquiry.attachment_urls) ? enquiry.attachment_urls : [];
                const updatedAttachments = fileLink && !currentAttachments.includes(fileLink)
                    ? [...currentAttachments, fileLink]
                    : currentAttachments;

                const enqUpdates = { attachment_urls: updatedAttachments };

                if (categoryId === 'payment_proof' || docType === 'Payment Proof') {
                    enqUpdates.payment_status = 'Received';
                    enqUpdates.payment_proof_url = fileLink;
                } else if (categoryId === 'customer_po' && !enquiry.customer_ref) {
                    const poMatch = file.name.match(/PO[-_ ]?([A-Za-z0-9]+)/i);
                    if (poMatch && poMatch[1]) {
                        enqUpdates.customer_ref = `PO-${poMatch[1]}`;
                    }
                }

                await supabase.from('customer_enquiries').update(enqUpdates).eq('id', enquiry.id);
            }

            if (job?.id) {
                const currentJobAttachments = Array.isArray(job.attachment_urls) ? job.attachment_urls : [];
                const updatedJobAttachments = fileLink && !currentJobAttachments.includes(fileLink)
                    ? [...currentJobAttachments, fileLink]
                    : currentJobAttachments;

                const jobUpdates = { attachment_urls: updatedJobAttachments };

                if (categoryId === 'payment_proof' || docType === 'Payment Proof') {
                    jobUpdates.status = 'Paid';
                    jobUpdates.is_paid = true;
                    if (invoiceDocs && invoiceDocs.length > 0) {
                        for (const inv of invoiceDocs) {
                            await supabase
                                .from('workflow_documents')
                                .update({ status: 'Paid', is_paid: true })
                                .eq('id', inv.id);
                        }
                    }
                } else if (categoryId === 'delivery_order' || docType === 'Delivery Order') {
                    if (job.status === 'Active' || job.status === 'Pending') {
                        jobUpdates.status = 'Delivered';
                    }
                }

                await supabase.from('workflow_documents').update(jobUpdates).eq('id', job.id);
            }

            toast.dismiss(loadToast);
            toast.success(`Saved "${file.name}" to Google Drive [${targetSubfolder}] as ${categoryLabel}!`);
            
            // Refresh cockpit state and drive tree
            await loadEagleSuite(activeId);
            setDriveRefreshKey(prev => prev + 1);
        } catch (err) {
            toast.dismiss(loadToast);
            console.error('Smart Upload failed:', err);
            toast.error('Upload failed: ' + (err.message || 'Unknown error'));
        }
    };

    return (
        <div style={{
            minHeight: embedded ? 'auto' : '100vh',
            background: embedded ? 'transparent' : '#f8fafc',
            color: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            gap: embedded ? '16px' : '0'
        }}>
            {/* Header: Embedded Control Bar vs Standalone Navigation */}
            {embedded ? (
                <div style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '14px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '1.3rem',
                            boxShadow: '0 4px 12px rgba(79,70,229,0.25)'
                        }}>
                            🦅
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>
                                    360° Eagle View Cockpit
                                </span>
                                <span style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    background: '#dcfce7',
                                    color: '#15803d',
                                    textTransform: 'uppercase'
                                }}>
                                    TARGET ACTIVE: {enqNo || activeJobNo}
                                </span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                                Client: <strong style={{ color: '#1e293b' }}>{customer}</strong> &bull; Vessel: <strong style={{ color: '#1e293b' }}>{vessel}</strong>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {onScrollToTable && (
                            <button
                                onClick={onScrollToTable}
                                style={{
                                    background: '#f1f5f9',
                                    color: '#475569',
                                    border: '1px solid #cbd5e1',
                                    padding: '7px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.78rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                <ArrowUp size={14} /> Back to Search Table
                            </button>
                        )}

                        <button
                            onClick={() => loadEagleSuite(activeId)}
                            style={{
                                background: '#f8fafc',
                                color: '#1e293b',
                                border: '1px solid #cbd5e1',
                                padding: '7px 12px',
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}
                            title="Refresh Transaction Suite"
                        >
                            <RefreshCcw size={14} /> Refresh
                        </button>

                        <button
                            onClick={() => setCalendarModal({
                                isOpen: true,
                                title: `[${enqNo}] Follow-up Reminder - ${customer}`,
                                date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
                                description: `Enquiry: ${enqNo}\nClient: ${customer}\nVessel: ${vessel}\nJob: ${activeJobNo || 'Not Created'}\nLink: ${window.location.href}`,
                                location: vessel ? `Vessel: ${vessel}` : '',
                                activityType: 'Enquiry Follow-up',
                                jobNo: activeJobNo || enqNo
                            })}
                            style={{
                                background: '#eff6ff',
                                color: '#2563eb',
                                border: '1px solid #bfdbfe',
                                padding: '7px 12px',
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}
                        >
                            <Calendar size={14} /> Set Reminder
                        </button>

                        {folderId && (
                            <button
                                onClick={() => window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank')}
                                style={{
                                    background: '#3b82f6',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '7px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.78rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                <FolderOpen size={14} /> Drive Folder
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                /* Top Navigation & Master Switcher Bar (Standalone) */
                <div style={{ background: '#1e2544', color: '#ffffff', position: 'sticky', top: 0, zIndex: 100, borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '12px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1 1 auto', minWidth: '320px' }}>
                        <button
                            onClick={() => navigate(-1)}
                            style={{ background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.15)', padding: '8px 14px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <ArrowLeft size={16} /> Back
                        </button>

                        <button
                            onClick={() => navigate('/workflows/eagle-control')}
                            style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.4)', padding: '8px 14px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <LayoutDashboard size={15} /> All Records
                        </button>

                        <div style={{ height: '20px', width: '1px', background: 'rgba(255,255,255,0.2)' }} />

                        {/* Autocomplete Enquiry Switcher */}
                        <div ref={searchRef} style={{ position: 'relative', flex: '1 1 280px', maxWidth: '440px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '6px 12px' }}>
                                <Search size={15} color="#94a3b8" style={{ marginRight: '8px' }} />
                                <input
                                    type="text"
                                    placeholder="Jump to Enquiry #, Job #, or Customer..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    onFocus={() => searchQuery && setShowSuggestions(true)}
                                    style={{ background: 'transparent', border: 'none', outline: 'none', color: '#ffffff', fontSize: '0.82rem', width: '100%' }}
                                />
                                {searchingSuggestions && <RefreshCcw size={14} className="animate-spin text-indigo-400" />}
                            </div>

                            {showSuggestions && searchSuggestions.length > 0 && (
                                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 12px 30px rgba(0,0,0,0.2)', zIndex: 1000, overflow: 'hidden', padding: '6px' }}>
                                    {searchSuggestions.map((item, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => handleSelectSuggestion(item)}
                                            style={{ padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s' }}
                                            onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div>
                                                <span style={{ fontWeight: 800, color: '#4f46e5', marginRight: '8px', fontSize: '0.82rem' }}>{item.no}</span>
                                                <span style={{ fontSize: '0.72rem', background: item.type === 'Enquiry' ? '#eff6ff' : '#f5f3ff', color: item.type === 'Enquiry' ? '#1d4ed8' : '#6d28d9', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, marginRight: '8px' }}>{item.type}</span>
                                                <span style={{ fontSize: '0.78rem', color: '#334155', fontWeight: 600 }}>{item.title}</span>
                                            </div>
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{item.client}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Top Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={() => loadEagleSuite(activeId)}
                            style={{ background: 'rgba(255,255,255,0.08)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.15)', padding: '8px 12px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            title="Refresh Transaction Suite"
                        >
                            <RefreshCcw size={14} /> Refresh
                        </button>

                        <button
                            onClick={() => setCalendarModal({
                                isOpen: true,
                                title: `[${enqNo}] Follow-up Reminder - ${customer}`,
                                date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
                                description: `Enquiry: ${enqNo}\nClient: ${customer}\nVessel: ${vessel}\nJob: ${activeJobNo || 'Not Created'}\nLink: ${window.location.href}`,
                                location: vessel ? `Vessel: ${vessel}` : '',
                                activityType: 'Enquiry Follow-up',
                                jobNo: activeJobNo || enqNo
                            })}
                            style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.4)', padding: '8px 14px', borderRadius: '10px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
                        >
                            <Calendar size={14} /> Set Reminder
                        </button>

                        {folderId && (
                            <button
                                onClick={() => window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank')}
                                style={{ background: '#3b82f6', color: '#ffffff', border: 'none', padding: '8px 14px', borderRadius: '10px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800 }}
                            >
                                <FolderOpen size={14} /> Drive Folder
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Master Header Banner */}
            <div style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '20px 24px' }}>
                <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
                    {/* Left: Enquiry Title & Reference */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                        <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 6px 16px rgba(99,102,241,0.3)', flexShrink: 0 }}>
                            <Layers size={26} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                                    {enqNo}
                                </h1>
                                <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', fontSize: '0.72rem', padding: '3px 10px', borderRadius: '12px', fontWeight: 800, textTransform: 'uppercase' }}>
                                    🦅 Eagle View 360°
                                </span>

                                {/* Lifecycle Status Pill with interactive selector */}
                                <div ref={lifecycleRef} style={{ position: 'relative' }}>
                                    <button
                                        onClick={() => setShowLifecycleDropdown(prev => !prev)}
                                        style={{
                                            background: lifecycle === 'Won / Converted' ? '#dcfce7' : (lifecycle === 'Closed' ? '#f1f5f9' : (lifecycle === 'Lost' ? '#fee2e2' : '#ecfeff')),
                                            color: lifecycle === 'Won / Converted' ? '#166534' : (lifecycle === 'Closed' ? '#475569' : (lifecycle === 'Lost' ? '#991b1b' : '#0e7490')),
                                            border: '1px solid currentColor',
                                            padding: '3px 12px',
                                            borderRadius: '12px',
                                            fontSize: '0.72rem',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <span>Lifecycle: {lifecycle}</span>
                                        <ChevronDown size={12} />
                                    </button>

                                    {showLifecycleDropdown && (
                                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: '170px', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, overflow: 'hidden', padding: '4px' }}>
                                            {['Open', 'Won / Converted', 'Closed', 'Lost'].map(st => (
                                                <button
                                                    key={st}
                                                    onClick={() => handleUpdateLifecycle(st)}
                                                    style={{ width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent', fontSize: '0.75rem', fontWeight: 700, color: '#334155', borderRadius: '6px', cursor: 'pointer' }}
                                                    onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    {st}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Payment Status Pill */}
                                <button
                                    onClick={() => setPaymentModalOpen(true)}
                                    style={{
                                        background: currentPaymentStatus === 'Received' ? '#dcfce7' : (currentPaymentStatus === 'Partial' ? '#fef3c7' : '#fee2e2'),
                                        color: currentPaymentStatus === 'Received' ? '#166534' : (currentPaymentStatus === 'Partial' ? '#92400e' : '#991b1b'),
                                        border: '1px solid currentColor',
                                        padding: '3px 12px',
                                        borderRadius: '12px',
                                        fontSize: '0.72rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px'
                                    }}
                                    title="Click to change Payment Status or upload proof"
                                >
                                    <CreditCard size={12} />
                                    <span>Payment: {currentPaymentStatus}</span>
                                    {suiteData?.paymentProofUrl && <FileCheck size={12} title="Proof attached" />}
                                </button>
                            </div>

                            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 800, color: '#1e293b' }}>{customer}</span>
                                <span>•</span>
                                <span>Vessel: <strong>{vessel}</strong></span>
                                {enquiry?.customer_ref && (
                                    <>
                                        <span>•</span>
                                        <span>Ref: <span style={{ fontFamily: 'monospace', color: '#6366f1' }}>{enquiry.customer_ref}</span></span>
                                    </>
                                )}
                                {activeJobNo && (
                                    <>
                                        <span>•</span>
                                        <span style={{ background: '#ecfdf5', color: '#059669', padding: '2px 8px', borderRadius: '6px', fontWeight: 800, border: '1px solid #a7f3d0' }}>
                                            Active Job: {activeJobNo}
                                        </span>
                                    </>
                                )}
                            </p>
                        </div>
                    </div>

                    {/* Right: Real-time Profit & Margin Cards */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 16px', textAlign: 'right' }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Customer Quoted</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#3b82f6' }}>
                                ${metrics.quotedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </div>

                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 16px', textAlign: 'right' }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Supplier Cost</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#f59e0b' }}>
                                ${metrics.supplierPoTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </div>

                        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '12px', padding: '10px 16px', textAlign: 'right' }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase' }}>Gross Profit Margin</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#047857', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                <TrendingUp size={16} />
                                <span>{metrics.profitMarginPercent}%</span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669' }}>(${metrics.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 0 })})</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Visual Stage Progress Tracker */}
                <div style={{ maxWidth: '1600px', margin: '20px auto 0', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                        {STAGES.map((st, idx) => {
                            let isDone = false;
                            if (st.key === 'ENQ') isDone = true;
                            if (st.key === 'RFQ') isDone = hasRfq;
                            if (st.key === 'QTN') isDone = hasQuote;
                            if (st.key === 'PO') isDone = hasPo;
                            if (st.key === 'JOB') isDone = hasJob;
                            if (st.key === 'INV') isDone = isPaid || (invoiceDocs && invoiceDocs.length > 0);

                            return (
                                <div
                                    key={st.key}
                                    style={{
                                        background: isDone ? st.bg : '#f8fafc',
                                        border: `1.5px solid ${isDone ? st.color : '#e2e8f0'}`,
                                        borderRadius: '10px',
                                        padding: '8px 12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        boxShadow: isDone ? `0 2px 8px ${st.color}20` : 'none',
                                        transition: 'all 0.18s'
                                    }}
                                >
                                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: isDone ? st.color : '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem', fontWeight: 900 }}>
                                        {isDone ? <Check size={12} /> : idx + 1}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: isDone ? st.color : '#64748b', whiteSpace: 'nowrap' }}>
                                        {st.label}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* 6 Pillars Header with Minimize / Maximize toggle */}
            <div style={{ maxWidth: '1600px', margin: '20px auto 8px', padding: embedded ? '0' : '0 24px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                        <Layers size={18} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                            Transaction Lifecycle & Commercial Pillars (6 Stages)
                        </h3>
                        <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                            Enquiry details, sourcing RFQs, customer quotations, supplier POs, delivery orders, and tax billing
                        </span>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setIsPillarsOpen(prev => !prev)}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: isPillarsOpen ? '#f1f5f9' : '#eff6ff',
                        color: isPillarsOpen ? '#475569' : '#2563eb',
                        border: `1px solid ${isPillarsOpen ? '#cbd5e1' : '#bfdbfe'}`,
                        padding: '6px 14px',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                    }}
                >
                    {isPillarsOpen ? <><Minimize2 size={13} /> Minimize Pillars</> : <><Maximize2 size={13} /> Expand 6 Pillars</>}
                </button>
            </div>

            {/* 6 Pillars Grid: The Heart of the Eagle View */}
            <div style={{ maxWidth: '1600px', margin: '0 auto 24px', padding: embedded ? '0' : '0 24px', width: '100%' }}>
                {isPillarsOpen ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
                    
                    {/* ───────────────────────────────────────────
                        PILLAR 1: CUSTOMER ENQUIRY (ANCHOR)
                    ─────────────────────────────────────────── */}
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                                    <FileText size={18} />
                                </div>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>1. Customer Sourcing Enquiry</h3>
                            </div>
                            <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#1d4ed8', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                {enquiry?.status || 'Draft'}
                            </span>
                        </div>

                        <div style={{ fontSize: '0.82rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div><strong>Ref No:</strong> <span style={{ color: '#4f46e5', fontWeight: 700 }}>{enqNo}</span></div>
                            <div><strong>Subject:</strong> {enquiry?.subject || 'General Sourcing'}</div>
                            <div><strong>Date Created:</strong> {enquiry?.created_at ? new Date(enquiry.created_at).toLocaleDateString() : '—'}</div>
                            <div><strong>Client:</strong> {customer}</div>
                            {enquiry?.contact?.name && <div><strong>Contact Person:</strong> {enquiry.contact.name} ({enquiry.contact.email || '—'})</div>}
                        </div>

                        {/* Sourced Items Preview */}
                        <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                                Requested Sourcing Items ({enquiry?.catalog_items?.length || 0})
                            </div>
                            {enquiry?.catalog_items && enquiry.catalog_items.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                                    {enquiry.catalog_items.slice(0, 5).map((it, idx) => (
                                        <div key={idx} style={{ fontSize: '0.78rem', color: '#334155', display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ fontWeight: 600 }}>• {it.name}</span>
                                            <span style={{ color: '#64748b' }}>{it.quantity || 1} {it.uom || 'UNIT'}</span>
                                        </div>
                                    ))}
                                    {enquiry.catalog_items.length > 5 && (
                                        <div style={{ fontSize: '0.72rem', color: '#6366f1', fontWeight: 700 }}>
                                            +{enquiry.catalog_items.length - 5} more items
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>No catalog items specified in enquiry.</div>
                            )}
                        </div>

                        <div style={{ marginTop: 'auto', display: 'flex', gap: '8px' }}>
                            <button
                                onClick={() => navigate(`/workflows/enquiry/${enquiry?.id}`)}
                                style={{ flex: 1, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '8px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                            >
                                <Edit3 size={14} /> Open Full Enquiry
                            </button>
                            <button
                                onClick={() => navigate(`/workflows/enquiry/print/${enquiry?.id}`)}
                                style={{ background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                title="Print Enquiry PDF"
                            >
                                <Printer size={14} />
                            </button>
                        </div>
                    </div>

                    {/* ───────────────────────────────────────────
                        PILLAR 2: SUPPLIER RFQ / BIDS
                    ─────────────────────────────────────────── */}
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5cf6' }}>
                                    <Send size={18} />
                                </div>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>2. Supplier RFQs & Bids</h3>
                            </div>
                            <span style={{ fontSize: '0.72rem', background: supplierQuotes.length > 0 ? '#dcfce7' : '#f1f5f9', color: supplierQuotes.length > 0 ? '#166534' : '#64748b', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                {supplierQuotes.length} Supplier(s)
                            </span>
                        </div>

                        {supplierQuotes.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {supplierQuotes.map((sq, idx) => (
                                    <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.82rem' }}>
                                                {sq.supplier?.name || 'Supplier'}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                                Status: <span style={{ fontWeight: 700, color: sq.status === 'Shortlisted' ? '#059669' : '#475569' }}>{sq.status || 'Pending'}</span>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: 900, color: '#8b5cf6', fontSize: '0.95rem' }}>
                                                ${parseFloat(sq.quote_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </div>
                                            {sq.status === 'Shortlisted' && (
                                                <span style={{ fontSize: '0.65rem', background: '#ecfdf5', color: '#059669', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                                    Shortlisted Bid
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ padding: '24px', textAlign: 'center', background: '#faf5ff', borderRadius: '12px', border: '1.5px dashed #d8b4fe' }}>
                                <Send size={24} color="#8b5cf6" style={{ margin: '0 auto 8px' }} />
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#6b21a8' }}>No Supplier RFQ Floated</div>
                                <div style={{ fontSize: '0.75rem', color: '#9333ea', marginTop: '4px' }}>Float this enquiry to suppliers to gather cost estimates.</div>
                            </div>
                        )}

                        <div style={{ marginTop: 'auto', display: 'flex', gap: '8px' }}>
                            <button
                                onClick={() => setShowFastFloat(true)}
                                style={{ flex: 1, background: '#8b5cf6', color: '#ffffff', border: 'none', padding: '9px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(139,92,246,0.3)' }}
                            >
                                <Plus size={15} /> Float RFQ to Suppliers
                            </button>
                            <button
                                onClick={() => navigate(`/unified-supplier-hub-pro?tab=compare&enquiry_id=${enquiry?.id}`)}
                                style={{ background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', padding: '9px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                                title="Compare Supplier Bids"
                            >
                                Compare
                            </button>
                        </div>
                    </div>

                    {/* ───────────────────────────────────────────
                        PILLAR 3: QUOTE2CUSTOMERS
                    ─────────────────────────────────────────── */}
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                                    <Receipt size={18} />
                                </div>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>3. Quote2Customers</h3>
                            </div>
                            <span style={{ fontSize: '0.72rem', background: quotationDocs.length > 0 ? '#dcfce7' : '#fee2e2', color: quotationDocs.length > 0 ? '#166534' : '#991b1b', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                {quotationDocs.length > 0 ? `${quotationDocs.length} Quote(s)` : 'Missing Quote'}
                            </span>
                        </div>

                        {quotationDocs.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {quotationDocs.map((q, idx) => (
                                    <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontWeight: 800, color: '#f59e0b', fontSize: '0.85rem' }}>{q.document_no}</span>
                                                <span style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>{q.status || 'Draft'}</span>
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                                                {q.created_at ? new Date(q.created_at).toLocaleDateString() : '—'} • {q.items?.length || 0} line item(s)
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '1rem' }}>
                                                ${parseFloat(q.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </div>
                                            <button
                                                onClick={() => navigate(`/workflows/editor/quotation/${q.id}`)}
                                                style={{ background: '#eff6ff', color: '#2563eb', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', marginTop: '4px' }}
                                            >
                                                Edit / View
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ padding: '24px', textAlign: 'center', background: '#fffbeb', borderRadius: '12px', border: '1.5px dashed #fcd34d' }}>
                                <Receipt size={24} color="#f59e0b" style={{ margin: '0 auto 8px' }} />
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#b45309' }}>No Customer Quote Generated</div>
                                <div style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '4px' }}>
                                    Convert this enquiry directly into an official quotation for your customer.
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: 'auto' }}>
                            <button
                                onClick={() => navigate(`/workflows/editor/quotation/new?source_enquiry_id=${enquiry?.id}&return_to=${encodeURIComponent(window.location.pathname)}`)}
                                style={{ width: '100%', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#ffffff', border: 'none', padding: '10px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(245,158,11,0.3)' }}
                            >
                                <Plus size={16} /> + Create Quote2Customer
                            </button>
                        </div>
                    </div>

                    {/* ───────────────────────────────────────────
                        PILLAR 4: PO2 SUPPLIERS
                    ─────────────────────────────────────────── */}
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f97316' }}>
                                    <ShoppingCart size={18} />
                                </div>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>4. PO2 Suppliers</h3>
                            </div>
                            <span style={{ fontSize: '0.72rem', background: supplierPoDocs.length > 0 ? '#dcfce7' : '#fee2e2', color: supplierPoDocs.length > 0 ? '#166534' : '#991b1b', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                {supplierPoDocs.length > 0 ? `${supplierPoDocs.length} Order(s)` : 'Missing PO'}
                            </span>
                        </div>

                        {supplierPoDocs.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {supplierPoDocs.map((po, idx) => (
                                    <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontWeight: 800, color: '#f97316', fontSize: '0.85rem' }}>{po.document_no}</span>
                                                <span style={{ fontSize: '0.68rem', background: '#ffedd5', color: '#9a3412', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>{po.status || 'Active'}</span>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginTop: '2px' }}>
                                                Supplier: {po.partners?.name || 'Supplier'}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '1rem' }}>
                                                ${parseFloat(po.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </div>
                                            <button
                                                onClick={() => navigate(`/workflows/editor/purchase-order/${po.id}`)}
                                                style={{ background: '#eff6ff', color: '#2563eb', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', marginTop: '4px' }}
                                            >
                                                Edit / View
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ padding: '24px', textAlign: 'center', background: '#fff7ed', borderRadius: '12px', border: '1.5px dashed #fdba74' }}>
                                <ShoppingCart size={24} color="#f97316" style={{ margin: '0 auto 8px' }} />
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#c2410c' }}>No Supplier Purchase Order</div>
                                <div style={{ fontSize: '0.75rem', color: '#ea580c', marginTop: '4px' }}>
                                    Place an order with your supplier to procure the requested items.
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: 'auto' }}>
                            <button
                                onClick={() => navigate(`/workflows/editor/purchase-order/new?source_enquiry_id=${enquiry?.id}&assigned_job_no=${encodeURIComponent(activeJobNo || '')}&return_to=${encodeURIComponent(window.location.pathname)}`)}
                                style={{ width: '100%', background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', color: '#ffffff', border: 'none', padding: '10px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(249,115,22,0.3)' }}
                            >
                                <Plus size={16} /> + Create PO2 Supplier
                            </button>
                        </div>
                    </div>

                    {/* ───────────────────────────────────────────
                        PILLAR 5: JOB CONTROL
                    ─────────────────────────────────────────── */}
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                                    <Ship size={18} />
                                </div>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>5. Job Control</h3>
                            </div>
                            <span style={{ fontSize: '0.72rem', background: activeJobNo ? '#dcfce7' : '#fee2e2', color: activeJobNo ? '#166534' : '#991b1b', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                {activeJobNo ? 'Job Active' : 'Not Converted'}
                            </span>
                        </div>

                        {activeJobNo ? (
                            <div style={{ background: '#f8fafc', border: '1.5px solid #a7f3d0', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#047857' }}>
                                            {activeJobNo}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                            Vessel: <strong>{vessel}</strong>
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '0.72rem', background: '#d1fae5', color: '#065f46', padding: '3px 8px', borderRadius: '6px', fontWeight: 800 }}>
                                        {job?.status || 'Active'}
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '4px' }}>
                                    {job?.description || 'Marine service and parts delivery job.'}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                    <button
                                        onClick={() => navigate(`/workflows/job-eagle-view/${job?.id || activeJobNo}`)}
                                        style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}
                                    >
                                        Job Eagle View
                                    </button>
                                    <button
                                        onClick={() => navigate('/workflows/jobs-dashboard')}
                                        style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        Job Dashboard
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: '24px', textAlign: 'center', background: '#f0fdf4', borderRadius: '12px', border: '1.5px dashed #86efac' }}>
                                <Ship size={24} color="#10b981" style={{ margin: '0 auto 8px' }} />
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#15803d' }}>Job Not Yet Created</div>
                                <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '4px' }}>
                                    Convert this enquiry into an official Job to assign technicians, schedule work, and generate Job documents.
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: 'auto' }}>
                            {!activeJobNo && (
                                <button
                                    onClick={handleConvertJob}
                                    disabled={convertingJob}
                                    style={{ width: '100%', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#ffffff', border: 'none', padding: '10px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(16,185,129,0.3)' }}
                                >
                                    {convertingJob ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                    🚀 Convert / Create Official Job
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ───────────────────────────────────────────
                        PILLAR 6: BILLING, CUSTOMER PO & PROOF
                    ─────────────────────────────────────────── */}
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ecfeff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#06b6d4' }}>
                                    <CreditCard size={18} />
                                </div>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>6. Customer Billing & Payment Proof</h3>
                            </div>
                            <span style={{ fontSize: '0.72rem', background: isPaid ? '#dcfce7' : '#fef3c7', color: isPaid ? '#166534' : '#92400e', padding: '3px 8px', borderRadius: '6px', fontWeight: 800 }}>
                                {currentPaymentStatus}
                            </span>
                        </div>

                        {/* Customer PO & Invoices */}
                        <div style={{ fontSize: '0.82rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div>
                                <strong>Customer PO:</strong> {customerPoDocs.length > 0 ? (
                                    <span style={{ color: '#0284c7', fontWeight: 700 }}>{customerPoDocs.map(p => p.document_no).join(', ')}</span>
                                ) : (
                                    <span style={{ color: '#94a3b8' }}>Awaiting Client PO</span>
                                )}
                            </div>
                            <div>
                                <strong>Tax Invoice:</strong> {invoiceDocs.length > 0 ? (
                                    <span style={{ color: '#059669', fontWeight: 700 }}>{invoiceDocs.map(i => `${i.document_no} ($${parseFloat(i.total_amount || 0).toLocaleString()})`).join(', ')}</span>
                                ) : (
                                    <span style={{ color: '#94a3b8' }}>Invoice not generated</span>
                                )}
                            </div>
                            <div>
                                <strong>Delivery Order:</strong> {doDocs.length > 0 ? (
                                    <span style={{ color: '#0891b2', fontWeight: 700 }}>{doDocs.map(d => d.document_no).join(', ')}</span>
                                ) : (
                                    <span style={{ color: '#94a3b8' }}>No DO recorded</span>
                                )}
                            </div>
                        </div>

                        {/* Payment Proof Card */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Proof of Payment</span>
                                <button
                                    onClick={() => setPaymentModalOpen(true)}
                                    style={{ background: 'transparent', border: 'none', color: '#4f46e5', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' }}
                                >
                                    Manage Proof
                                </button>
                            </div>
                            {suiteData?.paymentProofUrl ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ecfdf5', padding: '8px 12px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#065f46', fontWeight: 700 }}>
                                        <FileCheck size={16} color="#059669" />
                                        <span>Payment Proof Attached</span>
                                    </div>
                                    <a
                                        href={suiteData.paymentProofUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 800, textDecoration: 'underline' }}
                                    >
                                        View Slip
                                    </a>
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                    No remittance advice or bank receipt uploaded yet.
                                </div>
                            )}
                        </div>

                        <div style={{ marginTop: 'auto', display: 'flex', gap: '8px' }}>
                            <button
                                onClick={() => navigate(`/workflows/editor/tax-invoice/new?source_enquiry_id=${enquiry?.id}&assigned_job_no=${encodeURIComponent(activeJobNo || '')}&return_to=${encodeURIComponent(window.location.pathname)}`)}
                                style={{ flex: 1, background: '#06b6d4', color: '#ffffff', border: 'none', padding: '9px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                            >
                                <Plus size={15} /> + Create Tax Invoice
                            </button>
                            <button
                                onClick={() => navigate(`/soa`)}
                                style={{ background: '#f0fdfa', color: '#0f766e', border: '1px solid #99f6e4', padding: '9px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                                title="Open Statement of Account"
                            >
                                View SOA
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                    <div style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '16px 20px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '14px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '0.8rem', color: '#475569' }}>
                            <div><strong>Enquiry:</strong> <span style={{ color: '#2563eb', fontWeight: 700 }}>{enqNo}</span></div>
                            <div>•</div>
                            <div><strong>Quotes:</strong> <span style={{ fontWeight: 700, color: quotationDocs.length > 0 ? '#059669' : '#64748b' }}>{quotationDocs.length} Quote(s)</span></div>
                            <div>•</div>
                            <div><strong>Customer PO:</strong> <span style={{ fontWeight: 700, color: customerPoDocs.length > 0 ? '#059669' : '#64748b' }}>{customerPoDocs.length > 0 ? (customerPoDocs[0].customer_ref || 'Confirmed') : 'Pending'}</span></div>
                            <div>•</div>
                            <div><strong>Supplier Orders:</strong> <span style={{ fontWeight: 700, color: supplierPoDocs.length > 0 ? '#d97706' : '#64748b' }}>{supplierPoDocs.length} PO(s) (SGD {metrics.supplierPoTotal.toLocaleString()})</span></div>
                            <div>•</div>
                            <div><strong>Invoiced:</strong> <span style={{ fontWeight: 700, color: invoiceDocs.length > 0 ? '#0891b2' : '#64748b' }}>SGD {metrics.billedTotal.toLocaleString()}</span></div>
                            <div>•</div>
                            <div><strong>Status:</strong> <span style={{ fontWeight: 700, color: isPaid ? '#059669' : '#d97706' }}>{isPaid ? 'Paid' : 'Payment Pending'}</span></div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsPillarsOpen(true)}
                            style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Expand Full Details
                        </button>
                    </div>
                )}
            </div>

            {/* Smart Document Upload Hub (Collapsible) */}
            {!hideDriveAndUpload && (
                <div style={{ maxWidth: '1600px', margin: '0 auto 24px', padding: embedded ? '0' : '0 24px', width: '100%' }}>
                    {isUploadOpen ? (
                        <SmartUploadPanel
                            isOpen={true}
                            embedded={true}
                            documentType="Technical & Commercial Documentation"
                            accept="*/*"
                            activeFolderId={folderId || null}
                            activeFolderName={`${activeJobNo || enqNo} > Root Folder (Enquiry / RFQ)`}
                            runningEnquiryNo={activeJobNo || enqNo}
                            onSelect={handleSmartUploadSelect}
                            onToggleMinimize={() => setIsUploadOpen(false)}
                        />
                    ) : (
                        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Cloud size={20} color="#6366f1" />
                                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>Smart Document Ingestion Hub</span>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '12px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
                                    Folder: {activeJobNo || enqNo}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsUploadOpen(true)}
                                    style={{ background: '#4f46e5', color: '#ffffff', border: 'none', padding: '6px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <Maximize2 size={13} /> Expand Upload Hub
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Bottom Section: Integrated Bilateral Google Drive Tree (Collapsible) */}
            {!hideDriveAndUpload && (
                <div style={{ maxWidth: '1600px', margin: '0 auto 40px', padding: embedded ? '0' : '0 24px', width: '100%' }}>
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                        <div style={{ padding: '14px 20px', background: '#f8fafc', borderBottom: isDriveOpen ? '1px solid #e2e8f0' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                                    <FolderOpen size={18} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Bilateral Google Drive Folder Tree
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>({enqNo})</span>
                                    </h3>
                                    <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                                        Category-routed documents for Enquiry, Customer Quote, Customer PO, Supplier PO, DO, & Invoices
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                                    onClick={() => setIsDriveOpen(prev => !prev)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: isDriveOpen ? '#ffffff' : '#3b82f6',
                                        color: isDriveOpen ? '#475569' : '#ffffff',
                                        border: `1px solid ${isDriveOpen ? '#cbd5e1' : '#2563eb'}`,
                                        padding: '6px 14px',
                                        borderRadius: '8px',
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {isDriveOpen ? <><Minimize2 size={13} /> Minimize Tree</> : <><Maximize2 size={13} /> Expand Drive Tree</>}
                                </button>
                            </div>
                        </div>

                        {isDriveOpen ? (
                            <div style={{ padding: '20px' }}>
                                <EagleDriveTreeViewer
                                    key={driveRefreshKey}
                                    enquiry={enquiry}
                                    jobNo={activeJobNo || enqNo}
                                    folderId={folderId}
                                    jobFolderId={folderId}
                                    customerName={customer}
                                    companyId={profile?.company_id}
                                    readOnly={false}
                                />
                            </div>
                        ) : (
                            <div style={{ padding: '12px 20px', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                    Google Drive Folder Tree is minimized. Click Expand to explore folder contents and view files.
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setIsDriveOpen(true)}
                                    style={{
                                        background: '#eff6ff',
                                        color: '#2563eb',
                                        border: '1px solid #bfdbfe',
                                        padding: '5px 12px',
                                        borderRadius: '7px',
                                        fontSize: '0.76rem',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Open Drive Tree
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal: Fast Float RFQ */}
            {showFastFloat && (
                <FastFloatModal
                    isOpen={showFastFloat}
                    onClose={() => setShowFastFloat(false)}
                    enquiry={enquiry}
                    onSuccess={() => {
                        setShowFastFloat(false);
                        loadEagleSuite(activeId);
                    }}
                />
            )}

            {/* Modal: Calendar Reminder */}
            {calendarModal.isOpen && (
                <GoogleCalendarReminderModal
                    isOpen={calendarModal.isOpen}
                    onClose={() => setCalendarModal(prev => ({ ...prev, isOpen: false }))}
                    title={calendarModal.title}
                    date={calendarModal.date}
                    description={calendarModal.description}
                    location={calendarModal.location}
                    activityType={calendarModal.activityType}
                    jobNo={calendarModal.jobNo}
                />
            )}

            {/* Modal: Payment Status & Proof */}
            {paymentModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div style={{ background: '#ffffff', borderRadius: '16px', maxWidth: '440px', width: '100%', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Update Payment Details</h3>
                            <button onClick={() => setPaymentModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                                <X size={18} color="#64748b" />
                            </button>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>
                                PAYMENT STATUS
                            </label>
                            <select
                                value={selectedPaymentStatus}
                                onChange={e => setSelectedPaymentStatus(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 700 }}
                            >
                                <option value="Pending">Pending</option>
                                <option value="Partial">Partial</option>
                                <option value="Received">Received (Paid)</option>
                                <option value="Overdue">Overdue</option>
                            </select>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>
                                PROOF OF PAYMENT SLIP / RECEIPT
                            </label>
                            {paymentProofUrl ? (
                                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 700 }}>Proof Attached</span>
                                    <a href={paymentProofUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: '#4f46e5', fontWeight: 800 }}>Preview</a>
                                </div>
                            ) : null}
                            <input
                                type="file"
                                accept="image/*,.pdf"
                                onChange={handleUploadPaymentProof}
                                disabled={uploadingProof}
                                style={{ fontSize: '0.8rem' }}
                            />
                            {uploadingProof && <div style={{ fontSize: '0.72rem', color: '#6366f1', marginTop: '4px' }}>Uploading proof to secure storage...</div>}
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setPaymentModalOpen(false)}
                                style={{ background: '#f1f5f9', color: '#475569', border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSavePaymentStatus}
                                disabled={updatingStatus}
                                style={{ background: '#4f46e5', color: '#ffffff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer' }}
                            >
                                {updatingStatus ? 'Saving...' : 'Save Payment Details'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
