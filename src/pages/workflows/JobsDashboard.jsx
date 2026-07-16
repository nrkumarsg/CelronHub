import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
    LayoutDashboard, Folder, Calendar, DollarSign, TrendingUp, Plus, 
    Search, Grid, List, ArrowRight, ExternalLink, ShieldCheck, 
    AlertCircle, CheckCircle2, Activity, FileText, Printer, Eye, 
    RefreshCcw, FolderOpen, Copy, Trash2, MoreVertical,
    Package, CreditCard, Calculator, Image, Info,
    Briefcase, Truck, ClipboardList, Receipt, CheckSquare, Book, Ship, MapPin, Building2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getWorkflowDocuments, deleteWorkflowDocument, duplicateWorkflowDocument } from '../../lib/workflowV2Service';
import { isTokenValid, connectGoogleAPI } from '../../lib/googleAuthService';
import { getDocumentSettings } from '../../lib/store';
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

            // Prioritize the master "Job" document for header info
            if (doc.document_type === 'Job') {
                group.masterJob = doc;
                group.customer = doc.partners?.name || 'Walk-in';
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
                if (doc.partners?.name) group.customer = doc.partners.name;
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

            const term = searchQuery.toLowerCase().trim();
            const matchesSearch = !term || 
                job.jobNo.toLowerCase().includes(term) ||
                job.customer.toLowerCase().includes(term) ||
                job.vesselLocation.toLowerCase().includes(term) ||
                job.description.toLowerCase().includes(term) ||
                job.customerPoNo.toLowerCase().includes(term) ||
                job.suppliersList.toLowerCase().includes(term) ||
                (job.jobMajor && job.jobMajor.toLowerCase().includes(term)) ||
                (job.jobDescription && stripHtml(job.jobDescription).toLowerCase().includes(term));

            return matchesYear && matchesSearch;
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

    // Helper to format date
    const formatDate = (dateStr) => {
        if (!dateStr) return 'TBD';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
            <style>{`
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
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
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

                                        {/* Review Link */}
                                        <button
                                            onClick={() => {
                                                const masterId = job.masterJob?.id || job.allDocs[0]?.id;
                                                if (masterId) navigate(`/workflows/editor/job/${masterId}`);
                                            }}
                                            style={{ 
                                                background: 'transparent', 
                                                border: 'none', 
                                                color: 'var(--accent)', 
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
        </div>
    );
}
