import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sparkles, FolderOpen, Mail, Phone, Globe, Building2, User, Plus, Check, X, 
  ArrowLeft, CheckCircle2, Trash2, Users, Loader2, Info, Search, HelpCircle,
  UploadCloud, Image as ImageIcon, Database, RefreshCw, Layers, CheckSquare,
  AlertCircle, ChevronRight, Edit2, Play, CircleDot, ExternalLink,
  Smartphone, QrCode, Camera, Cpu, HardDrive, ArrowRightLeft, ImagePlus, RotateCcw,
  Grid, SlidersHorizontal, ListFilter, ArrowDownUp
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getPartners, getPendingPartners, savePartner, saveContact, deletePartner } from '../lib/store';
import { runDocumentPipeline } from '../lib/ai/documentPipeline';
import { connectGoogleAPI, isTokenValid } from '../lib/googleAuthService';
import { moveFile, uploadFileToDrive } from '../lib/driveService';
import { AIProviderFactory } from '../lib/ai/providerFactory';
import { stitchCardImages } from '../lib/imageStitcher';
import DriveFolderPickerModal from '../components/common/DriveFolderPickerModal';
import toast from 'react-hot-toast';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import SmartUploadPanel from '../components/upload/SmartUploadPanel';

// Secure Custom Drive Image Renderer with Resilient Fallback
const DriveImage = ({ fileId, accessToken, style, className }) => {
  const [src, setSrc] = useState('');
  const [loading, setLoading] = useState(true);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    if (!fileId) return;
    let isMounted = true;
    setLoading(true);
    setUseFallback(false);

    const token = accessToken || localStorage.getItem('google_access_token');
    
    if (token) {
      fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => {
          if (!res.ok) throw new Error('Drive API image fetch failed');
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
          if (isMounted) {
            setUseFallback(true);
            setSrc(`https://drive.google.com/thumbnail?id=${fileId}&sz=w600`);
            setLoading(false);
          }
        });
    } else {
      setUseFallback(true);
      setSrc(`https://drive.google.com/thumbnail?id=${fileId}&sz=w600`);
      setLoading(false);
    }

    return () => {
      isMounted = false;
      if (src && src.startsWith('blob:')) URL.revokeObjectURL(src);
    };
  }, [fileId, accessToken]);

  if (loading) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#94a3b8' }} className={className}>
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  return (
    <img 
      src={src} 
      onError={(e) => {
        if (!useFallback) {
          setUseFallback(true);
          e.target.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`;
        }
      }}
      style={{ ...style, objectFit: 'contain' }} 
      className={className} 
      alt="Business Card Scanned" 
    />
  );
};

export default function AiDriveCardParser() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Authentication State
  const [googleAccessToken, setGoogleAccessToken] = useState('');
  const [isDriveConnected, setIsDriveConnected] = useState(false);

  // Dynamic Source & Destination Google Drive Management
  const [sourceFolderLink, setSourceFolderLink] = useState('https://drive.google.com/drive/folders/1FopCXZKCiKTQrwExkB2D_JGm1tVWqOwU?usp=drive_link');
  const [sourceFolderId, setSourceFolderId] = useState(localStorage.getItem('gdrive_scanner_source_folder') || '1FopCXZKCiKTQrwExkB2D_JGm1tVWqOwU');
  const [sourceFolderName, setSourceFolderName] = useState(localStorage.getItem('gdrive_scanner_source_name') || 'Raw_Bus_Cards');

  const [destFolderId, setDestFolderId] = useState(localStorage.getItem('gdrive_scanner_dest_folder') || '');
  const [destFolderName, setDestFolderName] = useState(localStorage.getItem('gdrive_scanner_dest_name') || 'Merged_Bus_Cards');
  const [subfolders, setSubfolders] = useState([]);
  const [folderImageFiles, setFolderImageFiles] = useState([]); // All image files in source folder

  // Folder Picker Modal State
  const [folderPickerModal, setFolderPickerModal] = useState({ isOpen: false, mode: 'source' });

  // Multi-Provider AI API Switcher State
  const [selectedAiProvider, setSelectedAiProvider] = useState(localStorage.getItem('gdrive_scanner_ai_provider') || 'Gemini');

  // Queue Data States
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'approved'
  const [activeDirectoryPartners, setActiveDirectoryPartners] = useState([]);
  const [pendingDrafts, setPendingDrafts] = useState([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);

  // Batch Sync Pipeline States
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState([]);
  const [currentProgress, setCurrentProgress] = useState({ current: 0, total: 0, file: '' });

  const [showSmartUpload, setShowSmartUpload] = useState(false);
  const [qrModal, setQrModal] = useState({ isOpen: false, folderId: null, folderName: '' });
  const [uploadingMobileFile, setUploadingMobileFile] = useState(false);
  const mobileUploadInputRef = useRef(null);

  // Interactive Review & Manual Card Pairing State
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [selectedBackFileId, setSelectedBackFileId] = useState('');
  const [stitchLayout, setStitchLayout] = useState('side-by-side'); // 'side-by-side' | 'vertical'
  const [backCardSearch, setBackCardSearch] = useState('');
  const [backCardFilterMode, setBackCardFilterMode] = useState('sequential'); // 'sequential' | 'all'
  const [isGridExplorerOpen, setIsGridExplorerOpen] = useState(false);
  const [isReparsingPair, setIsReparsingPair] = useState(false);

  const [editedPartner, setEditedPartner] = useState({
    name: '', weblink: '', country: 'Singapore', city: '', address: '', phone1: '', email1: '', uen: '', types: ['Supplier'],
    brand: '', brands: '', business_scope: '', notes: '', google_drive_link: '', business_card_url: '', business_card_back_url: ''
  });
  const [editedContact, setEditedContact] = useState({
    name: '', email: '', handphone: '', post: 'Representative', department: 'Operations'
  });
  const [isSavingApproval, setIsSavingApproval] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('az');

  const sortItems = (items) => {
    return [...items].sort((a, b) => {
      if (sortBy === 'az') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'za') return (b.name || '').localeCompare(a.name || '');
      if (sortBy === 'lastScan') {
        const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
        const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
        return dateB - dateA;
      }
      return 0;
    });
  };

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

        const defaultDest = folders.find(f => f.name === 'Merged_Bus_Cards') || 
                            folders.find(f => f.name === '2026_Cards_Entry') || 
                            folders.find(f => f.name.includes('Merged') || f.name.includes('Entry'));
        if (defaultDest && !localStorage.getItem('gdrive_scanner_dest_folder')) {
          setDestFolderId(defaultDest.id);
          setDestFolderName(defaultDest.name);
          localStorage.setItem('gdrive_scanner_dest_folder', defaultDest.id);
          localStorage.setItem('gdrive_scanner_dest_name', defaultDest.name);
        }
      }
    } catch (err) {
      console.error('Failed to load subfolders:', err);
    }
  };

  const loadFolderImages = async (folderId, token) => {
    if (!folderId || !token) return;
    try {
      const query = `'${folderId}' in parents and trashed = false and (` +
        `mimeType contains 'image/' or name contains '.jpg' or name contains '.jpeg' or name contains '.png' or name contains '.webp'` +
        `)`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime)&pageSize=500`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setFolderImageFiles(data.files || []);
      }
    } catch (err) {
      console.error('Failed to load folder images:', err);
    }
  };

  // Load Tokens and Data
  useEffect(() => {
    const token = localStorage.getItem('google_access_token');
    const valid = isTokenValid();
    
    if (token && valid) {
      setGoogleAccessToken(token);
      setIsDriveConnected(true);
      const resolvedId = extractFolderId(sourceFolderLink);
      loadSubfolders(resolvedId, token);
      loadFolderImages(resolvedId, token);
    } else {
      setIsDriveConnected(false);
    }

    loadActiveDirectory();
    loadDraftsQueue();
  }, []);

  useEffect(() => {
    const token = googleAccessToken || localStorage.getItem('google_access_token');
    if (token && sourceFolderLink) {
      const resolvedId = extractFolderId(sourceFolderLink);
      loadSubfolders(resolvedId, token);
      loadFolderImages(resolvedId, token);
    }
  }, [sourceFolderLink, googleAccessToken]);

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
    if (!sourceFolderLink) return;
    let targetUrl = sourceFolderLink.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://drive.google.com/drive/folders/${targetUrl}`;
    }
    window.open(targetUrl, '_blank');
  };

  const handleMobileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const token = googleAccessToken || localStorage.getItem('google_access_token');
    if (!token) {
      toast.error('Google account not connected.');
      return;
    }

    setUploadingMobileFile(true);
    toast.loading(`Uploading card "${file.name}" to ${sourceFolderName}...`, { id: 'mobile-upload' });

    try {
      const targetFolderId = sourceFolderId || extractFolderId(sourceFolderLink);
      await uploadFileToDrive(token, file, { folderId: targetFolderId });
      toast.success(`Uploaded successfully to ${sourceFolderName}!`, { id: 'mobile-upload' });
      triggerFolderSync();
    } catch (err) {
      console.error('Mobile upload failed:', err);
      toast.error('Upload failed: ' + err.message, { id: 'mobile-upload' });
    } finally {
      setUploadingMobileFile(false);
      if (mobileUploadInputRef.current) mobileUploadInputRef.current.value = '';
    }
  };

  const handleSmartUploadSelect = async (fileObj) => {
    setShowSmartUpload(false);
    const token = googleAccessToken || localStorage.getItem('google_access_token');
    if (!token) {
      toast.error('Google account not connected. Please login first.');
      return;
    }

    const targetFolderId = sourceFolderId || extractFolderId(sourceFolderLink);
    toast.loading(`Processing card file for "${sourceFolderName}"...`, { id: 'card-upload' });

    try {
      if (fileObj.isGoogleDrive) {
        if (targetFolderId && fileObj.id) {
          await moveFile(token, fileObj.id, targetFolderId);
        }
        toast.success(`Card "${fileObj.name}" linked!`, { id: 'card-upload' });
      } else {
        await uploadFileToDrive(token, fileObj, { folderId: targetFolderId });
        toast.success(`Uploaded "${fileObj.name}"!`, { id: 'card-upload' });
      }

      setTimeout(() => {
        triggerFolderSync();
      }, 500);
    } catch (err) {
      console.error('Failed to upload card via SmartUpload:', err);
      toast.error('Upload failed: ' + err.message, { id: 'card-upload' });
    }
  };

  // -------------------------------------------------------------
  // INTELLIGENT FRONT & BACK CARD PAIRING & BATCH PROCESSING LOOP
  // -------------------------------------------------------------
  const triggerFolderSync = async () => {
    const resolvedSourceId = sourceFolderId || extractFolderId(sourceFolderLink);
    if (!resolvedSourceId) {
      toast.error('Invalid Google Drive source folder link or ID.');
      return;
    }

    const token = googleAccessToken || localStorage.getItem('google_access_token');
    if (!token) {
      toast.error('Google account not connected. Please login first.');
      return;
    }

    setIsSyncing(true);
    setSyncLogs([]);
    addLog(`Starting Batch Folder Discovery using AI Provider: ${selectedAiProvider}...`, 'start');

    try {
      addLog(`Connecting to Source Folder (ID: ${resolvedSourceId})...`, 'info');

      // Fetch files recursively inside source folder
      const foldersToScan = [resolvedSourceId];
      const scannedFolders = new Set();
      const allFiles = [];

      while (foldersToScan.length > 0 && scannedFolders.size < 50) {
        const currentFolderId = foldersToScan.shift();
        if (scannedFolders.has(currentFolderId)) continue;
        scannedFolders.add(currentFolderId);

        let pageToken = null;
        do {
          const query = `'${currentFolderId}' in parents and trashed = false and (` +
            `mimeType = 'application/vnd.google-apps.folder' or ` +
            `mimeType contains 'image/' or ` +
            `name contains '.jpg' or name contains '.jpeg' or name contains '.png' or name contains '.webp'` +
            `)`;

          const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,mimeType,modifiedTime)&pageSize=500${pageToken ? `&pageToken=${pageToken}` : ''}`;
          const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });

          if (!res.ok) break;
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

      setFolderImageFiles(allFiles);
      addLog(`Discovered ${allFiles.length} total card scan image(s) in directory.`, 'success');

      // Deduplicate files
      const uniqueFilesMap = new Map();
      allFiles.forEach(f => { if (f?.id) uniqueFilesMap.set(f.id, f); });
      const uniqueFiles = Array.from(uniqueFilesMap.values());

      if (uniqueFiles.length === 0) {
        addLog('No business card images found. Sync complete.', 'success');
        setIsSyncing(false);
        return;
      }

      // Check existing drafts in database
      const existingDraftsList = await getPendingPartners(profile);
      const activePartnersList = await getPartners(profile);
      const indexedFileIds = new Set();

      [...existingDraftsList, ...activePartnersList].forEach(p => {
        if (p.info) {
          const matchFront = p.info.match(/Front:\s*([a-zA-Z0-9_-]+)/i);
          if (matchFront) indexedFileIds.add(matchFront[1]);
          const matchFileId = p.info.match(/File ID:\s*([a-zA-Z0-9_-]+)/i);
          if (matchFileId) indexedFileIds.add(matchFileId[1]);
          indexedFileIds.add(p.info);
        }
      });

      const unprocessedFiles = uniqueFiles.filter(f => !indexedFileIds.has(f.id));
      addLog(`Queue Analysis: ${uniqueFiles.length - unprocessedFiles.length} cached, ${unprocessedFiles.length} new scans to process.`, 'info');

      if (unprocessedFiles.length === 0) {
        addLog('All cards in folder are fully indexed.', 'success');
        setIsSyncing(false);
        toast.success('Drive folder is fully up-to-date!');
        loadDraftsQueue();
        return;
      }

      // Group candidate pairs
      const pairs = [];
      const pairedFileIds = new Set();

      const getBaseKey = (filename) => {
        const clean = filename.toLowerCase().replace(/\.(jpg|jpeg|png|webp)$/i, '');
        return clean.replace(/[_\-\s]?(front|back|f|b|side1|side2|a|b|1|2)$/i, '').trim();
      };

      const isBackSide = (filename) => {
        const clean = filename.toLowerCase();
        return clean.includes('back') || clean.includes('_b.') || clean.includes('_b_') || clean.includes('side2');
      };

      // Group by Naming Convention
      const nameGroups = new Map();
      unprocessedFiles.forEach(file => {
        const key = getBaseKey(file.name);
        if (!nameGroups.has(key)) nameGroups.set(key, []);
        nameGroups.get(key).push(file);
      });

      nameGroups.forEach((groupFiles, key) => {
        if (groupFiles.length >= 2) {
          const backFile = groupFiles.find(f => isBackSide(f.name)) || groupFiles[1];
          const frontFile = groupFiles.find(f => f.id !== backFile.id) || groupFiles[0];
          pairs.push({ frontFile, backFile, isPair: true, key });
          pairedFileIds.add(frontFile.id);
          pairedFileIds.add(backFile.id);
        }
      });

      // Unpaired files
      const remainingFiles = unprocessedFiles.filter(f => !pairedFileIds.has(f.id));
      for (let i = 0; i < remainingFiles.length; i++) {
        const frontFile = remainingFiles[i];
        pairs.push({ frontFile, backFile: null, isPair: false, key: frontFile.name });
      }

      addLog(`Front/Back Pairing Engine: Grouped ${unprocessedFiles.length} file(s) into ${pairs.length} candidate card set(s).`, 'ai');
      setCurrentProgress({ current: 0, total: pairs.length, file: '' });

      const delay = (ms) => new Promise(res => setTimeout(res, ms));

      // Batch Process Loop
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        const { frontFile, backFile } = pair;

        setCurrentProgress({ current: i + 1, total: pairs.length, file: frontFile.name });
        addLog(`[Card ${i + 1}/${pairs.length}] Downloading scan: ${frontFile.name}${backFile ? ` + ${backFile.name}` : ''}...`, 'info');

        try {
          const frontRes = await fetch(`https://www.googleapis.com/drive/v3/files/${frontFile.id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!frontRes.ok) throw new Error(`Failed to download ${frontFile.name}`);
          const frontBlob = await frontRes.blob();
          const frontBase64 = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onloadend = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(frontBlob);
          });

          let backBase64 = null;
          if (backFile) {
            const backRes = await fetch(`https://www.googleapis.com/drive/v3/files/${backFile.id}?alt=media`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (backRes.ok) {
              const backBlob = await backRes.blob();
              backBase64 = await new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onloadend = () => res(reader.result);
                reader.onerror = rej;
                reader.readAsDataURL(backBlob);
              });
            }
          }

          // Multimodal AI Extraction
          addLog(`[Card ${i + 1}/${pairs.length}] Executing Vision OCR via ${selectedAiProvider}...`, 'ai');
          
          let ext = null;
          try {
            if (backBase64) {
              const aiResult = await AIProviderFactory.processCardPair({
                frontImage: frontBase64,
                backImage: backBase64,
                providerName: selectedAiProvider
              });
              ext = aiResult || {};
            } else {
              const pipelineRes = await runDocumentPipeline(token, 'Raw_Bus_Cards', frontFile.id, 'image_vision', frontBase64, null);
              ext = pipelineRes?.extracted_data || {};
            }
          } catch (aiErr) {
            console.warn(`[AI Pair Extractor] Provider ${selectedAiProvider} failed, using default pipeline fallback:`, aiErr);
            const pipelineRes = await runDocumentPipeline(token, 'Raw_Bus_Cards', frontFile.id, 'image_vision', frontBase64, null);
            ext = pipelineRes?.extracted_data || {};
          }

          const partnerName = ext.company_name || ext.partner?.name || `Draft_${frontFile.name.split('.')[0]}`;
          const contactName = ext.contact?.name || ext.contact_person || '';

          // Canvas Image Stitching
          let mergedDriveLink = '';
          let mergedFileId = null;

          if (backBase64 && typeof window !== 'undefined') {
            try {
              addLog(`[Card ${i + 1}/${pairs.length}] Stitching Front & Back cards into composite image...`, 'info');
              const { blob: stitchedBlob, filename: stitchedFilename } = await stitchCardImages(
                frontBase64, backBase64,
                { companyName: partnerName, contactName: contactName, layout: stitchLayout }
              );

              const targetDestId = destFolderId || resolvedSourceId;
              const stitchedFileObj = new File([stitchedBlob], stitchedFilename, { type: 'image/jpeg' });
              const driveUploadRes = await uploadFileToDrive(token, stitchedFileObj, { folderId: targetDestId });
              
              if (driveUploadRes?.id) {
                mergedFileId = driveUploadRes.id;
                mergedDriveLink = `https://drive.google.com/file/d/${driveUploadRes.id}/view`;
                addLog(`[Card ${i + 1}/${pairs.length}] Merged image uploaded to Drive Destination Folder!`, 'success');
              }
            } catch (stitchErr) {
              console.error('Image stitching/upload failed:', stitchErr);
            }
          }

          // Save Partner Record (with explicit Front: and Back: file IDs in info)
          const draftPartner = await savePartner({
            name: partnerName,
            weblink: ext.website || ext.partner?.website || 'www.celron.net',
            country: ext.country || ext.partner?.country || 'Singapore',
            city: ext.city || ext.partner?.city || '',
            address: ext.address || ext.partner?.address || '',
            phone1: (ext.phone_numbers && ext.phone_numbers[0]) || ext.phone || ext.partner?.phone || '',
            email1: ext.email || ext.partner?.email || '',
            uen: ext.uen || ext.partner?.uen || '',
            brands: ext.brands || ext.partner?.brands || '',
            business_scope: ext.business_scope || ext.partner?.business_scope || '',
            notes: ext.notes || ext.partner?.notes || '',
            google_drive_link: mergedDriveLink,
            business_card_url: `https://drive.google.com/file/d/${frontFile.id}/view`,
            business_card_back_url: backFile ? `https://drive.google.com/file/d/${backFile.id}/view` : '',
            gdrive_folder_id: destFolderId || resolvedSourceId,
            status: 'pending_approval',
            company_id: profile?.company_id,
            types: ['Supplier'],
            info: `Front: ${frontFile.id}${backFile ? ` | Back: ${backFile.id}` : ''} | File ID: ${mergedFileId || frontFile.id}`
          });

          // Save Contact Record
          const draftContact = await saveContact({
            name: contactName || 'Representative Draft',
            email: ext.contact?.email || ext.email || '',
            handphone: (ext.phone_numbers && ext.phone_numbers[0]) || ext.contact?.handphone || '',
            phone: ext.contact?.direct_line || ext.phone || '',
            post: ext.contact?.post || ext.designation || 'Representative',
            department: ext.contact?.department || 'Operations',
            partnerId: draftPartner.id,
            company_id: profile?.company_id,
            business_card_url: `https://drive.google.com/file/d/${frontFile.id}/view`,
            business_card_back_url: backFile ? `https://drive.google.com/file/d/${backFile.id}/view` : '',
            info: `Linked to Draft Partner ID: ${draftPartner.id}`
          });

          const fullDraft = { ...draftPartner, contacts: [draftContact] };
          setPendingDrafts(prev => [fullDraft, ...prev]);

          addLog(`[Card ${i + 1}/${pairs.length}] Saved Draft for "${partnerName}" (${contactName || 'Representative'}) to Supabase.`, 'success');
          await delay(600);

        } catch (pairErr) {
          console.error(`Failed to process card ${frontFile.name}:`, pairErr);
          addLog(`[Card ${i + 1}/${pairs.length}] Error: ${pairErr.message}`, 'error');
          await delay(800);
        }
      }

      addLog('All exhibition cards processed & saved cleanly!', 'success');
      toast.success('Batch Processing Complete!');
      loadDraftsQueue();

    } catch (syncError) {
      console.error('Batch Sync Failed:', syncError);
      addLog(`Critical Sync Failure: ${syncError.message}`, 'error');
      toast.error('Sync failed: ' + syncError.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Helper getters for explicit Front and Back file IDs
  const getDriveFrontFileId = (infoString) => {
    if (!infoString) return '';
    const frontMatch = infoString.match(/Front:\s*([a-zA-Z0-9_-]+)/i);
    if (frontMatch) return frontMatch[1];
    const fileIdMatch = infoString.match(/File ID:\s*([a-zA-Z0-9_-]+)/i);
    return fileIdMatch ? fileIdMatch[1] : '';
  };

  const getDriveBackFileId = (infoString) => {
    if (!infoString) return '';
    const match = infoString.match(/Back:\s*([a-zA-Z0-9_-]+)/i);
    return match ? match[1] : '';
  };

  const getDriveFileId = (infoString) => {
    if (!infoString) return '';
    const match = infoString.match(/File ID:\s*([a-zA-Z0-9_-]+)/i);
    return match ? match[1] : '';
  };

  // -------------------------------------------------------------
  // INTERACTIVE REVIEW & MANUAL BACK CARD PAIRING / RE-PARSING
  // -------------------------------------------------------------
  const handleSelectDraft = (draft) => {
    setSelectedDraft(draft);
    
    // Extract current front and back file IDs
    const frontId = getDriveFrontFileId(draft.info);
    const backId = getDriveBackFileId(draft.info);
    setSelectedBackFileId(backId || '');
    setBackCardSearch('');
    setBackCardFilterMode('sequential');

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
      notes: draft.notes || '',
      google_drive_link: draft.google_drive_link || '',
      business_card_url: draft.business_card_url || '',
      business_card_back_url: draft.business_card_back_url || ''
    });

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

    // Ensure folder images are loaded for carousel picker
    const token = googleAccessToken || localStorage.getItem('google_access_token');
    const resolvedSourceId = sourceFolderId || extractFolderId(sourceFolderLink);
    if (token && resolvedSourceId && folderImageFiles.length === 0) {
      loadFolderImages(resolvedSourceId, token);
    }
  };

  // RE-PARSE CARD PAIR WITH AI & RE-STITCH CANVAS
  const handleReparseCardPair = async () => {
    if (!selectedDraft) return;
    const frontFileId = getDriveFrontFileId(selectedDraft.info);
    const backFileId = selectedBackFileId;

    if (!frontFileId) {
      toast.error('Front card file ID missing.');
      return;
    }

    const token = googleAccessToken || localStorage.getItem('google_access_token');
    if (!token) {
      toast.error('Google Drive token missing. Please connect Google account.');
      return;
    }

    setIsReparsingPair(true);
    toast.loading(`AI re-parsing card pair via ${selectedAiProvider}...`, { id: 'reparse' });

    try {
      // 1. Download Front Image
      const frontRes = await fetch(`https://www.googleapis.com/drive/v3/files/${frontFileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!frontRes.ok) throw new Error('Failed to download front card image');
      const frontBlob = await frontRes.blob();
      const frontBase64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(frontBlob);
      });

      // 2. Download Selected Back Image if present
      let backBase64 = null;
      if (backFileId) {
        const backRes = await fetch(`https://www.googleapis.com/drive/v3/files/${backFileId}?alt=media`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (backRes.ok) {
          const backBlob = await backRes.blob();
          backBase64 = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onloadend = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(backBlob);
          });
        }
      }

      // 3. AI Multimodal Vision Extraction
      let ext = {};
      try {
        if (backBase64) {
          const aiResult = await AIProviderFactory.processCardPair({
            frontImage: frontBase64,
            backImage: backBase64,
            providerName: selectedAiProvider
          });
          ext = aiResult || {};
        } else {
          const pipelineRes = await runDocumentPipeline(token, 'Raw_Bus_Cards', frontFileId, 'image_vision', frontBase64, null);
          ext = pipelineRes?.extracted_data || {};
        }
      } catch (aiErr) {
        console.warn(`[AI Re-parser] Provider ${selectedAiProvider} error, falling back to pipeline:`, aiErr);
        const pipelineRes = await runDocumentPipeline(token, 'Raw_Bus_Cards', frontFileId, 'image_vision', frontBase64, null);
        ext = pipelineRes?.extracted_data || {};
      }

      const partnerName = ext.company_name || ext.partner?.name || editedPartner.name;
      const contactName = ext.contact?.name || ext.contact_person || editedContact.name;

      // 4. Stitch Canvas Image (Side-by-Side or Stacked)
      let mergedDriveLink = '';
      let mergedFileId = null;

      if (backBase64) {
        toast.loading(`Stitching front & back cards (${stitchLayout === 'vertical' ? 'Stacked' : 'Side-by-Side'})...`, { id: 'reparse' });
        const { blob: stitchedBlob, filename: stitchedFilename } = await stitchCardImages(
          frontBase64, backBase64,
          { companyName: partnerName, contactName: contactName, layout: stitchLayout }
        );

        const targetDestId = destFolderId || sourceFolderId;
        const stitchedFileObj = new File([stitchedBlob], stitchedFilename, { type: 'image/jpeg' });
        const driveUploadRes = await uploadFileToDrive(token, stitchedFileObj, { folderId: targetDestId });

        if (driveUploadRes?.id) {
          mergedFileId = driveUploadRes.id;
          mergedDriveLink = `https://drive.google.com/file/d/${driveUploadRes.id}/view`;
        }
      }

      // 5. Update State and Database
      const updatedPartner = {
        ...editedPartner,
        name: partnerName,
        weblink: ext.website || ext.partner?.website || editedPartner.weblink || 'www.celron.net',
        country: ext.country || ext.partner?.country || editedPartner.country || 'Singapore',
        city: ext.city || ext.partner?.city || editedPartner.city || '',
        address: ext.address || ext.partner?.address || editedPartner.address || '',
        phone1: (ext.phone_numbers && ext.phone_numbers[0]) || ext.phone || ext.partner?.phone || editedPartner.phone1 || '',
        email1: ext.email || ext.partner?.email || editedPartner.email1 || '',
        uen: ext.uen || ext.partner?.uen || editedPartner.uen || '',
        business_scope: ext.business_scope || ext.partner?.business_scope || editedPartner.business_scope || '',
        notes: ext.notes || ext.partner?.notes || editedPartner.notes || '',
        google_drive_link: mergedDriveLink || editedPartner.google_drive_link,
        business_card_back_url: backFileId ? `https://drive.google.com/file/d/${backFileId}/view` : '',
        info: `Front: ${frontFileId}${backFileId ? ` | Back: ${backFileId}` : ''} | File ID: ${mergedFileId || frontFileId}`
      };

      const updatedContact = {
        ...editedContact,
        name: contactName || editedContact.name,
        email: ext.contact?.email || ext.email || editedContact.email,
        handphone: (ext.phone_numbers && ext.phone_numbers[0]) || ext.contact?.handphone || editedContact.handphone,
        phone: ext.contact?.direct_line || ext.phone || editedContact.phone,
        post: ext.contact?.post || ext.designation || editedContact.post || 'Representative',
        department: ext.contact?.department || editedContact.department || 'Operations',
        business_card_back_url: backFileId ? `https://drive.google.com/file/d/${backFileId}/view` : ''
      };

      setEditedPartner(updatedPartner);
      setEditedContact(updatedContact);

      // Save to Supabase
      await savePartner(updatedPartner);
      await saveContact(updatedContact);

      toast.success('Card pair re-parsed & stitched successfully!', { id: 'reparse' });
      loadDraftsQueue();
    } catch (err) {
      console.error('Reparse failed:', err);
      toast.error('Re-parse failed: ' + err.message, { id: 'reparse' });
    } finally {
      setIsReparsingPair(false);
    }
  };

  const handleApproveDraft = async () => {
    setIsSavingApproval(true);
    try {
      toast.loading('Activating Partner profile in database...', { id: 'approve' });
      const approvedPartner = await savePartner({
        ...editedPartner,
        status: 'new' // Active partner
      });

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

      // Move Drive File to destination folder if selected
      const fileId = getDriveFileId(editedPartner.info);
      const token = googleAccessToken || localStorage.getItem('google_access_token');
      if (fileId && token && destFolderId) {
        try {
          addLog(`Moving Google Drive card image ${fileId} to destination folder...`, 'info');
          await moveFile(token, fileId, destFolderId);
          toast.success('Drive file moved to target folder.', { id: 'approve-move' });
        } catch (moveErr) {
          console.error('Failed to move file:', moveErr);
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

  // Computed candidate back cards for 500+ fast search & sequential filtering
  const currentFrontFileId = selectedDraft ? getDriveFrontFileId(selectedDraft.info) : '';
  const frontFileIdx = folderImageFiles.findIndex(f => f.id === currentFrontFileId);

  const availableBackCards = folderImageFiles
    .filter(img => img.id !== currentFrontFileId) // Exclude front image itself
    .filter(img => {
      if (!backCardSearch.trim()) return true;
      const query = backCardSearch.toLowerCase().trim();
      return (img.name || '').toLowerCase().includes(query) || (img.id || '').toLowerCase().includes(query);
    })
    .filter((img) => {
      if (backCardFilterMode === 'all' || backCardSearch.trim()) return true;
      // Sequential mode: show files within ±10 index positions of front file in the folder!
      if (frontFileIdx !== -1) {
        const imgIdx = folderImageFiles.findIndex(f => f.id === img.id);
        return Math.abs(imgIdx - frontFileIdx) <= 10;
      }
      return true;
    });

  // Filter & Sort computed values for dashboard
  const filteredPendingDrafts = pendingDrafts.filter(draft => {
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
  });

  const sortedPendingDrafts = sortItems(filteredPendingDrafts);

  const filteredActivePartners = activeDirectoryPartners.filter(partner => {
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
  });

  const sortedActivePartners = sortItems(filteredActivePartners);

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
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.95rem' }}>Batch exhibition card scanner with multi-model AI routing &amp; fast 500-card manual pairing</p>
          </div>
        </div>

        {/* AI Provider Switcher Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', padding: '8px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <Cpu size={18} color="#7c3aed" />
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>AI Vision Engine:</span>
          <select
            value={selectedAiProvider}
            onChange={(e) => {
              setSelectedAiProvider(e.target.value);
              localStorage.setItem('gdrive_scanner_ai_provider', e.target.value);
              toast.success(`Switched AI Engine to: ${e.target.value}`);
            }}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#faf5ff',
              color: '#7c3aed',
              fontWeight: 700,
              fontSize: '0.85rem',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="Gemini">AI Studio (Gemini 2.5 Flash)</option>
            <option value="Ollama">Ollama (Local Vision)</option>
            <option value="DeepSeek">DeepSeek API</option>
            <option value="Groq">Groq Console API</option>
          </select>
        </div>
      </header>

      {/* TOP CONTROL GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: isSyncing ? '1fr 1.2fr' : '1.2fr 0.8fr', gap: '24px', marginBottom: '32px' }}>
        
        {/* Drive Configuration Card */}
        <div className="glass-panel" style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe size={18} color="#7c3aed" /> Dynamic Source &amp; Destination Management
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
              {/* Dynamic Source Folder Selector */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                  Source Folder (Raw Scans Repository, e.g., MarineExpo-Raw-Material)
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    className="form-input"
                    style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                    value={sourceFolderLink}
                    onChange={(e) => setSourceFolderLink(e.target.value)}
                    placeholder="Source Folder Link or ID..."
                  />
                  <button
                    onClick={() => setFolderPickerModal({ isOpen: true, mode: 'source' })}
                    style={{ background: '#f3e8ff', border: '1px solid #d8b4fe', color: '#7c3aed', padding: '10px 14px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                  >
                    <HardDrive size={16} /> Browse Tree
                  </button>
                </div>
              </div>

              {/* Dynamic Destination Folder Selector */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                  Destination Folder (Merged Composite Output, e.g., Merged_Bus_Cards)
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', background: '#fff', fontSize: '0.9rem' }}
                    value={destFolderId}
                    onChange={(e) => {
                      const selected = subfolders.find(f => f.id === e.target.value);
                      setDestFolderId(e.target.value);
                      setDestFolderName(selected ? selected.name : 'Destination Folder');
                      localStorage.setItem('gdrive_scanner_dest_folder', e.target.value);
                      if (selected) localStorage.setItem('gdrive_scanner_dest_name', selected.name);
                    }}
                  >
                    <option value="">-- Keep in Source Folder --</option>
                    {subfolders.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setFolderPickerModal({ isOpen: true, mode: 'dest' })}
                    style={{ background: '#e0f2fe', border: '1px solid #7dd3fc', color: '#0284c7', padding: '10px 14px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                  >
                    <HardDrive size={16} /> Pick Folder
                  </button>
                </div>
              </div>

              {/* Action Buttons Toolbar */}
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '12px' }}>
                <input 
                  type="file" 
                  ref={mobileUploadInputRef} 
                  onChange={handleMobileUpload} 
                  accept="image/*" 
                  capture="environment" 
                  style={{ display: 'none' }} 
                />
                <button 
                  onClick={() => setShowSmartUpload(true)}
                  disabled={!isDriveConnected || isSyncing}
                  style={{ 
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', 
                    color: '#ffffff', border: 'none', padding: '10px 18px', borderRadius: '8px', 
                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                    boxShadow: '0 2px 6px rgba(99, 102, 241, 0.3)'
                  }}
                >
                  <Sparkles size={16} /> Smart Upload Hub
                </button>
                <button 
                  onClick={() => mobileUploadInputRef.current?.click()}
                  disabled={!isDriveConnected || uploadingMobileFile || isSyncing}
                  style={{ background: '#fdf4ff', border: '1px solid #f3d8f5', color: '#a855f7', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Camera size={16} /> {uploadingMobileFile ? 'Uploading...' : 'Upload Photo'}
                </button>
                <button 
                  onClick={() => setQrModal({ isOpen: true, folderId: sourceFolderId, folderName: sourceFolderName })}
                  disabled={!isDriveConnected}
                  style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <QrCode size={16} /> Mobile Scan
                </button>
                <button 
                  onClick={handleOpenFolder}
                  disabled={!sourceFolderLink}
                  style={{ background: '#fff', border: '1px solid #7c3aed', color: '#7c3aed', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <ExternalLink size={16} /> Open Source Folder
                </button>
                <button 
                  onClick={triggerFolderSync}
                  disabled={isSyncing || !sourceFolderLink}
                  style={{ 
                    background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', 
                    color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '8px', 
                    fontWeight: 700, cursor: isSyncing ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '8px', opacity: isSyncing ? 0.6 : 1
                  }}
                >
                  {isSyncing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Batch Processing Cards...
                    </>
                  ) : (
                    <>
                      <Play size={16} /> Pair &amp; Batch Sync Cards
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sync Pipeline Console Logs */}
        <div className="glass-panel" style={{ background: '#1e293b', padding: '24px', borderRadius: '16px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', height: '260px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', tracking: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CircleDot size={14} className={isSyncing ? "text-purple-400 animate-pulse" : "text-slate-500"} /> Multi-Model Card Pairing Pipeline
            </span>
            {isSyncing && (
              <span style={{ fontSize: '0.8rem', background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                Processing {currentProgress.current}/{currentProgress.total}
              </span>
            )}
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', background: '#0f172a', padding: '12px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: '1.5' }}>
            {syncLogs.length === 0 ? (
              <span style={{ color: '#64748b' }}>Console idle. Select source/destination folders &amp; click "Pair &amp; Batch Sync Cards".</span>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  padding: '10px 36px 10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0',
                  fontSize: '0.85rem', fontWeight: 600, color: '#475569', background: '#fff', outline: 'none', cursor: 'pointer'
                }}
              >
                <option value="az">A-Z</option>
                <option value="za">Z-A</option>
                <option value="lastScan">Last Scan - First Order</option>
              </select>
            </div>

            <div style={{ position: 'relative', width: '300px' }}>
              <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text" 
                placeholder="Search by name, contact, UEN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '10px 12px 10px 40px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.85rem', outline: 'none' }}
              />
            </div>
          </div>
        </div>

        {/* Tab Content */}
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
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>All business cards in Google Drive have been pre-indexed and approved. Click "Pair &amp; Batch Sync Cards" to scan for new uploads!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '20px' }}>
              {sortedPendingDrafts.map((draft) => {
                const frontDriveId = getDriveFrontFileId(draft.info);
                const backDriveId = getDriveBackFileId(draft.info);
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
                      {frontDriveId && googleAccessToken ? (
                        <DriveImage fileId={frontDriveId} accessToken={googleAccessToken} style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <div style={{ margin: 'auto', textAlign: 'center', color: '#475569', fontSize: '0.85rem' }}>
                          <ImageIcon size={32} style={{ margin: '0 auto 8px auto', display: 'block' }} />
                          Card Preview Restricted
                        </div>
                      )}
                      <span style={{ position: 'absolute', top: '10px', right: '10px', background: backDriveId ? '#7c3aed' : 'rgba(234, 179, 8, 0.9)', color: '#fff', padding: '3px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700 }}>
                        {backDriveId ? 'STITCHED PAIR' : 'PENDING REVIEW'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDraft(draft.id);
                        }}
                        style={{
                          position: 'absolute', top: '10px', left: '10px', background: 'rgba(239, 68, 68, 0.9)', color: '#fff',
                          border: 'none', borderRadius: '8px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', zIndex: 10
                        }}
                        title="Delete draft"
                      >
                        <Trash2 size={15} />
                      </button>
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
          /* Active Directory List */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {sortedActivePartners.map((partner) => (
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
        )}

      </main>

      {/* DETAILED DOUBLE-PANEL REVIEW MODAL WITH FAST MANUAL PAIRING & STITCH LAYOUT OPTIONS */}
      {selectedDraft && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.65)', 
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '24px', backdropFilter: 'blur(4px)'
        }}>
          <div style={{ 
            background: '#fff', borderRadius: '24px', width: '100%', maxWidth: '1320px', height: '95vh', 
            display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' 
          }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 28px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ background: 'rgba(124, 58, 237, 0.08)', padding: '10px', borderRadius: '12px', color: '#7c3aed', display: 'flex' }}>
                  <Edit2 size={20} />
                </span>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Review Scanned Card Pair Draft</h3>
                  <p style={{ margin: '2px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>Select matching back card from folder, customize stitch layout &amp; re-parse with AI</p>
                </div>
              </div>

              {/* Stitch Layout Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '6px 12px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Stitch Layout:</span>
                <button
                  onClick={() => setStitchLayout('side-by-side')}
                  style={{
                    padding: '5px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: 'none',
                    background: stitchLayout === 'side-by-side' ? '#7c3aed' : '#e2e8f0',
                    color: stitchLayout === 'side-by-side' ? '#fff' : '#475569'
                  }}
                >
                  Side-by-Side ↔
                </button>
                <button
                  onClick={() => setStitchLayout('vertical')}
                  style={{
                    padding: '5px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: 'none',
                    background: stitchLayout === 'vertical' ? '#7c3aed' : '#e2e8f0',
                    color: stitchLayout === 'vertical' ? '#fff' : '#475569'
                  }}
                >
                  Stacked (Vertical) ↕
                </button>
              </div>

              <button 
                onClick={() => setSelectedDraft(null)}
                style={{ background: '#f1f5f9', border: 'none', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.2fr 1fr', overflow: 'hidden', background: '#f8fafc' }}>
              
              {/* LEFT PANEL: HD Image Viewer + Fast 500-Card Carousel & Grid Explorer */}
              <div style={{ padding: '20px 24px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
                
                {/* Section Title */}
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ImageIcon size={16} /> CARD PAIR PREVIEW ({stitchLayout === 'vertical' ? 'Stacked Layout' : 'Side-by-Side'})
                  </span>
                  {editedPartner.google_drive_link && (
                    <a href={editedPartner.google_drive_link} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontSize: '0.8rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ExternalLink size={12} /> View Merged File in Drive
                    </a>
                  )}
                </div>
                
                {/* Front Side Card Frame (Only Raw Single Front Scan) */}
                <div style={{ marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7c3aed', background: '#f3e8ff', padding: '2px 8px', borderRadius: '6px', display: 'inline-block', marginBottom: '4px' }}>
                    FRONT SIDE (Original Raw Scan)
                  </span>
                  <div style={{ height: '160px', background: '#0f172a', borderRadius: '12px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                    {getDriveFrontFileId(selectedDraft.info) && googleAccessToken ? (
                      <DriveImage fileId={getDriveFrontFileId(selectedDraft.info)} accessToken={googleAccessToken} style={{ width: '100%', height: '100%' }} />
                    ) : (
                      <div style={{ margin: 'auto', color: '#64748b', textAlign: 'center', padding: '30px' }}>Front Card Preview</div>
                    )}
                  </div>
                </div>

                {/* Back Side Card Frame */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '6px' }}>
                      BACK SIDE (Selected Back Scan)
                    </span>
                    {selectedBackFileId !== getDriveBackFileId(selectedDraft.info) && (
                      <span style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 700 }}>
                        • Selection Updated
                      </span>
                    )}
                  </div>
                  <div style={{ height: '160px', background: '#0f172a', borderRadius: '12px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                    {selectedBackFileId ? (
                      <DriveImage fileId={selectedBackFileId} accessToken={googleAccessToken} style={{ width: '100%', height: '100%' }} />
                    ) : (
                      <div style={{ margin: 'auto', color: '#94a3b8', textAlign: 'center', padding: '30px', fontSize: '0.85rem' }}>
                        No back side card selected (Single card mode)
                      </div>
                    )}
                  </div>
                </div>

                {/* ------------------------------------------------------------- */}
                {/* FAST 500-IMAGE CAROUSEL & SEARCH PANEL */}
                {/* ------------------------------------------------------------- */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '14px', borderRadius: '14px', marginBottom: '12px' }}>
                  
                  {/* Selector Header & Controls */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ImagePlus size={16} color="#7c3aed" /> SELECT BACK SIDE CARD ({folderImageFiles.length} folder images):
                    </span>
                    
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => setIsGridExplorerOpen(true)}
                        style={{ background: '#e0f2fe', border: '1px solid #7dd3fc', color: '#0284c7', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Grid size={13} /> 500-Grid Explorer
                      </button>
                      <button
                        onClick={() => setSelectedBackFileId('')}
                        style={{ 
                          background: selectedBackFileId === '' ? '#f3e8ff' : '#f1f5f9', 
                          border: selectedBackFileId === '' ? '1px solid #d8b4fe' : '1px solid #cbd5e1', 
                          color: selectedBackFileId === '' ? '#7c3aed' : '#64748b', 
                          padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' 
                        }}
                      >
                        Single Card (No Back)
                      </button>
                    </div>
                  </div>

                  {/* Filter Modes & Instant Search Box */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                      <input 
                        type="text" 
                        placeholder={`Fast Search 500 card images by file name / number...`}
                        value={backCardSearch}
                        onChange={(e) => setBackCardSearch(e.target.value)}
                        style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8rem', outline: 'none' }}
                      />
                      {backCardSearch && (
                        <button 
                          onClick={() => setBackCardSearch('')}
                          style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => setBackCardFilterMode('sequential')}
                      style={{
                        padding: '6px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: 'none', whiteSpace: 'nowrap',
                        background: backCardFilterMode === 'sequential' && !backCardSearch ? '#7c3aed' : '#f1f5f9',
                        color: backCardFilterMode === 'sequential' && !backCardSearch ? '#fff' : '#64748b'
                      }}
                      title="Show card scans taken immediately before/after front card"
                    >
                      ⭐ Sequential (±10 Scans)
                    </button>
                    <button
                      onClick={() => setBackCardFilterMode('all')}
                      style={{
                        padding: '6px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: 'none', whiteSpace: 'nowrap',
                        background: backCardFilterMode === 'all' || backCardSearch ? '#7c3aed' : '#f1f5f9',
                        color: backCardFilterMode === 'all' || backCardSearch ? '#fff' : '#64748b'
                      }}
                    >
                      All ({folderImageFiles.length})
                    </button>
                  </div>

                  {/* Horizontal Scroll Thumbnail Strip */}
                  <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px', scrollbarWidth: 'thin' }}>
                    {availableBackCards.length === 0 ? (
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8', padding: '12px', textAlign: 'center', width: '100%' }}>
                        {backCardSearch ? `No images matching "${backCardSearch}"` : 'Loading folder card thumbnails...'}
                      </div>
                    ) : (
                      availableBackCards.map(img => {
                        const isSelected = img.id === selectedBackFileId;
                        const originalIdx = folderImageFiles.findIndex(f => f.id === img.id);
                        return (
                          <div
                            key={img.id}
                            onClick={() => setSelectedBackFileId(img.id)}
                            style={{
                              flexShrink: 0, width: '115px', height: '75px', background: '#0f172a',
                              borderRadius: '8px', overflow: 'hidden', cursor: 'pointer',
                              border: isSelected ? '2.5px solid #7c3aed' : '1px solid #cbd5e1',
                              position: 'relative', transition: 'all 0.15s',
                              boxShadow: isSelected ? '0 0 10px rgba(124, 58, 237, 0.4)' : 'none'
                            }}
                            title={`Scan #${originalIdx + 1}: ${img.name}`}
                          >
                            <DriveImage fileId={img.id} accessToken={googleAccessToken} style={{ width: '100%', height: '100%' }} />
                            
                            <span style={{ position: 'absolute', bottom: '2px', left: '2px', background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: '0.65rem', padding: '1px 4px', borderRadius: '4px' }}>
                              #{originalIdx + 1}
                            </span>

                            {isSelected && (
                              <div style={{ position: 'absolute', top: '4px', right: '4px', background: '#7c3aed', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Check size={12} />
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Re-Parse with AI Action Button */}
                  <button
                    onClick={handleReparseCardPair}
                    disabled={isReparsingPair}
                    style={{
                      width: '100%', marginTop: '10px',
                      background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                      color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px',
                      fontWeight: 700, fontSize: '0.85rem', cursor: isReparsingPair ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      boxShadow: '0 2px 8px rgba(124, 58, 237, 0.3)', opacity: isReparsingPair ? 0.7 : 1
                    }}
                  >
                    {isReparsingPair ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> AI Re-parsing &amp; Re-stitching ({stitchLayout})...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} /> Re-Parse Selected Pair with AI &amp; Re-Stitch Canvas ({stitchLayout})
                      </>
                    )}
                  </button>
                </div>

              </div>

              {/* RIGHT PANEL: Edit Forms Panel */}
              <div style={{ padding: '24px', overflowY: 'auto', height: '100%' }}>
                
                {/* Partner Form */}
                <div style={{ marginBottom: '24px', background: '#fff', border: '1px solid #e2e8f0', padding: '20px', borderRadius: '16px' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Building2 size={16} color="#7c3aed" /> 1. PARTNER PROFILE (COMPANY)
                  </h4>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Company Name *</label>
                    <input 
                      type="text" 
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                      value={editedPartner.name}
                      onChange={(e) => setEditedPartner(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>UEN</label>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                        value={editedPartner.uen}
                        onChange={(e) => setEditedPartner(prev => ({ ...prev, uen: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Website Link</label>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                        value={editedPartner.weblink}
                        onChange={(e) => setEditedPartner(prev => ({ ...prev, weblink: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
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

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>HQ Address</label>
                    <textarea 
                      rows={2}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                      value={editedPartner.address}
                      onChange={(e) => setEditedPartner(prev => ({ ...prev, address: e.target.value }))}
                    />
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Product Details / Business Scope (Extracted from Back Side)</label>
                    <textarea 
                      rows={3}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                      value={editedPartner.business_scope || ''}
                      onChange={(e) => setEditedPartner(prev => ({ ...prev, business_scope: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Contact Form */}
                <div style={{ marginBottom: '24px', background: '#fff', border: '1px solid #e2e8f0', padding: '20px', borderRadius: '16px' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <User size={16} color="#a855f7" /> 2. REPRESENTATIVE PROFILE (CONTACT)
                  </h4>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Full Name *</label>
                    <input 
                      type="text" 
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                      value={editedContact.name}
                      onChange={(e) => setEditedContact(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Email</label>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                        value={editedContact.email}
                        onChange={(e) => setEditedContact(prev => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Handphone / Mobile</label>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                        value={editedContact.handphone}
                        onChange={(e) => setEditedContact(prev => ({ ...prev, handphone: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Designation / Title</label>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                        value={editedContact.post}
                        onChange={(e) => setEditedContact(prev => ({ ...prev, post: e.target.value }))}
                      />
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
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                  <button 
                    onClick={() => handleDeleteDraft(selectedDraft.id)}
                    style={{ background: '#fff', border: '1px solid #ef4444', color: '#ef4444', padding: '10px 18px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Trash2 size={16} /> Delete Draft
                  </button>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                      onClick={() => setSelectedDraft(null)}
                      style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleApproveDraft}
                      disabled={isSavingApproval || !editedPartner.name}
                      style={{ 
                        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', color: '#fff', border: 'none', 
                        padding: '10px 28px', borderRadius: '8px', fontWeight: 700, cursor: isSavingApproval ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: '8px', opacity: isSavingApproval ? 0.6 : 1
                      }}
                    >
                      {isSavingApproval ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Approve &amp; Save
                    </button>
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

      {/* 500-IMAGE THUMBNAIL GRID EXPLORER MODAL */}
      {isGridExplorerOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(6px)', zIndex: 2000, display: 'flex', flexDirection: 'column', padding: '32px' }}>
          <div style={{ background: '#fff', borderRadius: '24px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '20px 32px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Grid size={22} color="#7c3aed" /> 500-Card Folder Image Explorer
                </h3>
                <p style={{ margin: '2px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>Select matching back card scan out of {folderImageFiles.length} images in folder</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ position: 'relative', width: '320px' }}>
                  <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input 
                    type="text" 
                    placeholder="Search all 500 card images..."
                    value={backCardSearch}
                    onChange={(e) => setBackCardSearch(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px 8px 38px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.85rem', outline: 'none' }}
                  />
                </div>

                <button 
                  onClick={() => setIsGridExplorerOpen(false)}
                  style={{ background: '#f1f5f9', border: 'none', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Grid Container */}
            <div style={{ flex: 1, padding: '24px', overflowY: 'auto', background: '#0f172a' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
                {folderImageFiles
                  .filter(img => img.id !== currentFrontFileId)
                  .filter(img => {
                    if (!backCardSearch.trim()) return true;
                    return (img.name || '').toLowerCase().includes(backCardSearch.toLowerCase().trim());
                  })
                  .map((img) => {
                    const isSelected = img.id === selectedBackFileId;
                    const idx = folderImageFiles.findIndex(f => f.id === img.id);
                    return (
                      <div
                        key={img.id}
                        onClick={() => {
                          setSelectedBackFileId(img.id);
                          setIsGridExplorerOpen(false);
                          toast.success(`Selected Back Card #${idx + 1} (${img.name})`);
                        }}
                        style={{
                          height: '125px', background: '#1e293b', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer',
                          border: isSelected ? '3px solid #7c3aed' : '1px solid #334155', position: 'relative',
                          transition: 'all 0.15s'
                        }}
                        onMouseOver={e => e.currentTarget.style.borderColor = '#a855f7'}
                        onMouseOut={e => e.currentTarget.style.borderColor = isSelected ? '#7c3aed' : '#334155'}
                      >
                        <DriveImage fileId={img.id} accessToken={googleAccessToken} style={{ width: '100%', height: '100%' }} />
                        <span style={{ position: 'absolute', bottom: '6px', left: '6px', background: 'rgba(15,23,42,0.85)', color: '#fff', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          #{idx + 1}
                        </span>
                        {isSelected && (
                          <div style={{ position: 'absolute', top: '6px', right: '6px', background: '#7c3aed', color: '#fff', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={14} />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Drive Folder Picker Modal */}
      <DriveFolderPickerModal
        isOpen={folderPickerModal.isOpen}
        onClose={() => setFolderPickerModal({ isOpen: false, mode: 'source' })}
        title={folderPickerModal.mode === 'source' ? 'Select Source Card Folder' : 'Select Destination Output Folder'}
        initialFolderId={folderPickerModal.mode === 'source' ? sourceFolderId : destFolderId}
        accessToken={googleAccessToken}
        onSelectFolder={(folder) => {
          if (folderPickerModal.mode === 'source') {
            setSourceFolderId(folder.id);
            setSourceFolderName(folder.name);
            setSourceFolderLink(`https://drive.google.com/drive/folders/${folder.id}`);
            localStorage.setItem('gdrive_scanner_source_folder', folder.id);
            localStorage.setItem('gdrive_scanner_source_name', folder.name);
            toast.success(`Selected Source Folder: ${folder.name}`);
            const token = googleAccessToken || localStorage.getItem('google_access_token');
            if (token) loadFolderImages(folder.id, token);
          } else {
            setDestFolderId(folder.id);
            setDestFolderName(folder.name);
            localStorage.setItem('gdrive_scanner_dest_folder', folder.id);
            localStorage.setItem('gdrive_scanner_dest_name', folder.name);
            toast.success(`Selected Destination Folder: ${folder.name}`);
          }
        }}
      />

      {/* QR Code Modal for Mobile Upload */}
      {qrModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', maxWidth: '400px', width: '100%', padding: '32px', borderRadius: '24px', border: '1px solid #e2e8f0', textAlign: 'center', position: 'relative' }}>
            <button 
              onClick={() => setQrModal({ isOpen: false, folderId: null, folderName: '' })}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              <X size={24} />
            </button>

            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Smartphone size={24} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>Mobile Upload Gateway</h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '24px' }}>
              Scan QR code to upload business card photos directly to <strong>{qrModal.folderName}</strong>.
            </p>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px dashed #cbd5e1', display: 'inline-block', marginBottom: '24px' }}>
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                  `${window.location.origin}/upload-media?folderId=${qrModal.folderId}&token=${googleAccessToken || localStorage.getItem('google_access_token')}&jobName=${encodeURIComponent(qrModal.folderName)}`
                )}`}
                alt="Upload QR Code"
                style={{ width: '200px', height: '200px', display: 'block' }}
              />
            </div>

            <button 
              style={{ width: '100%', background: '#7c3aed', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer' }}
              onClick={() => setQrModal({ isOpen: false, folderId: null, folderName: '' })}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {showSmartUpload && (
        <SmartUploadPanel
          isOpen={showSmartUpload}
          onClose={() => setShowSmartUpload(false)}
          activeFolderId={sourceFolderId}
          activeFolderName={sourceFolderName}
          documentType="Business Card Image"
          accept="image/*,.pdf"
          onSelect={handleSmartUploadSelect}
        />
      )}

    </div>
  );
}
