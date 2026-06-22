import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
    getGlobalExpenses, 
    updateExpenseStatus, 
    deleteJobExpense,
    saveJobExpense
} from '../../lib/jobExpenseService';
import { getPartners, uploadFile } from '../../lib/store';
import { supabase } from '../../lib/supabase';
import { 
    Receipt, 
    Plus, 
    Search, 
    Filter, 
    Download, 
    ExternalLink, 
    Trash2, 
    Edit,
    CheckCircle2, 
    Clock, 
    AlertCircle, 
    Loader2, 
    FileText, 
    LayoutDashboard,
    ArrowRight,
    TrendingUp,
    Briefcase,
    FolderOpen,
    Sparkles,
    Database,
    RefreshCw,
    Play,
    Check,
    X,
    ChevronRight,
    Building2,
    Users,
    CheckSquare,
    Globe,
    Calendar,
    ArrowLeft,
    CircleDot
} from 'lucide-react';
import { Modal, QuickExpenseAdd } from '../../components/workflow/QuickAddForms';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { extractBillWithGroq } from '../../lib/openAiVisionService';
import { connectGoogleAPI, isTokenValid, performOCR } from '../../lib/googleAuthService';
import toast from 'react-hot-toast';

// Secure Custom Drive Document Preview (Bypassing CORS)
const DriveDocPreview = ({ fileId, accessToken, fileName, style, className }) => {
    const [src, setSrc] = useState('');
    const [loading, setLoading] = useState(true);
    const isPdf = fileName?.toLowerCase().endsWith('.pdf') || fileName?.toLowerCase().includes('.pdf');

    useEffect(() => {
        if (!fileId || !accessToken) return;
        
        let isMounted = true;
        setLoading(true);

        fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        .then(res => {
            if (!res.ok) throw new Error('Failed to load document');
            return res.blob();
        })
        .then(blob => {
            if (isMounted) {
                const targetBlob = isPdf ? new Blob([blob], { type: 'application/pdf' }) : blob;
                const url = URL.createObjectURL(targetBlob);
                setSrc(url);
                setLoading(false);
            }
        })
        .catch(err => {
            console.error('Error loading Drive file:', err);
            if (isMounted) setLoading(false);
        });

        return () => {
            isMounted = false;
            if (src) URL.revokeObjectURL(src);
        };
    }, [fileId, accessToken, isPdf]);

    if (loading) {
        return (
            <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', color: '#94a3b8' }} className={className}>
                <Loader2 size={24} className="animate-spin" />
            </div>
        );
    }

    if (!src) {
        return (
            <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', color: '#64748b' }} className={className}>
                <AlertCircle size={24} style={{ marginRight: '8px' }} />
                <span>Failed to load preview</span>
            </div>
        );
    }

    if (isPdf) {
        return <iframe src={src} style={{ ...style, border: 'none' }} className={className} title="Invoice PDF Preview" />;
    }

    return <img src={src} style={{ ...style, objectFit: 'contain' }} className={className} alt="Scanned Invoice Preview" />;
};

