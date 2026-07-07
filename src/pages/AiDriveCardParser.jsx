import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sparkles, FolderOpen, Mail, Phone, Globe, Building2, User, Plus, Check, X, 
  ArrowLeft, CheckCircle2, Trash2, Users, Loader2, Info, Search, HelpCircle,
  UploadCloud, Image as ImageIcon, Database, RefreshCw, Layers, CheckSquare,
  AlertCircle, ChevronRight, Edit2, Play, CircleDot, ExternalLink,
  Smartphone, QrCode, Camera
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getPartners, getPendingPartners, savePartner, saveContact, deletePartner } from '../lib/store';
import { runDocumentPipeline } from '../lib/ai/documentPipeline';
import { connectGoogleAPI, isTokenValid } from '../lib/googleAuthService';
import { moveFile, uploadFileToDrive } from '../lib/driveService';
import toast from 'react-hot-toast';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

// Secure Custom Drive Image Renderer bypassing CORS limits
const DriveImage = ({ fileId, accessToken, style, className }) => {
  const [src, setSrc] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fileId || !accessToken) return;
    
    let isMounted = true;
    setLoading(true);

    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load image');
        return res.blob();
      })
      .then(blob => {
        if (isMounted) {
          const url = URL.createObjectURL(blob);
          setSrc(url);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('Error loading Drive image:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
      if (src) URL.revokeObjectURL(src);
    };
  }, [fileId, accessToken]);

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
        <span>Failed to load card</span>
      </div>
    );
  }

  return <img src={src} style={{ ...style, objectFit: 'contain' }} className={className} alt="Business Card Scanned" />;
};

