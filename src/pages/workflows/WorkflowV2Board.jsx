import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { isTokenValid, connectGoogleAPI } from '../../lib/googleAuthService';
import { 
    getWorkflowDocuments, 
    deleteWorkflowDocument, 
    duplicateWorkflowDocument, 
    convertQuotationToJob, 
    revertJobToQuotation, 
    revertQuotationToEnquiry,
    convertInvoiceToJob,
    convertProformaToTaxInvoice, 
    getDocumentHistory,
    getWorkflowDocumentsByJob
} from '../../lib/workflowV2Service';
import {
    FileCheck, Play, Briefcase, X, Loader2, PlayCircle, Folder, Upload,
    ArrowRightLeft, Filter, Eye, Printer, Search, Trash2, Plus, FileText, Copy, Clock,
    ArrowUp, ArrowDown, RefreshCw, Download, CreditCard, Calendar, ArrowUpDown, LayoutDashboard,
    ArrowLeft, Sparkles, HardDrive, Hexagon, MessageSquare, Globe, ShieldCheck, Users, Smartphone, History
} from 'lucide-react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import CustomerEnquiryForm from '../../components/CustomerEnquiryForm';
import JobEditV2Modal from '../../components/workflows/JobEditV2Modal';
import ReceivePaymentModal from '../../components/workflow/ReceivePaymentModal';
import SearchableSelect from '../../components/common/SearchableSelect';
import ModuleSwitcherHeader from '../../components/common/ModuleSwitcherHeader';
import { getPartners } from '../../lib/store';
import SmartUploadPanel from '../../components/upload/SmartUploadPanel';

const DOC_TYPES = [
    'Enquiry', 'Quotation', 'Job', 'Purchase Order', 'Order Acknowledgment',
    'Delivery Order', 'Service Report', 'Proforma Invoice',
    'Packing List', 'Tax Invoice', 'Certificate',
    'Payment Received', 'Statement of Account'
];