export default function BillsPortal() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const tabParam = searchParams.get('tab');
    
    // Auth & Drive Configuration
    const [googleAccessToken, setGoogleAccessToken] = useState('');
    const [isDriveConnected, setIsDriveConnected] = useState(false);
    const [folderLink, setFolderLink] = useState('https://drive.google.com/drive/folders/1MVrJO3j9xc9Ls9JpovmduW62i2YtfrRq?usp=drive_link');
    const [folderId, setFolderId] = useState('1MVrJO3j9xc9Ls9JpovmduW62i2YtfrRq');

    // Portal State
    const [loading, setLoading] = useState(true);
    const [bills, setBills] = useState([]);
    const [partners, setPartners] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [activeTab, setActiveTab] = useState(tabParam || 'pending'); // 'all', 'unpaid', 'paid', 'scanned', 'pending'
    const [selectedDraftIds, setSelectedDraftIds] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // Sync Pipeline State
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncLogs, setSyncLogs] = useState([]);
    const [currentProgress, setCurrentProgress] = useState({ current: 0, total: 0, file: '' });

    // Review Modal State
    const [selectedDraft, setSelectedDraft] = useState(null);
    const [editedBill, setEditedBill] = useState({
        id: '',
        supplier_id: '',
        supplier_name: '',
        invoice_no: '',
        invoice_date: '',
        description: '',
        amount: 0,
        gst_rate: 9,
        gst_amount: 0,
        grand_total: 0,
        job_id: '',
        bill_url: '',
        gdrive_file_id: '',
        attachment_note: ''
    });
    const [isSavingApproval, setIsSavingApproval] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('google_access_token');
        const valid = isTokenValid();
        
        if (token && valid) {
            setGoogleAccessToken(token);
            setIsDriveConnected(true);
        } else {
            setIsDriveConnected(false);
        }
    }, [activeTab]);

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) {
            setActiveTab(tab);
        }
    }, [searchParams]);

    useEffect(() => {
        if (profile?.company_id) {
            fetchData();
        }
    }, [profile]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [billsRes, partnersRes, jobsRes] = await Promise.all([
                getGlobalExpenses(profile.company_id),
                getPartners(profile.company_id),
                supabase
                    .from('workflow_documents')
                    .select('id, document_no, subject, drive_folder_id, gdrive_folder_id, partners(name), vessels!vessel_id(vessel_name)')
                    .eq('company_id', profile.company_id)
                    .eq('document_type', 'Job')
                    .order('document_no', { ascending: false })
            ]);

            if (billsRes.data) {
                console.log('Bills loaded:', billsRes.data);
                setBills(billsRes.data);
                const drafts = billsRes.data.filter(b => b.status && b.status.toLowerCase().includes('pending'));
                console.log('Pending drafts found:', drafts.length);
            }
            if (partnersRes) setPartners(partnersRes);
            if (jobsRes.data) setJobs(jobsRes.data);
        } catch (err) {
            console.error('Portal Data Error:', err);
        } finally {
            setLoading(false);
        }
    };

    const addLog = (message, type = 'info') => {
        setSyncLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), message, type }]);
    };

    const extractFolderId = (urlOrId) => {
        if (!urlOrId) return '';
        if (urlOrId.includes('drive.google.com')) {
            const match = urlOrId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
            return match ? match[1] : '';
        }
        return urlOrId.trim();
    };

    const handleConnectGoogle = () => {
        connectGoogleAPI('drive_bill_sync');
    };

    const handleOpenFolder = () => {
        if (!folderLink) return;
        let targetUrl = folderLink.trim();
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = `https://drive.google.com/drive/folders/${targetUrl}`;
        }
        window.open(targetUrl, '_blank');
    };

    const getDriveFileId = (bill) => {
        if (bill.gdrive_file_id) return bill.gdrive_file_id;
        if (!bill.attachment_note) return '';
        const match = bill.attachment_note.match(/File ID:\s*([a-zA-Z0-9_-]+)/i);
        return match ? match[1] : '';
    };

    // Google Drive Sync Pipeline
    const triggerFolderSync = async () => {
        const resolvedId = extractFolderId(folderLink);
        if (!resolvedId) {
            toast.error('Invalid Google Drive folder link or ID.');
            return;
        }
        setFolderId(resolvedId);

        const token = googleAccessToken || localStorage.getItem('google_access_token');
        if (!token) {
            toast.error('Google account not connected. Please login first.');
            return;
        }

        setIsSyncing(true);
        setSyncLogs([]);
        addLog('Starting Folder Discovery & OCR Pre-processing...', 'start');

        try {
            addLog(`Connecting to Drive Folder ID: ${resolvedId}...`);
            
            const foldersToScan = [resolvedId];
            const scannedFolders = new Set();
            const allFiles = [];
            
            while (foldersToScan.length > 0 && scannedFolders.size < 50) {
                const currentFolderId = foldersToScan.shift();
                if (scannedFolders.has(currentFolderId)) continue;
                scannedFolders.add(currentFolderId);
                
                addLog(`Scanning directory level... Discovered ${allFiles.length} file(s) so far.`);
                
                let pageToken = null;
                do {
                    const query = `'${currentFolderId}' in parents and trashed = false and (` +
                        `mimeType = 'application/vnd.google-apps.folder' or ` +
                        `mimeType contains 'image/' or ` +
                        `mimeType = 'application/pdf' or ` +
                        `name contains '.jpg' or ` +
                        `name contains '.jpeg' or ` +
                        `name contains '.png' or ` +
                        `name contains '.webp' or ` +
                        `name contains '.pdf'` +
                        `)`;
                    
                    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,mimeType,modifiedTime)&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
                    
                    const res = await fetch(url, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    
                    if (!res.ok) {
                        console.error(`Error listing folder ${currentFolderId}: ${res.status}`);
                        break;
                    }
                    
                    const data = await res.json();
                    const filesInFolder = data.files || [];
                    
                    for (const f of filesInFolder) {
                        if (f.mimeType === 'application/vnd.google-apps.folder') {
                            if (!scannedFolders.has(f.id) && !foldersToScan.includes(f.id)) {
                                foldersToScan.push(f.id);
                            }
                        } else {
                            allFiles.push(f);
                        }
                    }
                    
                    pageToken = data.nextPageToken || null;
                } while (pageToken);
            }
            
            // Deduplicate discovered files by ID
            const uniqueFilesMap = new Map();
            allFiles.forEach(f => {
                if (f && f.id) uniqueFilesMap.set(f.id, f);
            });
            const uniqueFiles = Array.from(uniqueFilesMap.values());

            addLog(`Discovered ${uniqueFiles.length} unique document(s) in Drive directory.`, 'success');

            if (uniqueFiles.length === 0) {
                addLog('No invoices or bills found. Sync complete.', 'success');
                setIsSyncing(false);
                return;
            }

            addLog('Cross-referencing files against Supabase database...', 'info');

            // Maintain a local mutable copy of bills to avoid stale React state references
            const currentBillsList = [...bills];

            const unprocessedFiles = uniqueFiles.filter(file => {
                const alreadyIndexed = currentBillsList.some(b => 
                    b.gdrive_file_id === file.id || 
                    (b.attachment_note && b.attachment_note.includes(file.id))
                );
                return !alreadyIndexed;
            });

            addLog(`Queue Analysis: ${uniqueFiles.length - unprocessedFiles.length} file(s) already cached. ${unprocessedFiles.length} new bill(s) require processing.`, 'info');

            if (unprocessedFiles.length === 0) {
                addLog('All files in the directory are fully synced. Ready for review!', 'success');
                setIsSyncing(false);
                toast.success('Drive Directory is fully up-to-date!');
                return;
            }

            setCurrentProgress({ current: 0, total: unprocessedFiles.length, file: '' });
            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            for (let i = 0; i < unprocessedFiles.length; i++) {
                const file = unprocessedFiles[i];
                setCurrentProgress({ current: i + 1, total: unprocessedFiles.length, file: file.name });
                
                // Double-check in case of duplicate runs or records inserted concurrently
                const isAlreadyIndexed = currentBillsList.some(b => 
                    b.gdrive_file_id === file.id || 
                    (b.attachment_note && b.attachment_note.includes(file.id))
                );
                if (isAlreadyIndexed) {
                    addLog(`[Bill ${i + 1}/${unprocessedFiles.length}] Skipping: File already indexed.`, 'warning');
                    continue;
                }

                addLog(`[Bill ${i + 1}/${unprocessedFiles.length}] Pre-downloading: ${file.name}...`, 'info');

                try {
                    const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (!fileRes.ok) throw new Error(`Failed to download ${file.name}`);

                    const blob = await fileRes.blob();
                    const isPdf = file.name.toLowerCase().endsWith('.pdf');

                    // 1. Upload file directly to Supabase Storage bucket 'company_assets' / 'vouchers'
                    addLog(`[Bill ${i + 1}/${unprocessedFiles.length}] Uploading to Supabase Storage...`, 'db');
                    const fileObj = new File([blob], file.name, { type: blob.type });
                    const publicUrl = await uploadFile('company_assets', 'vouchers', fileObj);

                    // 2. Perform OCR & Parse details with Retry Logic
                    let result = null;
                    let success = false;

                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try {
                            if (isPdf) {
                                addLog(`[Bill ${i + 1}/${unprocessedFiles.length}] Extracting text from PDF client-side...`, 'info');
                                const extractedText = await performOCR(fileObj);
                                if (!extractedText) throw new Error('No text content resolved from PDF file.');
                                
                                addLog(`[Bill ${i + 1}/${unprocessedFiles.length}] Submitting PDF content to Groq OCR parser (Attempt ${attempt}/3)...`, 'ai');
                                result = await extractBillWithGroq(extractedText, true);
                            } else {
                                addLog(`[Bill ${i + 1}/${unprocessedFiles.length}] Converting image to Base64...`, 'info');
                                const base64 = await new Promise((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => resolve(reader.result);
                                    reader.onerror = reject;
                                    reader.readAsDataURL(blob);
                                });

                                addLog(`[Bill ${i + 1}/${unprocessedFiles.length}] Submitting image to Groq Vision API (Attempt ${attempt}/3)...`, 'ai');
                                result = await extractBillWithGroq(base64, false);
                            }
                            success = true;
                            break;
                        } catch (apiError) {
                            const errMsg = apiError.message || String(apiError);
                            const isRateLimit = errMsg.toLowerCase().includes('rate limit') || 
                                                errMsg.toLowerCase().includes('tpm') || 
                                                errMsg.toLowerCase().includes('429') || 
                                                errMsg.toLowerCase().includes('too many requests') ||
                                                errMsg.toLowerCase().includes('tokens per min');

                            if (isRateLimit && attempt < 3) {
                                const backoffTime = attempt * 3500;
                                addLog(`[Rate Limit Detected] Tokens/min limit reached. Cooling down for ${(backoffTime / 1000).toFixed(1)}s before retrying...`, 'error');
                                await delay(backoffTime);
                            } else {
                                throw apiError; // Exhausted retries or a different error
                            }
                        }
                    }

                    if (!success || !result) {
                        throw new Error('Groq Vision OCR failed to return structured data.');
                    }

                    addLog(`[Bill ${i + 1}/${unprocessedFiles.length}] Extracted Details: Vendor: "${result.supplier_name}", Invoice No: "${result.invoice_no}", Total: ${result.grand_total} ${result.currency || 'SGD'}`, 'ai');

                    // Match partner supplier if possible
                    let supplierId = null;
                    if (result.supplier_name) {
                        const matched = partners.find(p => 
                            p.name.toLowerCase().includes(result.supplier_name.toLowerCase()) ||
                            (result.uen && p.uen === result.uen)
                        );
                        if (matched) {
                            supplierId = matched.id;
                            addLog(`[Bill ${i + 1}/${unprocessedFiles.length}] Linked to existing partner: ${matched.name}`, 'success');
                        }
                    }

                    // Check for duplicate invoice in existing bills database
                    if (result.invoice_no) {
                        const isDuplicate = currentBillsList.some(b => 
                            b.invoice_no && 
                            b.invoice_no.toLowerCase().trim() === result.invoice_no.toLowerCase().trim() &&
                            (
                                (b.supplier_id && supplierId && b.supplier_id === supplierId) ||
                                (b.supplier_name && result.supplier_name && b.supplier_name.toLowerCase().trim() === result.supplier_name.toLowerCase().trim())
                            )
                        );

                        if (isDuplicate) {
                            addLog(`[Bill ${i + 1}/${unprocessedFiles.length}] Skipping: Duplicate invoice detected (No: "${result.invoice_no}" for "${result.supplier_name || 'unknown supplier'}").`, 'warning');
                            await delay(600);
                            continue;
                        }
                    } else {
                        // Check for duplicate by date and amount if invoice number is missing
                        const isSimilarDuplicate = currentBillsList.some(b => 
                            b.invoice_date === result.invoice_date &&
                            (b.grand_total === result.grand_total || b.amount === result.subtotal) &&
                            (
                                (b.supplier_id && supplierId && b.supplier_id === supplierId) ||
                                (b.supplier_name && result.supplier_name && b.supplier_name.toLowerCase().trim() === result.supplier_name.toLowerCase().trim())
                            )
                        );
                        if (isSimilarDuplicate) {
                            addLog(`[Bill ${i + 1}/${unprocessedFiles.length}] Skipping: Duplicate expense with same vendor, date and amount detected.`, 'warning');
                            await delay(600);
                            continue;
                        }
                    }

                    addLog(`[Bill ${i + 1}/${unprocessedFiles.length}] Writing Draft record into Supabase...`, 'db');

                    // Save draft expense
                    const draftExpense = {
                        company_id: profile?.company_id,
                        supplier_name: result.supplier_name || file.name.split('.')[0],
                        supplier_id: supplierId,
                        description: result.description || `Scanned Invoice - ${file.name.split('.')[0]}`,
                        amount: result.subtotal || result.grand_total || 0,
                        gst_rate: 9,
                        gst_amount: result.gst_amount || 0,
                        grand_total: result.grand_total || result.subtotal || 0,
                        invoice_no: result.invoice_no || '',
                        invoice_date: result.invoice_date || new Date().toISOString().split('T')[0],
                        status: 'Pending Approval',
                        bill_url: publicUrl,
                        attachment_url: publicUrl,
                        gdrive_file_id: file.id,
                        attachment_note: `GoogleDrive File ID: ${file.id}. UEN: ${result.uen || ''}. Address: ${result.address || ''}. Phone: ${result.phone || ''}. Email: ${result.email || ''}. Website: ${result.website || ''}. Extracted via Groq Vision OCR.`
                    };

                    const { data: savedData, error: dbErr } = await supabase
                        .from('job_expenses')
                        .insert([draftExpense])
                        .select();

                    if (dbErr) throw dbErr;

                    if (savedData && savedData[0]) {
                        currentBillsList.push(savedData[0]);
                        setBills(prev => [savedData[0], ...prev]);
                    }

                    addLog(`[Bill ${i + 1}/${unprocessedFiles.length}] Saved Draft successfully.`, 'success');
                    
                    // Pace to stay within API rate limits
                    await delay(600);

                } catch (err) {
                    console.error(`Failed to process ${file.name}:`, err);
                    addLog(`[Bill ${i + 1}/${unprocessedFiles.length}] Error: ${err.message || err}`, 'error');
                    await delay(800);
                }
            }

            addLog('All files processed! Pre-indexing phase finished.', 'success');
            toast.success('Sync complete! All invoices pre-filled as database drafts.');
            fetchData();

        } catch (syncError) {
            console.error('Batch Sync Failed:', syncError);
            addLog(`Critical Sync Failure: ${syncError.message}`, 'error');
            toast.error('Sync failed: ' + syncError.message);
        } finally {
            setIsSyncing(false);
        }
    };

    // Review Modal Calculations
    const calculateTotals = (updated) => {
        const sub = parseFloat(updated.amount) || 0;
        const rate = parseFloat(updated.gst_rate) || 0;
        const gst = sub * (rate / 100);
        return {
            ...updated,
            gst_amount: gst,
            grand_total: sub + gst
        };
    };

    const handleReviewFieldChange = (field, value) => {
        setEditedBill(prev => {
            let updated = { ...prev, [field]: value };
            if (field === 'supplier_id' && value) {
                const s = partners.find(p => p.id === value);
                if (s) updated.supplier_name = s.name;
            }
            if (field === 'job_id') {
                const j = jobs.find(job => job.id === value);
                updated.job_no = j ? j.document_no : '';
            }
            if (['amount', 'gst_rate'].includes(field)) {
                updated = calculateTotals(updated);
            }
            return updated;
        });
    };

    const handleOpenReview = (bill) => {
        setSelectedDraft(bill);
        
        let initialJobNo = bill.job_no || '';
        if (!initialJobNo && bill.job_id && jobs.length > 0) {
            const j = jobs.find(job => job.id === bill.job_id);
            if (j) initialJobNo = j.document_no;
        }

        const initialBill = {
            id: bill.id,
            supplier_id: bill.supplier_id || '',
            supplier_name: bill.supplier_name || '',
            invoice_no: bill.invoice_no || '',
            invoice_date: bill.invoice_date || new Date().toISOString().split('T')[0],
            description: bill.description || '',
            amount: bill.amount || 0,
            gst_rate: bill.gst_rate || 9,
            gst_amount: bill.gst_amount || 0,
            grand_total: bill.grand_total || 0,
            job_id: bill.job_id || '',
            job_no: initialJobNo,
            bill_url: bill.bill_url || bill.attachment_url || '',
            gdrive_file_id: getDriveFileId(bill),
            attachment_note: bill.attachment_note || ''
        };
        setEditedBill(calculateTotals(initialBill));
    };

    const handleCreateSupplier = async () => {
        if (!editedBill.supplier_name) {
            toast.error('Please specify a Supplier Name.');
            return;
        }
        setIsSavingApproval(true);
        try {
            toast.loading('Creating supplier partner...', { id: 'create-supplier' });
            
            // Check if already exists just in case
            const existing = partners.find(p => p.name.toLowerCase() === editedBill.supplier_name.toLowerCase());
            if (existing) {
                toast.success('Supplier already exists!', { id: 'create-supplier' });
                handleReviewFieldChange('supplier_id', existing.id);
                return;
            }

            // Extract partner metadata parsed from attachment_note
            const note = editedBill.attachment_note || '';
            const uenMatch = note.match(/UEN:\s*([^\.]+)/i);
            const addressMatch = note.match(/Address:\s*([^\.]+)/i);
            const phoneMatch = note.match(/Phone:\s*([^\.]+)/i);
            const emailMatch = note.match(/Email:\s*([^\.]+)/i);
            const websiteMatch = note.match(/Website:\s*([^\.]+)/i);

            const newPartner = {
                company_id: profile.company_id,
                name: editedBill.supplier_name,
                types: ['Supplier'],
                status: 'Active',
                uen: (uenMatch ? uenMatch[1].trim() : '') || null,
                address: (addressMatch ? addressMatch[1].trim() : '') || null,
                phone1: (phoneMatch ? phoneMatch[1].trim() : '') || null,
                email1: (emailMatch ? emailMatch[1].trim() : '') || null,
                website: (websiteMatch ? websiteMatch[1].trim() : '') || null
            };

            const { data, error } = await supabase
                .from('partners')
                .insert([newPartner])
                .select()
                .single();

            if (error) throw error;

            toast.success('Supplier partner created successfully!', { id: 'create-supplier' });
            
            // Refresh partners list
            const partnersRes = await getPartners(profile.company_id);
            if (partnersRes) {
                setPartners(partnersRes);
            }

            // Select the newly created supplier
            handleReviewFieldChange('supplier_id', data.id);
        } catch (err) {
            console.error('Failed to create supplier:', err);
            toast.error('Failed to create supplier: ' + err.message, { id: 'create-supplier' });
        } finally {
            setIsSavingApproval(false);
        }
    };

    const handleApproveDraft = async (approvalStatus) => {
        if (!editedBill.supplier_id && !editedBill.supplier_name) {
            alert('Please select or specify a Supplier Name.');
            return;
        }

        setIsSavingApproval(true);
        try {
            toast.loading('Saving and approving expense...', { id: 'approve' });
            
            let finalSupplierId = editedBill.supplier_id;
            
            // Auto-create supplier if name entered but not created as a partner yet
            if (!finalSupplierId && editedBill.supplier_name) {
                const existing = partners.find(p => p.name.toLowerCase() === editedBill.supplier_name.toLowerCase());
                if (existing) {
                    finalSupplierId = existing.id;
                } else {
                    const { data: newP, error: pErr } = await supabase
                        .from('partners')
                        .insert([{
                            company_id: profile.company_id,
                            name: editedBill.supplier_name,
                            types: ['Supplier'],
                            status: 'Active'
                        }])
                        .select()
                        .single();
                    if (pErr) throw pErr;
                    finalSupplierId = newP.id;
                    
                    // Refresh partners local list
                    const partnersRes = await getPartners(profile.company_id);
                    if (partnersRes) setPartners(partnersRes);
                }
            }

            const payload = {
                ...editedBill,
                supplier_id: finalSupplierId,
                status: approvalStatus // 'Paid' or 'Unpaid'
            };

            const { data, error } = await saveJobExpense(payload);
            if (error) throw error;

            toast.success(`Bill approved as ${approvalStatus.toUpperCase()}!`, { id: 'approve' });
            setSelectedDraft(null);
            fetchData();
        } catch (err) {
            console.error('Approval Failed:', err);
            toast.error('Approval failed: ' + err.message, { id: 'approve' });
        } finally {
            setIsSavingApproval(false);
        }
    };

    // Bulk approve selected drafts
    const bulkApprove = async (status) => {
        if (selectedDraftIds.length === 0) return;
        toast.loading('Bulk approving drafts...', { id: 'bulk' });
        try {
            for (const id of selectedDraftIds) {
                const bill = bills.find(b => b.id === id);
                if (!bill) continue;
                const payload = { ...bill, status };
                const { error } = await saveJobExpense(payload);
                if (error) throw error;
            }
            toast.success('Bulk approve completed.', { id: 'bulk' });
            setSelectedDraftIds([]);
            fetchData();
        } catch (err) {
            console.error('Bulk approve failed:', err);
            toast.error('Bulk approve error: ' + err.message, { id: 'bulk' });
        }
    };

    const handleDeleteDraft = async (id) => {
        const msg = selectedDraft?.status === 'Pending Approval' 
            ? 'Are you sure you want to delete this parsed draft?' 
            : 'Are you sure you want to delete this bill record permanently?';
        if (!window.confirm(msg)) return;
        try {
            toast.loading(selectedDraft?.status === 'Pending Approval' ? 'Deleting draft...' : 'Deleting bill...', { id: 'delete' });
            const { error } = await deleteJobExpense(id);
            if (error) throw error;
            toast.success(selectedDraft?.status === 'Pending Approval' ? 'Draft removed.' : 'Bill deleted.', { id: 'delete' });
            setSelectedDraft(null);
            fetchData();
        } catch (err) {
            console.error('Delete failed:', err);
            toast.error('Delete failed: ' + err.message, { id: 'delete' });
        }
    };

    const handleStatusToggle = async (bill) => {
        const newStatus = bill.status === 'Paid' ? 'Unpaid' : 'Paid';
        const { data, error } = await updateExpenseStatus(bill.id, newStatus);
        if (data) {
            setBills(prev => prev.map(b => b.id === bill.id ? { ...b, status: newStatus } : b));
            toast.success(`Status updated to ${newStatus}`);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this bill record permanently?')) return;
        const { error } = await deleteJobExpense(id);
        if (!error) {
            setBills(prev => prev.filter(b => b.id !== id));
            toast.success('Bill deleted.');
        }
    };

    const handleUploadBill = async (file) => {
        return await uploadFile('company_assets', 'vouchers', file);
    };

    // Filter normal lists (excluding drafts pending approval)
    const filteredBills = bills.filter(b => {
        if (b.status === 'Pending Approval') return false;

        const matchesSearch = 
            (b.invoice_no?.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (b.partner?.name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (b.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (b.description?.toLowerCase().includes(searchQuery.toLowerCase()));
        
        if (activeTab === 'unpaid') return matchesSearch && b.status !== 'Paid';
        if (activeTab === 'paid') return matchesSearch && b.status === 'Paid';
        if (activeTab === 'all') return matchesSearch;
        return matchesSearch;
    });

    const pendingDrafts = bills.filter(b => b.status && b.status.toLowerCase().includes('pending'));


    const displayedBills = activeTab === 'pending' ? pendingDrafts : filteredBills;

    const unpaidTotal = bills
        .filter(b => b.status !== 'Paid' && b.status !== 'Pending Approval')
        .reduce((sum, b) => sum + (b.grand_total || b.amount || 0), 0);

    const monthlyTotal = bills
        .filter(b => {
            if (b.status === 'Pending Approval') return false;
            const date = new Date(b.invoice_date);
            const now = new Date();
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        })
        .reduce((sum, b) => sum + (b.grand_total || b.amount || 0), 0);

    const quarterlyTotal = bills
        .filter(b => {
            if (b.status === 'Pending Approval') return false;
            const date = new Date(b.invoice_date);
            const now = new Date();
            const getQuarter = (d) => Math.floor(d.getMonth() / 3);
            return getQuarter(date) === getQuarter(now) && date.getFullYear() === now.getFullYear();
        })
        .reduce((sum, b) => sum + (b.grand_total || b.amount || 0), 0);

    const yearlyTotal = bills
        .filter(b => {
            if (b.status === 'Pending Approval') return false;
            const date = new Date(b.invoice_date);
            const now = new Date();
            return date.getFullYear() === now.getFullYear();
        })
        .reduce((sum, b) => sum + (b.grand_total || b.amount || 0), 0);

    const grandTotal = bills
        .filter(b => b.status !== 'Pending Approval')
        .reduce((sum, b) => sum + (b.grand_total || b.amount || 0), 0);

    return (
        <div className="animate-fade-in" style={{ padding: '24px' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>Accounts Payable</h1>
                    <p style={{ color: '#64748b', marginTop: '4px' }}>Supplier Bills & GST Verification Portal</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                        className="btn btn-secondary" 
                        onClick={() => {
                            setActiveTab('scanned');
                            navigate('/accounts/bills?tab=scanned', { replace: true });
                        }}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            background: activeTab === 'scanned' ? '#f5f3ff' : undefined, 
                            borderColor: activeTab === 'scanned' ? '#c7d2fe' : undefined 
                        }}
                    >
                        <Sparkles size={18} style={{ color: '#a855f7' }} /> AI Invoice Scanner
                    </button>
                    <a 
                        href={folderLink} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="btn btn-secondary" 
                        style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            textDecoration: 'none' 
                        }}
                    >
                        <FolderOpen size={18} style={{ color: '#3b82f6' }} /> Google Drive Folder
                    </a>
                    <a 
                        href="https://console.groq.com/keys" 
                        target="_blank" 
                        rel="noreferrer" 
                        className="btn btn-secondary" 
                        style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            textDecoration: 'none' 
                        }}
                    >
                        <Sparkles size={18} style={{ color: '#f59e0b' }} /> Groq Console
                    </a>
                    <button className="btn btn-secondary" onClick={() => navigate('/gst-reporting')}>
                        <TrendingUp size={18} /> GST Summary
                    </button>
                    <button className="btn btn-primary" onClick={() => setIsAddModalOpen(true)} style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)', border: 'none' }}>
                        <Plus size={18} /> Upload New Bill
                    </button>
                </div>
            </header>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '40px' }}>
                <div className="glass-panel" style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <p style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Total Unpaid</p>
                            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ef4444', margin: 0 }}>SGD {unpaidTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h2>
                            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '8px' }}>{bills.filter(b => b.status !== 'Paid' && b.status !== 'Pending Approval').length} pending bills</p>
                        </div>
                        <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '14px' }}>
                            <Clock size={24} color="#ef4444" />
                        </div>
                    </div>
                </div>

                <div className="glass-panel" style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <p style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Expenses (Current Month)</p>
                            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>SGD {monthlyTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h2>
                            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '8px' }}>Across all projects</p>
                        </div>
                        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '14px' }}>
                            <Receipt size={24} color="#6366f1" />
                        </div>
                    </div>
                </div>

                <div className="glass-panel" style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <p style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Expenses (Current Quarter)</p>
                            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>SGD {quarterlyTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h2>
                            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '8px' }}>Active quarter expenses</p>
                        </div>
                        <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '14px' }}>
                            <Calendar size={24} color="#16a34a" />
                        </div>
                    </div>
                </div>

                <div className="glass-panel" style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <p style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Expenses (Current Year)</p>
                            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>SGD {yearlyTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h2>
                            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '8px' }}>Annual accumulated total</p>
                        </div>
                        <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '14px' }}>
                            <TrendingUp size={24} color="#3b82f6" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Tabs Header */}
            <div className="glass-panel" style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '0', overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fcfdfe' }}>
                    <div style={{ display: 'flex', gap: '24px' }}>
                        {['all', 'unpaid', 'paid', 'scanned', 'pending'].map(tab => (
                            <button 
                                key={tab}
                                onClick={() => {
                                    setActiveTab(tab);
                                    if (tab === 'scanned') {
                                        navigate('/accounts/bills?tab=scanned', { replace: true });
                                    } else {
                                        navigate('/accounts/bills', { replace: true });
                                    }
                                }}
                                style={{ 
                                    background: 'none', 
                                    border: 'none', 
                                    padding: '8px 0', 
                                    fontSize: '0.9rem', 
                                    fontWeight: 700, 
                                    color: activeTab === tab ? '#6366f1' : '#94a3b8',
                                    cursor: 'pointer',
                                    position: 'relative'
                                }}
                            >
                                {tab === 'scanned' ? 'Invoice Images' : tab === 'pending' ? 'Pending Drafts' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                                {activeTab === tab && <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, height: '2px', background: '#6366f1' }} />}
                            </button>
                        ))}
                    </div>
                    {activeTab !== 'scanned' && (
                        <div style={{ position: 'relative', width: '300px' }}>
                            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input 
                                type="text" 
                                placeholder="Search by vendor or invoice..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ 
                                    width: '100%', 
                                    padding: '10px 12px 10px 40px', 
                                    borderRadius: '10px', 
                                    border: '1px solid #e2e8f0', 
                                    fontSize: '0.85rem',
                                    outline: 'none'
                                }} 
                            />
                        </div>
                    )}
                </div>

                {activeTab !== 'scanned' ? (
                    <>
                        {activeTab === 'pending' && selectedDraftIds.length > 0 && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: '#f8fafc',
                                borderBottom: '1px solid #e2e8f0',
                                padding: '12px 24px',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <CheckSquare size={18} color="#6366f1" />
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                                        {selectedDraftIds.length} draft{selectedDraftIds.length > 1 ? 's' : ''} selected
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <button
                                        onClick={() => setSelectedDraftIds([])}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: '#64748b',
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Clear Selection
                                    </button>
                                    <button
                                        onClick={() => bulkApprove('Unpaid')}
                                        style={{
                                            background: '#6366f1',
                                            color: '#fff',
                                            border: 'none',
                                            padding: '6px 12px',
                                            borderRadius: '6px',
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <Check size={14} /> Approve as Unpaid
                                    </button>
                                    <button
                                        onClick={() => bulkApprove('Paid')}
                                        style={{
                                            background: '#10b981',
                                            color: '#fff',
                                            border: 'none',
                                            padding: '6px 12px',
                                            borderRadius: '6px',
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <CheckCircle2 size={14} /> Approve as Paid
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="table-responsive">
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ background: '#f8fafc' }}>
                                <tr>
                                    {activeTab === 'pending' ? (
                                        <th style={{ width: '40px', padding: '16px 24px', textAlign: 'center' }}>
                                            <input 
                                                type="checkbox"
                                                checked={selectedDraftIds.length === pendingDrafts.length && pendingDrafts.length > 0}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedDraftIds(pendingDrafts.map(b => b.id));
                                                    } else {
                                                        setSelectedDraftIds([]);
                                                    }
                                                }}
                                            />
                                        </th>
                                    ) : (
                                        <th style={{ width: '40px' }}></th>
                                    )}
                                    <th style={{ textAlign: 'left', padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Supplier</th>
                                <th style={{ textAlign: 'left', padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Invoice No</th>
                                <th style={{ textAlign: 'left', padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Date</th>
                                <th style={{ textAlign: 'left', padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Linked Job</th>
                                <th style={{ textAlign: 'right', padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>GST</th>
                                <th style={{ textAlign: 'right', padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Total</th>
                                <th style={{ textAlign: 'center', padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Status</th>
                                <th style={{ textAlign: 'right', padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: '60px' }}><Loader2 className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
                                ) : displayedBills.length === 0 ? (
                                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>No bills found matching your criteria.</td></tr>
                                ) : displayedBills.map(bill => (
                                    <tr 
                                        key={bill.id} 
                                        onClick={(e) => {
                                            if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.tagName === 'INPUT' || e.target.tagName === 'A' || e.target.closest('a')) {
                                                return;
                                            }
                                            if (activeTab === 'pending') {
                                                handleOpenReview(bill);
                                            }
                                        }}
                                        style={{ 
                                            borderBottom: '1px solid #f1f5f9',
                                            cursor: activeTab === 'pending' ? 'pointer' : 'default',
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseOver={(e) => {
                                            if (activeTab === 'pending') e.currentTarget.style.background = '#f8fafc';
                                        }}
                                        onMouseOut={(e) => {
                                            if (activeTab === 'pending') e.currentTarget.style.background = 'none';
                                        }}
                                    >
                                        {activeTab === 'pending' ? (
                                            <td style={{ padding: '16px 24px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                                <input 
                                                    type="checkbox"
                                                    checked={selectedDraftIds.includes(bill.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedDraftIds(prev => [...prev, bill.id]);
                                                        } else {
                                                            setSelectedDraftIds(prev => prev.filter(id => id !== bill.id));
                                                        }
                                                    }}
                                                />
                                            </td>
                                        ) : (
                                            <td style={{ padding: '16px 24px' }}></td>
                                        )}
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ fontWeight: 700, color: '#1e293b' }}>{bill.partner?.name || bill.supplier_name || 'Unknown Vendor'}</div>
                                            {bill.partner?.uen && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>GST: {bill.partner.uen}</div>}
                                        </td>
                                        <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>{bill.invoice_no || 'N/A'}</td>
                                        <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: '#475569' }}>{bill.invoice_date ? new Date(bill.invoice_date).toLocaleDateString() : '-'}</td>
                                        <td style={{ padding: '16px 24px' }}>
                                            {bill.job?.job_no ? (
                                                <button 
                                                    onClick={() => navigate(`/workflows/editor/Job/${bill.job_id}`)}
                                                    style={{ border: 'none', background: '#f1f5f9', color: '#475569', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                                                >
                                                    <Briefcase size={12} /> {bill.job.job_no}
                                                </button>
                                            ) : <span style={{ color: '#cbd5e1' }}>-</span>}
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 600, color: '#f97316' }}>SGD {bill.gst_amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 800, color: '#1e293b' }}>SGD {bill.grand_total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                            <button 
                                                onClick={() => handleStatusToggle(bill)}
                                                style={{ 
                                                    border: 'none', 
                                                    background: bill.status === 'Paid' ? '#dcfce7' : '#fef2f2', 
                                                    color: bill.status === 'Paid' ? '#15803d' : '#ef4444', 
                                                    padding: '6px 12px', 
                                                    borderRadius: '20px', 
                                                    fontSize: '0.7rem', 
                                                    fontWeight: 800, 
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}
                                            >
                                                {bill.status === 'Paid' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                                                {bill.status === 'Paid' ? 'PAID' : 'UNPAID'}
                                            </button>
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                {activeTab === 'pending' ? (
                                                    <button 
                                                        className="btn btn-primary"
                                                        onClick={() => handleOpenReview(bill)}
                                                        style={{ 
                                                            background: '#6366f1', 
                                                            color: '#fff', 
                                                            border: 'none', 
                                                            padding: '6px 12px', 
                                                            borderRadius: '6px', 
                                                            fontSize: '0.75rem', 
                                                            fontWeight: 600, 
                                                            cursor: 'pointer',
                                                            marginRight: '8px'
                                                        }}
                                                    >
                                                        Review
                                                    </button>
                                                ) : (
                                                    <button 
                                                        className="btn-icon-sm" 
                                                        onClick={() => handleOpenReview(bill)}
                                                        title="Edit Bill Details"
                                                        style={{ color: '#6366f1', borderColor: '#c7d2fe' }}
                                                    >
                                                        <Edit size={16} />
                                                    </button>
                                                )}
                                                {(bill.bill_url || bill.attachment_url) && (
                                                    <a href={bill.bill_url || bill.attachment_url} target="_blank" rel="noreferrer" className="btn-icon-sm" title="View PDF">
                                                        <FileText size={16} color="#6366f1" />
                                                    </a>
                                                )}
                                                <button className="btn-icon-sm" onClick={() => handleDelete(bill.id)} style={{ color: '#ef4444' }}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    </>
                ) : (
                    // Google Drive Scanner View
                    <div style={{ padding: '32px', background: '#f8fafc' }}>
                        {/* Configuration & Logs Console */}
                        <div style={{ display: 'grid', gridTemplateColumns: isSyncing ? '1fr 1.2fr' : '1.2fr 0.8fr', gap: '24px', marginBottom: '32px' }}>
                            <div className="glass-panel" style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Globe size={18} color="#6366f1" /> Google Drive Configurations
                                    </h2>
                                    <span style={{ 
                                        background: isDriveConnected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                                        color: isDriveConnected ? '#16a34a' : '#dc2626', 
                                        padding: '4px 10px', 
                                        borderRadius: '20px', 
                                        fontSize: '0.8rem', 
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}>
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isDriveConnected ? '#16a34a' : '#dc2626' }}></span>
                                        {isDriveConnected ? 'Connected' : 'Disconnected'}
                                    </span>
                                </div>

                                {!isDriveConnected ? (
                                    <div style={{ background: 'rgba(99, 102, 241, 0.04)', border: '1px dashed rgba(99, 102, 241, 0.2)', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                                        <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#64748b' }}>Authenticate your Google Account to authorize direct document indexing from Drive folder repositories.</p>
                                        <button 
                                            onClick={handleConnectGoogle}
                                            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}
                                        >
                                            Connect Google Account
                                        </button>
                                    </div>
                                ) : (
                                    <div>
                                        <div style={{ marginBottom: '16px' }}>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Folder Directory Shared Link / ID</label>
                                            <input 
                                                type="text" 
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                                                value={folderLink}
                                                onChange={(e) => setFolderLink(e.target.value)}
                                                placeholder="https://drive.google.com/drive/folders/..."
                                            />
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                            <button 
                                                onClick={handleOpenFolder}
                                                disabled={!folderLink}
                                                style={{ 
                                                    background: '#fff', 
                                                    border: '1px solid #6366f1', 
                                                    color: '#6366f1', 
                                                    padding: '10px 16px', 
                                                    borderRadius: '8px', 
                                                    fontWeight: 600, 
                                                    cursor: 'pointer', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: '6px',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseOver={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.05)'}
                                                onMouseOut={e => e.currentTarget.style.background = '#fff'}
                                            >
                                                <ExternalLink size={16} /> Open Folder
                                            </button>
                                            <button 
                                                onClick={handleConnectGoogle}
                                                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                            >
                                                <RefreshCw size={16} /> Reconnect
                                            </button>
                                            <button 
                                                onClick={triggerFolderSync}
                                                disabled={isSyncing || !folderLink}
                                                style={{ 
                                                    background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)', 
                                                    color: '#fff', 
                                                    border: 'none', 
                                                    padding: '10px 24px', 
                                                    borderRadius: '8px', 
                                                    fontWeight: 700, 
                                                    cursor: isSyncing ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    opacity: isSyncing ? 0.6 : 1
                                                }}
                                            >
                                                {isSyncing ? (
                                                    <>
                                                        <Loader2 size={16} className="animate-spin" /> Indexing folder...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Play size={16} /> Sync &amp; Pre-Index Folder
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Pre-indexing Pipeline Console */}
                            <div className="glass-panel" style={{ background: '#1e293b', padding: '24px', borderRadius: '16px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', height: '240px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <CircleDot size={14} className={isSyncing ? "animate-pulse" : ""} style={{ color: isSyncing ? '#a855f7' : '#64748b' }} /> Background Pre-indexing Pipeline
                                    </span>
                                    {isSyncing && (
                                        <span style={{ fontSize: '0.8rem', background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                                            Processing {currentProgress.current}/{currentProgress.total}
                                        </span>
                                    )}
                                </div>
                                
                                <div style={{ flex: 1, overflowY: 'auto', background: '#0f172a', padding: '12px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: '1.5' }}>
                                    {syncLogs.length === 0 ? (
                                        <span style={{ color: '#64748b' }}>Console idle. Click "Sync & Pre-Index Folder" to discover new scanned invoices or bills.</span>
                                    ) : (
                                        syncLogs.map((log, idx) => (
                                            <div key={idx} style={{ 
                                                marginBottom: '4px',
                                                color: log.type === 'error' ? '#ef4444' : 
                                                       log.type === 'success' ? '#22c55e' : 
                                                       log.type === 'warning' ? '#f59e0b' : 
                                                       log.type === 'ai' ? '#c084fc' : 
                                                       log.type === 'db' ? '#38bdf8' : '#94a3b8' 
                                            }}>
                                                [{log.time}] {log.message}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Scanned Bills Grid */}
                        <div style={{ marginTop: '32px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Drafts Pending Review ({pendingDrafts.length})</h3>
                            </div>

                            {loading ? (
                                <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748b' }}>
                                    <Loader2 size={36} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#6366f1' }} />
                                    <p>Loading database drafts queue...</p>
                                </div>
                            ) : pendingDrafts.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '64px 32px', background: '#fafafb', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                                    <CheckSquare size={48} color="#94a3b8" style={{ margin: '0 auto 16px auto' }} />
                                    <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#475569', margin: '0 0 4px 0' }}>Perfect Sync! Review Queue Empty</h4>
                                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>All invoices in Google Drive have been pre-indexed and approved. Click "Sync Folder" to scan for new uploads!</p>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                                    {pendingDrafts.map((draft) => {
                                        const driveId = getDriveFileId(draft);
                                        
                                        return (
                                            <div 
                                                key={draft.id}
                                                onClick={() => handleOpenReview(draft)}
                                                style={{ 
                                                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden', cursor: 'pointer',
                                                    transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                                }}
                                                onMouseOver={e => {
                                                    e.currentTarget.style.borderColor = '#6366f1';
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                }}
                                                onMouseOut={e => {
                                                    e.currentTarget.style.borderColor = '#e2e8f0';
                                                    e.currentTarget.style.transform = 'none';
                                                }}
                                            >
                                                {/* Visual File Preview */}
                                                <div style={{ position: 'relative', height: '160px', background: '#0f172a', display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
                                                    {driveId && googleAccessToken ? (
                                                        <DriveDocPreview fileId={driveId} accessToken={googleAccessToken} fileName={draft.bill_url || draft.attachment_url || draft.supplier_name} style={{ width: '100%', height: '100%' }} />
                                                    ) : (
                                                        <div style={{ margin: 'auto', textAlign: 'center', color: '#475569', fontSize: '0.85rem' }}>
                                                            <FileText size={32} style={{ margin: '0 auto 8px auto', display: 'block', color: '#64748b' }} />
                                                            Preview Restricted
                                                        </div>
                                                    )}
                                                    <span style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(234, 179, 8, 0.9)', color: '#fff', padding: '3px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700 }}>
                                                        PENDING REVIEW
                                                    </span>
                                                </div>

                                                <div style={{ padding: '16px' }}>
                                                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Building2 size={16} color="#64748b" /> {draft.supplier_name || 'Unknown supplier'}
                                                    </h4>
                                                    <p style={{ margin: '0 0 12px 0', color: '#64748b', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        Invoice: {draft.invoice_no || 'N/A'}
                                                    </p>
                                                    
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                            {draft.invoice_date ? new Date(draft.invoice_date).toLocaleDateString() : '-'}
                                                        </span>
                                                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b' }}>
                                                            SGD {draft.grand_total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Standard Upload Modal */}
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Upload Supplier Bill" icon={Plus} size="xl">
                <QuickExpenseAdd 
                    company_id={profile?.company_id}
                    partners={partners}
                    jobs={jobs}
                    onSuccess={() => {
                        setIsAddModalOpen(false);
                        fetchData();
                    }}
                    onCancel={() => setIsAddModalOpen(false)}
                    onUploadBill={handleUploadBill}
                />
            </Modal>

            {/* Detailed Double-Panel Review Modal */}
            {selectedDraft && (
                <div style={{ 
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.65)', 
                    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '24px', backdropFilter: 'blur(4px)'
                }}>
                    <div style={{ 
                        background: '#fff', borderRadius: '24px', width: '100%', maxWidth: '1200px', height: '90vh', 
                        display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' 
                    }}>
                        {/* Modal Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ background: 'rgba(99, 102, 241, 0.08)', padding: '10px', borderRadius: '12px', color: '#6366f1', display: 'flex' }}>
                                    <Receipt size={20} />
                                </span>
                                <div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                                        {selectedDraft.status === 'Pending Approval' ? 'Review Scanned Invoice Details' : 'Edit Bill Details'}
                                    </h3>
                                    <p style={{ margin: '2px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                                        {selectedDraft.status === 'Pending Approval' 
                                            ? 'Verify calculations, select supplier and job, then approve to accounts payable directory.'
                                            : 'Modify bill details, calculations, supplier, and project linkage.'}
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setSelectedDraft(null)}
                                style={{ background: '#f1f5f9', border: 'none', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', cursor: 'pointer' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body: Double-panel */}
                        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                            {/* Left Panel: Document Preview */}
                            <div style={{ flex: 1.1, background: '#0f172a', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                                {editedBill.gdrive_file_id && googleAccessToken ? (
                                    <DriveDocPreview 
                                        fileId={editedBill.gdrive_file_id} 
                                        accessToken={googleAccessToken} 
                                        fileName={selectedDraft.bill_url || selectedDraft.attachment_url || selectedDraft.supplier_name} 
                                        style={{ width: '100%', height: '100%' }} 
                                    />
                                ) : (
                                    <div style={{ margin: 'auto', textAlign: 'center', color: '#94a3b8' }}>
                                        <FileText size={64} style={{ margin: '0 auto 16px auto', display: 'block' }} />
                                        <span>Document Preview Unavailable</span>
                                    </div>
                                )}
                            </div>

                            {/* Right Panel: Edit Form */}
                            <div style={{ flex: 0.9, padding: '32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#fafafa' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                                    {/* Supplier Selector */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>Supplier *</label>
                                        <select
                                            value={editedBill.supplier_id || ''}
                                            onChange={e => handleReviewFieldChange('supplier_id', e.target.value)}
                                            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', outline: 'none', background: '#fff' }}
                                        >
                                            <option value="">-- Create new or select matching Supplier --</option>
                                            {partners.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                        {!editedBill.supplier_id && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                                                <span style={{ fontSize: '0.75rem', color: '#f97316' }}>No matching partner selected. Entering raw name:</span>
                                                <input 
                                                    type="text"
                                                    value={editedBill.supplier_name || ''}
                                                    onChange={e => handleReviewFieldChange('supplier_name', e.target.value)}
                                                    placeholder="Supplier Name"
                                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                                                />
                                                <button
                                                    onClick={handleCreateSupplier}
                                                    disabled={isSavingApproval || !editedBill.supplier_name}
                                                    style={{
                                                        background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                                                        color: '#fff',
                                                        border: 'none',
                                                        padding: '8px 16px',
                                                        borderRadius: '8px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 700,
                                                        cursor: (isSavingApproval || !editedBill.supplier_name) ? 'not-allowed' : 'pointer',
                                                        marginTop: '6px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '6px',
                                                        boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.2)'
                                                    }}
                                                >
                                                    <Plus size={14} /> Add as New Supplier Partner
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Invoice Number & Date */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>Invoice No</label>
                                            <input 
                                                type="text"
                                                value={editedBill.invoice_no || ''}
                                                onChange={e => handleReviewFieldChange('invoice_no', e.target.value)}
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>Invoice Date</label>
                                            <input 
                                                type="date"
                                                value={editedBill.invoice_date || ''}
                                                onChange={e => handleReviewFieldChange('invoice_date', e.target.value)}
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Linked Job Selection */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>Linked Job / Project</label>
                                        <select
                                            value={editedBill.job_id || ''}
                                            onChange={e => handleReviewFieldChange('job_id', e.target.value)}
                                            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', outline: 'none', background: '#fff' }}
                                        >
                                            <option value="">Unlinked (General Expense)</option>
                                            {jobs.map(j => (
                                                <option key={j.id} value={j.id}>
                                                    {j.document_no}
                                                    {j.partners?.name ? ` - ${j.partners.name}` : ''}
                                                    {j.vessels?.vessel_name ? ` (${j.vessels.vessel_name})` : ''}
                                                    {j.subject ? ` - ${j.subject}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Description */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>Description / Line Summary</label>
                                        <textarea 
                                            value={editedBill.description || ''}
                                            onChange={e => handleReviewFieldChange('description', e.target.value)}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', height: '60px', resize: 'none' }}
                                        />
                                    </div>

                                    {/* Financial Split: Subtotal, GST Rate, GST Amount, Grand Total */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>Subtotal (Before Tax)</label>
                                            <input 
                                                type="number"
                                                step="0.01"
                                                value={editedBill.amount || 0}
                                                onChange={e => handleReviewFieldChange('amount', parseFloat(e.target.value) || 0)}
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: 'bold' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>GST Rate (%)</label>
                                            <input 
                                                type="number"
                                                value={editedBill.gst_rate || 9}
                                                onChange={e => handleReviewFieldChange('gst_rate', parseFloat(e.target.value) || 0)}
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', opacity: 0.8 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>GST Tax Amount</label>
                                            <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 'bold', color: '#475569' }}>
                                                SGD {editedBill.gst_amount?.toFixed(2)}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#6366f1' }}>Grand Total (SGD)</label>
                                            <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #6366f1', background: '#f5f3ff', fontWeight: 900, color: '#4338ca', fontSize: '1.1rem' }}>
                                                SGD {editedBill.grand_total?.toFixed(2)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '24px' }}>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button 
                                            disabled={isSavingApproval}
                                            onClick={() => handleApproveDraft('Unpaid')}
                                            style={{ 
                                                flex: 1, 
                                                background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)', 
                                                color: '#fff', 
                                                border: 'none', 
                                                padding: '12px', 
                                                borderRadius: '10px', 
                                                fontWeight: 700, 
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <Check size={16} /> {selectedDraft.status === 'Pending Approval' ? 'Approve (Unpaid)' : 'Save as Unpaid'}
                                        </button>
                                        <button 
                                            disabled={isSavingApproval}
                                            onClick={() => handleApproveDraft('Paid')}
                                            style={{ 
                                                flex: 1, 
                                                background: '#10b981', 
                                                color: '#fff', 
                                                border: 'none', 
                                                padding: '12px', 
                                                borderRadius: '10px', 
                                                fontWeight: 700, 
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <CheckCircle2 size={16} /> {selectedDraft.status === 'Pending Approval' ? 'Approve (Paid)' : 'Save as Paid'}
                                        </button>
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button 
                                            onClick={() => handleDeleteDraft(editedBill.id)}
                                            style={{ 
                                                flex: 1, 
                                                background: '#fee2e2', 
                                                color: '#dc2626', 
                                                border: '1px solid #fecaca', 
                                                padding: '10px', 
                                                borderRadius: '10px', 
                                                fontWeight: 600, 
                                                cursor: 'pointer' 
                                            }}
                                        >
                                            {selectedDraft.status === 'Pending Approval' ? 'Dismiss / Delete Draft' : 'Delete Bill'}
                                        </button>
                                        <button 
                                            onClick={() => setSelectedDraft(null)}
                                            style={{ 
                                                flex: 1, 
                                                background: '#fff', 
                                                color: '#475569', 
                                                border: '1px solid #cbd5e1', 
                                                padding: '10px', 
                                                borderRadius: '10px', 
                                                fontWeight: 600, 
                                                cursor: 'pointer' 
                                            }}
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const Upload = ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
);