export default function AiDriveCardParser() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Authentication State
  const [googleAccessToken, setGoogleAccessToken] = useState('');
  const [isDriveConnected, setIsDriveConnected] = useState(false);

  // Folder Configuration
  const [folderLink, setFolderLink] = useState('https://drive.google.com/drive/folders/1FopCXZKCiKTQrwExkB2D_JGm1tVWqOwU?usp=drive_link');
  const [folderId, setFolderId] = useState('1FopCXZKCiKTQrwExkB2D_JGm1tVWqOwU');

  // Queue Data States
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'approved' | 'all'
  const [activeDirectoryPartners, setActiveDirectoryPartners] = useState([]);
  const [pendingDrafts, setPendingDrafts] = useState([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);

  // Batch Sync Pipeline States
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState([]);
  const [currentProgress, setCurrentProgress] = useState({ current: 0, total: 0, file: '' });

  // Subfolders & Destination State
  const [subfolders, setSubfolders] = useState([]);
  const [destFolderId, setDestFolderId] = useState(localStorage.getItem('gdrive_scanner_dest_folder') || '');
  const [qrModal, setQrModal] = useState({ isOpen: false, folderId: null, folderName: '' });
  const [uploadingMobileFile, setUploadingMobileFile] = useState(false);
  const mobileUploadInputRef = useRef(null);

  // Interactive Double-Panel Review State
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [editedPartner, setEditedPartner] = useState({
    name: '', weblink: '', country: 'Singapore', city: '', address: '', phone1: '', email1: '', uen: '', types: ['Supplier'],
    brand: '', brands: '', business_scope: '', notes: ''
  });
  const [editedContact, setEditedContact] = useState({
    name: '', email: '', handphone: '', post: 'Representative', department: 'Operations'
  });
  const [isSavingApproval, setIsSavingApproval] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadSubfolders = async (rootId, token) => {
    if (!rootId || !token) return;
    try {
      const query = `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const folders = data.files || [];
        setSubfolders(folders);
        
        const defaultDest = folders.find(f => f.name === '2026_Cards_Entry') || 
                            folders.find(f => f.name.includes('Entry') || f.name.includes('Images') || f.name.includes('Merged')) || 
                            folders.find(f => f.name.toLowerCase() !== 'raw_bus_cards');
        if (defaultDest && !localStorage.getItem('gdrive_scanner_dest_folder')) {
          setDestFolderId(defaultDest.id);
          localStorage.setItem('gdrive_scanner_dest_folder', defaultDest.id);
        }
      }
    } catch (err) {
      console.error('Failed to load subfolders:', err);
    }
  };

  // Load Tokens and Data
  useEffect(() => {
    const token = localStorage.getItem('google_access_token');
    const valid = isTokenValid();
    
    if (token && valid) {
      setGoogleAccessToken(token);
      setIsDriveConnected(true);
      const resolvedId = extractFolderId(folderLink);
      loadSubfolders(resolvedId, token);
    } else {
      setIsDriveConnected(false);
    }

    loadActiveDirectory();
    loadDraftsQueue();
  }, []);

  useEffect(() => {
    const token = googleAccessToken || localStorage.getItem('google_access_token');
    if (token && folderLink) {
      const resolvedId = extractFolderId(folderLink);
      loadSubfolders(resolvedId, token);
    }
  }, [folderLink, googleAccessToken]);

  const handleMobileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const token = googleAccessToken || localStorage.getItem('google_access_token');
    if (!token) {
      toast.error('Google account not connected.');
      return;
    }

    setUploadingMobileFile(true);
    toast.loading(`Uploading card "${file.name}" to Raw_Bus_Cards...`, { id: 'mobile-upload' });

    try {
      let targetScanFolderId = folderId;
      try {
        const checkQuery = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and (name = 'Raw_Bus_Cards' or name = 'raw_bus_cards' or name = 'Raw Bus Cards' or name = 'raw bus cards') and trashed = false`;
        const checkUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(checkQuery)}&fields=files(id,name)`;
        const checkRes = await fetch(checkUrl, { headers: { 'Authorization': `Bearer ${token}` } });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.files && checkData.files.length > 0) {
            targetScanFolderId = checkData.files[0].id;
          }
        }
      } catch (err) {
        console.error('Failed to resolve subfolder during mobile upload:', err);
      }

      await uploadFileToDrive(token, file, { folderId: targetScanFolderId });
      toast.success(`Uploaded successfully to Raw_Bus_Cards!`, { id: 'mobile-upload' });
      triggerFolderSync();
    } catch (err) {
      console.error('Mobile upload failed:', err);
      toast.error('Upload failed: ' + err.message, { id: 'mobile-upload' });
    } finally {
      setUploadingMobileFile(false);
      if (mobileUploadInputRef.current) mobileUploadInputRef.current.value = '';
    }
  };

  const addLog = (message, type = 'info') => {
    setSyncLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), message, type }]);
  };

  const loadActiveDirectory = async () => {
    try {
      const data = await getPartners(profile);
      setActiveDirectoryPartners(data);
    } catch (err) {
      console.error('Failed to load active partners:', err);
    }
  };

  const loadDraftsQueue = async () => {
    setLoadingDrafts(true);
    try {
      const data = await getPendingPartners(profile);
      setPendingDrafts(data);
    } catch (err) {
      console.error('Failed to load pending drafts:', err);
    } finally {
      setLoadingDrafts(false);
    }
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
    connectGoogleAPI('drive_card_sync');
  };

  const handleOpenFolder = () => {
    if (!folderLink) return;
    let targetUrl = folderLink.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://drive.google.com/drive/folders/${targetUrl}`;
    }
    window.open(targetUrl, '_blank');
  };

  // BACKGROUND BATCH SYNC PIPELINE
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
      // 1. Fetch files inside the folder recursively (BFS traversal)
      addLog(`Connecting to Drive Folder ID: ${resolvedId}...`);
      
      let targetScanFolderId = resolvedId;
      try {
        const checkQuery = `'${resolvedId}' in parents and mimeType = 'application/vnd.google-apps.folder' and (name = 'Raw_Bus_Cards' or name = 'raw_bus_cards' or name = 'Raw Bus Cards' or name = 'raw bus cards') and trashed = false`;
        const checkUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(checkQuery)}&fields=files(id,name)`;
        const checkRes = await fetch(checkUrl, { headers: { 'Authorization': `Bearer ${token}` } });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.files && checkData.files.length > 0) {
            targetScanFolderId = checkData.files[0].id;
            addLog(`Found specific folder "Raw_Bus_Cards" (ID: ${targetScanFolderId}). Scanning this folder only.`, 'info');
          }
        }
      } catch (err) {
        console.error('Failed to resolve Raw_Bus_Cards folder:', err);
      }

      const foldersToScan = [targetScanFolderId];
      const scannedFolders = new Set();
      const allFiles = [];
      const textFiles = [];
      
      while (foldersToScan.length > 0 && scannedFolders.size < 50) {
        const currentFolderId = foldersToScan.shift();
        if (scannedFolders.has(currentFolderId)) continue;
        scannedFolders.add(currentFolderId);
        
        addLog(`Scanning directory level... Discovered ${allFiles.length} card(s) so far.`);
        
        let pageToken = null;
        do {
          const query = `'${currentFolderId}' in parents and trashed = false and (` +
            `mimeType = 'application/vnd.google-apps.folder' or ` +
            `mimeType contains 'image/' or ` +
            `name contains '.jpg' or ` +
            `name contains '.jpeg' or ` +
            `name contains '.png' or ` +
            `name contains '.webp' or ` +
            `name contains '.txt'` +
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
            } else if (f.name.toLowerCase().endsWith('.txt')) {
              textFiles.push(f);
            } else {
              // It is an actual card image file!
              allFiles.push(f);
            }
          }
          
          pageToken = data.nextPageToken || null;
        } while (pageToken);
      }
      
      addLog(`Discovered ${allFiles.length} total card file(s) in Drive directory.`, 'success');
      
      // Deduplicate discovered files by ID
      const uniqueFilesMap = new Map();
      allFiles.forEach(f => {
        if (f && f.id) uniqueFilesMap.set(f.id, f);
      });
      const uniqueFiles = Array.from(uniqueFilesMap.values());

      const uniqueTextFilesMap = new Map();
      textFiles.forEach(f => {
        if (f && f.id) uniqueTextFilesMap.set(f.id, f);
      });
      const uniqueTextFiles = Array.from(uniqueTextFilesMap.values());

      if (uniqueFiles.length === 0) {
        addLog('No business card images found. Sync complete.', 'success');
        setIsSyncing(false);
        return;
      }

      // 2. Cross-reference with existing drafts and active profiles to avoid duplicates
      addLog('Cross-referencing files against Supabase indexed network...', 'info');
      
      // Get currently pre-indexed cards in draft state
      const existingDraftsList = await getPendingPartners(profile);
      const activePartnersList = await getPartners(profile);

      // Map indexed File IDs to quickly check
      const indexedFileIds = new Set();
      existingDraftsList.forEach(p => {
        if (p.info) {
          const match = p.info.match(/File ID:\s*([a-zA-Z0-9_-]+)/i);
          if (match) indexedFileIds.add(match[1]);
          indexedFileIds.add(p.info);
        }
      });
      activePartnersList.forEach(p => {
        if (p.info) {
          const match = p.info.match(/File ID:\s*([a-zA-Z0-9_-]+)/i);
          if (match) indexedFileIds.add(match[1]);
          indexedFileIds.add(p.info);
        }
      });

      // Find files that haven't been saved yet
      const unprocessedFiles = uniqueFiles.filter(file => {
        return !indexedFileIds.has(file.id);
      });

      addLog(`Queue Analysis: ${uniqueFiles.length - unprocessedFiles.length} file(s) already cached. ${unprocessedFiles.length} new card(s) require processing.`, 'info');

      if (unprocessedFiles.length === 0) {
        addLog('All cards in the directory are fully synced. Ready for review!', 'success');
        setIsSyncing(false);
        toast.success('Drive Directory is fully up-to-date!');
        loadDraftsQueue();
        return;
      }

      // 3. Process new files asynchronously
      setCurrentProgress({ current: 0, total: unprocessedFiles.length, file: '' });
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      for (let i = 0; i < unprocessedFiles.length; i++) {
        const file = unprocessedFiles[i];
        setCurrentProgress({ current: i + 1, total: unprocessedFiles.length, file: file.name });
        addLog(`[Card ${i + 1}/${unprocessedFiles.length}] Pre-downloading: ${file.name}...`, 'info');

        try {
          // Download file content as Blob
          const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (!fileRes.ok) {
            throw new Error(`Failed to download ${file.name}`);
          }

          const blob = await fileRes.blob();
          
          // Convert Blob to Base64 safely
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          // Check for companion PaddleOCR text file
          const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
          const companionTxt = uniqueTextFiles.find(tf => 
            tf.name.toLowerCase() === `${file.name.toLowerCase()}.txt` ||
            tf.name.toLowerCase() === `${baseName.toLowerCase()}.txt`
          );

          let extractedText = '';
          if (companionTxt) {
            try {
              addLog(`[Card ${i + 1}/${unprocessedFiles.length}] Found companion text file "${companionTxt.name}". Downloading PaddleOCR text...`, 'info');
              const txtRes = await fetch(`https://www.googleapis.com/drive/v3/files/${companionTxt.id}?alt=media`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (txtRes.ok) {
                extractedText = await txtRes.text();
                addLog(`[Card ${i + 1}/${unprocessedFiles.length}] PaddleOCR text loaded successfully (${extractedText.length} chars).`, 'success');
              }
            } catch (txtErr) {
              console.error('Failed to read companion text file:', txtErr);
            }
          }

          // OCR Extraction loop with Exponential Backoff Retry mechanism
          let pipelineResult = null;
          let success = false;

          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              if (extractedText) {
                addLog(`[Card ${i + 1}/${unprocessedFiles.length}] Processing companion text via Ingestion Pipeline (Attempt ${attempt}/3)...`, 'ai');
                pipelineResult = await runDocumentPipeline(token, 'Raw_Bus_Cards', file.id, 'text_file', extractedText, companionTxt?.id);
              } else {
                addLog(`[Card ${i + 1}/${unprocessedFiles.length}] Processing image via Ingestion Pipeline (Attempt ${attempt}/3)...`, 'ai');
                pipelineResult = await runDocumentPipeline(token, 'Raw_Bus_Cards', file.id, 'image_vision', base64, null);
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
                throw apiError; // Exhausted retries or a different API error
              }
            }
          }

          if (!success || !pipelineResult) {
            throw new Error('Ingestion Pipeline failed to return structured data.');
          }

          // Map extracted data to local partner/contact schema
          const ext = pipelineResult.extracted_data || {};
          const result = {
            partner: {
              name: ext.company_name || ext.partner?.name || `Draft_${file.name.split('.')[0]}`,
              uen: ext.uen || ext.partner?.uen || '',
              address: ext.address || ext.partner?.address || '',
              country: ext.country || ext.partner?.country || 'Singapore',
              city: ext.city || ext.partner?.city || '',
              postal_code: ext.postal_code || ext.partner?.postal_code || '',
              email: ext.email || ext.partner?.email || '',
              phone: (ext.phone_numbers && ext.phone_numbers[0]) || ext.partner?.phone || '',
              website: ext.website || ext.partner?.website || '',
              brands: ext.brands || ext.partner?.brands || '',
              business_scope: ext.business_scope || ext.partner?.business_scope || '',
              notes: ext.notes || ext.partner?.notes || ''
            },
            contact: {
              name: ext.contact_person || ext.contact?.name || '',
              email: ext.email || ext.contact?.email || '',
              handphone: (ext.phone_numbers && ext.phone_numbers[0]) || ext.contact?.handphone || '',
              post: ext.designation || ext.contact?.post || '',
              department: ext.department || ext.contact?.department || 'Other'
            }
          };

          addLog(`[Card ${i + 1}/${unprocessedFiles.length}] Pipeline routing: ${pipelineResult.confidence_metrics?.pipeline_action}. Confidence: ${pipelineResult.confidence_metrics?.confidence_score}. Company: "${result.partner.name}".`, 'ai');

          // Safety check: duplicate company name + contact email
          const isNameEmailDuplicate = existingDraftsList.some(p => 
              p.name && result.partner.name &&
              p.name.toLowerCase().trim() === result.partner.name.toLowerCase().trim() &&
              p.email1 && result.partner.email &&
              p.email1.toLowerCase().trim() === result.partner.email.toLowerCase().trim()
          );

          if (isNameEmailDuplicate) {
              addLog(`[Card ${i + 1}/${unprocessedFiles.length}] Skipping: Duplicate partner by name & email ("${result.partner.name}").`, 'warning');
              indexedFileIds.add(file.id);
              await delay(600);
              continue;
          }

          addLog(`[Card ${i + 1}/${unprocessedFiles.length}] Writing Draft record into Supabase...`, 'db');

          // Save Partner Draft
          const draftPartner = await savePartner({
            name: result.partner.name || file.name.split('.')[0],
            weblink: result.partner.website || '',
            country: result.partner.country || 'Singapore',
            city: result.partner.city || '',
            address: result.partner.address || '',
            phone1: result.partner.phone || '',
            email1: result.partner.email || '',
            uen: result.partner.uen || '',
            info: `GoogleDrive File ID: ${file.id}. Extracted via Groq Vision OCR.`,
            company_id: profile?.company_id,
            status: 'pending_approval',
            types: result.partner.types || ['Supplier'],
            brand: result.partner.brands || '',
            brands: result.partner.brands || '',
            business_scope: result.partner.business_scope || '',
            notes: result.partner.notes || ''
          });

          // Save Contact Draft linked to Partner Draft
          const draftContact = await saveContact({
            name: result.contact.name || 'Unknown Contact',
            email: result.contact.email || `pending_${Date.now()}@example.com`,
            handphone: result.contact.handphone || '',
            post: result.contact.post || 'Representative',
            department: result.contact.department || 'Operations',
            partnerId: draftPartner.id,
            company_id: profile?.company_id,
            info: `Linked to Draft Partner ID: ${draftPartner.id}`
          });

          // Add to memory list and update UI state in real-time
          const fullDraftPartner = { ...draftPartner, contacts: [draftContact] };
          existingDraftsList.push(fullDraftPartner);
          setPendingDrafts(prev => [fullDraftPartner, ...prev]);
          indexedFileIds.add(file.id);

          addLog(`[Card ${i + 1}/${unprocessedFiles.length}] Saved Draft successfully.`, 'success');

          // Standard pacing delay to stay safely under rate limits
          await delay(600);

        } catch (cardError) {
          console.error(`Failed to process ${file.name}:`, cardError);
          addLog(`[Card ${i + 1}/${unprocessedFiles.length}] Error processing file: ${cardError.message}`, 'error');
          // Delay before next file even on failure to avoid rate limit spikes
          await delay(800);
        }
      }

      addLog('All cards processed! Pre-indexing phase finished.', 'success');
      toast.success('Sync complete! All cards pre-filled as database drafts.');
      loadDraftsQueue();

    } catch (syncError) {
      console.error('Batch Sync Failed:', syncError);
      addLog(`Critical Sync Failure: ${syncError.message}`, 'error');
      toast.error('Sync failed: ' + syncError.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // INTERACTIVE REVIEW & APPROVALS
  const handleSelectDraft = (draft) => {
    setSelectedDraft(draft);
    
    // Set editable partner fields
    setEditedPartner({
      id: draft.id,
      name: draft.name || '',
      weblink: draft.weblink || '',
      country: draft.country || 'Singapore',
      city: draft.city || '',
      address: draft.address || '',
      phone1: draft.phone1 || '',
      email1: draft.email1 || '',
      uen: draft.uen || '',
      types: draft.types || ['Supplier'],
      info: draft.info || '',
      company_id: draft.company_id,
      brand: draft.brand || '',
      brands: draft.brands || '',
      business_scope: draft.business_scope || '',
      notes: draft.notes || ''
    });

    // Extract draft representative (first contact in draft relation)
    const representative = draft.contacts?.[0] || {};
    setEditedContact({
      id: representative.id || '',
      name: representative.name || '',
      email: representative.email || '',
      handphone: representative.handphone || '',
      post: representative.post || 'Representative',
      department: representative.department || 'Operations',
      partnerId: draft.id,
      company_id: draft.company_id
    });
  };

  const handleApproveDraft = async () => {
    setIsSavingApproval(true);
    try {
      // 1. Commit Partner - updating status to 'new' to activate it in core directory
      toast.loading('Activating Partner profile...', { id: 'approve' });
      const approvedPartner = await savePartner({
        ...editedPartner,
        status: 'new' // Marks it active
      });

      // 2. Commit Contact
      if (editedContact.id) {
        await saveContact({
          ...editedContact,
          partnerId: approvedPartner.id
        });
      } else {
        await saveContact({
          ...editedContact,
          partnerId: approvedPartner.id
        });
      }

      // 3. Move Google Drive File if destination folder is chosen
      const fileId = getDriveFileId(editedPartner.info);
      const token = googleAccessToken || localStorage.getItem('google_access_token');
      if (fileId && token && destFolderId) {
        try {
          addLog(`Moving Google Drive card image ${fileId} to destination folder...`, 'info');
          await moveFile(token, fileId, destFolderId);
          toast.success('Drive file moved to target folder.', { id: 'approve-move' });
        } catch (moveErr) {
          console.error('Failed to move file:', moveErr);
          toast.error('Failed to move file: ' + moveErr.message);
        }
      }

      toast.success(`Success! Authorized: ${editedPartner.name}`, { id: 'approve' });
      setSelectedDraft(null);
      loadDraftsQueue();
      loadActiveDirectory();
    } catch (err) {
      console.error('Approve failed:', err);
      toast.error('Authorization failed: ' + err.message, { id: 'approve' });
    } finally {
      setIsSavingApproval(false);
    }
  };

  const handleDeleteDraft = async (draftId) => {
    if (!window.confirm('Are you sure you want to dismiss and delete this parsed draft?')) return;
    
    try {
      toast.loading('Deleting draft...', { id: 'delete' });
      await deletePartner(draftId);
      toast.success('Draft removed.', { id: 'delete' });
      setSelectedDraft(null);
      loadDraftsQueue();
    } catch (err) {
      toast.error('Delete failed: ' + err.message, { id: 'delete' });
    }
  };

  const getDriveFileId = (infoString) => {
    if (!infoString) return '';
    const match = infoString.match(/File ID:\s*([a-zA-Z0-9_-]+)/i);
    return match ? match[1] : '';
  };

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%', padding: '32px', color: '#334155', borderRadius: '16px' }}>
      
      {/* Header Panel */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', borderBottom: '1px solid #e2e8f0', paddingBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={() => navigate('/partners')} 
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', color: '#64748b', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.2s' }}
            onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
            onMouseOut={e => e.currentTarget.style.background = '#fff'}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', padding: '8px', borderRadius: '10px', color: '#fff', display: 'flex' }}>
                <FolderOpen size={20} />
              </span>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                AI Google Drive Card Scanner
              </h1>
            </div>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.95rem' }}>Index folders of business cards automatically with OpenAI Vision OCR and verify them instantly</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <a 
            href="https://platform.deepseek.com/usage" 
            target="_blank" 
            rel="noreferrer" 
            className="btn btn-secondary" 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '8px', 
              textDecoration: 'none',
              background: '#fff',
              border: '1px solid #e2e8f0',
              padding: '10px 16px',
              borderRadius: '10px',
              fontSize: '0.9rem',
              fontWeight: 600,
              color: '#475569',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <Sparkles size={16} style={{ color: '#0d6efd' }} /> DeepSeek Platform
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
              textDecoration: 'none',
              background: '#fff',
              border: '1px solid #e2e8f0',
              padding: '10px 16px',
              borderRadius: '10px',
              fontSize: '0.9rem',
              fontWeight: 600,
              color: '#475569',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <Sparkles size={16} style={{ color: '#f59e0b' }} /> Groq Console
          </a>
        </div>
      </header>

      {/* TOP CONTROL GRID: Google Drive Connection Settings & Logs */}
      <div style={{ display: 'grid', gridTemplateColumns: isSyncing ? '1fr 1.2fr' : '1.2fr 0.8fr', gap: '24px', marginBottom: '32px' }}>
        
        {/* Drive Connection Card */}
        <div className="glass-panel" style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe size={18} color="#7c3aed" /> Google Drive Configuration
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
            <div style={{ background: 'rgba(124, 58, 237, 0.04)', border: '1px dashed rgba(124, 58, 237, 0.2)', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#64748b' }}>Authenticate your Google Account to authorize direct document indexing from Drive folder repositories.</p>
              <button 
                onClick={handleConnectGoogle}
                style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}
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
                  className="form-input"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                  value={folderLink}
                  onChange={(e) => setFolderLink(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                />
              </div>

              {isDriveConnected && subfolders.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Move Approved Cards To (Destination folder)</label>
                  <select 
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', background: '#fff', fontSize: '0.9rem' }}
                    value={destFolderId}
                    onChange={(e) => {
                      setDestFolderId(e.target.value);
                      localStorage.setItem('gdrive_scanner_dest_folder', e.target.value);
                    }}
                  >
                    <option value="">-- Do Not Move (Keep in Raw_Bus_Cards) --</option>
                    {subfolders.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <input 
                  type="file" 
                  ref={mobileUploadInputRef} 
                  onChange={handleMobileUpload} 
                  accept="image/*" 
                  capture="environment" 
                  style={{ display: 'none' }} 
                />
                <button 
                  onClick={() => mobileUploadInputRef.current?.click()}
                  disabled={!isDriveConnected || uploadingMobileFile || isSyncing}
                  style={{ 
                    background: '#fdf4ff', 
                    border: '1px solid #f3d8f5', 
                    color: '#a855f7', 
                    padding: '10px 16px', 
                    borderRadius: '8px', 
                    fontWeight: 600, 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = '#fae8ff'}
                  onMouseOut={e => e.currentTarget.style.background = '#fdf4ff'}
                  title="Capture card photo with phone camera and upload directly"
                >
                  <Camera size={16} /> {uploadingMobileFile ? 'Uploading...' : 'Upload Photo'}
                </button>
                <button 
                  onClick={() => setQrModal({ isOpen: true, folderId: folderId, folderName: 'Raw_Bus_Cards' })}
                  disabled={!isDriveConnected || !folderLink}
                  style={{ 
                    background: '#f0fdf4', 
                    border: '1px solid #bbf7d0', 
                    color: '#16a34a', 
                    padding: '10px 16px', 
                    borderRadius: '8px', 
                    fontWeight: 600, 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = '#dcfce7'}
                  onMouseOut={e => e.currentTarget.style.background = '#f0fdf4'}
                  title="Open Mobile Upload Gateway to upload business cards from your phone"
                >
                  <QrCode size={16} /> Mobile Scan
                </button>
                <button 
                  onClick={handleOpenFolder}
                  disabled={!folderLink}
                  style={{ 
                    background: '#fff', 
                    border: '1px solid #7c3aed', 
                    color: '#7c3aed', 
                    padding: '10px 16px', 
                    borderRadius: '8px', 
                    fontWeight: 600, 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(124, 58, 237, 0.05)'}
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
                    background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', 
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

        {/* Sync Pipeline Console Logs */}
        <div className="glass-panel" style={{ background: '#1e293b', padding: '24px', borderRadius: '16px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', height: '240px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', tracking: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CircleDot size={14} className={isSyncing ? "text-purple-400 animate-pulse" : "text-slate-500"} /> Background Pre-indexing Pipeline
            </span>
            {isSyncing && (
              <span style={{ fontSize: '0.8rem', background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                Processing {currentProgress.current}/{currentProgress.total}
              </span>
            )}
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', background: '#0f172a', padding: '12px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: '1.5' }}>
            {syncLogs.length === 0 ? (
              <span style={{ color: '#64748b' }}>Console idle. Click "Sync & Pre-Index Folder" to discover new business cards.</span>
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

      {/* DASHBOARD: Visual Review Cards Queue */}
      <main style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
        
        {/* Navigation Tabs and Search Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '24px' }}>
            <button 
              onClick={() => setActiveTab('pending')}
              style={{ 
                background: 'none', border: 'none', padding: '8px 4px', fontSize: '1rem', fontWeight: activeTab === 'pending' ? 700 : 500, 
                color: activeTab === 'pending' ? '#7c3aed' : '#64748b', cursor: 'pointer', borderBottom: activeTab === 'pending' ? '2px solid #7c3aed' : 'none' 
              }}
            >
              Drafts Pending Review
              <span style={{ background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', padding: '2px 8px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, marginLeft: '8px' }}>
                {pendingDrafts.length}
              </span>
            </button>
            <button 
              onClick={() => setActiveTab('approved')}
              style={{ 
                background: 'none', border: 'none', padding: '8px 4px', fontSize: '1rem', fontWeight: activeTab === 'approved' ? 700 : 500, 
                color: activeTab === 'approved' ? '#7c3aed' : '#64748b', cursor: 'pointer', borderBottom: activeTab === 'approved' ? '2px solid #7c3aed' : 'none' 
              }}
            >
              Authorized Directory
              <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, marginLeft: '8px' }}>
                {activeDirectoryPartners.length}
              </span>
            </button>
          </div>

          <div style={{ position: 'relative', width: '300px' }}>
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              placeholder="Search by name, contact, UEN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '10px 12px 10px 40px', 
                borderRadius: '10px', 
                border: '1px solid #e2e8f0', 
                fontSize: '0.85rem',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={e => e.target.style.borderColor = '#7c3aed'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>
        </div>

        {/* Tab Content: Review Queue List */}
        {loadingDrafts ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748b' }}>
            <Loader2 size={36} className="animate-spin text-purple-600" style={{ margin: '0 auto 12px auto' }} />
            <p>Loading database drafts queue...</p>
          </div>
        ) : activeTab === 'pending' ? (
          pendingDrafts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 32px', background: '#fafafb', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
              <CheckSquare size={48} color="#94a3b8" style={{ margin: '0 auto 16px auto' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#475569', margin: '0 0 4px 0' }}>Perfect Sync! Review Queue Empty</h3>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>All business cards in Google Drive have been pre-indexed and approved. Click "Sync Folder" to scan for new uploads!</p>
            </div>
          ) : pendingDrafts.filter(draft => {
            const rep = draft.contacts?.[0] || {};
            const query = searchQuery.toLowerCase();
            return (
              (draft.name || '').toLowerCase().includes(query) ||
              (draft.address || '').toLowerCase().includes(query) ||
              (draft.email1 || '').toLowerCase().includes(query) ||
              (draft.phone1 || '').toLowerCase().includes(query) ||
              (draft.uen || '').toLowerCase().includes(query) ||
              (rep.name || '').toLowerCase().includes(query) ||
              (rep.post || '').toLowerCase().includes(query) ||
              (rep.email || '').toLowerCase().includes(query) ||
              (rep.handphone || '').toLowerCase().includes(query)
            );
          }).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 32px', background: '#fafafb', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
              <Search size={48} color="#94a3b8" style={{ margin: '0 auto 16px auto' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#475569', margin: '0 0 4px 0' }}>No Cards Found</h3>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>No pending drafts match your search query "{searchQuery}".</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
              {pendingDrafts.filter(draft => {
                const rep = draft.contacts?.[0] || {};
                const query = searchQuery.toLowerCase();
                return (
                  (draft.name || '').toLowerCase().includes(query) ||
                  (draft.address || '').toLowerCase().includes(query) ||
                  (draft.email1 || '').toLowerCase().includes(query) ||
                  (draft.phone1 || '').toLowerCase().includes(query) ||
                  (draft.uen || '').toLowerCase().includes(query) ||
                  (rep.name || '').toLowerCase().includes(query) ||
                  (rep.post || '').toLowerCase().includes(query) ||
                  (rep.email || '').toLowerCase().includes(query) ||
                  (rep.handphone || '').toLowerCase().includes(query)
                );
              }).map((draft) => {
                const driveId = getDriveFileId(draft.info);
                const rep = draft.contacts?.[0] || {};
                
                return (
                  <div 
                    key={draft.id}
                    onClick={() => handleSelectDraft(draft)}
                    style={{ 
                      background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden', cursor: 'pointer',
                      transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.borderColor = '#7c3aed';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.transform = 'none';
                    }}
                  >
                    {/* Visual Card Image Preview */}
                    <div style={{ position: 'relative', height: '160px', background: '#0f172a', display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
                      {driveId && googleAccessToken ? (
                        <DriveImage fileId={driveId} accessToken={googleAccessToken} style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <div style={{ margin: 'auto', textAlign: 'center', color: '#475569', fontSize: '0.85rem' }}>
                          <ImageIcon size={32} style={{ margin: '0 auto 8px auto', display: 'block' }} />
                          Card Preview Restricted
                        </div>
                      )}
                      <span style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(234, 179, 8, 0.9)', color: '#fff', padding: '3px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700 }}>
                        PENDING REVIEW
                      </span>
                    </div>

                    <div style={{ padding: '16px' }}>
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Building2 size={16} color="#64748b" /> {draft.name}
                      </h4>
                      <p style={{ margin: '0 0 12px 0', color: '#64748b', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {draft.address || 'No Location Recorded'}
                      </p>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                        <div style={{ background: '#faf5ff', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7' }}>
                          <User size={16} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {rep.name || 'Representative Draft'}
                          </span>
                          <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {rep.post || 'Job Title'}
                          </span>
                        </div>
                        <ChevronRight size={16} color="#94a3b8" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Active Partners List */
          activeDirectoryPartners.filter(partner => {
            const query = searchQuery.toLowerCase();
            const hasContactMatch = (partner.contacts || []).some(c => 
              (c.name || '').toLowerCase().includes(query) ||
              (c.email || '').toLowerCase().includes(query) ||
              (c.handphone || '').toLowerCase().includes(query)
            );
            return (
              (partner.name || '').toLowerCase().includes(query) ||
              (partner.address || '').toLowerCase().includes(query) ||
              (partner.uen || '').toLowerCase().includes(query) ||
              (partner.weblink || '').toLowerCase().includes(query) ||
              hasContactMatch
            );
          }).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 32px', background: '#fafafb', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
              <Search size={48} color="#94a3b8" style={{ margin: '0 auto 16px auto' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#475569', margin: '0 0 4px 0' }}>No Partners Found</h3>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>No active partners match your search query "{searchQuery}".</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
              {activeDirectoryPartners.filter(partner => {
                const query = searchQuery.toLowerCase();
                const hasContactMatch = (partner.contacts || []).some(c => 
                  (c.name || '').toLowerCase().includes(query) ||
                  (c.email || '').toLowerCase().includes(query) ||
                  (c.handphone || '').toLowerCase().includes(query)
                );
                return (
                  (partner.name || '').toLowerCase().includes(query) ||
                  (partner.address || '').toLowerCase().includes(query) ||
                  (partner.uen || '').toLowerCase().includes(query) ||
                  (partner.weblink || '').toLowerCase().includes(query) ||
                  hasContactMatch
                );
              }).map((partner) => (
                <div 
                  key={partner.id}
                  style={{ 
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', 
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1e293b', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Building2 size={18} color="#7c3aed" /> {partner.name}
                    </h4>
                    <span style={{ background: '#ecfdf5', color: '#047857', padding: '3px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, display: 'inline-block', marginBottom: '12px' }}>
                      ACTIVE PARTNER
                    </span>
                    <p style={{ margin: '0 0 8px 0', color: '#64748b', fontSize: '0.85rem' }}>{partner.address || 'Singapore'}</p>
                    {partner.weblink && (
                      <a href={partner.weblink.startsWith('http') ? partner.weblink : `https://${partner.weblink}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: '#2563eb', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', marginBottom: '12px' }}>
                        <Globe size={12} /> {partner.weblink}
                      </a>
                    )}
                  </div>

                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Users size={16} color="#64748b" />
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {partner.contacts?.length || 0} representative(s) linked
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

      </main>

      {/* DETAILED DOUBLE-PANEL MODALreview/drawer */}
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
                <span style={{ background: 'rgba(124, 58, 237, 0.08)', padding: '10px', borderRadius: '12px', color: '#7c3aed', display: 'flex' }}>
                  <Edit2 size={20} />
                </span>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Review Scanned Card Draft</h3>
                  <p style={{ margin: '2px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>Perform visual verification, make profile modifications, and approve to database</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedDraft(null)}
                style={{ background: '#f1f5f9', border: 'none', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Double-Panel Content */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.1fr 1fr', overflow: 'hidden', background: '#f8fafc' }}>
              
              {/* LEFT PANEL: High-Definition Scanned Image Viewer */}
              <div style={{ padding: '32px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
                  <ImageIcon size={16} /> ORIGINAL SCANNED CARD
                </div>
                
                <div style={{ 
                  flex: 1, background: '#0f172a', borderRadius: '16px', display: 'flex', overflow: 'hidden', 
                  border: '1.5px solid #e2e8f0', padding: '16px', boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.4)' 
                }}>
                  {getDriveFileId(selectedDraft.info) && googleAccessToken ? (
                    <DriveImage 
                      fileId={getDriveFileId(selectedDraft.info)} 
                      accessToken={googleAccessToken} 
                      style={{ width: '100%', height: '100%' }} 
                    />
                  ) : (
                    <div style={{ margin: 'auto', color: '#64748b', textAlign: 'center' }}>
                      Image preview restricted
                    </div>
                  )}
                </div>
                
                <div style={{ marginTop: '16px', background: '#faf9fe', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '12px', fontSize: '0.8rem', color: '#7c3aed', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>The forms on the right have been pre-filled via OpenAI's Vision OCR model and ACRA UEN directory fallbacks. Verify all values match the printed business card accurately.</span>
                </div>
              </div>

              {/* RIGHT PANEL: Edit Forms Panel */}
              <div style={{ padding: '32px', overflowY: 'auto', height: '100%' }}>
                
                {/* Form Group 1: Company Profile (Partner) */}
                <div style={{ marginBottom: '32px', background: '#fff', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '16px' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Building2 size={16} color="#7c3aed" /> 1. PARTNER PROFILE (COMPANY)
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', margin: 0 }}>Company Name *</label>
                        {editedPartner.name && (
                          <a 
                            href={`https://www.google.com/search?q=${encodeURIComponent(editedPartner.name)}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ fontSize: '0.75rem', color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                          >
                            <Search size={12} /> Google Search
                          </a>
                        )}
                      </div>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                        value={editedPartner.name}
                        onChange={(e) => setEditedPartner(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', margin: 0 }}>Singapore UEN</label>
                        {editedPartner.uen && (
                          <a 
                            href={`https://www.sgpbusiness.com/search?q=${encodeURIComponent(editedPartner.uen)}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ fontSize: '0.75rem', color: '#7c3aed', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                          >
                            <ExternalLink size={12} /> SgpBusiness Search
                          </a>
                        )}
                      </div>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                        value={editedPartner.uen}
                        onChange={(e) => setEditedPartner(prev => ({ ...prev, uen: e.target.value }))}
                        placeholder="e.g. 201436227C"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Website Link</label>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                        value={editedPartner.weblink}
                        onChange={(e) => setEditedPartner(prev => ({ ...prev, weblink: e.target.value }))}
                        placeholder="e.g. www.ark.sg"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Office Email</label>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                        value={editedPartner.email1}
                        onChange={(e) => setEditedPartner(prev => ({ ...prev, email1: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Office Phone</label>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                        value={editedPartner.phone1}
                        onChange={(e) => setEditedPartner(prev => ({ ...prev, phone1: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Physical HQ Address</label>
                    <textarea 
                      rows={2}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem', fontFamily: 'sans-serif' }}
                      value={editedPartner.address}
                      onChange={(e) => setEditedPartner(prev => ({ ...prev, address: e.target.value }))}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Country</label>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                        value={editedPartner.country}
                        onChange={(e) => setEditedPartner(prev => ({ ...prev, country: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>City</label>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                        value={editedPartner.city}
                        onChange={(e) => setEditedPartner(prev => ({ ...prev, city: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div style={{ margin: '24px 0 16px 0', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                    <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Layers size={14} color="#7c3aed" /> Product &amp; Brands Details
                    </h5>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginBottom: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Brands Represented</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Fluke, Megger, Raychem"
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                          value={editedPartner.brands || ''}
                          onChange={(e) => setEditedPartner(prev => ({ ...prev, brands: e.target.value, brand: e.target.value }))}
                        />
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Business Scope / Product Description</label>
                        <textarea 
                          rows={2}
                          placeholder="e.g. Electrical calibration laboratory, supplier of marine test equipment"
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem', fontFamily: 'sans-serif' }}
                          value={editedPartner.business_scope || ''}
                          onChange={(e) => setEditedPartner(prev => ({ ...prev, business_scope: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ margin: '24px 0 16px 0', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Partner Notes (Rich Text Builder)</label>
                    <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
                      <ReactQuill
                        theme="snow"
                        value={editedPartner.notes || ''}
                        onChange={(content) => setEditedPartner(prev => ({ ...prev, notes: content }))}
                        modules={{
                          toolbar: [
                            ['bold', 'italic', 'underline', 'strike'],
                            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                            ['link'],
                            ['clean']
                          ]
                        }}
                        style={{ height: '150px', marginBottom: '40px' }}
                      />
                    </div>
                  </div>

                </div>

                {/* Form Group 2: Representative Profile (Contact) */}
                <div style={{ marginBottom: '32px', background: '#fff', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '16px' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <User size={16} color="#a855f7" /> 2. REPRESENTATIVE PROFILE (CONTACT)
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Full Name *</label>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                        value={editedContact.name}
                        onChange={(e) => setEditedContact(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Personal Professional Email</label>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                        value={editedContact.email}
                        onChange={(e) => setEditedContact(prev => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Direct Mobile (Handphone)</label>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                        value={editedContact.handphone}
                        onChange={(e) => setEditedContact(prev => ({ ...prev, handphone: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Job Designation / Title</label>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                        value={editedContact.post}
                        onChange={(e) => setEditedContact(prev => ({ ...prev, post: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Department</label>
                    <select 
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem', background: '#fff' }}
                      value={editedContact.department}
                      onChange={(e) => setEditedContact(prev => ({ ...prev, department: e.target.value }))}
                    >
                      <option value="Management">Management</option>
                      <option value="Sales">Sales</option>
                      <option value="Technical">Technical</option>
                      <option value="Operations">Operations</option>
                      <option value="Finance">Finance</option>
                      <option value="Safety">Safety</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                </div>

                {/* Approve & Delete Operations Block */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                  <button 
                    onClick={() => handleDeleteDraft(selectedDraft.id)}
                    style={{ 
                      background: '#fff', border: '1px solid #ef4444', color: '#ef4444', padding: '12px 20px', borderRadius: '8px', 
                      fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' 
                    }}
                  >
                    <Trash2 size={18} /> Delete Draft
                  </button>

                  <div style={{ display: 'flex', gap: '16px' }}>
                    <button 
                      onClick={() => setSelectedDraft(null)}
                      style={{ 
                        background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '12px 24px', borderRadius: '8px', 
                        fontWeight: 600, cursor: 'pointer' 
                      }}
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleApproveDraft}
                      disabled={isSavingApproval || !editedPartner.name || !editedContact.name}
                      style={{ 
                        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', 
                        color: '#fff', 
                        border: 'none', 
                        padding: '12px 32px', 
                        borderRadius: '8px', 
                        fontWeight: 700, 
                        cursor: isSavingApproval ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 10px rgba(34, 197, 94, 0.3)',
                        opacity: isSavingApproval ? 0.6 : 1
                      }}
                    >
                      {isSavingApproval ? (
                        <>
                          <Loader2 size={18} className="animate-spin" /> Saving...
                        </>
                      ) : (
                        <>
                          <Check size={18} /> Approve &amp; Save
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

      {/* QR Code Modal for Mobile Upload Gateway */}
      {qrModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass-panel animate-scale-up" style={{ background: '#fff', color: '#1e293b', maxWidth: '400px', width: '100%', padding: '32px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', textAlign: 'center', position: 'relative' }}>
            <button 
              onClick={() => setQrModal({ isOpen: false, folderId: null, folderName: '' })}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
            >
              <X size={24} />
            </button>

            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Smartphone size={24} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>Mobile Upload Gateway</h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '24px', lineHeight: '1.4' }}>
              Scan this QR code with your smartphone camera to upload files directly to your <strong>{qrModal.folderName}</strong> folder.
            </p>

            {!qrModal.folderId ? (
              <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <Loader2 size={36} className="animate-spin text-primary" />
                <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Connecting Google Drive...</span>
              </div>
            ) : (
              <div>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px dashed #cbd5e1', display: 'inline-block', marginBottom: '24px' }}>
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                      `${window.location.origin}/upload-media?folderId=${qrModal.folderId}&token=${googleAccessToken || localStorage.getItem('google_access_token')}&jobName=${encodeURIComponent(qrModal.folderName)}`
                    )}`}
                    alt="Upload QR Code"
                    style={{ width: '200px', height: '200px', display: 'block' }}
                  />
                </div>

                <div style={{ fontSize: '0.8rem', color: '#94a3b8', background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                  <Info size={14} style={{ flexShrink: 0 }} />
                  <span>Session active. QR code is valid for temporary uploading.</span>
                </div>
              </div>
            )}

            <button 
              className="btn btn-primary" 
              style={{ width: '100%', marginTop: '24px', padding: '12px', borderRadius: '12px', fontWeight: 700 }}
              onClick={() => setQrModal({ isOpen: false, folderId: null, folderName: '' })}
            >
              Done
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
