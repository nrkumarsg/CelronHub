import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
    LayoutDashboard, Folder, Calendar, DollarSign, TrendingUp, Plus, 
    Search, Grid, List, ArrowRight, ExternalLink, ShieldCheck, 
    AlertCircle, CheckCircle2, Activity, FileText, Printer, Eye, 
    RefreshCcw, FolderOpen, Copy, Trash2, MoreVertical,
    Package, CreditCard, Calculator, Image, Info,
    Briefcase, Truck, ClipboardList, Receipt, CheckSquare, Book, Ship, MapPin, Building2,
    ArrowUpDown, ArrowRightLeft, Upload, Filter
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { 
    getWorkflowDocuments, 
    deleteWorkflowDocument, 
    duplicateWorkflowDocument,
    revertJobToQuotation,
    getWorkflowDocumentsByJob
} from '../../lib/workflowV2Service';
import { isTokenValid, connectGoogleAPI } from '../../lib/googleAuthService';
import { getDocumentSettings, getPartners } from '../../lib/store';
import SearchableSelect from '../../components/common/SearchableSelect';
import JobEditV2Modal from '../../components/workflows/JobEditV2Modal';
import toast from 'react-hot-toast';

const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};

export default function JobsDashboard() {
    const [loading, setLoading] = useState(true);
    const [documents, setDocuments] = useState([]);
    const [settings, setSettings] = useState(null);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('card'); // 'card' or 'table'
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'operations'

    // Embedded Job List Table States (Image 2 area)
    const [partners, setPartners] = useState([]);
    const [tableSubTab, setTableSubTab] = useState('Ongoing');
    const [tableSearchQuery, setTableSearchQuery] = useState('');
    const [tableSelectedPartnerId, setTableSelectedPartnerId] = useState('');
    const [tableSortKey, setTableSortKey] = useState('created_at');
    const [tableSortDirection, setTableSortDirection] = useState('desc');
    const [tableCompactWindow, setTableCompactWindow] = useState(true);
    const [editingJob, setEditingJob] = useState(null);

    const jobsTools = [
        { title: 'Quote2Customers', description: 'Create and manage sales quotations sent to customers.', icon: <Briefcase size={24} />, color: '#6366f1', path: '/quotations' },
        { title: 'JOBS Master Board', description: 'Full master list of all jobs with status tracking and timeline views.', icon: <ShieldCheck size={24} />, color: '#10b981', path: '/workflows?type=Job' },
        { title: 'Invoices Portal', description: 'Generate tax invoices, track billings, and manage receivables.', icon: <DollarSign size={24} />, color: '#14b8a6', path: '/invoices' },
        { title: 'Payment Received', description: 'Record and view incoming payments and customer deposits.', icon: <CheckCircle2 size={24} />, color: '#22c55e', path: '/workflows?type=Payment+Received' },
        { title: 'Delivery Orders', description: 'Generate DOs and dispatch cargo transit documents.', icon: <Truck size={24} />, color: '#10b981', path: '/delivery-orders' },
        { title: 'Service Reports', description: 'Record technician task sheets and services performed.', icon: <ClipboardList size={24} />, color: '#ec4899', path: '/service-reports' },
        { title: 'Packing Lists', description: 'Create manifest sheets for cargo shipping and crates.', icon: <Package size={24} />, color: '#f97316', path: '/packing-lists' },
        { title: 'Proforma Invoices', description: 'Issue advance invoices for deposit collections.', icon: <Receipt size={24} />, color: '#ef4444', path: '/proforma-invoices' },
        { title: 'Calibration Lab', description: 'Access calibration test reports and instrument logs.', icon: <CheckSquare size={24} />, color: '#059669', path: '/forms/calibration-lab' },
        { title: 'Manuals & Ref. Books', description: 'Search and view system manuals and maritime references.', icon: <Book size={24} />, color: '#f97316', path: '/manuals' },
        { title: 'Vessels Directory', description: 'Manage ships, vessels, and their specific engineering details.', icon: <Ship size={24} />, color: '#94a3b8', path: '/vessels' },
        { title: 'Work Locations', description: 'View geographic workplaces and shipyard coordinates.', icon: <MapPin size={24} />, color: '#94a3b8', path: '/work-locations' }
    ];

    const handleNavigateToTab = (job, tabName) => {
        const masterId = job.masterJob?.id || job.allDocs[0]?.id;
        if (masterId) {
            navigate(`/workflows/editor/job/${masterId}?tab=${tabName}`);
        } else {
            toast.error("No valid document found to open.");
        }
    };

    const { profile } = useAuth();
    const [openDropdownJobNo, setOpenDropdownJobNo] = useState(null);

    // Close dropdown on click outside
    useEffect(() => {
        const handleOutsideClick = () => setOpenDropdownJobNo(null);
        window.addEventListener('click', handleOutsideClick);
        return () => window.removeEventListener('click', handleOutsideClick);
    }, []);

    // Fetch User Settings and Workflow Documents based on Active Company
    useEffect(() => {
        const loadInitialData = async () => {
            if (!profile?.company_id) {
                setLoading(false);
                return;
            }
            try {
                setLoading(true);

                // One-time database correction for CEL-2606-6081 issue date
                try {
                    const { data: fixDoc } = await supabase
                        .from('workflow_documents')
                        .select('id, issue_date')
                        .eq('document_no', 'CEL-2606-6081')
                        .eq('issue_date', '2025-11-30')
                        .maybeSingle();
                    if (fixDoc) {
                        await supabase
                            .from('workflow_documents')
                            .update({ issue_date: '2026-06-19' })
                            .eq('id', fixDoc.id);
                        console.log("Successfully corrected CEL-2606-6081 issue date to 2026-06-19");
                    }
                } catch (fixErr) {
                    console.error("Error executing one-time correction:", fixErr);
                }

                // Temporary debug log for CEL-2606-6051
                try {
                    const { data: suite6051 } = await supabase
                        .from('workflow_documents')
                        .select('id, document_type, document_no, assigned_job_no, total_amount, is_job, revision_no')
                        .eq('assigned_job_no', 'CEL-2606-6051');
                    console.log("=== CEL-2606-6051 Suite Documents ===", suite6051);
                } catch (err) {
                    console.error("Error querying suite6051:", err);
                }

                const docSettings = await getDocumentSettings(profile.company_id);
                setSettings(docSettings);

                try {
                    const pData = await getPartners(profile);
                    if (pData) setPartners(pData);
                } catch (pErr) {
                    console.warn("Could not load partners:", pErr);
                }
                
                // Load All Workflow Documents for the active company workspace (filtering for job documents at DB level)
                const { data: docs, error } = await getWorkflowDocuments(profile.company_id, null, true);
                if (error) throw error;
                setDocuments(docs || []);
            } catch (err) {
                console.error("Error loading dashboard data:", err);
                toast.error("Failed to load dashboard data");
            } finally {
                setLoading(false);
            }
        };

        loadInitialData();
    }, [profile?.company_id]);

    // Process & group documents by assigned_job_no
    const processJobs = () => {
        const jobGroups = {};

        // Find all documents that are part of a job suite
        const suiteDocs = documents.filter(d => d.assigned_job_no);

        suiteDocs.forEach(doc => {
            const jobNo = doc.assigned_job_no;
            if (!jobGroups[jobNo]) {
                jobGroups[jobNo] = {
                    jobNo,
                    masterJob: null,
                    allDocs: [],
                    customer: 'Walk-in',
                    vesselLocation: '-',
                    description: '-',
                    customerPoNo: '-',
                    customerRef: '-',
                    issueDate: doc.issue_date || doc.created_at,
                    expiryDate: doc.expiry_date,
                    status: 'Active',
                    customerInvoiceAmount: 0,
                    customerPaidStatus: 'No Invoice',
                    supplierInvoiceAmount: 0,
                    supplierPaidStatus: 'No PO',
                    suppliers: new Set(),
                    driveFolderId: null,
                    jobMajor: null,
                    jobDescription: null
                };
            }

            const group = jobGroups[jobNo];
            group.allDocs.push(doc);

            if (doc.partner_id) group.partnerId = doc.partner_id;

            // Prioritize the master "Job" document for header info
            if (doc.document_type === 'Job') {
                group.masterJob = doc;
                group.customer = doc.delivery_verification?.po_description || doc.partners?.name || 'Walk-in';
                group.partnerId = doc.partner_id || group.partnerId;
                group.vesselLocation = doc.vessels?.vessel_name || doc.work_locations?.location_name || '-';
                group.description = doc.subject || '-';
                group.customerPoNo = doc.customer_po_no || '-';
                group.customerRef = doc.customer_ref || '-';
                group.issueDate = doc.issue_date || doc.created_at;
                group.expiryDate = doc.expiry_date;
                group.status = doc.status || 'Active';
                group.driveFolderId = doc.drive_folder_id || doc.gdrive_folder_id;
                group.jobMajor = doc.delivery_verification?.job_major === 'Other' ? doc.delivery_verification?.job_major_custom : doc.delivery_verification?.job_major;
                group.jobDescription = doc.delivery_verification?.job_description;
            } else if (!group.masterJob) {
                // Fallback details if no master Job document is found yet
                if (doc.delivery_verification?.po_description || doc.partners?.name) {
                    group.customer = doc.delivery_verification?.po_description || doc.partners.name;
                }
                if (doc.partner_id) group.partnerId = doc.partner_id;
                if (doc.vessels?.vessel_name) group.vesselLocation = doc.vessels.vessel_name;
                else if (doc.work_locations?.location_name) group.vesselLocation = doc.work_locations.location_name;
                if (doc.subject) group.description = doc.subject;
                if (doc.customer_po_no) group.customerPoNo = doc.customer_po_no;
                if (doc.customer_ref) group.customerRef = doc.customer_ref;
                if (doc.drive_folder_id || doc.gdrive_folder_id) group.driveFolderId = doc.drive_folder_id || doc.gdrive_folder_id;
                if (doc.delivery_verification?.job_major) {
                    group.jobMajor = doc.delivery_verification.job_major === 'Other' ? doc.delivery_verification.job_major_custom : doc.delivery_verification.job_major;
                }
                if (doc.delivery_verification?.job_description) {
                    group.jobDescription = doc.delivery_verification.job_description;
                }
            }

            // Financial Calculations
            if (doc.document_type === 'Tax Invoice') {
                if (doc.status !== 'Draft') {
                    group.customerInvoiceAmount += parseFloat(doc.total_amount) || 0;
                    group.customerPaidStatus = doc.status || 'Unpaid';
                } else if (group.customerPaidStatus === 'No Invoice') {
                    group.customerPaidStatus = 'Draft';
                }
            } else if (doc.document_type === 'Purchase Order') {
                group.supplierInvoiceAmount += parseFloat(doc.total_amount) || 0;
                group.supplierPaidStatus = doc.status || 'Pending';
                if (doc.partners?.name) {
                    group.suppliers.add(doc.partners.name);
                }
            }
        });

        // Convert grouped objects to array and do final mapping
        return Object.values(jobGroups).map(job => {
            const overdueDays = getOverdueDays(job.expiryDate, job.status);
            
            // Fallback to Job value for Billed if no Tax Invoice exists
            const billedAmount = job.customerInvoiceAmount > 0 
                ? job.customerInvoiceAmount 
                : (parseFloat(job.masterJob?.total_amount) || 0);

            // Fallback to PO value if no Purchase Order exists
            const poAmount = job.supplierInvoiceAmount > 0 
                ? job.supplierInvoiceAmount 
                : 0;

            return {
                ...job,
                customerInvoiceAmount: billedAmount,
                supplierInvoiceAmount: poAmount,
                suppliersList: Array.from(job.suppliers).join(', ') || '-',
                profit: billedAmount - poAmount,
                overdueDays
            };
        });
    };

    // Calculate Overdue Days
    const getOverdueDays = (expiryDateStr, status) => {
        if (!expiryDateStr || ['Completed', 'Closed', 'Archived'].includes(status)) return 0;
        const expiryDate = new Date(expiryDateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        expiryDate.setHours(0, 0, 0, 0);
        const diffTime = today.getTime() - expiryDate.getTime();
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    };

    // Build Folder Name for provisioning
    const buildProjectFolderName = (jobNo, doc) => {
        const custName = doc.customer || 'Walk-in';
        const cleanCust = custName.replace(/[^a-zA-Z0-9\s]/g, '').trim().substring(0, 15);
        const vesselName = doc.vesselLocation !== '-' ? doc.vesselLocation : '';
        const cleanVessel = vesselName ? ` - ${vesselName.replace(/[^a-zA-Z0-9\s]/g, '').trim().substring(0, 15)}` : '';
        return `${jobNo} - ${cleanCust}${cleanVessel}`;
    };

    // Open or Provision Google Drive Folder
    const handleOpenDriveFolder = async (e, job) => {
        e.preventDefault();
        e.stopPropagation();

        if (job.driveFolderId) {
            window.open(`https://drive.google.com/drive/folders/${job.driveFolderId}`, '_blank');
            return;
        }

        const confirmMsg = `No Google Drive folder linked for Job ${job.jobNo}. Would you like to provision a new project folder structure for it now?`;
        if (!window.confirm(confirmMsg)) return;

        try {
            setLoading(true);

            if (!isTokenValid()) {
                if (window.confirm('Your Google connection has expired or is not connected. Would you like to connect now?')) {
                    sessionStorage.setItem('google_auth_return_url', window.location.pathname + window.location.search);
                    connectGoogleAPI();
                }
                return;
            }

            const accessToken = localStorage.getItem('google_access_token');
            if (!accessToken) throw new Error('Google account not connected');

            const { provisionFullProjectStructure } = await import('../../lib/driveService');

            let celronRootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
            if (!celronRootId) throw new Error('Google Drive Root Folder ID not configured in Settings.');

            if (celronRootId.includes('drive.google.com')) {
                const match = celronRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || celronRootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (match) celronRootId = match[1];
            }

            const currentYear = new Date().getFullYear().toString();
            const projName = buildProjectFolderName(job.jobNo, job);
            
            const projectFolderId = await provisionFullProjectStructure(accessToken, celronRootId, currentYear, projName);

            // Update master job or other documents in DB
            const masterId = job.masterJob?.id || job.allDocs[0]?.id;
            if (masterId) {
                await supabase.from('workflow_documents').update({ drive_folder_id: projectFolderId }).eq('id', masterId);
            }

            // Migrate Enquiry files if enquiry_id is linked
            const enquiryId = job.masterJob?.enquiry_id || job.allDocs.find(d => d.enquiry_id)?.enquiry_id;
            if (enquiryId) {
                const { data: enqData } = await supabase
                    .from('customer_enquiries')
                    .select('gdrive_folder_id')
                    .eq('id', enquiryId)
                    .maybeSingle();

                if (enqData?.gdrive_folder_id) {
                    const { migrateEnquiryFilesToJob } = await import('../../lib/driveService');
                    try {
                        await migrateEnquiryFilesToJob(accessToken, enqData.gdrive_folder_id, projectFolderId);
                    } catch (migErr) {
                        console.error('Enquiry files migration failed:', migErr);
                    }
                }
            }

            toast.success('Folder provisioned successfully!');
            
            // Reload documents
            const { data: docs } = await getWorkflowDocuments(profile.company_id, null, true);
            setDocuments(docs || []);

            window.open(`https://drive.google.com/drive/folders/${projectFolderId}`, '_blank');
        } catch (error) {
            console.error('Provisioning failed:', error);
            toast.error('Failed to provision: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Open General Celron Jobs Folder in Google Drive
    const handleOpenRootDrive = () => {
        let celronRootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
        if (!celronRootId) {
            toast.error('Google Drive Root Folder ID is not configured in Settings.');
            return;
        }
        if (celronRootId.includes('drive.google.com')) {
            window.open(celronRootId, '_blank');
        } else {
            window.open(`https://drive.google.com/drive/folders/${celronRootId}`, '_blank');
        }
    };

    // Open General Jobs Folder under Year-wise Hierarchy
    const handleOpenJobsDrive = async () => {
        let celronRootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
        if (!celronRootId) {
            toast.error('Google Drive Root Folder ID is not configured in Settings.');
            return;
        }

        if (celronRootId.includes('drive.google.com')) {
            const match = celronRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || celronRootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (match) celronRootId = match[1];
        }

        const customJobsRootId = '1GPr3g5mq6_TotBzM8gDz_atJPR7TgbB-';
        if (celronRootId === customJobsRootId) {
            window.open(`https://drive.google.com/drive/folders/${celronRootId}`, '_blank');
            return;
        }

        if (!isTokenValid()) {
            if (window.confirm('Your Google connection has expired or is not connected. Would you like to connect now?')) {
                sessionStorage.setItem('google_auth_return_url', window.location.pathname + window.location.search);
                connectGoogleAPI();
            }
            return;
        }

        const accessToken = localStorage.getItem('google_access_token');
        if (!accessToken) {
            handleOpenRootDrive();
            return;
        }

        const loadToast = toast.loading('Searching for general JOBS folder...');
        try {
            // Find '01. TIME_BASED' folder under celronRootId
            let query = `name='01. TIME_BASED' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${celronRootId}' in parents`;
            let res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': 'Bearer ' + accessToken }
            });
            let data = await res.json();
            let timeBasedId = data.files?.[0]?.id;

            if (timeBasedId) {
                const currentYear = new Date().getFullYear().toString();
                query = `name='${currentYear}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${timeBasedId}' in parents`;
                res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
                    headers: { 'Authorization': 'Bearer ' + accessToken }
                });
                data = await res.json();
                let yearFolderId = data.files?.[0]?.id;

                if (yearFolderId) {
                    query = `name='JOBS' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${yearFolderId}' in parents`;
                    res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
                        headers: { 'Authorization': 'Bearer ' + accessToken }
                    });
                    data = await res.json();
                    let jobsFolderId = data.files?.[0]?.id;

                    if (jobsFolderId) {
                        toast.dismiss(loadToast);
                        window.open(`https://drive.google.com/drive/folders/${jobsFolderId}`, '_blank');
                        return;
                    }
                }
            }
            toast.dismiss(loadToast);
            handleOpenRootDrive();
        } catch (err) {
            console.error('Error finding JOBS folder:', err);
            toast.dismiss(loadToast);
            handleOpenRootDrive();
        }
    };

    const reloadDocuments = async () => {
        if (!profile?.company_id) return;
        try {
            const { data: docs, error } = await getWorkflowDocuments(profile.company_id, null, true);
            if (error) throw error;
            setDocuments(docs || []);
        } catch (err) {
            console.error("Error reloading documents:", err);
            toast.error("Failed to reload documents");
        }
    };

    const handleDuplicateJob = async (e, job) => {
        e.preventDefault();
        e.stopPropagation();

        const masterId = job.masterJob?.id || job.allDocs[0]?.id;
        if (!masterId) {
            toast.error("No valid document found to duplicate.");
            return;
        }

        if (!window.confirm(`Are you sure you want to duplicate Job ${job.jobNo}? This will duplicate the master Job details into a new draft.`)) {
            return;
        }

        try {
            setLoading(true);
            const { data: newDoc, error } = await duplicateWorkflowDocument(masterId);
            if (error) throw error;
            toast.success(`Job duplicated successfully as Draft!`);
            if (newDoc && newDoc.id) {
                navigate(`/workflows/editor/job/${newDoc.id}`);
            } else {
                await reloadDocuments();
            }
        } catch (error) {
            console.error('Duplication failed:', error);
            toast.error('Failed to duplicate: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteJob = async (e, job) => {
        e.preventDefault();
        e.stopPropagation();

        if (!window.confirm(`Are you sure you want to delete Job Suite ${job.jobNo}? This will permanently delete the Job and all its associated documents (Invoices, POs, etc.). This action cannot be undone.`)) {
            return;
        }

        try {
            setLoading(true);
            
            // Filter out dependent/revision documents whose parents are also being deleted in this batch.
            // When the parent is deleted, deleteWorkflowDocument recursively deletes its dependents,
            // so we don't need to call it separately on the child documents.
            const docIds = new Set(job.allDocs.map(d => d.id));
            const rootDocs = job.allDocs.filter(doc => !doc.original_document_id || !docIds.has(doc.original_document_id));

            // Run deletions in parallel using Promise.all
            const deletePromises = rootDocs.map(async (doc) => {
                const { error } = await deleteWorkflowDocument(doc.id);
                if (error) {
                    return error.message || `Error deleting document ID ${doc.id}`;
                }
                return null;
            });

            const results = await Promise.all(deletePromises);
            const deleteErrors = results.filter(Boolean);

            if (deleteErrors.length > 0) {
                toast.error(`Some documents failed to delete: ${deleteErrors.join(', ')}`);
            } else {
                toast.success(`Job Suite ${job.jobNo} deleted successfully.`);
            }
            await reloadDocuments();
        } catch (error) {
            console.error('Deletion failed:', error);
            toast.error('Failed to delete: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Processed jobs list
    const processedJobs = processJobs();

    // Get unique list of years from jobs
    const availableYears = [...new Set(processedJobs.map(job => {
        const dateStr = job.issueDate;
        return dateStr ? new Date(dateStr).getFullYear().toString() : new Date().getFullYear().toString();
    }))].sort((a, b) => b.localeCompare(a));

    // Filter and sort jobs by running job number in descending order (latest first)
    const filteredJobs = processedJobs
        .filter(job => {
            const jobYear = job.issueDate ? new Date(job.issueDate).getFullYear().toString() : new Date().getFullYear().toString();
            const matchesYear = selectedYear === 'All' || jobYear === selectedYear;

            const term = (searchQuery || tableSearchQuery || '').toLowerCase().trim();
            const matchesSearch = !term || 
                (job.jobNo && job.jobNo.toLowerCase().includes(term)) ||
                (job.customer && job.customer.toLowerCase().includes(term)) ||
                (job.vesselLocation && job.vesselLocation.toLowerCase().includes(term)) ||
                (job.description && job.description.toLowerCase().includes(term)) ||
                (job.customerPoNo && job.customerPoNo.toLowerCase().includes(term)) ||
                (job.customerRef && job.customerRef.toLowerCase().includes(term)) ||
                (job.suppliersList && job.suppliersList.toLowerCase().includes(term)) ||
                (job.jobMajor && job.jobMajor.toLowerCase().includes(term)) ||
                (job.jobDescription && stripHtml(job.jobDescription).toLowerCase().includes(term)) ||
                (job.allDocs && job.allDocs.some(d => 
                    (d.document_no && d.document_no.toLowerCase().includes(term)) ||
                    (d.subject && d.subject.toLowerCase().includes(term)) ||
                    (d.customer_ref && d.customer_ref.toLowerCase().includes(term)) ||
                    (d.customer_po_no && d.customer_po_no.toLowerCase().includes(term)) ||
                    (d.delivery_verification?.po_description && d.delivery_verification.po_description.toLowerCase().includes(term)) ||
                    (d.partners?.name && d.partners.name.toLowerCase().includes(term)) ||
                    (d.contacts?.name && d.contacts.name.toLowerCase().includes(term)) ||
                    (d.contacts?.first_name && d.contacts.first_name.toLowerCase().includes(term))
                ));

            let matchesPartner = true;
            if (tableSelectedPartnerId) {
                const selectedPartner = partners.find(p => p.id === tableSelectedPartnerId);
                const selectedPartnerName = selectedPartner?.name?.trim().toLowerCase();
                matchesPartner = (job.partnerId === tableSelectedPartnerId) ||
                    (job.customer && selectedPartnerName && job.customer.trim().toLowerCase() === selectedPartnerName) ||
                    (job.allDocs && job.allDocs.some(d => 
                        d.partner_id === tableSelectedPartnerId ||
                        (d.partners?.name && selectedPartnerName && d.partners.name.trim().toLowerCase() === selectedPartnerName)
                    ));
            }

            return matchesYear && matchesSearch && matchesPartner;
        })
        .sort((a, b) => {
            const getLastFourDigits = (jobNo) => {
                if (!jobNo) return 0;
                const parts = jobNo.split('-');
                const lastPart = parts[parts.length - 1];
                const parsed = parseInt(lastPart, 10);
                return isNaN(parsed) ? 0 : parsed;
            };
            return getLastFourDigits(b.jobNo) - getLastFourDigits(a.jobNo);
        });

    // KPI Metrics calculation
    const totalJobsCount = filteredJobs.length;
    const activeJobsCount = filteredJobs.filter(j => !['Completed', 'Closed', 'Archived'].includes(j.status)).length;
    const totalCustomerInvoiced = filteredJobs.reduce((sum, j) => sum + j.customerInvoiceAmount, 0);
    const totalSupplierPO = filteredJobs.reduce((sum, j) => sum + j.supplierInvoiceAmount, 0);
    const totalNetProfit = filteredJobs.reduce((sum, j) => sum + j.profit, 0);
    const overdueJobsCount = filteredJobs.filter(j => j.overdueDays > 0).length;

    // Sub Tabs Configuration for Job List (Image 2 & 3)
    const JOB_SUB_TABS = [
        { id: 'Ongoing', label: 'Ongoing Jobs', color: '#3b82f6', bgActive: '#3b82f6', textActive: '#ffffff', bgInactive: '#eff6ff', textInactive: '#1e40af', border: '#3b82f6', desc: 'Billed drafts or operational in-progress' },
        { id: 'Completed', label: 'Completed Jobs', color: '#10b981', bgActive: '#10b981', textActive: '#ffffff', bgInactive: '#ecfdf5', textInactive: '#065f46', border: '#10b981', desc: 'Billed Tax Invoices awaiting payments' },
        { id: 'Archived', label: 'Archived Jobs', color: '#64748b', bgActive: '#64748b', textActive: '#ffffff', bgInactive: '#f1f5f9', textInactive: '#475569', border: '#94a3b8', desc: 'Fully Paid Tax Invoices or Closed' }
    ];

    // Process Job Groups with subTabState for the embedded table view
    const tableJobRows = useMemo(() => {
        const suiteDocs = documents.filter(d => d.assigned_job_no);
        const docsByJob = {};
        documents.forEach(d => {
            if (d.assigned_job_no) {
                if (!docsByJob[d.assigned_job_no]) docsByJob[d.assigned_job_no] = [];
                docsByJob[d.assigned_job_no].push(d);
            }
        });

        const jobGroups = {};
        const jobs = documents.filter(d => (d.is_job === true || d.document_type === 'Job') && d.assigned_job_no);
        const candidateDocs = jobs.length > 0 ? jobs : suiteDocs;

        candidateDocs.forEach(d => {
            const jno = d.assigned_job_no;
            if (!jobGroups[jno] || d.document_type === 'Job') {
                const suite = docsByJob[jno] || [];
                const taxInvoice = suite.find(sd => sd.document_type === 'Tax Invoice');
                
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
                    if (d.status === 'Completed' || d.status === 'Closed' || d.status === 'Inactive') {
                        tab = 'Archived';
                    }
                }

                jobGroups[jno] = {
                    ...d,
                    subTabState: tab,
                    suiteDocs: suite
                };
            }
        });

        return Object.values(jobGroups).sort((a, b) => (b.assigned_job_no || '').localeCompare(a.assigned_job_no || ''));
    }, [documents]);

    const ongoingCount = useMemo(() => tableJobRows.filter(d => d.subTabState === 'Ongoing').length, [tableJobRows]);
    const completedCount = useMemo(() => tableJobRows.filter(d => d.subTabState === 'Completed').length, [tableJobRows]);
    const archivedCount = useMemo(() => tableJobRows.filter(d => d.subTabState === 'Archived').length, [tableJobRows]);

    const filteredTableDocs = useMemo(() => {
        return tableJobRows.filter(doc => {
            if (tableSubTab && doc.subTabState !== tableSubTab) {
                return false;
            }

            if (selectedYear !== 'All') {
                const docDate = doc.issue_date || doc.created_at;
                const docYear = docDate ? new Date(docDate).getFullYear().toString() : new Date().getFullYear().toString();
                if (docYear !== selectedYear) return false;
            }

            const term = (tableSearchQuery || searchQuery || '').toLowerCase().trim();
            if (term) {
                const matches = (doc.assigned_job_no || doc.document_no || '').toLowerCase().includes(term) ||
                    (doc.partners?.name || '').toLowerCase().includes(term) ||
                    (doc.delivery_verification?.po_description || '').toLowerCase().includes(term) ||
                    (doc.subject || '').toLowerCase().includes(term) ||
                    (doc.customer_ref || '').toLowerCase().includes(term) ||
                    (doc.customer_po_no || '').toLowerCase().includes(term) ||
                    (doc.contacts?.name || '').toLowerCase().includes(term) ||
                    (doc.contacts?.first_name || '').toLowerCase().includes(term) ||
                    (doc.suiteDocs && doc.suiteDocs.some(sd => 
                        (sd.document_no && sd.document_no.toLowerCase().includes(term)) ||
                        (sd.subject && sd.subject.toLowerCase().includes(term)) ||
                        (sd.customer_ref && sd.customer_ref.toLowerCase().includes(term)) ||
                        (sd.customer_po_no && sd.customer_po_no.toLowerCase().includes(term)) ||
                        (sd.partners?.name && sd.partners.name.toLowerCase().includes(term)) ||
                        (sd.contacts?.name && sd.contacts.name.toLowerCase().includes(term))
                    ));
                if (!matches) return false;
            }

            if (tableSelectedPartnerId) {
                const selectedPartner = partners.find(p => p.id === tableSelectedPartnerId);
                const selectedPartnerName = selectedPartner?.name;
                const matchesPartner = doc.partner_id === tableSelectedPartnerId ||
                    (doc.partners?.name && selectedPartnerName && doc.partners.name.trim().toLowerCase() === selectedPartnerName.trim().toLowerCase()) ||
                    (doc.suiteDocs && doc.suiteDocs.some(sd => 
                        sd.partner_id === tableSelectedPartnerId ||
                        (sd.partners?.name && selectedPartnerName && sd.partners.name.trim().toLowerCase() === selectedPartnerName.trim().toLowerCase())
                    ));
                if (!matchesPartner) return false;
            }

            return true;
        });
    }, [tableJobRows, tableSubTab, selectedYear, tableSearchQuery, searchQuery, tableSelectedPartnerId, partners]);

    const sortedTableDocs = useMemo(() => {
        return [...filteredTableDocs].sort((a, b) => {
            if (tableSortKey === 'created_at') {
                const valA = a.created_at ? new Date(a.created_at) : 0;
                const valB = b.created_at ? new Date(b.created_at) : 0;
                return tableSortDirection === 'desc' ? valB - valA : valA - valB;
            } else if (tableSortKey === 'document_no') {
                const valA = a.assigned_job_no || a.document_no || '';
                const valB = b.assigned_job_no || b.document_no || '';
                return tableSortDirection === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
            } else if (tableSortKey === 'total_amount') {
                const valA = parseFloat(a.delivery_verification?.po_value || a.total_amount) || 0;
                const valB = parseFloat(b.delivery_verification?.po_value || b.total_amount) || 0;
                return tableSortDirection === 'desc' ? valB - valA : valA - valB;
            } else if (tableSortKey === 'customer') {
                const valA = a.delivery_verification?.po_description || a.partners?.name || '';
                const valB = b.delivery_verification?.po_description || b.partners?.name || '';
                return tableSortDirection === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
            }
            return 0;
        });
    }, [filteredTableDocs, tableSortKey, tableSortDirection]);

    const extractFirstImageSrc = (htmlString) => {
        if (!htmlString) return null;
        const match = htmlString.match(/<img[^>]+src="([^">]+)"/);
        return match ? match[1] : null;
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

            const { getDocumentSettings: fetchSettings } = await import('../../lib/store');
            const { provisionFullProjectStructure, uploadFileToDrive } = await import('../../lib/driveService');

            const docSettings = await fetchSettings(profile.company_id);
            let celronRootId = docSettings?.gdrive_celron_root_id || docSettings?.google_drive_folder_id;
            if (celronRootId?.includes('drive.google.com')) {
                const match = celronRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || celronRootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (match) celronRootId = match[1];
            }

            const currentYear = new Date().getFullYear().toString();
            const jobNo = doc.assigned_job_no || doc.document_no;
            const projName = buildProjectFolderName(jobNo, doc);
            const projectFolderId = await provisionFullProjectStructure(accessToken, celronRootId, currentYear, projName);
            
            const result = await uploadFileToDrive(accessToken, file, { folderId: projectFolderId });
            const proofUrl = `https://drive.google.com/file/d/${result.id}/view`;

            const newAttachments = [...(doc.attachment_urls || []), proofUrl];
            await supabase.from('workflow_documents').update({ 
                attachment_urls: newAttachments,
                status: 'Confirmed' 
            }).eq('id', doc.id);

            toast.success('Signed proof uploaded successfully!');
            await reloadDocuments();
        } catch (error) {
            console.error('Upload failed:', error);
            toast.error('Upload failed: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRevertJob = async (doc) => {
        const jobNo = doc.assigned_job_no || doc.document_no;
        if (!window.confirm(`Are you sure you want to revert Job ${jobNo} back to a Quotation? \n\nThis will DELETE all associated suite documents (CEL, ORA, DO, etc.) and restore the original Quotation to Draft status.`)) return;
        
        try {
            setLoading(true);
            await revertJobToQuotation(jobNo);
            toast.success('Job reverted to Quotation successfully.');
            await reloadDocuments();
        } catch (error) {
            console.error("Revert failed:", error);
            toast.error("Failed to revert job: " + (error.message || "Unknown error"));
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteJobDoc = async (doc) => {
        const isJobGroup = Boolean(doc.assigned_job_no);
        const confirmMsg = isJobGroup 
            ? `Are you sure you want to delete the ENTIRE Job suite ${doc.assigned_job_no}? This will delete all associated documents linked to this job.`
            : 'Are you sure you want to delete this document? This action cannot be undone.';
        
        if (!window.confirm(confirmMsg)) return;

        try {
            setLoading(true);
            if (isJobGroup) {
                const { data: jobDocs } = await getWorkflowDocumentsByJob(doc.job_id || doc.id);
                if (jobDocs && jobDocs.length > 0) {
                    const docIds = new Set(jobDocs.map(d => d.id));
                    const rootDocs = jobDocs.filter(jd => !jd.original_document_id || !docIds.has(jd.original_document_id));
                    const deletePromises = rootDocs.map(async (jd) => {
                        const { error } = await deleteWorkflowDocument(jd.id);
                        if (error) throw error;
                    });
                    await Promise.all(deletePromises);
                } else {
                    const { error } = await deleteWorkflowDocument(doc.id);
                    if (error) throw error;
                }
            } else {
                const { error } = await deleteWorkflowDocument(doc.id);
                if (error) throw error;
            }
            toast.success(isJobGroup ? `Job suite ${doc.assigned_job_no} deleted successfully.` : "Document deleted successfully.");
            await reloadDocuments();
        } catch (error) {
            console.error("Delete failed:", error);
            toast.error("Failed to delete: " + (error.message || "Unknown database error."));
        } finally {
            setLoading(false);
        }
    };

    const handleDuplicateJobDoc = async (docId) => {
        if (!window.confirm('Are you sure you want to duplicate this document? All items will be copied to a new draft.')) return;
        try {
            toast.loading('Duplicating document...', { id: 'dup-doc' });
            const { data: newDoc, error } = await duplicateWorkflowDocument(docId);
            if (error) throw error;
            toast.success(`Duplicated successfully as ${newDoc?.document_no || 'Draft'}! Opening editor...`, { id: 'dup-doc' });
            if (newDoc && newDoc.id) {
                const slug = (newDoc.document_type || 'job').toLowerCase().replace(/\s+/g, '-');
                navigate(`/workflows/editor/${slug}/${newDoc.id}`);
            } else {
                await reloadDocuments();
            }
        } catch (error) {
            console.error("Duplicate failed:", error);
            toast.error("Failed to duplicate document: " + (error.message || "Unknown error."), { id: 'dup-doc' });
        }
    };

    const handlePrintPreview = (docId) => {
        window.open(`/workflows/print/${docId}`, '_blank');
    };

    const handleDocDriveFolder = (doc) => {
        const folderId = doc.drive_folder_id || doc.gdrive_folder_id;
        if (folderId) {
            window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
        } else {
            const jobObj = {
                jobNo: doc.assigned_job_no || doc.document_no,
                customer: doc.delivery_verification?.po_description || doc.partners?.name || 'Walk-in',
                vesselLocation: doc.vessels?.vessel_name || doc.work_locations?.location_name || '-',
                driveFolderId: null,
                masterJob: doc,
                allDocs: [doc]
            };
            handleOpenDriveFolder({ preventDefault: () => {}, stopPropagation: () => {} }, jobObj);
        }
    };

    // Helper to format date
    const formatDate = (dateStr) => {
        if (!dateStr) return 'TBD';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #f1f5f9;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }
                .table-row {
                    transition: background 0.15s ease;
                }
                .table-row:hover {
                    background: #f8fafc;
                }
                .quick-links-section {
                    margin-top: 16px;
                    border-top: 1px solid #e2e8f0;
                    padding-top: 16px;
                }
                .quick-link-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 10px;
                    border-radius: 8px;
                    font-size: 0.78rem;
                    font-weight: 600;
                    border: 1px solid transparent;
                    cursor: pointer;
                    text-align: left;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    background: #f8fafc;
                    color: #475569;
                }
                .quick-link-btn:hover {
                    transform: translateY(-1.5px);
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.03);
                }
                .quick-link-btn:active {
                    transform: translateY(0);
                }
                .quick-link-btn.items { background: rgba(99, 102, 241, 0.04); color: #4f46e5; border-color: rgba(99, 102, 241, 0.08); }
                .quick-link-btn.items:hover { background: rgba(99, 102, 241, 0.08); border-color: rgba(99, 102, 241, 0.2); }
                
                .quick-link-btn.workflow { background: rgba(139, 92, 246, 0.04); color: #7c3aed; border-color: rgba(139, 92, 246, 0.08); }
                .quick-link-btn.workflow:hover { background: rgba(139, 92, 246, 0.08); border-color: rgba(139, 92, 246, 0.2); }
                
                .quick-link-btn.po { background: rgba(245, 158, 11, 0.04); color: #d97706; border-color: rgba(245, 158, 11, 0.08); }
                .quick-link-btn.po:hover { background: rgba(245, 158, 11, 0.08); border-color: rgba(245, 158, 11, 0.2); }
                
                .quick-link-btn.costing { background: rgba(59, 130, 246, 0.04); color: #2563eb; border-color: rgba(59, 130, 246, 0.08); }
                .quick-link-btn.costing:hover { background: rgba(59, 130, 246, 0.08); border-color: rgba(59, 130, 246, 0.2); }
                
                .quick-link-btn.payments { background: rgba(16, 185, 129, 0.04); color: #059669; border-color: rgba(16, 185, 129, 0.08); }
                .quick-link-btn.payments:hover { background: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.2); }
                
                .quick-link-btn.gallery { background: rgba(244, 63, 94, 0.04); color: #e11d48; border-color: rgba(244, 63, 94, 0.08); }
                .quick-link-btn.gallery:hover { background: rgba(244, 63, 94, 0.08); border-color: rgba(244, 63, 94, 0.2); }
                
                .quick-link-btn.explorer { background: rgba(6, 182, 212, 0.04); color: #0891b2; border-color: rgba(6, 182, 212, 0.08); }
                .quick-link-btn.explorer:hover { background: rgba(6, 182, 212, 0.08); border-color: rgba(6, 182, 212, 0.2); }
                
                .quick-link-btn.other { background: rgba(100, 116, 139, 0.04); color: #475569; border-color: rgba(100, 116, 139, 0.08); }
                .quick-link-btn.other:hover { background: rgba(100, 116, 139, 0.08); border-color: rgba(100, 116, 139, 0.2); }

                .table-quick-link-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 22px;
                    height: 22px;
                    border-radius: 6px;
                    border: 1.5px solid transparent;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }
                .table-quick-link-btn:hover {
                    transform: scale(1.18);
                    box-shadow: 0 2px 4px rgba(0,0,0,0.08);
                }
                .table-quick-link-btn.items { background: rgba(99, 102, 241, 0.1); color: #4f46e5; border-color: rgba(99, 102, 241, 0.2); }
                .table-quick-link-btn.workflow { background: rgba(139, 92, 246, 0.1); color: #7c3aed; border-color: rgba(139, 92, 246, 0.2); }
                .table-quick-link-btn.po { background: rgba(245, 158, 11, 0.1); color: #d97706; border-color: rgba(245, 158, 11, 0.2); }
                .table-quick-link-btn.costing { background: rgba(59, 130, 246, 0.1); color: #2563eb; border-color: rgba(59, 130, 246, 0.2); }
                .table-quick-link-btn.payments { background: rgba(16, 185, 129, 0.1); color: #059669; border-color: rgba(16, 185, 129, 0.2); }
                .table-quick-link-btn.gallery { background: rgba(244, 63, 94, 0.1); color: #e11d48; border-color: rgba(244, 63, 94, 0.2); }
                .table-quick-link-btn.explorer { background: rgba(6, 182, 212, 0.1); color: #0891b2; border-color: rgba(6, 182, 212, 0.2); }
                .table-quick-link-btn.other { background: rgba(100, 116, 139, 0.1); color: #475569; border-color: rgba(100, 116, 139, 0.2); }
            `}</style>
            {/* Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '12px', letterSpacing: '-0.02em' }}>
                        <LayoutDashboard size={32} color="var(--accent)" /> Jobs Control Dashboard
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '4px', fontSize: '1.05rem' }}>Track project lifecycle, financials, files, and milestones.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                        className="btn btn-secondary" 
                        onClick={() => navigate('/unified-supplier-hub')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, borderColor: '#f59e0b', color: '#b45309', background: '#fffbeb' }}
                    >
                        <Building2 size={18} /> Go to Supplier Hub
                    </button>
                    <button 
                        className="btn btn-secondary" 
                        onClick={() => navigate('/workflows?type=Job')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
                    >
                        <List size={18} /> View Job List Table
                    </button>
                    <button 
                        className="btn btn-primary" 
                        onClick={() => navigate('/workflows/editor/job/new')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
                    >
                        <Plus size={18} /> Create New Job
                    </button>
                </div>
            </div>

            {/* Tab Selector */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', background: '#f1f5f9', padding: '6px', borderRadius: '14px', width: 'fit-content' }}>
                <button
                    onClick={() => setActiveTab('dashboard')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '10px',
                        border: 'none',
                        background: activeTab === 'dashboard' ? '#fff' : 'transparent',
                        color: activeTab === 'dashboard' ? 'var(--accent)' : '#64748b',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: activeTab === 'dashboard' ? '0 4px 6px -1px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.2s'
                    }}
                >
                    <LayoutDashboard size={18} />
                    Active Jobs Dashboard
                </button>
                <button
                    onClick={() => setActiveTab('operations')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '10px',
                        border: 'none',
                        background: activeTab === 'operations' ? '#fff' : 'transparent',
                        color: activeTab === 'operations' ? 'var(--accent)' : '#64748b',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: activeTab === 'operations' ? '0 4px 6px -1px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.2s'
                    }}
                >
                    <Briefcase size={18} />
                    Operations &amp; Navigation
                </button>
            </div>

            {activeTab === 'operations' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px', width: '100%', marginBottom: '40px' }}>
                    {jobsTools.map((tool, idx) => (
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
            ) : (
                <>


                    {/* Google Drive Integration card */}
                    <div className="glass-panel animate-fade-in" style={{ padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)', marginBottom: '24px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.04) 0%, rgba(16, 185, 129, 0.04) 100%)', backdropFilter: 'blur(8px)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <FolderOpen size={28} color="#f59e0b" fill="#f59e0b" fillOpacity={0.1} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>Google Drive Workspace Folder</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '2px' }}>Access the centralized repository containing all job files and related documentation.</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button 
                            onClick={() => navigate('/workflows?type=Job')}
                            className="btn btn-secondary" 
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, padding: '10px 16px', borderRadius: '8px' }}
                        >
                            <List size={16} /> View Job List Table
                        </button>
                        <button 
                            onClick={handleOpenJobsDrive} 
                            className="btn btn-secondary" 
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', borderColor: '#3b82f6', color: '#1d4ed8', background: '#eff6ff', fontWeight: 700, padding: '10px 16px', transition: 'all 0.2s', borderRadius: '8px' }}
                        >
                            <Folder size={16} fill="#3b82f6" fillOpacity={0.15} /> Open Jobs Folder
                        </button>
                        <button 
                            onClick={handleOpenRootDrive} 
                            className="btn btn-secondary" 
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', borderColor: '#f59e0b', color: '#b45309', background: '#fffbeb', fontWeight: 700, padding: '10px 16px', transition: 'all 0.2s', borderRadius: '8px' }}
                        >
                            <ExternalLink size={16} /> Open Drive Root
                        </button>
                    </div>
                </div>
            </div>

            {/* Top Toolbar: Filters & Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                {/* Year wise Horizontal Tabs */}
                <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', gap: '2px', border: '1px solid var(--border-color)' }}>
                    <button 
                        onClick={() => setSelectedYear('All')}
                        style={{ padding: '8px 16px', border: 'none', background: selectedYear === 'All' ? '#ffffff' : 'transparent', color: selectedYear === 'All' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: selectedYear === 'All' ? 700 : 500, borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.9rem' }}
                    >
                        All Years
                    </button>
                    {(availableYears.length > 0 ? availableYears : [new Date().getFullYear().toString()]).map(year => (
                        <button
                            key={year}
                            onClick={() => setSelectedYear(year)}
                            style={{ padding: '8px 16px', border: 'none', background: selectedYear === year ? '#ffffff' : 'transparent', color: selectedYear === year ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: selectedYear === year ? 700 : 500, borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.9rem' }}
                        >
                            {year}
                        </button>
                    ))}
                </div>

                {/* Search & Layout Toggles */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '8px 16px', minWidth: '320px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <Search size={18} color="var(--text-secondary)" style={{ marginRight: '8px' }} />
                        <input
                            type="text"
                            placeholder="Search jobs, customers, descriptions..."
                            style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, color: 'var(--text-primary)', fontSize: '0.9rem' }}
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setTableSearchQuery(e.target.value);
                            }}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setTableSearchQuery('');
                                }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px', fontSize: '0.8rem', fontWeight: 'bold' }}
                                title="Clear Search"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', background: '#e2e8f0', padding: '4px', borderRadius: '10px', gap: '2px' }}>
                        <button 
                            onClick={() => setViewMode('card')}
                            style={{ padding: '8px', border: 'none', background: viewMode === 'card' ? '#ffffff' : 'transparent', color: viewMode === 'card' ? 'var(--accent)' : 'var(--text-secondary)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            title="Grid Card View"
                        >
                            <Grid size={18} />
                        </button>
                        <button 
                            onClick={() => setViewMode('table')}
                            style={{ padding: '8px', border: 'none', background: viewMode === 'table' ? '#ffffff' : 'transparent', color: viewMode === 'table' ? 'var(--accent)' : 'var(--text-secondary)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            title="Detailed List Table"
                        >
                            <List size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* KPI Cards Panel */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', borderRadius: '16px', background: '#ffffff', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Jobs</span>
                    <span style={{ fontSize: '2rem', fontWeight: 800, marginTop: '8px', color: '#1e293b' }}>{totalJobsCount}</span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Activity size={14} color="#6366f1" /> {activeJobsCount} active ongoing
                    </span>
                </div>

                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', borderRadius: '16px', background: '#ffffff', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Customer Billed</span>
                    <span style={{ fontSize: '2rem', fontWeight: 800, marginTop: '8px', color: '#10b981' }}>
                        SGD {totalCustomerInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Calculated from Tax Invoices</span>
                </div>

                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', borderRadius: '16px', background: '#ffffff', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Supplier PO Cost</span>
                    <span style={{ fontSize: '2rem', fontWeight: 800, marginTop: '8px', color: '#f59e0b' }}>
                        SGD {totalSupplierPO.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Calculated from Purchase Orders</span>
                </div>

                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', borderRadius: '16px', background: '#ffffff', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Projected Net Profit</span>
                    <span style={{ fontSize: '2rem', fontWeight: 800, marginTop: '8px', color: totalNetProfit >= 0 ? '#10b981' : '#ef4444' }}>
                        SGD {totalNetProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: totalNetProfit >= 0 ? '#059669' : '#dc2626', marginTop: '4px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <TrendingUp size={14} /> {totalCustomerInvoiced > 0 ? ((totalNetProfit / totalCustomerInvoiced) * 100).toFixed(1) : 0}% margin
                    </span>
                </div>

                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', borderRadius: '16px', background: '#ffffff', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Overdue Jobs</span>
                    <span style={{ fontSize: '2rem', fontWeight: 800, marginTop: '8px', color: overdueJobsCount > 0 ? '#ef4444' : '#10b981' }}>{overdueJobsCount}</span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertCircle size={14} color={overdueJobsCount > 0 ? '#ef4444' : '#10b981'} /> Require immediate review
                    </span>
                </div>
            </div>

            {/* Embedded Job Control Small Window Table (from Image 2 / Image 3) */}
            <div className="glass-panel animate-fade-in" style={{
                background: '#ffffff',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '32px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
            }}>
                {/* 3 Status Tabs: Ongoing Jobs, Completed Jobs, Archived Jobs */}
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    marginBottom: '20px',
                    borderBottom: '1px solid var(--border-color)',
                    paddingBottom: '16px',
                    overflowX: 'auto'
                }}>
                    {JOB_SUB_TABS.map(tab => {
                        const isActive = tableSubTab === tab.id;
                        let count = 0;
                        if (tab.id === 'Ongoing') count = ongoingCount;
                        else if (tab.id === 'Completed') count = completedCount;
                        else if (tab.id === 'Archived') count = archivedCount;

                        return (
                            <button
                                key={tab.id}
                                onClick={() => setTableSubTab(tab.id)}
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
                                    minWidth: '220px',
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

                {/* Filter Toolbar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
                        {/* Search */}
                        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 16px', minWidth: '300px', flex: 1 }}>
                            <Search size={18} color="var(--text-secondary)" style={{ marginRight: '8px' }} />
                            <input
                                type="text"
                                placeholder="Search document no, customer, subject..."
                                style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                                value={tableSearchQuery || searchQuery}
                                onChange={(e) => {
                                    setTableSearchQuery(e.target.value);
                                    setSearchQuery(e.target.value);
                                }}
                            />
                            {(tableSearchQuery || searchQuery) && (
                                <button
                                    onClick={() => {
                                        setTableSearchQuery('');
                                        setSearchQuery('');
                                    }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px', fontSize: '0.8rem', fontWeight: 'bold' }}
                                    title="Clear Search"
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {/* Customer Filter Dropdown */}
                        <div style={{ minWidth: '240px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Filter size={18} color="var(--text-secondary)" style={{ marginLeft: '4px' }} />
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
                                value={tableSelectedPartnerId}
                                onChange={(e) => setTableSelectedPartnerId(e.target.value)}
                                placeholder="All Customers"
                            />
                        </div>

                        {/* Sort Dropdown */}
                        <div style={{ minWidth: '220px', display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0 12px' }}>
                            <ArrowUpDown size={16} color="var(--text-secondary)" style={{ marginRight: '8px' }} />
                            <select
                                style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, color: 'var(--text-primary)', fontSize: '0.88rem', cursor: 'pointer', height: '38px' }}
                                value={`${tableSortKey}-${tableSortDirection}`}
                                onChange={(e) => {
                                    const [key, dir] = e.target.value.split('-');
                                    setTableSortKey(key);
                                    setTableSortDirection(dir);
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
                    </div>

                    {/* Tile Filter Badge & Small Window Toggle */}
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
                            <span>Tile Filter: {tableSubTab} ({sortedTableDocs.length})</span>
                        </div>

                        <button
                            onClick={() => setTableCompactWindow(!tableCompactWindow)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                background: tableCompactWindow ? '#ffffff' : '#f1f5f9',
                                color: '#334155',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            title={tableCompactWindow ? "Switch to full expanded table view" : "Switch to 5-6 row compact window view"}
                        >
                            {tableCompactWindow ? '📐 Small Window (5-6 Rows)' : '📄 Full View'}
                        </button>
                    </div>
                </div>

                {/* Table Container */}
                <div
                    className="table-container custom-scrollbar"
                    style={{
                        maxHeight: tableCompactWindow ? '360px' : 'none',
                        overflowY: tableCompactWindow ? 'auto' : 'visible',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px 12px 0 0',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
                        position: 'relative'
                    }}
                >
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            <tr>
                                <th style={{ width: '130px', padding: '12px 14px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>CEL Job No</th>
                                <th style={{ width: '25%', minWidth: '220px', padding: '12px 14px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Customer</th>
                                <th style={{ width: '180px', padding: '12px 14px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Purchase Order Info</th>
                                <th style={{ width: '30%', minWidth: '250px', padding: '12px 14px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Description</th>
                                <th style={{ width: '120px', textAlign: 'right', padding: '12px 14px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Value (SGD)</th>
                                <th style={{ width: '110px', padding: '12px 14px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Attachment</th>
                                <th style={{ width: '80px', textAlign: 'center', padding: '12px 14px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Folder</th>
                                <th style={{ width: '280px', textAlign: 'right', padding: '12px 14px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>Loading job documents...</td></tr>
                            ) : sortedTableDocs.length === 0 ? (
                                <tr>
                                    <td colSpan="8">
                                        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
                                            <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                                            <p>No documents found matching your criteria.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                sortedTableDocs.map((doc) => (
                                    <tr key={doc.id || doc.assigned_job_no} className="table-row" style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ color: '#1e3a8a', padding: '12px 14px', fontWeight: 700 }}>{doc.assigned_job_no || 'TBD'}</td>
                                        <td style={{ padding: '12px 14px' }}>
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
                                        <td style={{ padding: '12px 14px' }}>
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
                                        <td style={{ padding: '12px 14px' }}>
                                            <div style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem' }} title={doc.subject}>
                                                {doc.subject || '-'}
                                            </div>
                                        </td>
                                        <td className="font-bold" style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 700 }}>
                                            SGD {(doc.total_amount || doc.delivery_verification?.po_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td style={{ padding: '12px 14px' }}>
                                            {doc.customer_po_attachment_url ? (
                                                <a href={doc.customer_po_attachment_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontWeight: 600 }}>
                                                    <FileText size={12} /> View PO
                                                </a>
                                            ) : (
                                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No Upload</span>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                                            <button
                                                onClick={() => handleDocDriveFolder(doc)}
                                                style={{ background: 'none', border: 'none', color: (doc.drive_folder_id || doc.gdrive_folder_id) ? '#f59e0b' : '#6366f1', cursor: 'pointer', opacity: (doc.drive_folder_id || doc.gdrive_folder_id) ? 1 : 0.6 }}
                                                title={(doc.drive_folder_id || doc.gdrive_folder_id) ? "Open Project Folder" : "Provision Project Folder"}
                                            >
                                                <Folder size={20} fill={(doc.drive_folder_id || doc.gdrive_folder_id) ? "#f59e0b" : "currentColor"} fillOpacity={0.2} />
                                            </button>
                                        </td>
                                        <td style={{ textAlign: 'right', padding: '12px 14px' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-secondary"
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '0.78rem', borderRadius: '6px' }}
                                                    onClick={() => {
                                                        if (doc.document_type === 'Enquiry') {
                                                            navigate(`/workflows/enquiry/${doc.id}`);
                                                        } else {
                                                            navigate(`/workflows/editor/job/${doc.id}`);
                                                        }
                                                    }}
                                                    title="Open Job Suite"
                                                >
                                                    <Eye size={14} /> Open
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-secondary"
                                                    style={{ color: '#6366f1', padding: '6px', borderRadius: '6px' }}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleDuplicateJobDoc(doc.id);
                                                    }}
                                                    title="Duplicate Job Document"
                                                >
                                                    <Copy size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-secondary"
                                                    style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '0.78rem', borderRadius: '6px' }}
                                                    onClick={() => setEditingJob(doc)}
                                                    title="Edit Job Details"
                                                >
                                                    <Plus size={14} /> Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-secondary"
                                                    style={{ padding: '6px', borderRadius: '6px' }}
                                                    onClick={() => handlePrintPreview(doc.id)}
                                                    title="Print Preview"
                                                >
                                                    <Printer size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-secondary"
                                                    style={{ color: '#ef4444', borderColor: '#fecaca', background: '#fef2f2', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '0.78rem', borderRadius: '6px' }}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleRevertJob(doc);
                                                    }}
                                                    title="Revert to Quotation (Cancel Job)"
                                                >
                                                    <ArrowRightLeft size={14} /> Revert
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-secondary"
                                                    style={{ color: 'var(--danger)', padding: '6px', borderRadius: '6px' }}
                                                    onClick={() => handleDeleteJobDoc(doc)}
                                                    title="Delete Job Suite"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                                <label style={{ cursor: 'pointer', margin: 0 }} title="Upload Signed Copy to Job Folder">
                                                    <div className="btn btn-sm btn-secondary" style={{ color: '#059669', padding: '6px', borderRadius: '6px' }}>
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
                            )}
                        </tbody>
                        {sortedTableDocs.length > 0 && (
                            <tfoot style={{ background: '#f8fafc', fontWeight: 'bold', borderTop: '2px solid var(--border-color)' }}>
                                <tr>
                                    <td colSpan={4} style={{ textAlign: 'right', padding: '12px 14px', color: 'var(--text-secondary)' }}>
                                        Total for {sortedTableDocs.length} {sortedTableDocs.length === 1 ? 'Record' : 'Records'}:
                                    </td>
                                    <td style={{ color: 'var(--text-primary)', fontSize: '1.05em', textAlign: 'right', padding: '12px 14px' }}>
                                        SGD {sortedTableDocs.reduce((sum, doc) => sum + (parseFloat(doc.delivery_verification?.po_value || doc.total_amount) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                    fontWeight: 600,
                    flexWrap: 'wrap',
                    gap: '8px'
                }}>
                    <span>
                        Showing {tableCompactWindow ? `top 5-6 rows per window` : `all ${sortedTableDocs.length} rows`} for tile: <strong style={{ color: '#4f46e5' }}>{tableSubTab}</strong> ({sortedTableDocs.length} matching jobs/docs)
                    </span>
                    <button
                        onClick={() => navigate('/workflows?type=Job')}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#4f46e5',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.78rem'
                        }}
                    >
                        Expand to Full List View ↓
                    </button>
                </div>
            </div>

            {/* Dashboard Content Area */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '64px 0' }}>
                    <div className="animate-spin" style={{ margin: '0 auto 16px', width: '32px', height: '32px', border: '3px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
                    <p style={{ color: 'var(--text-secondary)' }}>Loading jobs...</p>
                </div>
            ) : filteredJobs.length === 0 && viewMode === 'table' ? (
                <div className="glass-panel" style={{ padding: '64px 0', textAlign: 'center', borderRadius: '16px', background: '#ffffff', border: '1px solid var(--border-color)' }}>
                    <ShieldCheck size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>No Jobs Found</h3>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>Create a new Job or select a different year/search term.</p>
                </div>
            ) : viewMode === 'card' ? (
                /* Card View Mode (Image 2 style) */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
                    {/* Add New Job Card */}
                    <div 
                        onClick={() => navigate('/workflows/editor/job/new')}
                        className="glass-panel"
                        style={{ 
                            padding: '24px', 
                            borderRadius: '18px', 
                            border: '1.5px dashed var(--accent)', 
                            background: 'rgba(99, 102, 241, 0.02)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: '340px',
                            cursor: 'pointer',
                            transition: 'all 0.25s ease',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.01)',
                            textAlign: 'center'
                        }}
                        onMouseOver={e => {
                            e.currentTarget.style.transform = 'translateY(-4px)';
                            e.currentTarget.style.boxShadow = '0 12px 24px rgba(99, 102, 241, 0.08)';
                            e.currentTarget.style.background = 'rgba(99, 102, 241, 0.05)';
                            e.currentTarget.style.borderColor = 'var(--accent-hover)';
                        }}
                        onMouseOut={e => {
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.01)';
                            e.currentTarget.style.background = 'rgba(99, 102, 241, 0.02)';
                            e.currentTarget.style.borderColor = 'var(--accent)';
                        }}
                    >
                        <div style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            background: '#eff6ff',
                            color: 'var(--accent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: '16px',
                            transition: 'transform 0.2s ease',
                            border: '1.5px solid #bfdbfe'
                        }}
                        onMouseOver={e => {
                            e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseOut={e => {
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                        >
                            <Plus size={28} />
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Create New Job</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: '200px' }}>
                            Initialize a new job suite with draft forms, invoices, and folders.
                        </p>
                    </div>
                    {filteredJobs.map(job => (
                        <div 
                            key={job.jobNo}
                            className="glass-panel"
                            style={{ 
                                padding: '24px', 
                                borderRadius: '18px', 
                                border: '1.5px solid var(--border-color)', 
                                borderLeft: job.overdueDays > 0 ? '6px solid #ef4444' : (['Completed', 'Closed', 'Archived'].includes(job.status) ? '6px solid #10b981' : '6px solid #3b82f6'),
                                background: '#ffffff',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                transition: 'all 0.25s ease',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
                            }}
                            onMouseOver={e => {
                                e.currentTarget.style.transform = 'translateY(-4px)';
                                e.currentTarget.style.boxShadow = '0 12px 24px rgba(31, 38, 135, 0.06)';
                            }}
                            onMouseOut={e => {
                                e.currentTarget.style.transform = 'none';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.02)';
                            }}
                        >
                            <div>
                                {/* Card Badges */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <button 
                                        onClick={() => window.open('https://drive.google.com/drive/folders/1GPr3g5mq6_TotBzM8gDz_atJPR7TgbB-?usp=sharing', '_blank')}
                                        title="Open Jobs Google Drive"
                                        style={{ 
                                            display: 'inline-flex', 
                                            alignItems: 'center', 
                                            gap: '6px', 
                                            padding: '5px 12px', 
                                            borderRadius: '8px', 
                                            fontSize: '0.78rem', 
                                            fontWeight: 800, 
                                            background: '#dcfce7', 
                                            color: '#15803d',
                                            border: 'none',
                                            cursor: 'pointer',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onMouseOver={e => {
                                            e.currentTarget.style.background = '#bbf7d0';
                                            e.currentTarget.style.transform = 'scale(1.05)';
                                        }}
                                        onMouseOut={e => {
                                            e.currentTarget.style.background = '#dcfce7';
                                            e.currentTarget.style.transform = 'scale(1)';
                                        }}
                                    >
                                        <ShieldCheck size={14} /> JOB
                                    </button>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                                        {job.overdueDays > 0 ? (
                                            <span style={{ 
                                                padding: '5px 12px', 
                                                borderRadius: '8px', 
                                                fontSize: '0.78rem', 
                                                fontWeight: 800, 
                                                background: '#fee2e2', 
                                                color: '#b91c1c'
                                            }}>
                                                Overdue by {job.overdueDays} days
                                            </span>
                                        ) : (
                                            <span style={{ 
                                                padding: '5px 12px', 
                                                borderRadius: '8px', 
                                                fontSize: '0.78rem', 
                                                fontWeight: 800, 
                                                background: job.status === 'Completed' || job.status === 'Closed' || job.status === 'Archived' ? '#dcfce7' : '#eff6ff', 
                                                color: job.status === 'Completed' || job.status === 'Closed' || job.status === 'Archived' ? '#15803d' : '#1d4ed8'
                                            }}>
                                                {job.status}
                                            </span>
                                        )}
                                        
                                        {/* Actions dropdown */}
                                        <div style={{ position: 'relative' }}>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    setOpenDropdownJobNo(openDropdownJobNo === job.jobNo ? null : job.jobNo);
                                                }}
                                                style={{ 
                                                     background: 'none', 
                                                     border: '1px solid var(--border-color)', 
                                                     color: '#64748b', 
                                                     cursor: 'pointer',
                                                     padding: '6px',
                                                     display: 'flex',
                                                     alignItems: 'center',
                                                     justifyContent: 'center',
                                                     borderRadius: '8px',
                                                     transition: 'all 0.2s'
                                                }}
                                                onMouseOver={e => {
                                                    e.currentTarget.style.background = '#f1f5f9';
                                                    e.currentTarget.style.borderColor = '#cbd5e1';
                                                }}
                                                onMouseOut={e => {
                                                    e.currentTarget.style.background = 'none';
                                                    e.currentTarget.style.borderColor = 'var(--border-color)';
                                                }}
                                                title="Job Actions"
                                            >
                                                <MoreVertical size={16} />
                                            </button>
                                            
                                            {openDropdownJobNo === job.jobNo && (
                                                <div style={{ 
                                                     position: 'absolute', 
                                                     top: 'calc(100% + 6px)', 
                                                     right: 0, 
                                                     background: '#ffffff', 
                                                     border: '1px solid #e2e8f0', 
                                                     borderRadius: '12px', 
                                                     boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                                                     zIndex: 100,
                                                     minWidth: '160px',
                                                     padding: '6px 0',
                                                     overflow: 'hidden'
                                                }}>
                                                    <button 
                                                         onClick={(e) => {
                                                             e.stopPropagation();
                                                             setOpenDropdownJobNo(null);
                                                             navigate(`/workflows?job_id=${job.jobNo}`);
                                                         }}
                                                         style={{ 
                                                             display: 'block', 
                                                             width: '100%', 
                                                             textAlign: 'left', 
                                                             padding: '10px 14px', 
                                                             border: 'none', 
                                                             background: 'none', 
                                                             cursor: 'pointer',
                                                             fontSize: '0.88rem',
                                                             color: '#334155',
                                                             fontWeight: 600,
                                                             transition: 'background 0.2s'
                                                         }}
                                                         onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                                         onMouseOut={e => e.currentTarget.style.background = 'none'}
                                                    >
                                                         View Job List
                                                    </button>
                                                    <button 
                                                         onClick={(e) => {
                                                             e.stopPropagation();
                                                             setOpenDropdownJobNo(null);
                                                             const masterId = job.masterJob?.id || job.allDocs[0]?.id;
                                                             if (masterId) navigate(`/workflows/editor/job/${masterId}`);
                                                         }}
                                                         style={{ 
                                                             display: 'block', 
                                                             width: '100%', 
                                                             textAlign: 'left', 
                                                             padding: '10px 14px', 
                                                             border: 'none', 
                                                             background: 'none', 
                                                             cursor: 'pointer',
                                                             fontSize: '0.88rem',
                                                             color: '#334155',
                                                             fontWeight: 600,
                                                             transition: 'background 0.2s'
                                                         }}
                                                         onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                                         onMouseOut={e => e.currentTarget.style.background = 'none'}
                                                    >
                                                         Edit Job
                                                    </button>
                                                    <button 
                                                         onClick={(e) => {
                                                             e.stopPropagation();
                                                             setOpenDropdownJobNo(null);
                                                             handleDuplicateJob(e, job);
                                                         }}
                                                         style={{ 
                                                             display: 'block', 
                                                             width: '100%', 
                                                             textAlign: 'left', 
                                                             padding: '10px 14px', 
                                                             border: 'none', 
                                                             background: 'none', 
                                                             cursor: 'pointer',
                                                             fontSize: '0.88rem',
                                                             color: '#334155',
                                                             fontWeight: 600,
                                                             transition: 'background 0.2s'
                                                         }}
                                                         onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                                         onMouseOut={e => e.currentTarget.style.background = 'none'}
                                                    >
                                                         Duplicate Job
                                                    </button>
                                                    <div style={{ borderTop: '1px solid #f1f5f9', margin: '4px 0' }}></div>
                                                    <button 
                                                         onClick={(e) => {
                                                             e.stopPropagation();
                                                             setOpenDropdownJobNo(null);
                                                             handleDeleteJob(e, job);
                                                         }}
                                                         style={{ 
                                                             display: 'block', 
                                                             width: '100%', 
                                                             textAlign: 'left', 
                                                             padding: '10px 14px', 
                                                             border: 'none', 
                                                             background: 'none', 
                                                             cursor: 'pointer',
                                                             fontSize: '0.88rem',
                                                             color: '#ef4444',
                                                             fontWeight: 600,
                                                             transition: 'background 0.2s'
                                                         }}
                                                         onMouseOver={e => e.currentTarget.style.background = '#fef2f2'}
                                                         onMouseOut={e => e.currentTarget.style.background = 'none'}
                                                    >
                                                         Delete Job Suite
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Title: Job No */}
                                <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: '8px' }}>
                                    {job.jobNo}
                                </h2>

                                {/* Subtitle: Vessel or Customer */}
                                <p style={{ fontSize: '0.98rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                    {job.customer}
                                </p>

                                {/* Additional Card Meta details */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px', fontSize: '0.83rem', color: '#64748b' }}>
                                    {job.jobMajor && (
                                        <div style={{ marginBottom: '4px' }}>
                                            <span style={{ 
                                                display: 'inline-block', 
                                                padding: '2px 8px', 
                                                borderRadius: '6px', 
                                                background: '#eff6ff', 
                                                color: '#1d4ed8', 
                                                fontWeight: 800,
                                                fontSize: '0.75rem',
                                                textTransform: 'uppercase',
                                                border: '1px solid #bfdbfe'
                                            }}>
                                                {job.jobMajor}
                                            </span>
                                        </div>
                                    )}
                                    <div><strong style={{ color: '#475569' }}>Vessel/Loc:</strong> {job.vesselLocation}</div>
                                    <div><strong style={{ color: '#475569' }}>PO Ref:</strong> {job.customerPoNo}</div>
                                    <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={job.description}>
                                        <strong style={{ color: '#475569' }}>Desc:</strong> {job.description}
                                    </div>
                                    {job.jobDescription && (
                                        <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={stripHtml(job.jobDescription)}>
                                            <strong style={{ color: '#475569' }}>Job Detail:</strong> {stripHtml(job.jobDescription)}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                                        <span style={{ color: '#10b981', fontWeight: 700 }}>Billed: SGD {job.customerInvoiceAmount.toLocaleString()}</span>
                                        <span style={{ color: '#f59e0b', fontWeight: 700 }}>PO Cost: SGD {job.supplierInvoiceAmount.toLocaleString()}</span>
                                    </div>
                                </div>

                                {/* Quick Entry Tray */}
                                <div className="quick-links-section">
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
                                        Quick Entry Sections
                                    </span>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleNavigateToTab(job, 'items'); }}
                                            className="quick-link-btn items"
                                        >
                                            <Package size={13} /> Order Lines
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleNavigateToTab(job, 'workflow'); }}
                                            className="quick-link-btn workflow"
                                        >
                                            <FileText size={13} /> Workflow Suite
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleNavigateToTab(job, 'other'); }}
                                            className="quick-link-btn po"
                                        >
                                            <CreditCard size={13} /> PO & Ref Info
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleNavigateToTab(job, 'costing'); }}
                                            className="quick-link-btn costing"
                                        >
                                            <Calculator size={13} /> Costing & Exp
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleNavigateToTab(job, 'payments'); }}
                                            className="quick-link-btn payments"
                                        >
                                            <DollarSign size={13} /> Payments / GST
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleNavigateToTab(job, 'gallery'); }}
                                            className="quick-link-btn gallery"
                                        >
                                            <Image size={13} /> Photos & Media
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); navigate(`/dashboard/job-workflow?job_id=${job.id}&job_no=${job.jobNo}`); }}
                                            className="quick-link-btn workflow-board"
                                            style={{ gridColumn: 'span 2', background: '#eef2ff', color: '#4f46e5', borderColor: '#c7d2fe' }}
                                        >
                                            <Activity size={13} /> Job Workflow Board
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleNavigateToTab(job, 'explorer'); }}
                                            className="quick-link-btn explorer"
                                            style={{ gridColumn: 'span 2' }}
                                        >
                                            <FolderOpen size={13} /> Explorer (Drive)
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div>
                                {/* Dotted Divider */}
                                <div style={{ borderTop: '1px dotted var(--border-color)', margin: '14px 0' }}></div>

                                {/* Footer details */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        Date: {formatDate(job.issueDate)}
                                    </span>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        {/* Google Drive Specific Folder Button */}
                                        <button 
                                            onClick={(e) => handleOpenDriveFolder(e, job)}
                                            style={{ 
                                                background: job.driveFolderId ? '#fffbeb' : '#f8fafc', 
                                                color: job.driveFolderId ? '#d97706' : '#6366f1', 
                                                padding: '8px', 
                                                borderRadius: '8px', 
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transition: 'all 0.2s',
                                                border: job.driveFolderId ? '1px solid #fde68a' : '1px solid var(--border-color)'
                                            }}
                                            title={job.driveFolderId ? "Open Google Drive Job Folder" : "Provision Google Drive Folder"}
                                        >
                                            <Folder size={16} fill={job.driveFolderId ? "#f59e0b" : "transparent"} />
                                        </button>
                                        {/* Google Drive Root Folder Button */}
                                        <button 
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                window.open('https://drive.google.com/drive/folders/1GPr3g5mq6_TotBzM8gDz_atJPR7TgbB-?usp=sharing', '_blank');
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
                                            title="Open Jobs Root Folder"
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
                                            onClick={(e) => handleDuplicateJob(e, job)}
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
                                                border: '1px solid var(--border-color)'
                                            }}
                                            title="Duplicate Job (Copy)"
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
                                            onClick={(e) => handleDeleteJob(e, job)}
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
                                            title="Delete Job Suite"
                                            onMouseOver={e => {
                                                e.currentTarget.style.background = '#fee2e2';
                                            }}
                                            onMouseOut={e => {
                                                e.currentTarget.style.background = '#fef2f2';
                                            }}
                                        >
                                            <Trash2 size={16} />
                                        </button>

                                        {/* Eagle View / Review Link */}
                                        <button
                                            onClick={() => {
                                                const masterId = job.masterJob?.id || job.allDocs[0]?.id || job.jobNo;
                                                if (masterId) navigate(`/workflows/job-eagle-view/${masterId}`);
                                            }}
                                            style={{ 
                                                background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)', 
                                                border: 'none', 
                                                color: '#ffffff', 
                                                fontWeight: 800, 
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                fontSize: '0.85rem',
                                                padding: '6px 14px',
                                                borderRadius: '10px',
                                                boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)'
                                            }}
                                            title="Open Dedicated Eagle View Page"
                                        >
                                            Eagle View <ArrowRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                /* Table View Mode (Shows all requested columns) */
                <div className="table-container animate-fade-in" style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '16px' }}>
                    <table>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                <th>Job No</th>
                                <th>Customer</th>
                                <th>Vessel / Location</th>
                                <th>Job Description</th>
                                <th>Customer PO No</th>
                                <th>PO Reference</th>
                                <th style={{ textAlign: 'right' }}>Customer Invoice (SGD)</th>
                                <th>Customer Paid Status</th>
                                <th>Suppliers / Subcontractors</th>
                                <th style={{ textAlign: 'right' }}>Supplier Invoice (SGD)</th>
                                <th>Supplier Paid Status</th>
                                <th style={{ textAlign: 'right' }}>Profit (SGD)</th>
                                <th style={{ textAlign: 'center' }}>Drive Folders</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredJobs.map(job => (
                                <tr key={job.jobNo} className="table-row">
                                    {/* Job No */}
                                    <td className="font-bold" style={{ color: '#1e3a8a', padding: '12px 8px' }}>
                                        <div style={{ fontSize: '0.98rem', marginBottom: '6px' }}>{job.jobNo}</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '180px' }}>
                                            <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleNavigateToTab(job, 'items'); }} className="table-quick-link-btn items" title="Order Lines (Scope)"><Package size={11} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleNavigateToTab(job, 'workflow'); }} className="table-quick-link-btn workflow" title="Workflow Suite (Documents)"><FileText size={11} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleNavigateToTab(job, 'other'); }} className="table-quick-link-btn po" title="PO & Reference Info"><CreditCard size={11} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleNavigateToTab(job, 'costing'); }} className="table-quick-link-btn costing" title="Project Costing (Expenses)"><Calculator size={11} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleNavigateToTab(job, 'payments'); }} className="table-quick-link-btn payments" title="Payments & GST"><DollarSign size={11} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleNavigateToTab(job, 'gallery'); }} className="table-quick-link-btn gallery" title="Photos & Media"><Image size={11} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleNavigateToTab(job, 'explorer'); }} className="table-quick-link-btn explorer" title="Google Drive Files"><FolderOpen size={11} /></button>
                                        </div>
                                    </td>
                                    
                                    {/* Customer */}
                                    <td className="font-medium">{job.customer}</td>
                                    
                                    {/* Vessel / Location */}
                                    <td>{job.vesselLocation}</td>
                                    
                                    {/* Job Description */}
                                    <td>
                                        <div style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.description}>
                                            {job.description}
                                        </div>
                                        {job.jobMajor && (
                                            <div style={{ marginTop: '4px' }}>
                                                <span style={{ 
                                                    display: 'inline-block', 
                                                    padding: '1px 6px', 
                                                    borderRadius: '4px', 
                                                    background: '#eff6ff', 
                                                    color: '#1d4ed8', 
                                                    fontWeight: 800,
                                                    fontSize: '0.7rem',
                                                    textTransform: 'uppercase',
                                                    border: '1px solid #bfdbfe'
                                                }}>
                                                    {job.jobMajor}
                                                </span>
                                            </div>
                                        )}
                                    </td>
                                    
                                    {/* Customer PO No */}
                                    <td className="font-semibold" style={{ color: '#4f46e5' }}>{job.customerPoNo}</td>
                                    
                                    {/* PO Reference */}
                                    <td>{job.customerRef}</td>
                                    
                                    {/* Customer Invoice Amount */}
                                    <td className="font-bold" style={{ textAlign: 'right' }}>
                                        {job.customerInvoiceAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    
                                    {/* Customer Paid Status */}
                                    <td>
                                        <span style={{ 
                                            display: 'inline-block', 
                                            padding: '4px 8px', 
                                            borderRadius: '6px', 
                                            fontSize: '0.75rem', 
                                            fontWeight: 700,
                                            background: job.customerPaidStatus === 'Paid' ? '#dcfce7' : (job.customerPaidStatus === 'No Invoice' ? '#f1f5f9' : '#fef3c7'),
                                            color: job.customerPaidStatus === 'Paid' ? '#15803d' : (job.customerPaidStatus === 'No Invoice' ? '#475569' : '#b45309')
                                        }}>
                                            {job.customerPaidStatus}
                                        </span>
                                    </td>
                                    
                                    {/* Suppliers */}
                                    <td>
                                        <div style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.suppliersList}>
                                            {job.suppliersList}
                                        </div>
                                    </td>
                                    
                                    {/* Suppliers Invoice Amount */}
                                    <td className="font-bold" style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                                        {job.supplierInvoiceAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    
                                    {/* Supplier Paid Status */}
                                    <td>
                                        <span style={{ 
                                            display: 'inline-block', 
                                            padding: '4px 8px', 
                                            borderRadius: '6px', 
                                            fontSize: '0.75rem', 
                                            fontWeight: 700,
                                            background: job.supplierPaidStatus === 'Paid' ? '#dcfce7' : (job.supplierPaidStatus === 'No PO' ? '#f1f5f9' : '#fef3c7'),
                                            color: job.supplierPaidStatus === 'Paid' ? '#15803d' : (job.supplierPaidStatus === 'No PO' ? '#475569' : '#b45309')
                                        }}>
                                            {job.supplierPaidStatus}
                                        </span>
                                    </td>
                                    
                                    {/* Profit */}
                                    <td className="font-bold" style={{ textAlign: 'right', color: job.profit >= 0 ? '#10b981' : '#ef4444' }}>
                                        {job.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    
                                    {/* Google Drive folder link */}
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                                            {/* Specific Job Folder */}
                                            <button
                                                onClick={(e) => handleOpenDriveFolder(e, job)}
                                                style={{ background: 'none', border: 'none', color: job.driveFolderId ? '#f59e0b' : '#6366f1', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                title={job.driveFolderId ? "Open Job Google Drive Folder" : "Provision Google Drive Folder"}
                                            >
                                                <Folder size={18} fill={job.driveFolderId ? "#f59e0b" : "transparent"} />
                                            </button>
                                            {/* Root Jobs Folder */}
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    window.open('https://drive.google.com/drive/folders/1GPr3g5mq6_TotBzM8gDz_atJPR7TgbB-?usp=sharing', '_blank');
                                                }}
                                                style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                title="Open Jobs Root Folder"
                                            >
                                                <FolderOpen size={18} fill="#bfdbfe" />
                                            </button>
                                        </div>
                                    </td>
                                    
                                    {/* Job Status */}
                                    <td>
                                        <span style={{ 
                                            display: 'inline-block', 
                                            padding: '4px 8px', 
                                            borderRadius: '6px', 
                                            fontSize: '0.75rem', 
                                            fontWeight: 700,
                                            background: job.overdueDays > 0 ? '#fee2e2' : (job.status === 'Completed' || job.status === 'Closed' ? '#dcfce7' : '#eff6ff'),
                                            color: job.overdueDays > 0 ? '#b91c1c' : (job.status === 'Completed' || job.status === 'Closed' ? '#15803d' : '#1d4ed8')
                                        }}>
                                            {job.overdueDays > 0 ? `Overdue (${job.overdueDays}d)` : job.status}
                                        </span>
                                    </td>
                                    
                                    {/* Actions */}
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                            {/* Open/Edit */}
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                onClick={() => {
                                                     const masterId = job.masterJob?.id || job.allDocs[0]?.id;
                                                     if (masterId) navigate(`/workflows/editor/job/${masterId}`);
                                                }}
                                                title="Open Job Suite"
                                            >
                                                <Eye size={12} /> Open
                                            </button>

                                            {/* Copy */}
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '6px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', border: '1px solid var(--border-color)', color: '#475569' }}
                                                onClick={(e) => handleDuplicateJob(e, job)}
                                                title="Duplicate Job (Copy)"
                                            >
                                                <Copy size={12} />
                                            </button>

                                            {/* Delete */}
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '6px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444' }}
                                                onClick={(e) => handleDeleteJob(e, job)}
                                                title="Delete Job Suite"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
                </>
            )}

            {/* Job Edit Modal */}
            {editingJob && (
                <JobEditV2Modal
                    job={editingJob}
                    onClose={() => setEditingJob(null)}
                    onSave={async () => {
                        setEditingJob(null);
                        await reloadDocuments();
                    }}
                />
            )}
        </div>
    );
}
