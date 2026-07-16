import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { 
    Search, FileText, Send, ClipboardCheck, Briefcase, Truck, Receipt, 
    ChevronRight, ArrowLeft, Plus, RefreshCcw, Activity, ArrowRightLeft, 
    Calendar, CheckCircle, Clock, AlertCircle, ShoppingCart, DollarSign,
    ExternalLink, Trash2, Edit2, Layers, Folder, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import CustomerEnquiryForm from '../../components/CustomerEnquiryForm';
import SearchableSelect from '../../components/common/SearchableSelect';
import { isTokenValid } from '../../lib/googleAuthService';
import { 
    listFolderContent, 
    uploadFileToDrive, 
    provisionFullProjectStructure, 
    getOrCreateFolder,
    copyFile
} from '../../lib/driveService';
import SmartUploadPanel from '../../components/upload/SmartUploadPanel';


// Sub-component for Google Drive integration per stage
function StageDriveManager({ accessToken, folderId, stageName, stageId, jobNo, onRefresh, onProvision }) {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [isUploadPanelOpen, setIsUploadPanelOpen] = useState(false);

    useEffect(() => {
        if (accessToken && folderId) {
            fetchFiles();
        } else {
            setFiles([]);
        }
    }, [accessToken, folderId]);

    const fetchFiles = async () => {
        setLoading(true);
        try {
            const content = await listFolderContent(accessToken, folderId);
            setFiles(content || []);
        } catch (err) {
            console.error(`Error loading files for stage ${stageName}:`, err);
        } finally {
            setLoading(false);
        }
    };

    if (!accessToken) {
        return (
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '10px' }}>
                Connect Google Account to view/upload Drive files.
            </div>
        );
    }

    if (!folderId) {
        return (
            <div style={{ marginTop: '14px', borderTop: '1px solid #cbd5e1', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600 }}>
                    ⚠️ Google Drive folder not yet provisioned.
                </span>
                <button 
                    onClick={onProvision}
                    style={{ background: '#fffbeb', border: '1px solid #f59e0b', color: '#b45309', borderRadius: '6px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                >
                    + Provision Folder
                </button>
            </div>
        );
    }

    return (
        <div style={{ marginTop: '14px', borderTop: '1px solid #cbd5e1', paddingTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Folder size={14} color="#f59e0b" /> Drive Documents
                </span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button 
                        onClick={() => window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank')}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                    >
                        Open Folder
                    </button>
                    <button 
                        onClick={() => setIsUploadPanelOpen(true)}
                        disabled={uploading}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#6366f1', border: 'none', color: '#fff', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                        {uploading ? 'Processing...' : '+ Upload File'}
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Loading files...</div>
            ) : files.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>No files in this folder.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                    {files.map(file => (
                        <div key={file.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                            <a 
                                href={file.webViewLink} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{ fontSize: '0.78rem', color: '#4f46e5', fontWeight: 600, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}
                            >
                                {file.name}
                            </a>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ''}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <SmartUploadPanel 
                isOpen={isUploadPanelOpen}
                onClose={() => setIsUploadPanelOpen(false)}
                activeFolderId={folderId}
                activeFolderName={`${jobNo || 'Job'} - Stage ${stageId} (${stageName || ''})`}
                onSelect={async (file, suggestions) => {
                    if (!file) return;
                    setUploading(true);
                    try {
                        if (file.isGoogleDrive) {
                            await copyFile(accessToken, file.id, folderId);
                            toast.success("File copied successfully to Drive!");
                        } else {
                            await uploadFileToDrive(accessToken, file, { folderId });
                            toast.success("File uploaded successfully to Drive!");
                        }
                        await fetchFiles();
                        if (onRefresh) onRefresh();
                    } catch (err) {
                        console.error("Error adding file to Drive:", err);
                        toast.error("Failed to add file: " + err.message);
                    } finally {
                        setUploading(false);
                    }
                }}
                documentType="workflow"
                accept=".pdf,.png,.jpg,.jpeg"
            />
        </div>
    );
}

export default function JobWorkflow() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedSuite, setSelectedSuite] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // Core database records for the selected flow
    const [enquiry, setEnquiry] = useState(null);
    const [quotes, setQuotes] = useState([]);
    const [docs, setDocs] = useState([]); // Quotation, Job, PO, DO, Invoice, etc.
    
    // Modals & Options
    const [showEnquiryForm, setShowEnquiryForm] = useState(false);
    const [recentSuites, setRecentSuites] = useState([]);
    const [enquiryOptions, setEnquiryOptions] = useState([]);
    const [jobOptions, setJobOptions] = useState([]);

    // Subfolder caches
    const [enquirySubfolders, setEnquirySubfolders] = useState([]);
    const [jobSubfolders, setJobSubfolders] = useState([]);

    useEffect(() => {
        if (profile?.company_id) {
            loadRecentSuites();
            loadDropdownOptions();

            // Read URL params for direct linking
            const params = new URLSearchParams(window.location.search);
            const enqId = params.get('enquiry_id');
            const enqNo = params.get('enquiry_no');
            const jobId = params.get('job_id');
            const jobNo = params.get('job_no');

            if (enqId) {
                handleSelectSuite({ id: enqId, type: 'Enquiry', no: enqNo || 'Enquiry' });
            } else if (jobId) {
                handleSelectSuite({ id: jobId, type: 'Job', no: jobNo || 'Job' });
            }
        }
    }, [profile]);

    // Autocomplete Search suggestion generator
    useEffect(() => {
        const handler = setTimeout(() => {
            if (searchQuery.trim().length >= 2) {
                fetchSuggestions(searchQuery.trim());
            } else {
                setSuggestions([]);
            }
        }, 300);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    const loadDropdownOptions = async () => {
        try {
            // Load Enquiries
            const { data: enqs, error: enqErr } = await supabase
                .from('customer_enquiries')
                .select('id, enquiry_no, subject, customer:partners!customer_id(name)')
                .eq('company_id', profile.company_id)
                .order('enquiry_no', { ascending: false });

            if (enqErr) {
                console.error("Error loading enquiries for dropdown:", enqErr);
            } else if (enqs) {
                setEnquiryOptions(enqs.map(e => ({
                    id: e.id,
                    name: `${e.enquiry_no} - ${e.customer?.name || 'Walk-in'} (${e.subject || 'No Subject'})`
                })));
            }

            // Load Jobs
            const { data: jobs, error: jobErr } = await supabase
                .from('workflow_documents')
                .select('id, document_no, subject, customer:partners!partner_id(name), enquiry_id, assigned_job_no')
                .eq('company_id', profile.company_id)
                .eq('document_type', 'Job')
                .order('document_no', { ascending: false });

            if (jobErr) {
                console.error("Error loading jobs for dropdown:", jobErr);
            } else if (jobs) {
                setJobOptions(jobs.map(j => ({
                    id: j.id,
                    name: `${j.assigned_job_no || j.document_no} - ${j.customer?.name || 'Walk-in'} (${j.subject || 'No Subject'})`,
                    enquiryId: j.enquiry_id,
                    assignedJobNo: j.assigned_job_no
                })));
            }
        } catch (err) {
            console.error("Error loading dropdown options:", err);
        }
    };

    const loadRecentSuites = async () => {
        try {
            // Fetch 5 most recent Jobs/Enquiries to pre-populate dashboard
            const { data: recentJobs, error } = await supabase
                .from('workflow_documents')
                .select('id, document_no, document_type, subject, created_at, partners(name)')
                .eq('company_id', profile.company_id)
                .in('document_type', ['Job', 'Enquiry'])
                .order('created_at', { ascending: false })
                .limit(5);

            if (error) throw error;
            setRecentSuites(recentJobs || []);
        } catch (err) {
            console.error("Error loading recent suites:", err);
        }
    };

    const fetchSuggestions = async (term) => {
        try {
            // Search customer enquiries
            const { data: enqs } = await supabase
                .from('customer_enquiries')
                .select('id, enquiry_no, subject, partners!customer_id(name)')
                .eq('company_id', profile.company_id)
                .ilike('enquiry_no', `%${term}%`)
                .limit(5);

            // Search workflow documents (Jobs, Quotations)
            const { data: jobDocs } = await supabase
                .from('workflow_documents')
                .select('id, document_no, document_type, subject, partners(name)')
                .eq('company_id', profile.company_id)
                .in('document_type', ['Job', 'Quotation'])
                .ilike('document_no', `%${term}%`)
                .limit(5);

            const results = [];
            if (enqs) {
                enqs.forEach(e => {
                    results.push({
                        id: e.id,
                        type: 'Enquiry',
                        no: e.enquiry_no,
                        title: e.subject || 'Service Enquiry',
                        client: e.partners?.name || 'Walk-in Client'
                    });
                });
            }
            if (jobDocs) {
                jobDocs.forEach(d => {
                    results.push({
                        id: d.id,
                        type: d.document_type,
                        no: d.document_no,
                        title: d.subject || `${d.document_type} Document`,
                        client: d.partners?.name || 'Walk-in Client'
                    });
                });
            }
            setSuggestions(results);
        } catch (err) {
            console.error("Error searching suggestions:", err);
        }
    };

    const handleSelectSuite = async (item) => {
        setSuggestions([]);
        setSearchQuery(item.no);
        setLoading(true);
        try {
            let enquiryId = null;
            let assignedJobNo = null;

            if (item.type === 'Enquiry') {
                enquiryId = item.id;
            } else if (item.type === 'Job') {
                // If we select a Job directly, we fetch its document_no and enquiry_id
                const { data: doc } = await supabase
                    .from('workflow_documents')
                    .select('document_no, enquiry_id')
                    .eq('id', item.id)
                    .single();
                if (doc) {
                    assignedJobNo = doc.document_no;
                    enquiryId = doc.enquiry_id;
                }
            } else {
                // Fetch document details to locate linked IDs
                const { data: doc } = await supabase
                    .from('workflow_documents')
                    .select('enquiry_id, assigned_job_no')
                    .eq('id', item.id)
                    .single();

                if (doc) {
                    enquiryId = doc.enquiry_id;
                    assignedJobNo = doc.assigned_job_no;
                }
            }

            await loadFullWorkflowSuite(enquiryId, assignedJobNo);
            setSelectedSuite(item);
        } catch (err) {
            console.error("Error loading suite:", err);
            toast.error("Failed to load workflow details");
        } finally {
            setLoading(false);
        }
    };

    const loadFullWorkflowSuite = async (enquiryId, assignedJobNo) => {
        // 1. Fetch Enquiry Detail
        let fetchedEnquiry = null;
        if (enquiryId) {
            const { data: enq } = await supabase
                .from('customer_enquiries')
                .select('*, customer:partners(name), contact:contacts(name), vessel:vessels(vessel_name)')
                .eq('id', enquiryId)
                .maybeSingle();
            fetchedEnquiry = enq;
            setEnquiry(enq);

            // Fetch floated supplier quotes
            const { data: quotesData } = await supabase
                .from('supplier_quotes')
                .select('*, supplier:partners(name)')
                .eq('enquiry_id', enquiryId);
            setQuotes(quotesData || []);
        } else {
            setEnquiry(null);
            setQuotes([]);
        }

        // 2. Fetch associated workflow documents (Quotation, Job, PO, DO, Invoice, etc.)
        let query = supabase
            .from('workflow_documents')
            .select('*, partners(name), vessels(vessel_name), work_locations(location_name)')
            .eq('company_id', profile.company_id);

        if (assignedJobNo && enquiryId) {
            query = query.or(`assigned_job_no.eq.${assignedJobNo},document_no.eq.${assignedJobNo},enquiry_id.eq.${enquiryId}`);
        } else if (assignedJobNo) {
            query = query.or(`assigned_job_no.eq.${assignedJobNo},document_no.eq.${assignedJobNo}`);
        } else if (enquiryId) {
            query = query.eq('enquiry_id', enquiryId);
        } else {
            setDocs([]);
            return;
        }

        const { data: docData } = await query.order('created_at', { ascending: true });
        setDocs(docData || []);

        // 3. Load subfolder details if token is valid
        const accessToken = localStorage.getItem('google_access_token');
        if (isTokenValid() && accessToken) {
            // Load Enquiry subfolders
            const targetEnqFolderId = fetchedEnquiry?.gdrive_folder_id;
            if (targetEnqFolderId) {
                try {
                    const content = await listFolderContent(accessToken, targetEnqFolderId);
                    setEnquirySubfolders(content || []);
                } catch (e) {
                    console.error("Error listing Enquiry subfolders:", e);
                    setEnquirySubfolders([]);
                }
            } else {
                setEnquirySubfolders([]);
            }

            // Find Job folder ID and load subfolders
            let jobFolderId = null;
            const jobDoc = docData?.find(d => d.document_type === 'Job');
            if (jobDoc?.drive_folder_id) {
                jobFolderId = jobDoc.drive_folder_id;
            }

            if (jobFolderId) {
                try {
                    const content = await listFolderContent(accessToken, jobFolderId);
                    setJobSubfolders(content || []);
                } catch (e) {
                    console.error("Error listing Job subfolders:", e);
                    setJobSubfolders([]);
                }
            } else {
                setJobSubfolders([]);
            }
        }
    };

    const handleCreateJobDirect = () => {
        navigate('/workflows/editor/job/new');
    };

    const handleProvisionFolder = async () => {
        if (!isTokenValid()) {
            toast.error("Google Drive connection is expired or not connected");
            return;
        }

        const accessToken = localStorage.getItem('google_access_token');
        if (!accessToken) return;

        setLoading(true);
        try {
            const { getDocumentSettings } = await import('../../lib/store');
            
            const settings = await getDocumentSettings(profile.company_id);
            let celronRootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
            if (celronRootId?.includes('drive.google.com')) {
                const match = celronRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || celronRootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (match) celronRootId = match[1];
            }

            const currentYear = new Date().getFullYear().toString();

            // If we have a Job, let's provision the Job folder
            const jobDoc = docs.find(d => d.document_type === 'Job');
            if (jobDoc) {
                // Helper to format project folder name
                const buildProjectFolderName = (jobNo, doc) => {
                    const partnerName = doc.partners?.name || 'Walk-in';
                    const vesselName = doc.vessels?.vessel_name || '';
                    const locationName = doc.work_locations?.location_name || '';
                    const suffix = vesselName || locationName || '';
                    const folderTitle = suffix ? `${jobNo} - ${partnerName} - ${suffix}` : `${jobNo} - ${partnerName}`;
                    return folderTitle.replace(/[/\\?%*:|"<>]/g, '-');
                };

                const projName = buildProjectFolderName(jobDoc.document_no, jobDoc);
                const projectFolderId = await provisionFullProjectStructure(accessToken, celronRootId, currentYear, projName);

                // Update database
                await supabase
                    .from('workflow_documents')
                    .update({ drive_folder_id: projectFolderId })
                    .eq('id', jobDoc.id);

                toast.success("Job Google Drive folder provisioned successfully!");
                await loadFullWorkflowSuite(enquiry?.id, jobDoc.assigned_job_no || jobDoc.document_no);
            } else if (enquiry) {
                // If we only have an Enquiry, let's provision the Enquiry folder
                const enqName = `${enquiry.enquiry_no} - ${enquiry.customer?.name || 'Walk-in'}`.replace(/[/\\?%*:|"<>]/g, '-');
                
                const enquiriesRootId = await getOrCreateFolder(accessToken, celronRootId, 'ENQUIRIES');
                const yearFolderId = await getOrCreateFolder(accessToken, enquiriesRootId, currentYear);
                const enquiryFolderId = await getOrCreateFolder(accessToken, yearFolderId, enqName);

                await getOrCreateFolder(accessToken, enquiryFolderId, 'Photos & Media');
                await getOrCreateFolder(accessToken, enquiryFolderId, 'Supplier Enquiry uploads');
                await getOrCreateFolder(accessToken, enquiryFolderId, 'Quotations received');

                // Update database
                await supabase
                    .from('customer_enquiries')
                    .update({ gdrive_folder_id: enquiryFolderId })
                    .eq('id', enquiry.id);

                toast.success("Enquiry Google Drive folder provisioned successfully!");
                await loadFullWorkflowSuite(enquiry.id, null);
            } else {
                toast.error("No active Enquiry or Job found to provision folders.");
            }
        } catch (err) {
            console.error("Failed to provision folder:", err);
            toast.error("Folder provisioning failed: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Stage Resolvers
    const getStage1 = () => {
        if (enquiry) {
            return {
                status: 'active',
                title: enquiry.enquiry_no,
                date: enquiry.enquiry_date,
                client: enquiry.customer?.name || 'Walk-in Client',
                details: enquiry.description || 'No additional description details.',
                link: `/workflows/enquiry/${enquiry.id}`
            };
        }
        const enqDoc = docs.find(d => d.document_type === 'Enquiry');
        if (enqDoc) {
            return {
                status: 'active',
                title: enqDoc.document_no,
                date: enqDoc.issue_date,
                client: enqDoc.partners?.name || 'Walk-in Client',
                details: enqDoc.subject || 'Enquiry Document',
                link: `/workflows/editor/enquiry/${enqDoc.id}`
            };
        }
        return { status: 'missing' };
    };

    const getStage2 = () => {
        if (quotes.length > 0) {
            const receivedCount = quotes.filter(q => q.status === 'Received' || q.status === 'Shortlisted').length;
            const shortlisted = quotes.find(q => q.status === 'Shortlisted');
            return {
                status: 'active',
                rfqCount: quotes.length,
                receivedCount,
                shortlistedSupplier: shortlisted?.supplier?.name || null,
                shortlistedAmount: shortlisted?.quote_amount || null,
                lowestBid: Math.min(...quotes.filter(q => q.quote_amount > 0).map(q => q.quote_amount), 0)
            };
        }
        return { status: 'missing' };
    };

    const getStage3 = () => {
        const qtn = docs.find(d => d.document_type === 'Quotation');
        if (qtn) {
            return {
                status: qtn.status === 'Approved' ? 'confirmed' : 'active',
                no: qtn.document_no,
                amount: qtn.total_amount,
                docStatus: qtn.status,
                link: `/workflows/editor/quotation/${qtn.id}`
            };
        }
        return { status: 'missing' };
    };

    const getStage4 = () => {
        const job = docs.find(d => d.document_type === 'Job');
        const po = docs.find(d => d.document_type === 'Purchase Order');
        if (job) {
            return {
                status: 'active',
                jobNo: job.document_no,
                jobStatus: job.status,
                customerPo: job.customer_po_no || '-',
                poNo: po?.document_no || null,
                poAmount: po?.total_amount || 0,
                poStatus: po?.status || null,
                jobLink: `/workflows/editor/job/${job.id}`,
                poLink: po ? `/workflows/editor/purchase-order/${po.id}` : null
            };
        }
        return { status: 'missing' };
    };

    const getStage5 = () => {
        const doDoc = docs.find(d => d.document_type === 'Delivery Order');
        const pklDoc = docs.find(d => d.document_type === 'Packing List');
        const srDoc = docs.find(d => d.document_type === 'Service Report');
        
        if (doDoc || pklDoc || srDoc) {
            return {
                status: 'active',
                doNo: doDoc?.document_no || null,
                doStatus: doDoc?.status || null,
                pklNo: pklDoc?.document_no || null,
                pklStatus: pklDoc?.status || null,
                srNo: srDoc?.document_no || null,
                srStatus: srDoc?.status || null
            };
        }
        return { status: 'missing' };
    };

    const getStage6 = () => {
        const inv = docs.find(d => d.document_type === 'Tax Invoice');
        const pro = docs.find(d => d.document_type === 'Proforma Invoice');
        const pay = docs.find(d => d.document_type === 'Payment Received');
        
        if (inv || pro || pay) {
            return {
                status: inv?.status === 'Paid' ? 'confirmed' : 'active',
                invNo: inv?.document_no || null,
                invAmount: inv?.total_amount || 0,
                invStatus: inv?.status || null,
                proNo: pro?.document_no || null,
                proStatus: pro?.status || null,
                payNo: pay?.document_no || null,
                payAmount: pay?.total_amount || 0,
                link: inv ? `/workflows/editor/tax-invoice/${inv.id}` : (pro ? `/workflows/editor/proforma-invoice/${pro.id}` : null)
            };
        }
        return { status: 'missing' };
    };

    const resolveFolderForStage = (stageNum) => {
        const jobDoc = docs.find(d => d.document_type === 'Job');
        const jobFolderId = jobDoc?.drive_folder_id;

        if (stageNum === 1) {
            if (enquiry?.gdrive_folder_id) return enquiry.gdrive_folder_id;
            if (jobFolderId) {
                const supportFolder = jobSubfolders.find(f => f.name === 'SupportDocs' && f.mimeType === 'application/vnd.google-apps.folder');
                return supportFolder ? supportFolder.id : jobFolderId;
            }
            return null;
        }
        if (stageNum === 2) {
            const enqRfqFolder = enquirySubfolders.find(f => f.name === 'Supplier Enquiry uploads' && f.mimeType === 'application/vnd.google-apps.folder')?.id;
            if (enqRfqFolder) return enqRfqFolder;
            if (enquiry?.gdrive_folder_id) return enquiry.gdrive_folder_id;
            if (jobFolderId) {
                const worksuiteFolder = jobSubfolders.find(f => f.name === 'Worksuite' && f.mimeType === 'application/vnd.google-apps.folder');
                return worksuiteFolder ? worksuiteFolder.id : jobFolderId;
            }
            return null;
        }
        if (stageNum === 3) {
            const enqQtnFolder = enquirySubfolders.find(f => f.name === 'Quotations received' && f.mimeType === 'application/vnd.google-apps.folder')?.id;
            if (enqQtnFolder) return enqQtnFolder;
            if (enquiry?.gdrive_folder_id) return enquiry.gdrive_folder_id;
            if (jobFolderId) {
                const worksuiteFolder = jobSubfolders.find(f => f.name === 'Worksuite' && f.mimeType === 'application/vnd.google-apps.folder');
                return worksuiteFolder ? worksuiteFolder.id : jobFolderId;
            }
            return null;
        }
        if (stageNum === 4) {
            return jobFolderId || null;
        }
        if (stageNum === 5) {
            if (jobFolderId) {
                const supportFolder = jobSubfolders.find(f => f.name === 'SupportDocs' && f.mimeType === 'application/vnd.google-apps.folder');
                return supportFolder ? supportFolder.id : jobFolderId;
            }
            return null;
        }
        if (stageNum === 6) {
            if (jobFolderId) {
                const billsFolder = jobSubfolders.find(f => f.name === 'SupplierBills&Expenses' && f.mimeType === 'application/vnd.google-apps.folder');
                return billsFolder ? billsFolder.id : jobFolderId;
            }
            return null;
        }
        return null;
    };

    const stage1 = getStage1();
    const stage2 = getStage2();
    const stage3 = getStage3();
    const stage4 = getStage4();
    const stage5 = getStage5();
    const stage6 = getStage6();

    // Financial summary
    const billedAmount = docs.find(d => d.document_type === 'Tax Invoice')?.total_amount || docs.find(d => d.document_type === 'Job')?.total_amount || 0;
    const poCost = docs.find(d => d.document_type === 'Purchase Order')?.total_amount || 0;
    const margin = billedAmount - poCost;

    const accessToken = localStorage.getItem('google_access_token');
    const driveConnected = isTokenValid() && accessToken;

    return (
        <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '12px', letterSpacing: '-0.02em' }}>
                        <ArrowRightLeft size={32} color="#6366f1" /> Job Workflow Board
                    </h1>
                    <p style={{ color: '#64748b', marginTop: '4px', fontSize: '1.05rem' }}>Eagle-Eye perspective to search, track, and complete full transaction lifecycles.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                        onClick={() => navigate('/')} 
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
                    >
                        <ArrowLeft size={18} /> Back to Dashboard
                    </button>
                    <button 
                        onClick={() => setShowEnquiryForm(true)} 
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, borderColor: '#f59e0b', color: '#b45309', background: '#fffbeb' }}
                    >
                        <Plus size={18} /> New Customer Enquiry
                    </button>
                    <button 
                        onClick={handleCreateJobDirect} 
                        className="btn btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
                    >
                        <Plus size={18} /> Direct Create Job
                    </button>
                </div>
            </div>

            {/* Dropdown selectors side-by-side */}
            <div className="glass-panel" style={{ position: 'relative', zIndex: 10, padding: '24px', borderRadius: '20px', border: '1px solid #cbd5e1', background: '#fff', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.02)', marginBottom: '32px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Select Customer Enquiry</label>
                        <SearchableSelect 
                            options={enquiryOptions}
                            value={enquiry?.id || ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val) {
                                    const matched = enquiryOptions.find(o => o.id === val);
                                    handleSelectSuite({ id: val, type: 'Enquiry', no: matched.name.split(' - ')[0] });
                                }
                            }}
                            placeholder="Type to search Enquiries..."
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Select Active Job</label>
                        <SearchableSelect 
                            options={jobOptions}
                            value={docs.find(d => d.document_type === 'Job')?.id || ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val) {
                                    const matched = jobOptions.find(o => o.id === val);
                                    handleSelectSuite({ id: val, type: 'Job', no: matched.name.split(' - ')[0] });
                                }
                            }}
                            placeholder="Type to search Jobs..."
                        />
                    </div>
                </div>
            </div>

            {/* Top Workspace controls: Search panel */}
            <div className="glass-panel" style={{ padding: '28px', borderRadius: '24px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.04)', marginBottom: '32px' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1e293b', margin: '0 0 16px 0' }}>Search Job or Enquiry Suite</h3>
                <div style={{ position: 'relative', width: '100%', maxWidth: '800px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '16px', padding: '6px 16px' }}>
                        <Search size={22} color="#94a3b8" style={{ marginRight: '10px' }} />
                        <input 
                            type="text" 
                            placeholder="Type Job number (e.g. CEL-2607-6091) or Enquiry number (e.g. ECEL-2606-2401)..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '1.05rem', color: '#334155', padding: '10px 0' }}
                        />
                        {loading && <RefreshCcw size={20} className="animate-spin" color="#6366f1" />}
                    </div>

                    {suggestions.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 12px 24px rgba(0,0,0,0.1)', zIndex: 100, marginTop: '8px', overflow: 'hidden', padding: '8px' }}>
                            {suggestions.map((item, idx) => (
                                <div 
                                    key={idx}
                                    onClick={() => handleSelectSuite(item)}
                                    style={{ padding: '12px 16px', borderRadius: '10px', cursor: 'pointer', transition: 'background 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                    onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div>
                                        <span style={{ fontWeight: 800, color: '#4f46e5', marginRight: '10px' }}>{item.no}</span>
                                        <span style={{ fontSize: '0.9rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', marginRight: '10px', textTransform: 'uppercase', fontWeight: 700 }}>{item.type}</span>
                                        <span style={{ fontWeight: 600, color: '#334155' }}>{item.title}</span>
                                    </div>
                                    <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>{item.client}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {!selectedSuite && (
                    <div style={{ marginTop: '24px' }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Recent Workflows</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                            {recentSuites.map((suite, idx) => (
                                <div 
                                    key={idx}
                                    onClick={() => handleSelectSuite({
                                        id: suite.id,
                                        type: suite.document_type || 'Job',
                                        no: suite.document_no,
                                        title: suite.subject
                                    })}
                                    style={{ padding: '14px 20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.2s' }}
                                    onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = '#6366f1'; }}
                                    onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                >
                                    <Layers size={18} color="#6366f1" />
                                    <div>
                                        <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.92rem' }}>{suite.document_no}</div>
                                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{suite.partners?.name || 'Walk-in'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Detailed Suite Flow */}
            {selectedSuite ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '32px', alignItems: 'start' }}>
                    {/* Visual Timeline Panel */}
                    <div className="glass-panel" style={{ padding: '32px', borderRadius: '24px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
                            <div>
                                <span style={{ fontSize: '0.85rem', background: '#eef2ff', color: '#4f46e5', padding: '4px 10px', borderRadius: '6px', fontWeight: 800, textTransform: 'uppercase', marginRight: '10px' }}>Active Workspace</span>
                                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>{selectedSuite.no}</span>
                            </div>
                            <button onClick={() => { setSelectedSuite(null); setEnquiry(null); setDocs([]); }} style={{ background: 'none', border: 'none', color: '#64748b', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                                Clear Selector
                            </button>
                        </div>

                        {/* Interactive Steps timeline */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
                            <div style={{ position: 'absolute', left: '23px', top: '24px', bottom: '24px', width: '3px', background: '#cbd5e1', zIndex: 1 }} />

                            {/* Stage 1: Enquiry Received */}
                            <div style={{ display: 'flex', gap: '20px', position: 'relative', zIndex: 5 }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: stage1.status === 'active' ? '#3b82f6' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: stage1.status === 'active' ? '0 0 12px rgba(59, 130, 246, 0.4)' : 'none' }}>
                                    <FileText size={20} />
                                </div>
                                <div style={{ flex: 1, background: '#f8fafc', padding: '20px', borderRadius: '18px', border: '1.5px solid', borderColor: stage1.status === 'active' ? '#bfdbfe' : '#e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>1. Customer Enquiry / Service Request</h4>
                                            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Sourcing Origin</span>
                                        </div>
                                        {stage1.status === 'active' ? (
                                            <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>Received</span>
                                        ) : (
                                            <span style={{ fontSize: '0.75rem', background: '#fee2e2', color: '#9f1239', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>Missing / Direct Order</span>
                                        )}
                                    </div>
                                    {stage1.status === 'active' ? (
                                        <div style={{ fontSize: '0.9rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                                            <div><strong>Ref No:</strong> {stage1.title} ({new Date(stage1.date).toLocaleDateString()})</div>
                                            <div><strong>Client:</strong> {stage1.client}</div>
                                            <div><strong>Description:</strong> {stage1.details || 'No additional details.'}</div>
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                                <button onClick={() => navigate(stage1.link)} style={{ background: '#eff6ff', color: '#1d4ed8', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', width: 'fit-content' }}>
                                                    View Enquiry Details
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '12px 0 0 0' }}>This job was entered directly without a preliminary customer enquiry stage.</p>
                                    )}

                                    {/* Google Drive files section for Stage 1 */}
                                    <StageDriveManager 
                                        accessToken={accessToken} 
                                        folderId={resolveFolderForStage(1)} 
                                        stageName="Enquiry"
                                        stageId={1}
                                        jobNo={docs.find(d => d.document_type === 'Job')?.assigned_job_no || docs.find(d => d.document_type === 'Job')?.document_no || 'Job'}
                                        onRefresh={() => loadFullWorkflowSuite(enquiry?.id, docs.find(d => d.document_type === 'Job')?.assigned_job_no || docs.find(d => d.document_type === 'Job')?.document_no)} 
                                        onProvision={handleProvisionFolder}
                                    />
                                </div>
                            </div>

                            {/* Stage 2: RFQ Sourcing */}
                            <div style={{ display: 'flex', gap: '20px', position: 'relative', zIndex: 5 }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: stage2.status === 'active' ? '#8b5cf6' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: stage2.status === 'active' ? '0 0 12px rgba(139, 92, 246, 0.4)' : 'none' }}>
                                    <Send size={20} />
                                </div>
                                <div style={{ flex: 1, background: '#f8fafc', padding: '20px', borderRadius: '18px', border: '1.5px solid', borderColor: stage2.status === 'active' ? '#ddd6fe' : '#e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>2. Supplier RFQ / Sourcing</h4>
                                            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Vendor Price Collection</span>
                                        </div>
                                        {stage2.status === 'active' ? (
                                            <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>Shortlisted &amp; Active</span>
                                        ) : (
                                            <span style={{ fontSize: '0.75rem', background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>Awaiting RFQ</span>
                                        )}
                                    </div>
                                    {stage2.status === 'active' ? (
                                        <div style={{ fontSize: '0.9rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                                            <div><strong>RFQs Floated:</strong> {stage2.rfqCount} supplier(s)</div>
                                            <div><strong>Bids Received:</strong> {stage2.receivedCount} quote(s)</div>
                                            {stage2.shortlistedSupplier && (
                                                <div style={{ background: '#ecfdf5', color: '#065f46', padding: '8px 12px', borderRadius: '8px', border: '1px solid #a7f3d0', marginTop: '4px' }}>
                                                    <strong>Shortlisted Bid:</strong> {stage2.shortlistedSupplier} — ${stage2.shortlistedAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </div>
                                            )}
                                            <button onClick={() => navigate('/workflows/float-supplier-order')} style={{ background: '#f5f3ff', color: '#6d28d9', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', width: 'fit-content', marginTop: '6px' }}>
                                                Open RFQ Floating Panel
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ marginTop: '12px' }}>
                                            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 10px 0' }}>No supplier RFQs have been floated for this enquiry yet.</p>
                                            {enquiry && (
                                                <button onClick={() => navigate(`/workflows/enquiry/${enquiry.id}`)} style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                                                    Float RFQ to Suppliers
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Google Drive files section for Stage 2 */}
                                    <StageDriveManager 
                                        accessToken={accessToken} 
                                        folderId={resolveFolderForStage(2)} 
                                        stageName="RFQ"
                                        stageId={2}
                                        jobNo={docs.find(d => d.document_type === 'Job')?.assigned_job_no || docs.find(d => d.document_type === 'Job')?.document_no || 'Job'}
                                        onRefresh={() => loadFullWorkflowSuite(enquiry?.id, docs.find(d => d.document_type === 'Job')?.assigned_job_no || docs.find(d => d.document_type === 'Job')?.document_no)} 
                                        onProvision={handleProvisionFolder}
                                    />
                                </div>
                            </div>

                            {/* Stage 3: Quotation Sent */}
                            <div style={{ display: 'flex', gap: '20px', position: 'relative', zIndex: 5 }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: stage3.status === 'confirmed' ? '#10b981' : (stage3.status === 'active' ? '#6366f1' : '#94a3b8'), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: stage3.status !== 'missing' ? '0 0 12px rgba(99, 102, 241, 0.4)' : 'none' }}>
                                    <ClipboardCheck size={20} />
                                </div>
                                <div style={{ flex: 1, background: '#f8fafc', padding: '20px', borderRadius: '18px', border: '1.5px solid', borderColor: stage3.status !== 'missing' ? '#c7d2fe' : '#e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>3. Customer Quotation</h4>
                                            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Client Offer Sheet</span>
                                        </div>
                                        {stage3.status !== 'missing' ? (
                                            <span style={{ fontSize: '0.75rem', background: stage3.status === 'confirmed' ? '#dcfce7' : '#eff6ff', color: stage3.status === 'confirmed' ? '#166534' : '#1e40af', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                                {stage3.docStatus}
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '0.75rem', background: '#fee2e2', color: '#9f1239', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>Missing Quote</span>
                                        )}
                                    </div>
                                    {stage3.status !== 'missing' ? (
                                        <div style={{ fontSize: '0.9rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                                            <div><strong>Quote No:</strong> {stage3.no}</div>
                                            <div><strong>Quotation Value:</strong> ${stage3.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                            <button onClick={() => navigate(stage3.link)} style={{ background: '#eef2ff', color: '#4f46e5', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', width: 'fit-content', marginTop: '6px' }}>
                                                Edit / Print Quotation
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ marginTop: '12px' }}>
                                            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 10px 0' }}>No customer quotation has been generated yet.</p>
                                            {enquiry && (
                                                <button onClick={() => navigate(`/quotations?create=1&enquiry_id=${enquiry.id}&enquiry_no=${enquiry.enquiry_no}`)} style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                                                    Generate Customer Quotation
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Google Drive files section for Stage 3 */}
                                    <StageDriveManager 
                                        accessToken={accessToken} 
                                        folderId={resolveFolderForStage(3)} 
                                        stageName="Quotation"
                                        stageId={3}
                                        jobNo={docs.find(d => d.document_type === 'Job')?.assigned_job_no || docs.find(d => d.document_type === 'Job')?.document_no || 'Job'}
                                        onRefresh={() => loadFullWorkflowSuite(enquiry?.id, docs.find(d => d.document_type === 'Job')?.assigned_job_no || docs.find(d => d.document_type === 'Job')?.document_no)} 
                                        onProvision={handleProvisionFolder}
                                    />
                                </div>
                            </div>

                            {/* Stage 4: Job & PO Confirmation */}
                            <div style={{ display: 'flex', gap: '20px', position: 'relative', zIndex: 5 }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: stage4.status === 'active' ? '#10b981' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: stage4.status === 'active' ? '0 0 12px rgba(16, 185, 129, 0.4)' : 'none' }}>
                                    <Briefcase size={20} />
                                </div>
                                <div style={{ flex: 1, background: '#f8fafc', padding: '20px', borderRadius: '18px', border: '1.5px solid', borderColor: stage4.status === 'active' ? '#a7f3d0' : '#e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>4. Confirmed Project Job &amp; Supplier PO</h4>
                                            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Operational Boundary</span>
                                        </div>
                                        {stage4.status === 'active' ? (
                                            <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>Confirmed Suite</span>
                                        ) : (
                                            <span style={{ fontSize: '0.75rem', background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>Awaiting Order</span>
                                        )}
                                    </div>
                                    {stage4.status === 'active' ? (
                                        <div style={{ fontSize: '0.9rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                                            <div><strong>Job Code:</strong> {stage4.jobNo} ({stage4.jobStatus})</div>
                                            <div><strong>Customer PO Ref:</strong> {stage4.customerPo}</div>
                                            {stage4.poNo ? (
                                                <div><strong>Supplier PO:</strong> {stage4.poNo} (${stage4.poAmount?.toLocaleString()} — {stage4.poStatus})</div>
                                            ) : (
                                                <div style={{ color: '#d97706', fontWeight: 600 }}>Supplier Purchase Order missing.</div>
                                            )}
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                                <button onClick={() => navigate(stage4.jobLink)} style={{ background: '#ecfdf5', color: '#047857', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                                                    Manage Job
                                                </button>
                                                {stage4.poLink ? (
                                                    <button onClick={() => navigate(stage4.poLink)} style={{ background: '#f0fdf4', color: '#15803d', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                                                        Manage PO
                                                    </button>
                                                ) : (
                                                    <button onClick={() => navigate(`/workflows/editor/purchase-order/new?assigned_job_no=${stage4.jobNo}`)} style={{ background: '#fffbeb', color: '#b45309', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                                                        + Generate PO to Supplier
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ marginTop: '12px' }}>
                                            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 10px 0' }}>Job master has not been promoted.</p>
                                            {docs.find(d => d.document_type === 'Quotation') && (
                                                <button onClick={() => navigate(`/workflows?type=Quotation`)} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                                                    Promote Quotation to Job
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Google Drive files section for Stage 4 */}
                                    <StageDriveManager 
                                        accessToken={accessToken} 
                                        folderId={resolveFolderForStage(4)} 
                                        stageName="JobMaster"
                                        stageId={4}
                                        jobNo={docs.find(d => d.document_type === 'Job')?.assigned_job_no || docs.find(d => d.document_type === 'Job')?.document_no || 'Job'}
                                        onRefresh={() => loadFullWorkflowSuite(enquiry?.id, docs.find(d => d.document_type === 'Job')?.assigned_job_no || docs.find(d => d.document_type === 'Job')?.document_no)} 
                                        onProvision={handleProvisionFolder}
                                    />
                                </div>
                            </div>

                            {/* Stage 5: DO & Packing List */}
                            <div style={{ display: 'flex', gap: '20px', position: 'relative', zIndex: 5 }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: stage5.status === 'active' ? '#f97316' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: stage5.status === 'active' ? '0 0 12px rgba(249, 115, 22, 0.4)' : 'none' }}>
                                    <Truck size={20} />
                                </div>
                                <div style={{ flex: 1, background: '#f8fafc', padding: '20px', borderRadius: '18px', border: '1.5px solid', borderColor: stage5.status === 'active' ? '#ffedd5' : '#e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>5. Dispatch, Logistics &amp; Service Report</h4>
                                            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Delivery Verification</span>
                                        </div>
                                        {stage5.status === 'active' ? (
                                            <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>Dispatched</span>
                                        ) : (
                                            <span style={{ fontSize: '0.75rem', background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>Pending Dispatch</span>
                                        )}
                                    </div>
                                    {stage5.status === 'active' ? (
                                        <div style={{ fontSize: '0.9rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                                            {stage5.doNo && <div><strong>Delivery Order:</strong> {stage5.doNo} ({stage5.doStatus})</div>}
                                            {stage5.pklNo && <div><strong>Packing List:</strong> {stage5.pklNo} ({stage5.pklStatus})</div>}
                                            {stage5.srNo && <div><strong>Service Report:</strong> {stage5.srNo} ({stage5.srStatus})</div>}
                                            
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                                {stage4.jobNo && (
                                                    <>
                                                        {!stage5.doNo && <button onClick={() => navigate(`/workflows/editor/delivery-order/new?assigned_job_no=${stage4.jobNo}`)} style={{ background: '#fff3e0', color: '#e65100', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>+ Create DO</button>}
                                                        {!stage5.pklNo && <button onClick={() => navigate(`/workflows/editor/packing-list/new?assigned_job_no=${stage4.jobNo}`)} style={{ background: '#e0f2f1', color: '#004d40', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>+ Create Packing List</button>}
                                                        {!stage5.srNo && <button onClick={() => navigate(`/workflows/editor/service-report/new?assigned_job_no=${stage4.jobNo}`)} style={{ background: '#fce4ec', color: '#880e4f', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>+ Create Service Report</button>}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ marginTop: '12px' }}>
                                            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 10px 0' }}>No transit manifests (DO, PKL, SR) found.</p>
                                            {stage4.jobNo && (
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button onClick={() => navigate(`/workflows/editor/delivery-order/new?assigned_job_no=${stage4.jobNo}`)} style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                                                        Generate DO
                                                    </button>
                                                    <button onClick={() => navigate(`/workflows/editor/service-report/new?assigned_job_no=${stage4.jobNo}`)} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                                                        Generate Service Report
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Google Drive files section for Stage 5 */}
                                    <StageDriveManager 
                                        accessToken={accessToken} 
                                        folderId={resolveFolderForStage(5)} 
                                        stageName="Logistics"
                                        stageId={5}
                                        jobNo={docs.find(d => d.document_type === 'Job')?.assigned_job_no || docs.find(d => d.document_type === 'Job')?.document_no || 'Job'}
                                        onRefresh={() => loadFullWorkflowSuite(enquiry?.id, docs.find(d => d.document_type === 'Job')?.assigned_job_no || docs.find(d => d.document_type === 'Job')?.document_no)} 
                                        onProvision={handleProvisionFolder}
                                    />
                                </div>
                            </div>

                            {/* Stage 6: Invoice & Settlement */}
                            <div style={{ display: 'flex', gap: '20px', position: 'relative', zIndex: 5 }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: stage6.status === 'confirmed' ? '#10b981' : (stage6.status === 'active' ? '#ef4444' : '#94a3b8'), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: stage6.status !== 'missing' ? '0 0 12px rgba(239, 68, 68, 0.4)' : 'none' }}>
                                    <Receipt size={20} />
                                </div>
                                <div style={{ flex: 1, background: '#f8fafc', padding: '20px', borderRadius: '18px', border: '1.5px solid', borderColor: stage6.status !== 'missing' ? '#fecaca' : '#e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>6. Tax Invoicing &amp; Customer Settlement</h4>
                                            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Receivables Ledger</span>
                                        </div>
                                        {stage6.status !== 'missing' ? (
                                            <span style={{ fontSize: '0.75rem', background: stage6.status === 'confirmed' ? '#dcfce7' : '#fee2e2', color: stage6.status === 'confirmed' ? '#166534' : '#b91c1c', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                                {stage6.invStatus || stage6.proStatus || 'Sent'}
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '0.75rem', background: '#fee2e2', color: '#9f1239', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>Unbilled</span>
                                        )}
                                    </div>
                                    {stage6.status !== 'missing' ? (
                                        <div style={{ fontSize: '0.9rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                                            {stage6.invNo && <div><strong>Tax Invoice:</strong> {stage6.invNo} (${stage6.invAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })})</div>}
                                            {stage6.proNo && <div><strong>Proforma:</strong> {stage6.proNo}</div>}
                                            {stage6.payNo && (
                                                <div style={{ color: '#16a34a', fontWeight: 600 }}>
                                                    <strong>Payment Recorded:</strong> {stage6.payNo} (${stage6.payAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                                                </div>
                                            )}
                                            
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                                {stage6.link && (
                                                    <button onClick={() => navigate(stage6.link)} style={{ background: '#fecaca', color: '#991b1b', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                                                        Edit Invoice
                                                    </button>
                                                )}
                                                {stage6.invNo && stage6.invStatus !== 'Paid' && (
                                                    <button onClick={() => navigate(`/workflows?type=Payment+Received`)} style={{ background: '#d1fae5', color: '#065f46', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                                                        + Record Payment
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ marginTop: '12px' }}>
                                            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 10px 0' }}>No invoice has been created.</p>
                                            {stage4.jobNo && (
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button onClick={() => navigate(`/workflows/editor/tax-invoice/new?assigned_job_no=${stage4.jobNo}`)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                                                        Create Tax Invoice
                                                    </button>
                                                    <button onClick={() => navigate(`/workflows/editor/proforma-invoice/new?assigned_job_no=${stage4.jobNo}`)} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                                                        Create Proforma Invoice
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Google Drive files section for Stage 6 */}
                                    <StageDriveManager 
                                        accessToken={accessToken} 
                                        folderId={resolveFolderForStage(6)} 
                                        stageName="Invoicing"
                                        stageId={6}
                                        jobNo={docs.find(d => d.document_type === 'Job')?.assigned_job_no || docs.find(d => d.document_type === 'Job')?.document_no || 'Job'}
                                        onRefresh={() => loadFullWorkflowSuite(enquiry?.id, docs.find(d => d.document_type === 'Job')?.assigned_job_no || docs.find(d => d.document_type === 'Job')?.document_no)} 
                                        onProvision={handleProvisionFolder}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Side Sidebar summary panel */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                            <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 800, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>Financial Health</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div>
                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Billed Amount</div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b' }}>${Number(billedAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Supplier Cost</div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f97316' }}>${Number(poCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                </div>
                                <div style={{ borderTop: '1px dotted #e2e8f0', paddingTop: '12px' }}>
                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Projected Net Profit</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: margin >= 0 ? '#10b981' : '#ef4444' }}>${Number(margin || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                </div>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                            <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 800, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>Linked Assets</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <button 
                                    disabled={!stage4.jobNo}
                                    onClick={() => navigate(`/workflows/editor/job/${docs.find(d => d.document_type === 'Job')?.id}?tab=drive`)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 600, color: '#475569', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                                >
                                    <Folder size={18} color="#f59e0b" /> Open Google Drive
                                </button>
                                <button 
                                    disabled={!enquiry}
                                    onClick={() => navigate(`/soa?partner_id=${enquiry?.customer_id}`)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 600, color: '#475569', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                                >
                                    <Receipt size={18} color="#ec4899" /> Statement of Account
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 20px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '24px', textAlign: 'center' }}>
                    <Layers size={48} color="#94a3b8" style={{ marginBottom: '16px' }} />
                    <h3 style={{ color: '#1e293b', marginBottom: '8px' }}>No Active Job or Enquiry Selected</h3>
                    <p style={{ color: '#64748b', maxWidth: '400px', margin: '0 auto' }}>Use the search box above to find and display the visual pipeline follow-up for a particular transaction suite.</p>
                </div>
            )}

            {/* Modal for creating a new Enquiry */}
            {showEnquiryForm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', borderRadius: '24px', width: '95%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', padding: '32px', position: 'relative' }}>
                        <button onClick={() => setShowEnquiryForm(false)} style={{ position: 'absolute', top: '24px', right: '24px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                            <X size={24} />
                        </button>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginBottom: '24px' }}>Create New Customer Enquiry</h2>
                        <CustomerEnquiryForm 
                            onClose={() => setShowEnquiryForm(false)}
                            onSave={() => {
                                setShowEnquiryForm(false);
                                loadRecentSuites();
                                loadDropdownOptions();
                            }} 
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