const buildProjectFolderName = (jobNo, doc) => {
    if (!doc) return jobNo;
    const partnerName = doc.partners?.name || 'Walk-in';
    const vesselName = doc.vessels?.vessel_name || '';
    const locationName = doc.work_locations?.location_name || '';
    const suffix = vesselName || locationName || '';
    const folderTitle = suffix ? `${jobNo} - ${partnerName} - ${suffix}` : `${jobNo} - ${partnerName}`;
    return folderTitle.replace(/[/\\?%*:|"<>]/g, '-');
};

const SUB_TABS_CONFIG = {
    'Job': [
        { id: 'Ongoing', label: 'Ongoing Jobs', color: '#3b82f6', bgActive: '#3b82f6', textActive: '#ffffff', bgInactive: '#eff6ff', textInactive: '#1e40af', border: '#3b82f6', desc: 'Billed drafts or operational in-progress' },
        { id: 'Completed', label: 'Completed Jobs', color: '#10b981', bgActive: '#10b981', textActive: '#ffffff', bgInactive: '#ecfdf5', textInactive: '#065f46', border: '#10b981', desc: 'Billed Tax Invoices awaiting payments' },
        { id: 'Archived', label: 'Archived Jobs', color: '#64748b', bgActive: '#64748b', textActive: '#ffffff', bgInactive: '#f1f5f9', textInactive: '#475569', border: '#94a3b8', desc: 'Fully Paid Tax Invoices or Closed' }
    ],
    'Quotation': [
        { id: 'Sent', label: 'Sent / Awaiting PO', color: '#3b82f6', bgActive: '#3b82f6', textActive: '#ffffff', bgInactive: '#eff6ff', textInactive: '#1e40af', border: '#3b82f6', desc: 'Awaiting customer order confirmation' },
        { id: 'Draft', label: 'Draft Quotes', color: '#f59e0b', bgActive: '#f59e0b', textActive: '#ffffff', bgInactive: '#fffbeb', textInactive: '#b45309', border: '#fbbf24', desc: 'Internal draft quotes being prepared' },
        { id: 'Confirmed', label: 'Converted to Job', color: '#10b981', bgActive: '#10b981', textActive: '#ffffff', bgInactive: '#ecfdf5', textInactive: '#065f46', border: '#10b981', desc: 'Successfully approved and ordered' }
    ],
    'Tax Invoice': [
        { id: 'Sent', label: 'Sent (Unpaid)', color: '#ef4444', bgActive: '#ef4444', textActive: '#ffffff', bgInactive: '#fef2f2', textInactive: '#991b1b', border: '#f87171', desc: 'Issued tax invoices awaiting payment' },
        { id: 'Draft', label: 'Draft Invoices', color: '#f59e0b', bgActive: '#f59e0b', textActive: '#ffffff', bgInactive: '#fffbeb', textInactive: '#b45309', border: '#fbbf24', desc: 'Unissued draft tax invoices' },
        { id: 'Paid', label: 'Paid Invoices', color: '#10b981', bgActive: '#10b981', textActive: '#ffffff', bgInactive: '#ecfdf5', textInactive: '#065f46', border: '#10b981', desc: 'Fully paid and closed tax invoices' }
    ],
    'Proforma Invoice': [
        { id: 'Sent', label: 'Sent / Unpaid', color: '#ef4444', bgActive: '#ef4444', textActive: '#ffffff', bgInactive: '#fef2f2', textInactive: '#991b1b', border: '#f87171', desc: 'Issued proformas awaiting advance payment' },
        { id: 'Draft', label: 'Draft Proformas', color: '#f59e0b', bgActive: '#f59e0b', textActive: '#ffffff', bgInactive: '#fffbeb', textInactive: '#b45309', border: '#fbbf24', desc: 'Unissued draft proforma invoices' },
        { id: 'Paid', label: 'Paid Proformas', color: '#10b981', bgActive: '#10b981', textActive: '#ffffff', bgInactive: '#ecfdf5', textInactive: '#065f46', border: '#10b981', desc: 'Fully settled proforma invoices' }
    ],
    'Delivery Order': [
        { id: 'Active', label: 'Active Transit', color: '#3b82f6', bgActive: '#3b82f6', textActive: '#ffffff', bgInactive: '#eff6ff', textInactive: '#1e40af', border: '#3b82f6', desc: 'Out for delivery or in transit' },
        { id: 'Draft', label: 'Draft DOs', color: '#f59e0b', bgActive: '#f59e0b', textActive: '#ffffff', bgInactive: '#fffbeb', textInactive: '#b45309', border: '#fbbf24', desc: 'Draft delivery orders being prepared' },
        { id: 'Confirmed', label: 'Signed & Completed', color: '#10b981', bgActive: '#10b981', textActive: '#ffffff', bgInactive: '#ecfdf5', textInactive: '#065f46', border: '#10b981', desc: 'Goods delivered and proof signed' }
    ],
    'Packing List': [
        { id: 'Active', label: 'Active Shipping', color: '#3b82f6', bgActive: '#3b82f6', textActive: '#ffffff', bgInactive: '#eff6ff', textInactive: '#1e40af', border: '#3b82f6', desc: 'Shipment or packages being processed' },
        { id: 'Draft', label: 'Draft Packing Lists', color: '#f59e0b', bgActive: '#f59e0b', textActive: '#ffffff', bgInactive: '#fffbeb', textInactive: '#b45309', border: '#fbbf24', desc: 'Unissued packing details' },
        { id: 'Completed', label: 'Dispatched / Closed', color: '#10b981', bgActive: '#10b981', textActive: '#ffffff', bgInactive: '#ecfdf5', textInactive: '#065f46', border: '#10b981', desc: 'Fully packed and closed' }
    ],
    'Order Acknowledgment': [
        { id: 'Sent', label: 'Sent Acknowledgments', color: '#3b82f6', bgActive: '#3b82f6', textActive: '#ffffff', bgInactive: '#eff6ff', textInactive: '#1e40af', border: '#3b82f6', desc: 'Awaiting shipping or job updates' },
        { id: 'Draft', label: 'Service / Delivery Date', color: '#f59e0b', bgActive: '#f59e0b', textActive: '#ffffff', bgInactive: '#fffbeb', textInactive: '#b45309', border: '#fbbf24', desc: 'Highlighting delivery date or service date' },
        { id: 'Confirmed', label: 'Converted to Job', color: '#10b981', bgActive: '#10b981', textActive: '#ffffff', bgInactive: '#ecfdf5', textInactive: '#065f46', border: '#10b981', desc: 'Active in job suite' }
    ]
};

export default function WorkflowV2Board() {
    const { profile } = useAuth();
    const canAdmin = ['admin', 'finance', 'superadmin'].includes(profile?.role);
    const navigate = useNavigate();
    const handleGoBack = () => {
        if (window.history.state && window.history.state.idx > 0) {
            navigate(-1);
        } else {
            navigate('/workflows/jobs-dashboard');
        }
    };
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeType, setActiveType] = useState('All');
    const [viewMode, setViewMode] = useState('board'); // 'board' | 'tools'

    const workflowTools = [
        { title: 'Universal Finder', description: 'Deep file search and text matching across all documents.', icon: <Search size={24} />, color: '#3b82f6', path: '/workflows/universal-finder' },
        { title: 'AI Document Assistant', description: 'Chat with uploaded project files, logs, and sheets using LLMs.', icon: <Sparkles size={24} />, color: '#a855f7', path: '/workflows/ai-assistant' },
        { title: 'Storage Explorer', description: 'Browse and manage company drive and local project workspace files.', icon: <Folder size={24} />, color: '#3b82f6', path: '/storage?tab=explorer' },
        { title: 'Corporate Vault', description: 'Secure corporate storage for regulatory, IRAS, GST, and audit files.', icon: <HardDrive size={24} />, color: '#22c55e', path: '/vault' },
        { title: 'Google Drive Sync', description: 'Manage cloud authorization, credentials, and folder connections.', icon: <RefreshCw size={24} />, color: '#f59e0b', path: '/settings?tab=communications' },
        { title: 'Messaging Hub', description: 'Centralized channels and threads for team communications.', icon: <Hexagon size={24} />, color: '#8b5cf6', path: '/messaging' },
        { title: 'Commercial Wall', description: 'Company announcement bulletin board and communication feed.', icon: <MessageSquare size={24} />, color: '#6366f1', path: '/commercial-wall' },
        { title: 'Global Finder', description: 'Query external part directories and international inventory systems.', icon: <Globe size={24} />, color: '#10b981', path: 'https://global-parts-find.base44.app/Finder', isExternal: true }
    ];

    const adminTools = [
        { title: 'User Control', description: 'Manage system users, accessible modules, and roles.', icon: <ShieldCheck size={24} />, color: '#3b82f6', path: '/admin/users' },
        { title: 'Staff Directory', description: 'Access and update staff profiles, details, and permissions.', icon: <Users size={24} />, color: '#f59e0b', path: '/admin/staff' },
        { title: 'APK Manager', description: 'Upload and distribute Android application packages.', icon: <Smartphone size={24} />, color: '#10b981', path: '/admin/apks' },
        { title: 'Activity Logs', description: 'Security audit trail and superadmin logs.', icon: <History size={24} />, color: '#a855f7', path: '/admin/logs' }
    ];

    const [showDropdown, setShowDropdown] = useState(false);
    const [showEnquiryForm, setShowEnquiryForm] = useState(false);
    
    // Convert to Job States
    const [showConversionModal, setShowConversionModal] = useState(false);
    const [conversionTarget, setConversionTarget] = useState(null);
    const [conversionLoading, setConversionLoading] = useState(false);

    // Job Editing States
    const [editingJob, setEditingJob] = useState(null);
    const [historyDoc, setHistoryDoc] = useState(null);
    const [historyItems, setHistoryItems] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Payment Modal States
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentPrefill, setPaymentPrefill] = useState(null);
    
    // SOA Aging View State
    const [soaGroups, setSoaGroups] = useState([]);
    const [sortDirection, setSortDirection] = useState('desc'); // 'asc' | 'desc'
    const [sortKey, setSortKey] = useState('created_at'); // 'created_at' | 'document_no' | 'customer' | 'total_amount'
    const [selectedCustomerForSOA, setSelectedCustomerForSOA] = useState(null);
    const [customerDocs, setCustomerDocs] = useState([]);
    const [loadingCustomerDocs, setLoadingCustomerDocs] = useState(false);
    const [poFile, setPoFile] = useState(null);
    const [showSmartUpload, setShowSmartUpload] = useState(false);
    const [partners, setPartners] = useState([]);
    const [selectedPartnerId, setSelectedPartnerId] = useState('');

    const dropdownRef = useRef(null);
    const [subTab, setSubTab] = useState('Ongoing'); // General sub-tab state (Ongoing, Completed, Archived, Sent, Draft, Paid, etc.)
    const [compactWindow, setCompactWindow] = useState(true); // 5-6 row small window mode

    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const jobId = searchParams.get('job_id');
    const paramType = searchParams.get('type');
    const view = searchParams.get('view');
    const isDepository = view === 'depository';

    useEffect(() => {
        // Support both query param (?type=Quotation) and pathname (/quotations)
        const path = location.pathname.substring(1).replace(/-/g, ' '); // simple normalization
        
        // Try exact match or plural match
        const foundDocType = DOC_TYPES.find(t => 
            t.toLowerCase() === path.toLowerCase() || 
            t.toLowerCase() === path.toLowerCase().replace(/s$/, '') ||
            (t + 's').toLowerCase() === path.toLowerCase()
        );

        const aliasMap = {
            'invoices': 'Tax Invoice',
            'quotations': 'Quotation',
            'purchase-orders': 'Purchase Order',
            'delivery-orders': 'Delivery Order',
            'proforma-invoices': 'Proforma Invoice',
            'packing-lists': 'Packing List',
            'certificates': 'Certificate',
            'service-reports': 'Service Report',
            'payment-received': 'Payment Received'
        };

        const rawPath = location.pathname.substring(1);
        const aliasMatch = aliasMap[rawPath];

        if (paramType && DOC_TYPES.includes(paramType)) {
            setActiveType(paramType);
        } else if (aliasMatch) {
            setActiveType(aliasMatch);
        } else if (foundDocType) {
            setActiveType(foundDocType);
        } else if (location.pathname === '/workflows') {
            setActiveType('All');
        }
    }, [paramType, location.pathname]);

    useEffect(() => {
        if (profile?.company_id) {
            fetchDocs();
        }
    }, [profile, activeType]);

    useEffect(() => {
        const config = SUB_TABS_CONFIG[activeType];
        if (config && config.length > 0) {
            setSubTab(config[0].id);
        } else {
            setSubTab('All');
        }
    }, [activeType]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [dropdownRef]);

    useEffect(() => {
        if (profile?.company_id) {
            const fetchPartners = async () => {
                const data = await getPartners(profile);
                if (data) setPartners(data);
            };
            fetchPartners();
        }
    }, [profile]);

    const fetchDocs = async () => {
        setLoading(true);
        // If activeType is "Job", we fetch ALL documents for the company and filter by is_job
        let typeFilter = (activeType === 'All' || activeType === 'Job') ? null : activeType;
        
        // Special fetch for SOA: we need all financial docs to calculate balances
        if (activeType === 'Statement of Account') {
            typeFilter = ['Tax Invoice', 'Proforma Invoice', 'Payment Received'];
        }

        // Fetch both Quotation and Order Acknowledgment when either is selected to handle crossover
        if (activeType === 'Quotation' || activeType === 'Order Acknowledgment') {
            typeFilter = ['Quotation', 'Order Acknowledgment'];
        }
        const isInvoiceView = activeType === 'Tax Invoice' || activeType === 'Proforma Invoice';
        if (isInvoiceView) {
            typeFilter = [activeType, 'Payment Received'];
        }
        const { data, error } = await getWorkflowDocuments(profile.company_id, typeFilter);
        
        if (data) {
            let filtered = data;
            
            // Build a payment map for ALL docs to calculate invoice balances
            const paymentsMap = {};
            data.filter(d => d.document_type === 'Payment Received').forEach(payment => {
                try {
                    const notes = JSON.parse(payment.internal_notes || '{}');
                    const relatedId = notes.related_document_id;
                    if (relatedId) {
                        paymentsMap[relatedId] = (paymentsMap[relatedId] || 0) + (parseFloat(payment.total_amount) || 0);
                    }
                } catch (e) {}
            });

            if (activeType === 'Job') {
                // Show everything that has is_job: true, but group by job number to avoid duplicates in the list
                const jobs = data.filter(d => d.is_job === true && d.assigned_job_no);
                
                // Group documents by assigned_job_no to examine their invoice/payment state
                const docsByJob = {};
                data.forEach(d => {
                    if (d.assigned_job_no) {
                        if (!docsByJob[d.assigned_job_no]) docsByJob[d.assigned_job_no] = [];
                        docsByJob[d.assigned_job_no].push(d);
                    }
                });

                const jobGroups = {};
                jobs.forEach(d => {
                    const jno = d.assigned_job_no;
                    // Prioritize 'Job' document type, or take the first one found (likely the QTN)
                    if (!jobGroups[jno] || d.document_type === 'Job') {
                        // Find invoice and payment state
                        const suiteDocs = docsByJob[jno] || [];
                        const taxInvoice = suiteDocs.find(sd => sd.document_type === 'Tax Invoice');
                        
                        let tab = 'Ongoing';
                        if (taxInvoice) {
                            if (taxInvoice.status === 'Paid') {
                                tab = 'Archived';
                            } else if (taxInvoice.status === 'Draft') {
                                tab = 'Ongoing';
                            } else {
                                tab = 'Completed';
                            }
                        } else {
                            // Check if Job itself is marked as Completed/Closed/Inactive
                            if (d.status === 'Completed' || d.status === 'Closed' || d.status === 'Inactive') {
                                tab = 'Archived';
                            }
                        }

                        jobGroups[jno] = {
                            ...d,
                            subTabState: tab
                        };
                    }
                });
                filtered = Object.values(jobGroups).sort((a, b) => b.assigned_job_no.localeCompare(a.assigned_job_no));
            } else if (activeType === 'Statement of Account') {
                // Group by Customer and calculate outstanding
                const groups = {};
                data.forEach(doc => {
                    const pname = doc.partners?.name || 'Walk-in';
                    if (!groups[pname]) {
                        groups[pname] = { 
                            partner_id: doc.partner_id, 
                            name: pname, 
                            outstanding: 0, 
                            total_invoiced: 0, 
                            total_paid: 0,
                            last_transaction: doc.issue_date,
                            doc_count: 0
                        };
                    }
                    
                    const amount = parseFloat(doc.total_amount) || 0;
                    if (doc.document_type.includes('Invoice')) {
                        groups[pname].outstanding += amount;
                        groups[pname].total_invoiced += amount;
                    } else if (doc.document_type === 'Payment Received') {
                        groups[pname].outstanding -= amount;
                        groups[pname].total_paid += amount;
                    }
                    groups[pname].doc_count++;
                    if (doc.issue_date && (!groups[pname].last_transaction || new Date(doc.issue_date) > new Date(groups[pname].last_transaction))) {
                        groups[pname].last_transaction = doc.issue_date;
                    }
                });
                setSoaGroups(Object.values(groups));
            }
            
            // Map the balance and assign subTabState to all documents
            filtered = filtered.map(doc => {
                let state = 'Draft';
                
                // Job Tab State Resolution
                if (doc.document_type === 'Job') {
                    state = doc.subTabState || 'Ongoing';
                }
                // Quotation & Order Acknowledgment Tab State Resolution
                else if (doc.document_type === 'Quotation' || doc.document_type === 'Order Acknowledgment') {
                    if (doc.is_job === true || doc.status === 'Confirmed' || doc.status === 'Approved' || doc.status === 'Active') {
                        state = 'Confirmed';
                    } else if (doc.status === 'Sent' || doc.status === 'Waiting') {
                        state = 'Sent';
                    } else {
                        state = 'Draft';
                    }
                }
                // Invoice Tab State Resolution
                else if (doc.document_type === 'Tax Invoice' || doc.document_type === 'Proforma Invoice') {
                    const paid = paymentsMap[doc.id] || 0;
                    const balance = Math.max(0, parseFloat(doc.total_amount || 0) - paid);
                    
                    if (doc.status === 'Paid' || balance <= 0.01) {
                        state = 'Paid';
                    } else if (doc.status === 'Draft') {
                        state = 'Draft';
                    } else {
                        state = 'Sent';
                    }
                    return { ...doc, subTabState: state, total_paid: paid, balance };
                }
                // Delivery Order Tab State Resolution
                else if (doc.document_type === 'Delivery Order') {
                    if (doc.status === 'Confirmed' || doc.status === 'Completed' || doc.status === 'Received') {
                        state = 'Confirmed';
                    } else if (doc.status === 'Draft') {
                        state = 'Draft';
                    } else {
                        state = 'Active';
                    }
                }
                // Packing List Tab State Resolution
                else if (doc.document_type === 'Packing List') {
                    if (doc.status === 'Confirmed' || doc.status === 'Completed' || doc.status === 'Closed') {
                        state = 'Completed';
                    } else if (doc.status === 'Draft') {
                        state = 'Draft';
                    } else {
                        state = 'Active';
                    }
                }

                return { ...doc, subTabState: state };
            });

            if (isInvoiceView) {
                // Filter out the Payment Received records from the actual list view so they don't show up in the table
                filtered = filtered.filter(d => d.document_type === activeType);
            }
            
            setDocuments(filtered);
        }
        setLoading(false);
    };

    const handleDelete = async (doc) => {
        const id = doc.id;
        if (!id) {
            toast.error("Invalid document ID");
            return;
        }

        const isJobGroup = activeType === 'Job' && doc.assigned_job_no;
        const confirmMsg = isJobGroup 
            ? `Are you sure you want to delete the ENTIRE Job suite ${doc.assigned_job_no}? This will delete all associated documents (Enquiry, Quotation, PO, INV, etc.) linked to this job.`
            : 'Are you sure you want to delete this document? This action cannot be undone.';
        
        if (window.confirm(confirmMsg)) {
            try {
                if (isJobGroup) {
                    setLoading(true);
                    // 1. Fetch all docs in the job
                    const { data: jobDocs } = await getWorkflowDocumentsByJob(doc.job_id || doc.id);
                    if (jobDocs && jobDocs.length > 0) {
                        // Filter out dependent/revision documents whose parents are also being deleted in this batch
                        const docIds = new Set(jobDocs.map(d => d.id));
                        const rootDocs = jobDocs.filter(jd => !jd.original_document_id || !docIds.has(jd.original_document_id));

                        // Run deletions in parallel
                        const deletePromises = rootDocs.map(async (jd) => {
                            const { error } = await deleteWorkflowDocument(jd.id);
                            if (error) throw error;
                        });
                        await Promise.all(deletePromises);
                    } else {
                        // Fallback to just this doc if no job_id link found
                        const { error } = await deleteWorkflowDocument(id);
                        if (error) throw error;
                    }
                } else {
                    const { error } = await deleteWorkflowDocument(id);
                    if (error) throw error;
                }
                
                toast.success(isJobGroup ? "Job suite deleted successfully" : "Document deleted successfully");
                fetchDocs();
            } catch (error) {
                console.error("Delete failed:", error);
                let msg = error.message || error.details || "Unknown database error.";
                if (msg.includes('foreign key constraint')) {
                    msg = "Cannot delete this document because it is referenced by other records.";
                }
                toast.error("Failed to delete: " + msg, { duration: 5000 });
            } finally {
                setLoading(false);
            }
        }
    };

    const handleDuplicate = async (id) => {
        if (window.confirm('Are you sure you want to duplicate this document? All items will be copied to a new draft.')) {
            try {
                toast.loading('Duplicating document...', { id: 'dup-doc' });
                const { data: newDoc, error } = await duplicateWorkflowDocument(id);
                if (error) throw error;

                toast.success(`Duplicated successfully as ${newDoc?.document_no || 'Draft'}! Opening editor...`, { id: 'dup-doc' });
                
                if (newDoc && newDoc.id) {
                    const slug = (newDoc.document_type || 'job').toLowerCase().replace(/\s+/g, '-');
                    navigate(`/workflows/editor/${slug}/${newDoc.id}`);
                } else {
                    fetchDocs();
                }
            } catch (error) {
                console.error("Duplicate failed:", error);
                toast.error("Failed to duplicate document. Error: " + (error.message || "Unknown error."), { id: 'dup-doc' });
            }
        }
    };

    const handleShowHistory = async (doc) => {
        setHistoryDoc(doc);
        setLoadingHistory(true);
        try {
            const { data, error } = await getDocumentHistory(doc);
            if (data) setHistoryItems(data);
            if (error) throw error;
        } catch (err) {
            console.error("History fetch error:", err);
            toast.error("Failed to fetch history: " + err.message);
        } finally {
            setLoadingHistory(false);
        }
    };
    
    const handleConversionSubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const poData = {
            po_no: formData.get('po_no'),
            po_date: formData.get('po_date'),
            po_value: formData.get('po_value'),
            po_description: formData.get('po_description'),
            po_by: formData.get('po_by')
        };
        const options = {
            includeCertificates: formData.get('includeCertificates') === 'on',
            includeServiceReport: formData.get('includeServiceReport') === 'on'
        };

        setConversionLoading(true);
        try {
            let result;
            if (conversionTarget.document_type.includes('Invoice')) {
                result = await convertInvoiceToJob(conversionTarget.id, poData);
            } else {
                result = await convertQuotationToJob(conversionTarget.id, poData, options);
            }
            const { jobNo } = result;
            
            // Provision Drive folder and migrate files if Google API is connected
            if (isTokenValid()) {
                try {
                    const accessToken = localStorage.getItem('google_access_token');
                    if (accessToken) {
                        const { getDocumentSettings } = await import('../../lib/store');
                        const { provisionFullProjectStructure, uploadFileToDrive, migrateEnquiryFilesToJob } = await import('../../lib/driveService');
                        const { supabase } = await import('../../lib/supabase');

                        const settings = await getDocumentSettings(profile.company_id);
                        let celronRootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
                        if (celronRootId?.includes('drive.google.com')) {
                            const match = celronRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || celronRootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                            if (match) celronRootId = match[1];
                        }

                        const currentYear = new Date().getFullYear().toString();
                        const projName = buildProjectFolderName(jobNo, conversionTarget);
                        const projectFolderId = await provisionFullProjectStructure(accessToken, celronRootId, currentYear, projName);

                        // Save folder ID to the newly created Job document
                        await supabase.from('workflow_documents').update({ 
                            drive_folder_id: projectFolderId
                        }).eq('document_no', jobNo);

                        // If PO file is uploaded/selected, copy/upload it to Drive
                        if (poFile) {
                            let poUrl = null;
                            if (poFile.isGoogleDrive && poFile.id) {
                                const { copyFile } = await import('../../lib/driveService');
                                const copyRes = await copyFile(accessToken, poFile.id, projectFolderId);
                                poUrl = `https://drive.google.com/file/d/${copyRes.id || poFile.id}/view`;
                            } else if (poFile instanceof File || poFile.name) {
                                const uploadResult = await uploadFileToDrive(accessToken, poFile, { folderId: projectFolderId });
                                poUrl = `https://drive.google.com/file/d/${uploadResult.id}/view`;
                            }

                            if (poUrl) {
                                // Update all documents associated with this job with the attachment URL
                                await supabase.from('workflow_documents').update({ 
                                    customer_po_attachment_url: poUrl,
                                    attachment_urls: [poUrl]
                                }).eq('assigned_job_no', jobNo);
                            }
                        }

                        // Move Enquiry folder into the newly created Job folder if enquiry_id or enquiry_no is linked
                        let enqFolderId = null;
                        if (conversionTarget?.enquiry_id) {
                            const { data: enqData } = await supabase
                                .from('customer_enquiries')
                                .select('gdrive_folder_id')
                                .eq('id', conversionTarget.enquiry_id)
                                .maybeSingle();
                            enqFolderId = enqData?.gdrive_folder_id;

                            if (!enqFolderId) {
                                const { data: docData } = await supabase
                                    .from('workflow_documents')
                                    .select('drive_folder_id')
                                    .eq('id', conversionTarget.enquiry_id)
                                    .maybeSingle();
                                enqFolderId = docData?.drive_folder_id;
                            }
                        }

                        if (!enqFolderId) {
                            const targetNo = conversionTarget?.enquiry_no || (conversionTarget?.document_type === 'Enquiry' ? conversionTarget?.document_no : null);
                            if (targetNo) {
                                const { data: docData } = await supabase
                                    .from('workflow_documents')
                                    .select('drive_folder_id')
                                    .eq('document_no', targetNo)
                                    .maybeSingle();
                                enqFolderId = docData?.drive_folder_id;
                            }
                        }

                        if (enqFolderId && projectFolderId) {
                            try {
                                const { moveFolder } = await import('../../lib/driveService');
                                await moveFolder(accessToken, enqFolderId, projectFolderId);
                                console.log(`Successfully moved Enquiry folder (${enqFolderId}) into Job folder (${projectFolderId})`);
                            } catch (mErr) {
                                console.warn("Notice: moveFolder failed or folder already moved:", mErr);
                            }
                            await migrateEnquiryFilesToJob(accessToken, enqFolderId, projectFolderId);
                        }
                    }
                } catch (driveErr) {
                    console.error("Google Drive setup/migration failed:", driveErr);
                    // Non-blocking error for main conversion
                }
            }

            alert(`Job ${jobNo} created successfully with all associated documents!`);
            setShowConversionModal(false);
            setPoFile(null);
            fetchDocs();
        } catch (error) {
            console.error("Conversion failed:", error);
            alert("Failed to convert to job: " + (error.message || "Unknown error"));
        } finally {
            setConversionLoading(false);
        }
    };

    const handleConvertToTaxInvoice = async (docId) => {
        if (!window.confirm('Are you sure you want to convert this Proforma Invoice to a Tax Invoice?')) return;
        
        setConversionLoading(true);
        try {
            const savedInv = await convertProformaToTaxInvoice(docId);
            alert(`Tax Invoice ${savedInv.document_no} created successfully!`);
            fetchDocs();
            // Optional: navigate to Tax Invoice tab
            navigate('/workflows?type=Tax+Invoice');
            setActiveType('Tax Invoice');
        } catch (error) {
            console.error("Conversion failed:", error);
            alert("Failed to convert to Tax Invoice: " + (error.message || "Unknown error"));
        } finally {
            setConversionLoading(false);
        }
    };

    const handleRestore = async (doc) => {
        if (!window.confirm(`Restore ${doc.document_no} to active workflows?`)) return;
        try {
            setLoading(true);
            const { supabase } = await import('../../lib/supabase');
            await supabase.from('workflow_documents').update({ status: 'Draft' }).eq('id', doc.id);
            alert('Document restored to active list.');
            fetchDocs();
        } catch (error) {
            console.error('Restore failed:', error);
            alert('Restore failed: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRevertJob = async (doc) => {
        if (!window.confirm(`Are you sure you want to revert Job ${doc.assigned_job_no} back to a Quotation? \n\nThis will DELETE all associated suite documents (CEL, ORA, DO, etc.) and restore the original Quotation to Draft status.`)) return;
        
        setConversionLoading(true);
        try {
            await revertJobToQuotation(doc.assigned_job_no);
            alert('Job reverted successfully.');
            fetchDocs();
        } catch (error) {
            console.error("Revert failed:", error);
            alert("Failed to revert job: " + (error.message || "Unknown error"));
        } finally {
            setConversionLoading(false);
        }
    };

    const handleRevertQuotation = async (doc) => {
        if (!window.confirm(`Are you sure you want to revert Quotation ${doc.document_no} back to an Enquiry? \n\nThis will DELETE the current Quotation and create a new draft Enquiry.`)) return;
        
        setConversionLoading(true);
        try {
            const savedEnq = await revertQuotationToEnquiry(doc.id);
            alert(`Quotation reverted to Enquiry ${savedEnq.document_no} successfully!`);
            fetchDocs();
            navigate('/workflows?type=Enquiry');
        } catch (error) {
            console.error("Revert failed:", error);
            alert("Failed to revert quotation: " + (error.message || "Unknown error"));
        } finally {
            setConversionLoading(false);
        }
    };


    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
    };

    const extractFirstImageSrc = (htmlString) => {
        if (!htmlString) return null;
        const match = htmlString.match(/<img[^>]+src="([^">]+)"/);
        return match ? match[1] : null;
    };

    const getTypeColor = (type) => {
        switch (type) {
            case 'Enquiry': return '#6366f1';
            case 'Quotation': return '#3b82f6';
            case 'Purchase Order': return '#f59e0b';
            case 'Order Acknowledgment': return '#059669';
            case 'Delivery Order': return '#10b981';
            case 'Service Report': return '#ec4899';
            case 'Tax Invoice': return '#ef4444';
            case 'Certificate': return '#6366f1';
            case 'Payment Received': return '#10b981';
            case 'Statement of Account': return '#3b82f6';
            case 'Proforma Invoice': return '#f43f5e';
            case 'Packing List': return '#f97316';
            default: return '#64748b';
        }
    };

    const handleUploadSignedProof = async (doc, file) => {
        if (!file) return;
        
        try {
            setLoading(true);

            if (!isTokenValid()) {
                if (window.confirm('Your Google connection has expired or is not connected. Would you like to connect now?')) {
                    sessionStorage.setItem('google_auth_return_url', window.location.pathname + window.location.search);
                    connectGoogleAPI();
                }
                setLoading(false);
                return;
            }

            const accessToken = localStorage.getItem('google_access_token');
            if (!accessToken) throw new Error('Google account not connected');

            const { getDocumentSettings } = await import('../../lib/store');
            const { getOrCreateFolder, provisionFullProjectStructure, uploadFileToDrive } = await import('../../lib/driveService');
            const { getGDriveFolderIdForStage } = await import('../../lib/workflowV2Service');

            const settings = await getDocumentSettings(profile.company_id);
            let celronRootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
            if (celronRootId?.includes('drive.google.com')) {
                const match = celronRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || celronRootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (match) celronRootId = match[1];
            }

            const currentYear = new Date().getFullYear().toString();
            const jobNo = doc.assigned_job_no || doc.document_no;
            const projName = buildProjectFolderName(jobNo, doc);
            const projectFolderId = await provisionFullProjectStructure(accessToken, celronRootId, currentYear, projName);
            
            // Option B: upload signed proof directly to the root project folder
            const signedFolderId = projectFolderId;
            
            const result = await uploadFileToDrive(accessToken, file, { folderId: signedFolderId });
            const proofUrl = `https://drive.google.com/file/d/${result.id}/view`;

            // Save to DB in attachment_urls or a specific field if we had one, 
            // for now let's use internal_notes or just alert success as it's in the folder
            const { supabase } = await import('../../lib/supabase');
            const newAttachments = [...(doc.attachment_urls || []), proofUrl];
            await supabase.from('workflow_documents').update({ 
                attachment_urls: newAttachments,
                status: 'Confirmed' 
            }).eq('id', doc.id);

            toast.success('Signed proof uploaded successfully!');
            fetchDocs();
        } catch (error) {
            console.error('Upload failed:', error);
            toast.error('Upload failed: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredDocs = documents.filter(doc => {
        if (jobId && doc.assigned_job_no !== jobId && doc.job_id !== jobId) {
            return false;
        }
        let matchesType = activeType === 'All' || doc.document_type === activeType;
        
        // Special logic for sub-tabbed pages
        const subTabConfig = SUB_TABS_CONFIG[activeType];
        if (subTabConfig) {
            if (activeType === 'Job') {
                matchesType = doc.document_type === 'Job' && doc.subTabState === subTab;
            } else if (activeType === 'Quotation') {
                matchesType = doc.document_type === 'Quotation' && !(doc.document_no || '').startsWith('ORA') && doc.subTabState === subTab;
            } else if (activeType === 'Order Acknowledgment') {
                matchesType = (doc.document_type === 'Order Acknowledgment' || (doc.document_type === 'Quotation' && (doc.document_no || '').startsWith('ORA'))) && doc.subTabState === subTab;
            } else {
                matchesType = doc.document_type === activeType && doc.subTabState === subTab;
            }
        } else {
            // Special logic for Order Acknowledgment vs Quotation (Handling ORA-prefixed Quotations)
            if (activeType === 'Order Acknowledgment') {
                matchesType = doc.document_type === 'Order Acknowledgment' || (doc.document_type === 'Quotation' && (doc.document_no || '').startsWith('ORA'));
            } else if (activeType === 'Quotation') {
                matchesType = doc.document_type === 'Quotation' && !(doc.document_no || '').startsWith('ORA');
            }
        }

        const matchesSearch = (doc.document_no || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (doc.partners?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (doc.subject || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (doc.customer_ref || '').toLowerCase().includes(searchQuery.toLowerCase());
        
        const selectedPartner = partners.find(p => p.id === selectedPartnerId);
        const selectedPartnerName = selectedPartner?.name;
        const matchesPartner = !selectedPartnerId || 
            doc.partner_id === selectedPartnerId ||
            (doc.partners?.name && selectedPartnerName && doc.partners.name.trim().toLowerCase() === selectedPartnerName.trim().toLowerCase());

        return matchesType && matchesSearch && matchesPartner;
    });

    const sortedDocs = [...filteredDocs].sort((a, b) => {
        let valA, valB;
        if (sortKey === 'created_at') {
            valA = a.created_at ? new Date(a.created_at) : 0;
            valB = b.created_at ? new Date(b.created_at) : 0;
            return sortDirection === 'desc' ? valB - valA : valA - valB;
        } else if (sortKey === 'document_no') {
            valA = a.assigned_job_no || a.document_no || '';
            valB = b.assigned_job_no || b.document_no || '';
            return sortDirection === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
        } else if (sortKey === 'total_amount') {
            valA = parseFloat(activeType === 'Job' ? a.delivery_verification?.po_value : a.total_amount) || 0;
            valB = parseFloat(activeType === 'Job' ? b.delivery_verification?.po_value : b.total_amount) || 0;
            return sortDirection === 'desc' ? valB - valA : valA - valB;
        } else if (sortKey === 'customer') {
            valA = a.delivery_verification?.po_description || a.partners?.name || '';
            valB = b.delivery_verification?.po_description || b.partners?.name || '';
            return sortDirection === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
        }
    });

    const getGroupedFlatRows = (docs) => {
        const groups = {};
        const result = [];
        
        // Scan docs and group the ones with assigned_job_no
        docs.forEach(doc => {
            const jobNo = doc.assigned_job_no?.trim();
            if (jobNo) {
                if (!groups[jobNo]) {
                    groups[jobNo] = {
                        jobNo,
                        docs: [],
                        customerName: doc.partners?.name || 'Walk-in'
                    };
                }
                groups[jobNo].docs.push(doc);
                if (doc.partners?.name) {
                    groups[jobNo].customerName = doc.partners.name;
                }
            }
        });
        
        // Now build the list preserving the order of sortedDocs (which is `docs` passed in)
        const groupKeysSeen = new Set();
        
        docs.forEach(doc => {
            const jobNo = doc.assigned_job_no?.trim();
            if (jobNo) {
                if (!groupKeysSeen.has(jobNo)) {
                    groupKeysSeen.add(jobNo);
                    const group = groups[jobNo];
                    result.push({ 
                        isHeader: true, 
                        jobNo: group.jobNo, 
                        customerName: group.customerName, 
                        key: `header-${group.jobNo}` 
                    });
                    
                    // The docs in group.docs are already in their relative sorted order from docs
                    group.docs.forEach(gDoc => {
                        result.push({ 
                            isHeader: false, 
                            doc: gDoc, 
                            key: gDoc.id 
                        });
                    });
                }
            } else {
                result.push({ 
                    isHeader: false, 
                    doc, 
                    key: doc.id 
                });
            }
        });
        
        return result;
    };

    const handleOpenDocument = (type, id) => {
        let url = type.toLowerCase() === 'enquiry'
            ? `/workflows/enquiry/${id}`
            : `/workflows/editor/${type.toLowerCase().replace(/\s+/g, '-')}/${id}`;
        if (id === 'new' && jobId) {
            url += `?job_id=${jobId}`;
        }
        window.open(url, '_blank');
    };

    const openDriveFolder = async (doc) => {
        // 1. Direct link on the document itself
        const folderId = doc.drive_folder_id || doc.gdrive_folder_id;
        if (folderId) {
            window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
            return;
        }

        // 2. If it's a Job or part of a Job, try to find the Project folder
        const jobNo = doc.assigned_job_no || doc.document_no;
        if (!jobNo) {
            alert('This document is not linked to an active Job or Enquiry folder.');
            return;
        }

        const confirmMsg = doc.document_type === 'Job'
            ? `No Google Drive folder linked for Job ${jobNo}. Would you like to provision a new project folder structure for it now?`
            : `No Google Drive folder linked for ${doc.document_no}. Would you like to provision a project folder for Job ${jobNo} now?`;
            
        if (!window.confirm(confirmMsg)) return;

        try {
            setLoading(true);

            if (!isTokenValid()) {
                if (window.confirm('Your Google connection has expired or is not connected. Would you like to connect now?')) {
                    sessionStorage.setItem('google_auth_return_url', window.location.pathname + window.location.search);
                    connectGoogleAPI();
                }
                setLoading(false);
                return;
            }

            const accessToken = localStorage.getItem('google_access_token');
            if (!accessToken) throw new Error('Google account not connected');

            const { getDocumentSettings } = await import('../../lib/store');
            const { getOrCreateFolder, provisionFullProjectStructure } = await import('../../lib/driveService');
            const { getGDriveFolderIdForStage } = await import('../../lib/workflowV2Service');

            const settings = await getDocumentSettings(profile.company_id);
            let celronRootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
            
            if (!celronRootId) throw new Error('Google Drive Root Folder ID not configured in Settings.');
            
            // Extract ID if URL was provided
            if (celronRootId.includes('drive.google.com')) {
                const match = celronRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || celronRootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (match) celronRootId = match[1];
            }

            const currentYear = new Date().getFullYear().toString();
            const projName = buildProjectFolderName(jobNo, doc);
            const projectFolderId = await provisionFullProjectStructure(accessToken, celronRootId, currentYear, projName);
            
            // Find specific subfolder for this document type (Option B: all documents go to root, so subfolderName is null)
            const subfolderName = getGDriveFolderIdForStage(doc.document_type);
            const targetFolderId = subfolderName ? await getOrCreateFolder(accessToken, subfolderName, projectFolderId) : projectFolderId;

            // Update DB if possible (Optional, but helps for next time)
            const { supabase } = await import('../../lib/supabase');
            await supabase.from('workflow_documents').update({ drive_folder_id: targetFolderId }).eq('id', doc.id);

            toast.success('Folder provisioned successfully!');
            fetchDocs();
            window.open(`https://drive.google.com/drive/folders/${targetFolderId}`, '_blank');
        } catch (error) {
            console.error('Provisioning failed:', error);
            toast.error('Failed to provision: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePrintPreview = (id) => {
        const url = `/workflows/print/${id}`;
        window.open(url, '_blank');
    };

    const handleDirectDownload = (id) => {
        window.open(`/workflows/print/${id}?autoDownload=true`, '_blank');
    };

    const getStepIdForDocType = (docType) => {
        switch (docType) {
            case 'Enquiry': return 1;
            case 'Quotation': return 2;
            case 'Customer PO': return 3;
            case 'Purchase Order':
            case 'Job': return 4;
            case 'Delivery Order': return 5;
            case 'Tax Invoice':
            case 'Proforma Invoice': return 6;
            case 'Payment Received': return 7;
            default: return 0;
        }
    };

    const getPageTitle = () => {
        if (isDepository) return 'RFQ Depository';
        if (activeType === 'All') return 'All Workflows';
        if (activeType === 'Enquiry') return 'Supplier Enquiries';
        if (activeType === 'Quotation') return 'Quote2Customers';
        if (activeType === 'Purchase Order') return 'P.O. 2 Suppliers';
        if (activeType === 'Payment Received') return 'Statement of Accounts';
        if (activeType === 'Statement of Account') return 'SOA List';
        if (activeType === 'Job') return 'Job List';
        return activeType + 's';
    };

    const getPageDescription = () => {
        if (isDepository) return 'Historical record of all floated enquiries to your suppliers.';
        if (activeType === 'All') return 'Manage all your documents and workflows across different stages.';
        if (activeType === 'Enquiry') return 'Generate and manage outgoing Enquiries to your suppliers.';
        if (activeType === 'Quotation') return 'Issue Quote2Customers to your prospective buyers.';
        if (activeType === 'Purchase Order') return 'Issue P.O. 2 Suppliers for your requirement.';
        if (activeType === 'Delivery Order') return 'Manage Delivery Orders for your shipments.';
        if (activeType === 'Proforma Invoice') return 'Draft Proforma Invoices for advance payments.';
        if (activeType === 'Packing List') return 'Manage Packing Lists for your deliveries.';
        if (activeType === 'Tax Invoice') return 'Manage final Tax Invoices for your sales.';
        if (activeType === 'Payment Received') return 'Record and track payments received from customers.';
        if (activeType === 'Statement of Account') return 'Generate statements of account for your customers.';
        return '';
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1600px', margin: '0 auto', padding: '0 8px' }}>
            <ModuleSwitcherHeader activeModule="processing" />
            <header className="page-header">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button 
                            onClick={handleGoBack} 
                            style={{ 
                                background: '#fff', 
                                border: '1px solid var(--border-color)', 
                                padding: '8px', 
                                borderRadius: '10px', 
                                cursor: 'pointer', 
                                color: 'var(--text-secondary)', 
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.borderColor = 'var(--accent)';
                                e.currentTarget.style.color = 'var(--accent)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border-color)';
                                e.currentTarget.style.color = 'var(--text-secondary)';
                            }}
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <h1 className="page-title" style={{ margin: 0 }}>{getPageTitle()}</h1>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
                        {getPageDescription()}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {activeType !== 'Payment Received' && activeType !== 'Job' && (
                        <button
                        type="button"
                        style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            height: '36px',
                            padding: '0 16px',
                            borderRadius: '8px',
                            background: '#4f46e5', 
                            color: '#ffffff', 
                            border: '1px solid #4338ca',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(79, 70, 229, 0.25)',
                            transition: 'all 0.15s'
                        }}
                        onClick={() => {
                            const config = {
                                'Quotation': { link: '/workflows/editor/quotation/new' },
                                'Purchase Order': { link: '/workflows/editor/purchase-order/new' },
                                'Delivery Order': { link: '/workflows/editor/delivery-order/new' },
                                'Service Report': { link: '/workflows/editor/service-report/new' },
                                'Proforma Invoice': { link: '/workflows/editor/proforma-invoice/new' },
                                'Packing List': { link: '/workflows/editor/packing-list/new' },
                                'Tax Invoice': { link: '/workflows/editor/tax-invoice/new' },
                                'Certificate': { link: '/workflows/editor/certificate/new' },
                                'Statement of Account': { link: '/soa' }
                            };
                            if (config[activeType]) {
                                window.open(config[activeType].link, '_blank');
                            } else if (activeType === 'All') {
                                setShowEnquiryForm(true);
                            } else {
                                setShowEnquiryForm(true);
                            }
                        }}
                    >
                        <Plus size={16} /> 
                        {(() => {
                            const labelMap = {
                                'Purchase Order': 'New Purchase Order 2 Supplier',
                                'Packing List': 'New Packing list',
                                'Delivery Order': 'New Delivery Order',
                                'Service Report': 'New Service Report',
                                'Quotation': 'New Quotation',
                                'Certificate': 'New Certificate',
                                'Proforma Invoice': 'New Proforma Invoice',
                                'Tax Invoice': 'New Tax Invoice',
                                'Statement of Account': 'Generate SOA',
                                'All': 'New Enquiry'
                            };
                            return labelMap[activeType] || `New ${activeType}`;
                        })()}
                    </button>
                    )}
                    {activeType === 'Job' && (
                        <>
                            <button
                                type="button"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    height: '36px',
                                    padding: '0 14px',
                                    borderRadius: '8px',
                                    background: '#ffffff',
                                    border: '1px solid #cbd5e1',
                                    color: '#475569',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                                onClick={() => navigate('/workflows/jobs-dashboard')}
                            >
                                <LayoutDashboard size={16} /> Go to Dashboard
                            </button>
                            <button
                                type="button"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    height: '36px',
                                    padding: '0 16px',
                                    borderRadius: '8px',
                                    background: '#4f46e5',
                                    border: '1px solid #4338ca',
                                    color: '#ffffff',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 4px rgba(79, 70, 229, 0.25)'
                                }}
                                onClick={() => {
                                    window.open('/workflows/editor/quotation/new', '_blank');
                                }}
                            >
                                <Plus size={16} /> New Job
                            </button>
                        </>
                    )}
                    <div className="dropdown" ref={dropdownRef}>
                        <button
                            type="button"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                height: '36px',
                                padding: '0 16px',
                                borderRadius: '8px',
                                background: '#4f46e5',
                                border: '1px solid #4338ca',
                                color: '#ffffff',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(79, 70, 229, 0.25)'
                            }}
                            onClick={() => setShowDropdown(!showDropdown)}
                        >
                            <Plus size={16} /> New Document
                        </button>
                        <div className={`dropdown-content ${showDropdown ? 'show' : ''}`} style={{ right: 0, minWidth: '200px' }}>
                            {DOC_TYPES.map(type => (
                                <button key={type} onClick={() => {
                                    setShowDropdown(false);
                                    handleOpenDocument(type, 'new');
                                }}>
                                    {type === 'Enquiry' ? 'Enquiry to Supplier' : (type === 'Quotation' ? 'Quote2Customers' : (type === 'Purchase Order' ? 'P.O. 2 Suppliers' : type))}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </header>

            {activeType === 'All' && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', background: '#f1f5f9', padding: '6px', borderRadius: '14px', width: 'fit-content' }}>
                    <button
                        onClick={() => setViewMode('board')}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '10px',
                            border: 'none',
                            background: viewMode === 'board' ? '#fff' : 'transparent',
                            color: viewMode === 'board' ? 'var(--accent)' : '#64748b',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: viewMode === 'board' ? '0 4px 6px -1px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        <LayoutDashboard size={18} />
                        Workflow Master Board
                    </button>
                    <button
                        onClick={() => setViewMode('tools')}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '10px',
                            border: 'none',
                            background: viewMode === 'tools' ? '#fff' : 'transparent',
                            color: viewMode === 'tools' ? 'var(--accent)' : '#64748b',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: viewMode === 'tools' ? '0 4px 6px -1px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Briefcase size={18} />
                        Workflow Tools &amp; Files
                    </button>
                </div>
            )}

            {activeType === 'All' && viewMode === 'tools' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', marginTop: '8px', marginBottom: '40px' }}>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>Workflow Tools &amp; Files</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px', width: '100%' }}>
                            {workflowTools.map((tool, idx) => (
                                <div 
                                    key={idx}
                                    onClick={() => {
                                        if (tool.isExternal) window.open(tool.path, '_blank');
                                        else navigate(tool.path);
                                    }}
                                    style={{
                                        background: '#ffffff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '20px',
                                        padding: '24px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '16px',
                                        cursor: 'pointer',
                                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-4px)';
                                        e.currentTarget.style.boxShadow = '0 12px 20px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                                        e.currentTarget.style.borderColor = tool.color + '44';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.transform = 'none';
                                        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05)';
                                        e.currentTarget.style.borderColor = '#e2e8f0';
                                    }}
                                >
                                    <div style={{
                                        width: '48px',
                                        height: '48px',
                                        borderRadius: '12px',
                                        background: `${tool.color}15`,
                                        color: tool.color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        {tool.icon}
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {tool.title}
                                            {tool.isExternal && <ExternalLink size={14} style={{ opacity: 0.6 }} />}
                                        </h3>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                                            {tool.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {canAdmin && (
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>System Admin Control Panel</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px', width: '100%' }}>
                                {adminTools.map((tool, idx) => (
                                    <div 
                                        key={idx}
                                        onClick={() => navigate(tool.path)}
                                        style={{
                                            background: '#ffffff',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '20px',
                                            padding: '24px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '16px',
                                            cursor: 'pointer',
                                            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                                        }}
                                        onMouseOver={(e) => {
                                            e.currentTarget.style.transform = 'translateY(-4px)';
                                            e.currentTarget.style.boxShadow = '0 12px 20px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                                            e.currentTarget.style.borderColor = tool.color + '44';
                                        }}
                                        onMouseOut={(e) => {
                                            e.currentTarget.style.transform = 'none';
                                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05)';
                                            e.currentTarget.style.borderColor = '#e2e8f0';
                                        }}
                                    >
                                        <div style={{
                                            width: '48px',
                                            height: '48px',
                                            borderRadius: '12px',
                                            background: `${tool.color}15`,
                                            color: tool.color,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            {tool.icon}
                                        </div>
                                        <div>
                                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px 0' }}>
                                                {tool.title}
                                            </h3>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                                                {tool.description}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <>
                <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '24px',
                overflowX: 'auto',
                paddingBottom: '8px'
            }}>
                <button
                    type="button"
                    onClick={() => navigate('/enquiries')}
                    style={{
                        height: '34px',
                        padding: '0 14px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#475569',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseOut={(e) => e.currentTarget.style.background = '#ffffff'}
                >
                    <FileText size={14} /> Enquiry from customer
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setActiveType('Enquiry');
                        if (!isDepository) navigate('/workflows?type=Enquiry');
                    }}
                    style={{
                        height: '34px',
                        padding: '0 14px',
                        borderRadius: '8px',
                        border: activeType === 'Enquiry' ? '1px solid #4338ca' : '1px solid #cbd5e1',
                        background: activeType === 'Enquiry' ? '#4f46e5' : '#ffffff',
                        color: activeType === 'Enquiry' ? '#ffffff' : '#475569',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: activeType === 'Enquiry' ? '0 2px 4px rgba(79, 70, 229, 0.2)' : 'none',
                        transition: 'all 0.15s'
                    }}
                    onMouseOver={(e) => { if (activeType !== 'Enquiry') e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseOut={(e) => { if (activeType !== 'Enquiry') e.currentTarget.style.background = '#ffffff'; }}
                >
                    <ArrowRightLeft size={14} /> Enquiry to Supplier
                </button>

                {!isDepository && (
                    <button
                        type="button"
                        onClick={() => {
                            setActiveType('All');
                            navigate('/workflows');
                        }}
                        style={{
                            height: '34px',
                            padding: '0 14px',
                            borderRadius: '8px',
                            border: activeType === 'All' ? '1px solid #4338ca' : '1px solid #cbd5e1',
                            background: activeType === 'All' ? '#4f46e5' : '#ffffff',
                            color: activeType === 'All' ? '#ffffff' : '#475569',
                            fontWeight: 600,
                            fontSize: '12px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: activeType === 'All' ? '0 2px 4px rgba(79, 70, 229, 0.2)' : 'none',
                            transition: 'all 0.15s'
                        }}
                        onMouseOver={(e) => { if (activeType !== 'All') e.currentTarget.style.background = '#f1f5f9'; }}
                        onMouseOut={(e) => { if (activeType !== 'All') e.currentTarget.style.background = '#ffffff'; }}
                    >
                        <Filter size={14} /> All Documents
                    </button>
                )}

                {!isDepository && DOC_TYPES.filter(t => t !== 'Enquiry').map(type => {
                        const isActive = activeType === type;
                        return (
                            <button
                                key={type}
                                type="button"
                                onClick={() => {
                                    if (type === 'Statement of Account') {
                                        navigate('/soa');
                                    } else {
                                        navigate(`/workflows?type=${encodeURIComponent(type)}`);
                                        setActiveType(type);
                                    }
                                }}
                                style={{
                                    height: '34px',
                                    padding: '0 14px',
                                    borderRadius: '8px',
                                    border: isActive ? '1px solid #4338ca' : '1px solid #cbd5e1',
                                    background: isActive ? '#4f46e5' : '#ffffff',
                                    color: isActive ? '#ffffff' : '#475569',
                                    fontWeight: 600,
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: isActive ? '0 2px 4px rgba(79, 70, 229, 0.2)' : 'none',
                                    transition: 'all 0.15s'
                                }}
                                onMouseOver={(e) => { if (!isActive) e.currentTarget.style.background = '#f1f5f9'; }}
                                onMouseOut={(e) => { if (!isActive) e.currentTarget.style.background = '#ffffff'; }}
                            >
                                {type === 'Jobs' && <Briefcase size={14} />}
                                {type === 'Quotation' && <FileText size={14} />}
                                {type === 'Enquiry' ? 'Enquiry to Supplier' : type}
                            </button>
                        );
                    })}
                </div>

            <div className="glass-panel">
                {jobId && (
                    <div style={{ 
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)', 
                        border: '1.5px solid #bfdbfe', 
                        color: '#1e40af', 
                        padding: '14px 20px', 
                        borderRadius: '12px', 
                        marginBottom: '20px', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        fontWeight: 600,
                        fontSize: '0.95rem',
                        boxShadow: '0 2px 4px rgba(59, 130, 246, 0.03)'
                    }}>
                        <span>Showing documents for Job Suite: <strong style={{ color: '#1d4ed8', fontSize: '1.05rem', marginLeft: '4px' }}>{jobId}</strong></span>
                        <button 
                            onClick={() => {
                                navigate(location.pathname + (activeType !== 'All' ? `?type=${activeType}` : ''));
                            }}
                            style={{ 
                                background: '#3b82f6', 
                                border: 'none', 
                                color: 'white', 
                                padding: '6px 14px', 
                                borderRadius: '8px', 
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={e => e.currentTarget.style.background = '#2563eb'}
                            onMouseOut={e => e.currentTarget.style.background = '#3b82f6'}
                        >
                            Clear Filter
                        </button>
                    </div>
                )}
                {SUB_TABS_CONFIG[activeType] && (
                    <div style={{ 
                        display: 'flex', 
                        gap: '12px', 
                        marginBottom: '20px', 
                        borderBottom: '1px solid var(--border-color)', 
                        paddingBottom: '16px' 
                    }}>
                        {SUB_TABS_CONFIG[activeType].map(tab => {
                            const isActive = subTab === tab.id;
                            // Count documents matching this state in current documents
                            let count = 0;
                            if (activeType === 'Job') {
                                count = documents.filter(d => d.document_type === 'Job' && d.subTabState === tab.id).length;
                            } else if (activeType === 'Quotation') {
                                count = documents.filter(d => d.document_type === 'Quotation' && !(d.document_no || '').startsWith('ORA') && d.subTabState === tab.id).length;
                            } else if (activeType === 'Order Acknowledgment') {
                                count = documents.filter(d => (d.document_type === 'Order Acknowledgment' || (d.document_type === 'Quotation' && (d.document_no || '').startsWith('ORA'))) && d.subTabState === tab.id).length;
                            } else {
                                count = documents.filter(d => d.document_type === activeType && d.subTabState === tab.id).length;
                            }

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setSubTab(tab.id)}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'flex-start',
                                        gap: '6px',
                                        padding: '14px 20px',
                                        borderRadius: '12px',
                                        border: `2px solid ${isActive ? tab.border : 'var(--border-color)'}`,
                                        background: isActive ? tab.bgActive : tab.bgInactive,
                                        color: isActive ? tab.textActive : tab.textInactive,
                                        cursor: 'pointer',
                                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                        flex: 1,
                                        textAlign: 'left',
                                        boxShadow: isActive ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                                        transform: isActive ? 'translateY(-2px)' : 'none'
                                    }}
                                    onMouseOver={e => {
                                        if (!isActive) {
                                            e.currentTarget.style.borderColor = tab.border;
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
                                        }
                                    }}
                                    onMouseOut={e => {
                                        if (!isActive) {
                                            e.currentTarget.style.borderColor = 'var(--border-color)';
                                            e.currentTarget.style.transform = 'none';
                                            e.currentTarget.style.boxShadow = 'none';
                                        }
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                                        <span style={{ 
                                            width: '10px', 
                                            height: '10px', 
                                            borderRadius: '50%', 
                                            background: isActive ? '#ffffff' : tab.color,
                                            border: isActive ? 'none' : `1px solid ${tab.border}`
                                        }} />
                                        <span style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '0.3px' }}>{tab.label}</span>
                                        <span style={{ 
                                            marginLeft: 'auto', 
                                            background: isActive ? '#ffffff' : tab.color, 
                                            color: isActive ? tab.color : '#ffffff', 
                                            padding: '3px 10px', 
                                            borderRadius: '20px', 
                                            fontSize: '0.8rem', 
                                            fontWeight: 800,
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                        }}>
                                            {count}
                                        </span>
                                    </div>
                                    <span style={{ 
                                        fontSize: '0.8rem', 
                                        opacity: isActive ? 0.9 : 0.8,
                                        fontWeight: 500
                                    }}>{tab.desc}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 16px', minWidth: '320px', flex: 1 }}>
                            <Search size={18} color="var(--text-secondary)" style={{ marginRight: '8px' }} />
                            <input
                                type="text"
                                placeholder="Search document no, customer, subject..."
                                style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', color: 'var(--text-primary)' }}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Customer Filter Dropdown */}
                        <div style={{ minWidth: '260px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Filter size={18} color="var(--text-secondary)" style={{ marginLeft: '8px' }} />
                            <SearchableSelect
                                options={(() => {
                                    const unique = [];
                                    const seen = new Set();
                                    (partners || []).forEach(p => {
                                        const key = (p.name || '').trim().toLowerCase();
                                        if (key && !seen.has(key)) {
                                            seen.add(key);
                                            unique.push(p);
                                        }
                                    });
                                    return unique;
                                })()}
                                value={selectedPartnerId}
                                onChange={(e) => setSelectedPartnerId(e.target.value)}
                                placeholder="All Customers"
                            />
                        </div>

                        {/* Sorting Dropdown */}
                        {activeType !== 'Statement of Account' && (
                            <div style={{ minWidth: '220px', display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0 12px' }}>
                                <ArrowUpDown size={16} color="var(--text-secondary)" style={{ marginRight: '8px' }} />
                                <select
                                    style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, color: 'var(--text-primary)', fontSize: '0.9rem', cursor: 'pointer', height: '38px' }}
                                    value={`${sortKey}-${sortDirection}`}
                                    onChange={(e) => {
                                        const [key, dir] = e.target.value.split('-');
                                        setSortKey(key);
                                        setSortDirection(dir);
                                    }}
                                >
                                    <option value="created_at-desc">Date Created (Newest First)</option>
                                    <option value="created_at-asc">Date Created (Oldest First)</option>
                                    <option value="document_no-desc">Document No (Z-A)</option>
                                    <option value="document_no-asc">Document No (A-Z)</option>
                                    <option value="customer-desc">Customer Name (Z-A)</option>
                                    <option value="customer-asc">Customer Name (A-Z)</option>
                                    <option value="total_amount-desc">Total Amount (Highest First)</option>
                                    <option value="total_amount-asc">Total Amount (Lowest First)</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Connected Active Tile Filter Badge & Window View Mode Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            background: '#eef2ff',
                            border: '1px solid #c7d2fe',
                            color: '#4338ca',
                            padding: '6px 12px',
                            borderRadius: '20px',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4f46e5' }} />
                            <span>Tile Filter: {subTab || activeType} ({sortedDocs.length})</span>
                        </div>

                        <button
                            onClick={() => setCompactWindow(!compactWindow)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                background: compactWindow ? '#ffffff' : '#f1f5f9',
                                color: '#334155',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            title={compactWindow ? "Switch to full expanded table view" : "Switch to 5-6 row compact window view"}
                        >
                            {compactWindow ? '📐 Small Window (5-6 Rows)' : '📄 Full View'}
                        </button>
                    </div>
                </div>

                <div 
                    className="table-container custom-scrollbar"
                    style={{
                        maxHeight: compactWindow ? '360px' : 'none',
                        overflowY: compactWindow ? 'auto' : 'visible',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px 12px 0 0',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
                        position: 'relative'
                    }}
                >
                    <table>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            {activeType === 'Statement of Account' ? (
                                <tr>
                                    <th style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}>
                                        Customer Name {sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                                    </th>
                                    <th>Outstanding Balance</th>
                                    <th>Total Invoiced</th>
                                    <th>Total Paid</th>
                                    <th>Last Transaction</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            ) : activeType === 'Job' ? (
                                <tr>
                                    <th style={{ width: '130px' }}>CEL Job No</th>
                                    <th style={{ width: '25%', minWidth: '220px' }}>Customer</th>
                                    <th style={{ width: '180px' }}>Purchase Order Info</th>
                                    <th style={{ width: '30%', minWidth: '250px' }}>Description</th>
                                    <th style={{ width: '120px', textAlign: 'right' }}>Value (SGD)</th>
                                    <th style={{ width: '110px' }}>Attachment</th>
                                    <th style={{ width: '80px', textAlign: 'center' }}>Folder</th>
                                    <th style={{ width: '280px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            ) : (
                                <tr>
                                    <th style={{ width: '110px' }}>Type</th>
                                    <th style={{ width: '110px' }}>Document No</th>
                                    <th style={{ width: '100px' }}>{activeType === 'Order Acknowledgment' ? 'Del / Svc Date' : 'Issue Date'}</th>
                                    <th style={{ minWidth: '200px' }}>Customer</th>
                                    <th style={{ width: '100px', textAlign: 'right' }}>Total</th>
                                    <th style={{ width: '80px' }}>Status</th>
                                    <th style={{ width: '60px', textAlign: 'center' }}>Folder</th>
                                    <th style={{ width: '230px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            )}
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="9" className="text-center py-12">Loading documents...</td></tr>
                            ) : (activeType === 'Statement of Account' ? soaGroups : sortedDocs).length === 0 ? (
                                <tr>
                                    <td colSpan={activeType === 'Job' ? "8" : "8"}>
                                        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
                                            <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                                            <p>No documents found matching your criteria.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : activeType === 'Statement of Account' ? (
                                soaGroups
                                    .filter(g => {
                                        if (!selectedPartnerId) return true;
                                        const selectedPartner = partners.find(p => p.id === selectedPartnerId);
                                        return selectedPartner && g.name && selectedPartner.name && g.name.trim().toLowerCase() === selectedPartner.name.trim().toLowerCase();
                                    })
                                    .sort((a, b) => sortDirection === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))
                                    .map((group) => (
                                        <tr key={group.name} className="table-row">
                                            <td 
                                                className="font-bold text-accent" 
                                                style={{ cursor: 'pointer', color: 'var(--accent)' }}
                                                onClick={() => {
                                                    setSelectedCustomerForSOA(group);
                                                    const docs = documents.filter(d => (d.partners?.name || 'Walk-in').trim().toLowerCase() === group.name.trim().toLowerCase());
                                                    setCustomerDocs(docs);
                                                }}
                                            >
                                                {group.name}
                                            </td>
                                            <td className="font-bold" style={{ color: group.outstanding > 0.01 ? '#ef4444' : (group.outstanding < -0.01 ? '#10b981' : 'var(--text-secondary)') }}>
                                                SGD {group.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>SGD {group.total_invoiced.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>SGD {group.total_paid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            <td>{formatDate(group.last_transaction)}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button 
                                                    className="btn btn-sm btn-secondary" 
                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}
                                                    onClick={() => window.open(`/soa?partner_id=${group.partner_id}`, '_blank')}
                                                >
                                                    <Printer size={14} /> Generate SOA
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                            ) : (
                                activeType === 'Job' ? (
                                    sortedDocs.map((doc) => (
                                        <tr key={doc.id} className="table-row">
                                            <td className="font-bold" style={{ color: '#1e3a8a' }}>{doc.assigned_job_no || 'TBD'}</td>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <div style={{ fontWeight: 600, color: '#1e3a8a', fontSize: '0.9rem' }}>{doc.delivery_verification?.po_description || doc.partners?.name || 'Walk-in'}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>
                                                        {doc.contacts?.name || 'N/A'}
                                                    </div>
                                                    
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px', opacity: 0.8 }}>
                                                        {doc.subject || '-'}
                                                    </div>
                                                    {doc.customer_ref && <div style={{ opacity: 0.6, fontSize: '0.7rem' }}>Ref: {doc.customer_ref}</div>}

                                                    {(() => {
                                                        const imgSrc = extractFirstImageSrc(doc.notes);
                                                        if (!imgSrc) return null;
                                                        return (
                                                            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <img 
                                                                    src={imgSrc} 
                                                                    alt="Proof thumbnail" 
                                                                    style={{ 
                                                                        width: '38px', 
                                                                        height: '38px', 
                                                                        objectFit: 'cover', 
                                                                        borderRadius: '4px', 
                                                                        border: '1px solid var(--border-color)', 
                                                                        cursor: 'pointer',
                                                                        transition: 'transform 0.2s',
                                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                                                    }} 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const win = window.open();
                                                                        win.document.write(`<iframe src="${imgSrc}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                                                                    }}
                                                                    onMouseOver={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
                                                                    onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                                                    title="Click to view full payment proof"
                                                                />
                                                                <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                                                                    Paid Proof Attached
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontWeight: 700, color: '#4f46e5', fontSize: '0.85rem' }}>{doc.customer_po_no || 'N/A'}</span>
                                                        {doc.customer_po_attachment_url && (
                                                            <a 
                                                                href={doc.customer_po_attachment_url} 
                                                                target="_blank" 
                                                                rel="noreferrer"
                                                                style={{ color: '#6366f1' }}
                                                                title="View PO File"
                                                            >
                                                                <FileText size={12} />
                                                            </a>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                                        {doc.customer_po_date ? formatDate(doc.customer_po_date) : 'No Date'}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                                                        By: {doc.contacts?.first_name || '-'}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem' }} title={doc.subject}>
                                                    {doc.subject || '-'}
                                                </div>
                                            </td>
                                            <td className="font-bold" style={{ textAlign: 'right' }}>SGD {(doc.total_amount || doc.delivery_verification?.po_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            <td>
                                                {doc.customer_po_attachment_url ? (
                                                    <a href={doc.customer_po_attachment_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <FileText size={12} /> View PO
                                                    </a>
                                                ) : (
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No Upload</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    onClick={() => openDriveFolder(doc)}
                                                    style={{ background: 'none', border: 'none', color: (doc.drive_folder_id || doc.gdrive_folder_id) ? '#f59e0b' : '#6366f1', cursor: 'pointer', opacity: (doc.drive_folder_id || doc.gdrive_folder_id) ? 1 : 0.4 }}
                                                    title={(doc.drive_folder_id || doc.gdrive_folder_id) ? "Open Project Folder" : "Provision Project Folder"}
                                                >
                                                    <Folder size={20} fill={(doc.drive_folder_id || doc.gdrive_folder_id) ? "#f59e0b" : "currentColor"} fillOpacity={0.2} />
                                                </button>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => {
                                                             if (doc.document_type === 'Enquiry') {
                                                                 navigate(`/workflows/enquiry/${doc.id}`);
                                                             } else {
                                                                 navigate(`/workflows/editor/${doc.document_type.toLowerCase().replace(/\s+/g, '-')}/${doc.id}`);
                                                             }
                                                         }}
                                                    >
                                                        <Eye size={14} /> Open
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-secondary"
                                                        style={{ color: '#6366f1' }}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handleDuplicate(doc.id);
                                                        }}
                                                        title="Duplicate Job Document"
                                                    >
                                                        <Copy size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-secondary"
                                                        style={{ color: 'var(--accent)' }}
                                                        onClick={() => setEditingJob(doc)}
                                                    >
                                                        <Plus size={14} /> Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => handlePrintPreview(doc.id)}
                                                    >
                                                        <Printer size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-secondary"
                                                        style={{ color: '#ef4444', borderColor: '#fecaca', background: '#fef2f2' }}
                                                        onClick={async (e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            if (!confirm(`Are you sure you want to revert Job ${doc.assigned_job_no} back to a Quotation? This will delete all associated ORA, DO, INV, etc. documents.`)) return;
                                                            try {
                                                                setLoading(true);
                                                                await revertJobToQuotation(doc.assigned_job_no);
                                                                alert('Reverted to Quotation successfully.');
                                                                fetchDocs();
                                                            } catch (err) {
                                                                console.error(err);
                                                                alert('Failed to revert: ' + err.message);
                                                            } finally {
                                                                setLoading(false);
                                                            }
                                                        }}
                                                        title="Revert to Quotation (Cancel Job)"
                                                    >
                                                        <ArrowRightLeft size={14} /> Revert
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-secondary"
                                                        style={{ color: 'var(--danger)' }}
                                                        onClick={() => handleDelete(doc)}
                                                        title="Delete Job Completely"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                    <label style={{ cursor: 'pointer', position: 'relative', zIndex: 20 }} title="Upload Signed Copy to Job Folder">
                                                        <div className="btn btn-sm btn-secondary" style={{ color: '#059669' }}>
                                                            <Upload size={14} />
                                                        </div>
                                                        <input 
                                                            type="file" 
                                                            hidden 
                                                            onChange={(e) => handleUploadSignedProof(doc, e.target.files[0])} 
                                                        />
                                                    </label>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    (() => {
                                        const itemsToRender = activeType === 'All' 
                                            ? getGroupedFlatRows(sortedDocs)
                                            : sortedDocs.map(doc => ({ isHeader: false, doc }));
                                        return itemsToRender.map((item) => {
                                            if (item.isHeader) {
                                                return (
                                                    <tr key={item.key} style={{ background: 'linear-gradient(90deg, #f0fdf4 0%, #ffffff 100%)', borderLeft: '4px solid #22c55e' }}>
                                                        <td colSpan="8" style={{ padding: '12px 16px', fontWeight: 800, color: '#166534', fontSize: '0.95rem', textAlign: 'left' }}>
                                                            <span style={{ background: '#22c55e', color: '#fff', padding: '3px 8px', borderRadius: '4px', marginRight: '8px', fontSize: '0.75rem', textTransform: 'uppercase' }}>Job Suite</span>
                                                            <strong>{item.jobNo}</strong> &ndash; {item.customerName}
                                                        </td>
                                                    </tr>
                                                );
                                            }
                                            const doc = item.doc;
                                            return (
                                                <tr key={doc.id} className="table-row" style={activeType === 'All' ? { borderLeft: '4px solid #86efac' } : undefined}>
                                            <td>
                                                <span style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    color: getTypeColor((doc.document_type === 'Quotation' && (doc.document_no || '').startsWith('ORA')) ? 'Order Acknowledgment' : doc.document_type),
                                                    textTransform: 'uppercase'
                                                }}>
                                                    <div style={{ 
                                                        width: '6px', 
                                                        height: '6px', 
                                                        borderRadius: '50%', 
                                                        background: getTypeColor((doc.document_type === 'Quotation' && (doc.document_no || '').startsWith('ORA')) ? 'Order Acknowledgment' : doc.document_type) 
                                                    }} />
                                                    {doc.document_type === 'Enquiry' ? 'Enquiry to Supplier' : 
                                                     (doc.document_type === 'Quotation' && (doc.document_no || '').startsWith('ORA')) ? 'Order Acknowledgment' : 
                                                     doc.document_type}
                                                </span>
                                            </td>
                                            <td className="font-medium" style={{ color: 'var(--accent)' }}>{doc.document_no}</td>
                                            <td>
                                                {doc.document_type === 'Order Acknowledgment' || (doc.document_type === 'Quotation' && (doc.document_no || '').startsWith('ORA')) ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Calendar size={14} color="#f59e0b" />
                                                            {formatDate(doc.expiry_date) !== '-' ? formatDate(doc.expiry_date) : 'TBD'}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.8 }}>
                                                            Issued: {formatDate(doc.issue_date)}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    formatDate(doc.issue_date)
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>{doc.partners?.name || 'Walk-in'}</div>
                                                    <div style={{ fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 600 }}>
                                                        {doc.contacts?.name || ''}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="font-bold" style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                                                {doc.currency} {doc.total_amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                {doc.total_paid > 0 && (
                                                    <div style={{ fontSize: '0.75rem', color: doc.balance > 0 ? '#f59e0b' : '#10b981', marginTop: '4px' }}>
                                                        {doc.balance <= 0 ? 'Paid' : `Bal: ${doc.currency} ${doc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <span style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    background: doc.status === 'Draft' ? 'rgba(100, 116, 139, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                                    color: doc.status === 'Draft' ? '#64748b' : '#10b981'
                                                }}>
                                                    {doc.status}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    onClick={() => openDriveFolder(doc)}
                                                    style={{ background: 'none', border: 'none', color: (doc.drive_folder_id || doc.gdrive_folder_id) ? '#f59e0b' : '#6366f1', cursor: 'pointer', opacity: (doc.drive_folder_id || doc.gdrive_folder_id) ? 1 : 0.4 }}
                                                    title={(doc.drive_folder_id || doc.gdrive_folder_id) ? "Open Drive Folder" : "Provision Drive Folder"}
                                                >
                                                    <Folder size={20} fill={(doc.drive_folder_id || doc.gdrive_folder_id) ? "#f59e0b" : "currentColor"} fillOpacity={0.2} />
                                                </button>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center', position: 'relative', zIndex: 10 }}>
                                                    <button
                                                        type="button"
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '4px',
                                                            height: '32px',
                                                            padding: '0 10px',
                                                            borderRadius: '6px',
                                                            background: '#ffffff',
                                                            border: '1px solid #cbd5e1',
                                                            color: '#334155',
                                                            fontSize: '12px',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            position: 'relative',
                                                            zIndex: 20
                                                        }}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            const isExternal = doc.notes?.includes('drive.google.com') || doc.notes?.startsWith('http');
                                                            if (isExternal) {
                                                                window.open(doc.notes, '_blank');
                                                            } else if (doc.document_type === 'Enquiry') {
                                                                navigate(`/workflows/enquiry/${doc.id}`);
                                                            } else {
                                                                navigate(`/workflows/editor/${doc.document_type.toLowerCase().replace(/\s+/g, '-')}/${doc.id}`);
                                                            }
                                                        }}
                                                    >
                                                        <Eye size={14} color="#64748b" /> <span>{doc.notes?.startsWith('http') ? 'View' : 'Open'}</span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            height: '32px',
                                                            width: '32px',
                                                            borderRadius: '6px',
                                                            background: '#ffffff',
                                                            border: '1px solid #cbd5e1',
                                                            color: '#6366f1',
                                                            cursor: 'pointer',
                                                            position: 'relative',
                                                            zIndex: 20
                                                        }}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handleDuplicate(doc.id);
                                                        }}
                                                        title="Duplicate Document"
                                                    >
                                                        <Copy size={14} />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            height: '32px',
                                                            width: '32px',
                                                            borderRadius: '6px',
                                                            background: '#ffffff',
                                                            border: '1px solid #cbd5e1',
                                                            color: '#475569',
                                                            cursor: 'pointer',
                                                            position: 'relative',
                                                            zIndex: 20
                                                        }}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handlePrintPreview(doc.id);
                                                        }}
                                                        title="Print / Save PDF"
                                                    >
                                                        <Printer size={14} />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            height: '32px',
                                                            width: '32px',
                                                            borderRadius: '6px',
                                                            background: '#ffffff',
                                                            border: '1px solid #cbd5e1',
                                                            color: '#10b981',
                                                            cursor: 'pointer',
                                                            position: 'relative',
                                                            zIndex: 20
                                                        }}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handleDirectDownload(doc.id);
                                                        }}
                                                        title="Download PDF"
                                                    >
                                                        <Download size={14} />
                                                    </button>

                                                    {doc.document_type === 'Certificate' && (
                                                        <button
                                                            type="button"
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                height: '32px',
                                                                width: '32px',
                                                                borderRadius: '6px',
                                                                background: '#ffffff',
                                                                border: '1px solid #cbd5e1',
                                                                color: '#8b5cf6',
                                                                cursor: 'pointer',
                                                                position: 'relative',
                                                                zIndex: 20
                                                            }}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleShowHistory(doc);
                                                            }}
                                                            title="View Revision History"
                                                        >
                                                            <Clock size={14} />
                                                        </button>
                                                    )}
    
                                                    {(doc.document_type?.toUpperCase() === 'QUOTATION' || doc.document_type?.toUpperCase() === 'ENQUIRY') && (
                                                        <button
                                                            type="button"
                                                            style={{ 
                                                                display: 'inline-flex', 
                                                                alignItems: 'center', 
                                                                justifyContent: 'center',
                                                                gap: '4px', 
                                                                height: '32px',
                                                                padding: '0 10px',
                                                                borderRadius: '6px',
                                                                fontSize: '12px',
                                                                fontWeight: 600,
                                                                cursor: doc.is_job ? 'default' : 'pointer', 
                                                                opacity: (conversionLoading || doc.is_job) ? 0.7 : 1,
                                                                background: doc.is_job ? '#94a3b8' : '#10b981',
                                                                border: doc.is_job ? '1px solid #94a3b8' : '1px solid #059669',
                                                                color: '#ffffff',
                                                                position: 'relative', 
                                                                zIndex: 20
                                                            }}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                if (doc.is_job) return;
                                                                setConversionTarget(doc);
                                                                setShowConversionModal(true);
                                                            }}
                                                            disabled={conversionLoading || doc.is_job}
                                                            title={doc.is_job ? "Already Converted to Job" : "Convert to Job"}
                                                        >
                                                            {conversionLoading ? <Loader2 size={12} className="animate-spin" /> : 
                                                             doc.is_job ? <FileCheck size={12} /> : <Play size={12} fill="currentColor" />} 
                                                            <span>{doc.is_job ? 'Job' : 'Job'}</span>
                                                        </button>
                                                    )}
    
                                                    {doc.document_type === 'Proforma Invoice' && (
                                                        <button
                                                            type="button"
                                                            style={{ 
                                                                display: 'inline-flex', 
                                                                alignItems: 'center', 
                                                                justifyContent: 'center',
                                                                gap: '4px', 
                                                                height: '32px',
                                                                padding: '0 10px',
                                                                borderRadius: '6px',
                                                                fontSize: '12px',
                                                                fontWeight: 600,
                                                                background: '#6366f1',
                                                                border: '1px solid #4f46e5',
                                                                color: '#ffffff',
                                                                cursor: 'pointer',
                                                                position: 'relative', 
                                                                zIndex: 20
                                                            }}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleConvertToTaxInvoice(doc.id);
                                                            }}
                                                            disabled={conversionLoading}
                                                            title="Convert to Tax Invoice"
                                                        >
                                                            {conversionLoading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} 
                                                            <span>Convert T.Inv</span>
                                                        </button>
                                                    )}

                                                    {doc.is_job && doc.document_type === 'Job' && (
                                                        <button
                                                            type="button"
                                                            style={{ 
                                                                display: 'inline-flex', 
                                                                alignItems: 'center', 
                                                                justifyContent: 'center',
                                                                gap: '4px', 
                                                                height: '32px',
                                                                padding: '0 10px',
                                                                borderRadius: '6px',
                                                                fontSize: '12px',
                                                                fontWeight: 600,
                                                                background: '#64748b',
                                                                border: '1px solid #475569',
                                                                color: '#ffffff',
                                                                cursor: 'pointer',
                                                                position: 'relative', 
                                                                zIndex: 20
                                                            }}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleRevertJob(doc);
                                                            }}
                                                            title="Revert Job to Quotation"
                                                        >
                                                            <RefreshCw size={12} />
                                                            <span>Revert</span>
                                                        </button>
                                                    )}

                                                    {doc.document_type === 'Quotation' && !doc.is_job && (
                                                        <button
                                                            type="button"
                                                            style={{ 
                                                                display: 'inline-flex', 
                                                                alignItems: 'center', 
                                                                justifyContent: 'center',
                                                                gap: '4px', 
                                                                height: '32px',
                                                                padding: '0 10px',
                                                                borderRadius: '6px',
                                                                fontSize: '12px',
                                                                fontWeight: 600,
                                                                background: '#64748b',
                                                                border: '1px solid #475569',
                                                                color: '#ffffff',
                                                                cursor: 'pointer',
                                                                position: 'relative', 
                                                                zIndex: 20
                                                            }}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleRevertQuotation(doc);
                                                            }}
                                                            title="Revert Quotation to Enquiry"
                                                        >
                                                            <RefreshCw size={12} />
                                                            <span>Revert</span>
                                                        </button>
                                                    )}

                                                    {(doc.document_type === 'Tax Invoice' || doc.document_type === 'Proforma Invoice') && (
                                                        <div style={{ display: 'flex', gap: '4px' }}>
                                                            {!doc.is_job && (
                                                                <button
                                                                    type="button"
                                                                    style={{ 
                                                                        display: 'inline-flex', 
                                                                        alignItems: 'center', 
                                                                        justifyContent: 'center',
                                                                        gap: '4px', 
                                                                        height: '32px',
                                                                        padding: '0 8px',
                                                                        borderRadius: '6px',
                                                                        fontSize: '12px',
                                                                        fontWeight: 600,
                                                                        background: '#10b981',
                                                                        border: '1px solid #059669',
                                                                        color: '#ffffff',
                                                                        position: 'relative',
                                                                        zIndex: 20
                                                                    }}
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        setConversionTarget(doc);
                                                                        setShowConversionModal(true);
                                                                    }}
                                                                    title="Convert to Job Suite"
                                                                >
                                                                    <Play size={10} fill="currentColor" />
                                                                    <span>Job</span>
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                style={{ 
                                                                    display: 'inline-flex', 
                                                                    alignItems: 'center', 
                                                                    justifyContent: 'center',
                                                                    gap: '4px', 
                                                                    height: '32px',
                                                                    padding: '0 8px',
                                                                    borderRadius: '6px',
                                                                    fontSize: '12px',
                                                                    fontWeight: 600,
                                                                    background: '#0284c7',
                                                                    border: '1px solid #0369a1',
                                                                    color: '#ffffff',
                                                                    position: 'relative',
                                                                    zIndex: 20
                                                                }}
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    setPaymentPrefill(doc);
                                                                    setShowPaymentModal(true);
                                                                }}
                                                                title="Record Payment"
                                                            >
                                                                <CreditCard size={12} />
                                                                <span>Payment Entry</span>
                                                            </button>
                                                        </div>
                                                    )}


                                                    <button
                                                        type="button"
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            height: '32px',
                                                            width: '32px',
                                                            borderRadius: '6px',
                                                            background: '#fef2f2',
                                                            border: '1px solid #fecaca',
                                                            color: '#ef4444',
                                                            cursor: 'pointer',
                                                            position: 'relative',
                                                            zIndex: 20
                                                        }}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handleDelete(doc);
                                                        }}
                                                        title="Delete Document"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                    {isDepository && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm"
                                                            style={{ 
                                                                background: 'rgba(5, 150, 105, 0.1)',
                                                                color: '#059669',
                                                                border: '1px solid rgba(5, 150, 105, 0.2)',
                                                                position: 'relative', 
                                                                zIndex: 20, 
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                fontWeight: 600
                                                            }}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleRestore(doc);
                                                            }}
                                                        >
                                                            <PlayCircle size={14} /> Restore
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                });
                                    })()
                                )
                            )}
                            </tbody>
                            {activeType !== 'Statement of Account' && filteredDocs.length > 0 && (
                                <tfoot style={{ background: '#f8fafc', fontWeight: 'bold', borderTop: '2px solid var(--border-color)' }}>
                                    <tr>
                                        <td colSpan={activeType === 'Job' ? 4 : 5} style={{ textAlign: 'right', paddingRight: '20px', color: 'var(--text-secondary)' }}>
                                            Total for {filteredDocs.length} {filteredDocs.length === 1 ? 'Record' : 'Records'}:
                                        </td>
                                        <td style={{ color: 'var(--text-primary)', fontSize: '1.05em', textAlign: 'right' }}>
                                            SGD {filteredDocs.reduce((sum, doc) => sum + (parseFloat(activeType === 'Job' ? doc.delivery_verification?.po_value : doc.total_amount) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td colSpan={3}></td>
                                    </tr>
                                </tfoot>
                            )}
                    </table>
                </div>

                {/* Footer status bar for small window */}
                <div style={{
                    padding: '10px 18px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderTop: 'none',
                    borderRadius: '0 0 12px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.78rem',
                    color: '#64748b',
                    fontWeight: 600
                }}>
                    <span>
                        Showing {compactWindow ? `top 5-6 rows per window` : `all ${sortedDocs.length} rows`} for tile: <strong style={{ color: '#4f46e5' }}>{subTab || activeType}</strong> ({sortedDocs.length} matching jobs/docs)
                    </span>
                    <button
                        onClick={() => setCompactWindow(!compactWindow)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#4f46e5',
                            fontWeight: 800,
                            cursor: 'pointer',
                            fontSize: '0.78rem'
                        }}
                    >
                        {compactWindow ? 'Expand to Full List View ↓' : 'Collapse to Small Window (5-6 Rows) ↑'}
                    </button>
                </div>
            </div>

            {showEnquiryForm && (
                <div className="modal-backdrop" style={{ zIndex: 1000 }}>
                    <div className="modal-content" style={{ maxWidth: '1000px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0 }}>Create New Enquiry to Supplier</h2>
                            <button className="btn btn-secondary" onClick={() => setShowEnquiryForm(false)}>Cancel</button>
                        </div>
                        <CustomerEnquiryForm 
                            onClose={() => setShowEnquiryForm(false)}
                            onSave={() => {
                                setShowEnquiryForm(false);
                                fetchDocs();
                            }} 
                        />
                    </div>
                </div>
            )}

            {showConversionModal && conversionTarget && (
                <div className="modal-backdrop" style={{ zIndex: 1000, background: 'rgba(0, 0, 0, 0.4)' }}>
                    <div className="modal-content" style={{ 
                        maxWidth: '560px', 
                        width: '95%', 
                        background: '#ffffff', 
                        borderRadius: '12px', 
                        padding: '24px', 
                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                        border: '1px solid #e5e7eb',
                        fontFamily: "'Inter', sans-serif"
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: '#1e3a8a', fontSize: '1.25rem', fontWeight: 700 }}>
                                <Briefcase size={22} color="#1e3a8a" /> Convert Quotation to Job
                            </h3>
                            <button onClick={() => setShowConversionModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleConversionSubmit}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                                <div className="form-item">
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: '#374151', marginBottom: '6px', fontWeight: 500 }}>Customer PO No.</label>
                                    <input type="text" required className="form-input" name="po_no" placeholder="PO-12345" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.95rem' }} />
                                </div>
                                <div className="form-item">
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: '#374151', marginBottom: '6px', fontWeight: 500 }}>PO Date</label>
                                    <div style={{ position: 'relative' }}>
                                        <input type="date" required className="form-input" name="po_date" defaultValue={new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.95rem' }} />
                                    </div>
                                </div>
                                <div className="form-item">
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: '#374151', marginBottom: '6px', fontWeight: 500 }}>PO Value (SGD)</label>
                                    <input type="number" step="0.01" required className="form-input" name="po_value" defaultValue={conversionTarget.total_amount} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.95rem' }} />
                                </div>
                                <div className="form-item">
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: '#374151', marginBottom: '6px', fontWeight: 500 }}>PO Issued By</label>
                                    <input type="text" className="form-input" name="po_by" placeholder="Name of Person" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.95rem' }} />
                                </div>
                            </div>

                            <div className="form-item" style={{ marginBottom: '24px' }}>
                                <label style={{ display: 'block', fontSize: '0.9rem', color: '#374151', marginBottom: '6px', fontWeight: 500 }}>PO Description / Project Scope</label>
                                <textarea className="form-input" name="po_description" rows="2" placeholder="Briefly describe the PO scope..." style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.95rem', resize: 'none' }}></textarea>
                            </div>

                            <div className="form-item" style={{ marginBottom: '24px' }}>
                                <label style={{ display: 'block', fontSize: '0.9rem', color: '#374151', marginBottom: '6px', fontWeight: 500 }}>Upload Customer PO (File Repository)</label>
                                <div style={{ 
                                    border: '2px dashed #6366f1', 
                                    borderRadius: '12px', 
                                    padding: '20px', 
                                    textAlign: 'center',
                                    background: poFile ? '#f0fdf4' : '#faf5ff',
                                    borderColor: poFile ? '#22c55e' : '#6366f1',
                                    transition: 'all 0.2s'
                                }}>
                                    {poFile ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                            <FileCheck size={28} color="#22c55e" />
                                            <span style={{ fontSize: '0.9rem', color: '#15803d', fontWeight: 700 }}>
                                                {poFile.name || poFile.title || 'Customer PO Selected'}
                                            </span>
                                            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                                                <button 
                                                    type="button" 
                                                    onClick={() => setShowSmartUpload(true)} 
                                                    style={{ fontSize: '0.8rem', color: '#4f46e5', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
                                                >
                                                    Change File via Smart Upload
                                                </button>
                                                <button 
                                                    type="button" 
                                                    onClick={() => setPoFile(null)} 
                                                    style={{ fontSize: '0.8rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div 
                                            onClick={() => setShowSmartUpload(true)}
                                            style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
                                        >
                                            <div style={{ padding: '10px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
                                                <Upload size={24} />
                                            </div>
                                            <span style={{ fontSize: '0.95rem', color: '#1e293b', fontWeight: 700 }}>
                                                Click to open Smart Document Upload
                                            </span>
                                            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                                Choose from Recent Files, Clipboard, Google Drive, Camera, Drag & Drop, or Mobile QR
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>



                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '32px' }}>
                                <button type="button" onClick={() => setShowConversionModal(false)} style={{ 
                                    padding: '10px 24px', 
                                    borderRadius: '8px', 
                                    border: '1px solid #d1d5db', 
                                    background: '#ffffff', 
                                    color: '#374151', 
                                    fontSize: '0.95rem', 
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}>Cancel</button>
                                <button type="submit" disabled={conversionLoading} style={{ 
                                    padding: '10px 24px', 
                                    borderRadius: '8px', 
                                    border: 'none', 
                                    background: '#5865f2', 
                                    color: '#ffffff', 
                                    fontSize: '0.95rem', 
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    minWidth: '200px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    boxShadow: '0 4px 6px -1px rgba(88, 101, 242, 0.2)'
                                }}>
                                    {conversionLoading ? (
                                        <>
                                            <Loader2 size={18} className="animate-spin" /> Generating...
                                        </>
                                    ) : 'Confirm & Generate Job'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingJob && (
                <JobEditV2Modal 
                    job={editingJob} 
                    onClose={() => setEditingJob(null)} 
                    onSave={() => {
                        fetchDocs();
                        setEditingJob(null);
                    }} 
                />
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                .dropdown {
                    position: relative;
                    display: inline-block;
                }
                .dropdown-content {
                    display: none;
                    position: absolute;
                    background-color: var(--bg-secondary);
                    min-width: 160px;
                    box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
                    z-index: 100;
                    border-radius: 8px;
                    border: 1px solid var(--border-color);
                    padding: 8px 0;
                    top: 100%;
                    margin-top: 4px;
                }
                .dropdown-content.show {
                    display: block;
                }
                .dropdown-content button {
                    color: var(--text-primary);
                    padding: 10px 16px;
                    text-decoration: none;
                    display: block;
                    width: 100%;
                    text-align: left;
                    border: none;
                    background: none;
                    cursor: pointer;
                    font-size: 0.9rem;
                    font-weight: 500;
                }
                .dropdown-content button:hover {
                    background-color: var(--bg-primary);
                    color: var(--accent);
                }
                .table-row td {
                    padding: 8px 12px;
                }
                .modal-backdrop {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 2000;
                    backdrop-filter: blur(4px);
                }
                .modal-content {
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                    position: relative;
                }
            `}} />
            {/* History Modal */}
            {historyDoc && (
                <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="modal-content" style={{ width: '800px', maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto', background: 'var(--bg-panel)', padding: '24px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>Revision History</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>{historyDoc.document_no} - {historyDoc.subject}</p>
                            </div>
                            <button onClick={() => setHistoryDoc(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={24} /></button>
                        </div>

                        {loadingHistory ? (
                            <div style={{ textAlign: 'center', padding: '40px' }}><Loader2 className="animate-spin" /></div>
                        ) : (
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Rev</th>
                                            <th>Document No</th>
                                            <th>Date</th>
                                            <th>Signature</th>
                                            <th>Status</th>
                                            {activeType === 'Job' && <th style={{ width: '150px' }}>Customer PO</th>}
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historyItems.map(item => (
                                            <tr key={item.id} className="table-row">
                                                <td>R{item.revision_no || 0}</td>
                                                <td className="font-medium">{item.document_no}</td>
                                                <td>{new Date(item.issue_date).toLocaleDateString()}</td>
                                                <td>
                                                    {item.signature_url ? (
                                                        <img src={item.signature_url} alt="Sig" style={{ height: '20px' }} />
                                                    ) : '-'}
                                                </td>
                                                <td>
                                                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>{item.status}</span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button 
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => {
                                                            const isExternal = item.notes?.includes('drive.google.com') || item.notes?.startsWith('http');
                                                            if (isExternal) window.open(item.notes, '_blank');
                                                            else if (item.document_type === 'Enquiry') navigate(`/workflows/enquiry/${item.id}`);
                                                            else navigate(`/workflows/editor/${item.document_type.toLowerCase().replace(/\s+/g, '-')}/${item.id}`);
                                                            setHistoryDoc(null);
                                                        }}
                                                    >
                                                        <Eye size={14} /> View
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {/* SOA Drill-down Modal */}
            {selectedCustomerForSOA && (
                <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="modal-content" style={{ width: '1000px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-panel)', padding: '32px', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800 }}>{selectedCustomerForSOA.name}</h2>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>Detailed Outstanding Ledger</p>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button 
                                    className="btn btn-primary"
                                    onClick={() => window.open(`/soa?partner_id=${selectedCustomerForSOA.partner_id}`, '_blank')}
                                >
                                    <Printer size={18} /> Generate Official Statement
                                </button>
                                <button onClick={() => setSelectedCustomerForSOA(null)} style={{ background: 'var(--bg-secondary)', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '8px', borderRadius: '50%' }}><X size={24} /></button>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '32px' }}>
                            <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid #ef4444' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Total Outstanding</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ef4444' }}>SGD {selectedCustomerForSOA.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            </div>
                            <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--accent)' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Total Invoiced</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>SGD {selectedCustomerForSOA.total_invoiced.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            </div>
                            <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid #10b981' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Total Payments</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>SGD {selectedCustomerForSOA.total_paid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            </div>
                        </div>

                        <div className="table-container">
                            <table style={{ borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ background: 'transparent' }}>Date</th>
                                        <th style={{ background: 'transparent' }}>Type</th>
                                        <th style={{ background: 'transparent' }}>Document No</th>
                                        <th style={{ background: 'transparent' }}>Subject / Ref</th>
                                        <th style={{ background: 'transparent' }}>Debit (+)</th>
                                        <th style={{ background: 'transparent' }}>Credit (-)</th>
                                        <th style={{ background: 'transparent', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customerDocs
                                        .sort((a, b) => new Date(b.issue_date) - new Date(a.issue_date))
                                        .map(doc => {
                                            const isInvoice = doc.document_type.includes('Invoice');
                                            return (
                                                <tr key={doc.id} className="table-row" style={{ background: 'var(--bg-secondary)', borderRadius: '12px' }}>
                                                    <td style={{ fontWeight: 500 }}>{formatDate(doc.issue_date)}</td>
                                                    <td>
                                                        <span style={{ 
                                                            fontSize: '0.75rem', 
                                                            padding: '4px 10px', 
                                                            borderRadius: '20px', 
                                                            background: isInvoice ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                                            color: isInvoice ? '#3b82f6' : '#10b981',
                                                            fontWeight: 600
                                                        }}>
                                                            {doc.document_type}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontWeight: 600 }}>{doc.document_no}</td>
                                                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{doc.subject || doc.payment_ref || '-'}</td>
                                                    <td style={{ fontWeight: 700, color: isInvoice ? 'var(--text-primary)' : 'transparent' }}>
                                                        {isInvoice ? `+ ${doc.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                                    </td>
                                                    <td style={{ fontWeight: 700, color: !isInvoice ? '#10b981' : 'transparent' }}>
                                                        {!isInvoice ? `- ${doc.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                         <button 
                                                             className="btn btn-sm btn-secondary"
                                                             onClick={() => {
                                                                 if (doc.document_type === 'Enquiry') {
                                                                     window.open(`/workflows/enquiry/${doc.id}`, '_blank');
                                                                 } else {
                                                                     window.open(`/workflows/editor/${doc.document_type.toLowerCase().replace(/\s+/g, '-')}/${doc.id}`, '_blank');
                                                                 }
                                                             }}
                                                         >
                                                             <Eye size={14} /> Open
                                                         </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            </>
            )}
            {showPaymentModal && (
                <ReceivePaymentModal 
                    isOpen={showPaymentModal}
                    onClose={() => setShowPaymentModal(false)}
                    onSuccess={() => {
                        setShowPaymentModal(false);
                        toast.success('Payment recorded successfully');
                        fetchDocs();
                    }}
                    partners={partners}
                    company_id={profile?.company_id}
                    prefill={paymentPrefill}
                />
            )}
            {showSmartUpload && (
                <SmartUploadPanel
                    isOpen={showSmartUpload}
                    onClose={() => setShowSmartUpload(false)}
                    onSelect={(fileObj) => {
                        console.log("Selected file via Smart Upload:", fileObj);
                        setPoFile(fileObj);
                        setShowSmartUpload(false);
                    }}
                    documentType="customer_po"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                    activeFolderName={conversionTarget?.subject || conversionTarget?.document_no || 'Job Workspace'}
                    runningEnquiryNo={conversionTarget?.enquiry_no || conversionTarget?.document_no || 'ENQ-2607-0005'}
                />
            )}
        </div>
    );
}
