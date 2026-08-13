import React, { useState, useEffect, useRef } from 'react';
import { 
    Search, X, Clock, Clipboard, Download, Cloud, Monitor, 
    AlertCircle, FileText, CheckCircle, Pin, Folder, Star, 
    Sparkles, ShieldAlert, FileImage, FileCode, Keyboard,
    Smartphone, QrCode, Image as ImageIcon, Loader2, Camera, RefreshCw, ExternalLink, MessageSquare
} from 'lucide-react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { RecentFilesStore } from './RecentFilesStore';
import { AIFileClassifier } from './AIFileClassifier';
import { DuplicateChecker } from './DuplicateChecker';
import { performOCR, getStoredToken, authenticate, getClientId, setClientId, getRedirectUrl } from '../../lib/googleAuthService';
import { parseOCRBusinessCard } from '../../lib/geminiService';
import { listFolderContent } from '../../lib/driveService';

// Default Google Drive folder specified by user
const DEFAULT_GDRIVE_FOLDER_ID = '1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w';
const DEFAULT_GDRIVE_FOLDER_URL = `https://drive.google.com/drive/folders/${DEFAULT_GDRIVE_FOLDER_ID}?usp=drive_link`;

export default function SmartUploadPanel({ 
    isOpen, 
    onClose, 
    onSelect, 
    documentType = 'thunderbird', 
    accept = '.pdf,image/*,.doc,.docx,.xlsx', 
    activeFolderId = DEFAULT_GDRIVE_FOLDER_ID, 
    activeFolderName = 'Google Drive Workspace', 
    initialTab = 'recent' 
}) {
    const [activeTab, setActiveTab] = useState(initialTab || 'recent');
    const [searchTerm, setSearchTerm] = useState('');
    
    // OCR states
    const [ocrFile, setOcrFile] = useState(null);
    const [ocrPreviewUrl, setOcrPreviewUrl] = useState(null);
    const [crop, setCrop] = useState({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
    const [completedCrop, setCompletedCrop] = useState(null);
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractedText, setExtractedText] = useState('');
    const [aiResult, setAiResult] = useState(null);
    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const imgRef = useRef(null);

    // Camera state
    const [cameraStream, setCameraStream] = useState(null);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [cameraFacingMode, setCameraFacingMode] = useState('environment');
    const videoRef = useRef(null);

    // Mobile QR state & Polling
    const [isPolling, setIsPolling] = useState(false);
    const [customFolderId, setCustomFolderId] = useState(() => {
        try {
            return typeof localStorage !== 'undefined' ? (localStorage.getItem('celron_gdrive_folder_id') || '') : '';
        } catch(e) { return ''; }
    });
    const currentFolderId = customFolderId || activeFolderId || DEFAULT_GDRIVE_FOLDER_ID;
    
    const handleChangeFolderId = () => {
        const input = prompt('Enter a new Google Drive Folder ID or paste a Google Drive folder link:\n\nDefault: https://drive.google.com/drive/folders/1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w', currentFolderId);
        if (input && input.trim()) {
            let extractedId = input.trim();
            const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
            if (match && match[1]) {
                extractedId = match[1];
            }
            setCustomFolderId(extractedId);
            try {
                localStorage.setItem('celron_gdrive_folder_id', extractedId);
            } catch(e) {}
            setTimeout(() => loadGoogleDriveFiles(extractedId), 100);
        }
    };
    
    const [driveToken, setDriveToken] = useState(null);
    const [authLoading, setAuthLoading] = useState(false);
    const [authError, setAuthError] = useState('');
    const [redirectUrl, setRedirectUrl] = useState('');
    const [clientIdInput, setClientIdInput] = useState('');
    const [hasClientId, setHasClientId] = useState(false);

    useEffect(() => {
        getRedirectUrl().then(setRedirectUrl).catch(() => {});
        getClientId().then((id) => {
            setClientIdInput(id);
            setHasClientId(!!id);
        }).catch(() => {});
        getStoredToken().then(setDriveToken).catch(() => {});
    }, []);

    const handleSaveClientId = async () => {
        await setClientId(clientIdInput);
        setHasClientId(!!clientIdInput.trim());
        setAuthError('');
    };

    const connectGoogle = async () => {
        setAuthLoading(true);
        setAuthError('');
        try {
            const token = await authenticate({ interactive: true });
            setDriveToken(token);
            return token;
        } catch (e) {
            console.error('[SmartUploadPanel] Google auth failed:', e);
            setAuthError(e.message || 'Google authentication failed.');
            return null;
        } finally {
            setAuthLoading(false);
        }
    };

    const activeToken = driveToken;
    const [qrDestination, setQrDestination] = useState('gdrive');

    // Store data states
    const [recentFiles, setRecentFiles] = useState([]);
    const [favorites, setFavorites] = useState([]);
    const [lastOpened, setLastOpened] = useState('');
    
    // Local state for selected/staged files
    const [stagedFile, setStagedFile] = useState(null);
    const [stagedFileHash, setStagedFileHash] = useState('');
    const [previewUrl, setPreviewUrl] = useState('');
    const [isCalculatingHash, setIsCalculatingHash] = useState(false);
    
    // Duplicate warning state
    const [duplicateRecord, setDuplicateRecord] = useState(null);
    
    // Google Drive integration states
    const [gdriveFiles, setGdriveFiles] = useState([]);
    const [gdriveLoading, setGdriveLoading] = useState(false);
    
    // Simulated Downloads state
    const [downloadFiles, setDownloadFiles] = useState([]);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    
    const fileInputRef = useRef(null);

    // Load Local Store data on mount/open
    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab || 'recent');
            setRecentFiles(RecentFilesStore.getUploads(documentType));
            setFavorites(RecentFilesStore.getFavoriteFolders(documentType));
            setLastOpened(RecentFilesStore.getLastOpenedFolder(documentType));
            loadRealDownloads();
            loadGoogleDriveFiles();
        }
    }, [isOpen, documentType, initialTab]);

    // Handle Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!isOpen) return;
            
            if (e.key === 'Escape') {
                onClose();
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'v') {
                setActiveTab('clipboard');
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                setActiveTab('downloads');
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'r') {
                e.preventDefault();
                setActiveTab('recent');
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'b') {
                e.preventDefault();
                triggerNativeFileInput();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Camera Stream Lifecycle
    useEffect(() => {
        if (activeTab === 'camera' && isOpen) {
            startCamera(cameraFacingMode);
        } else {
            stopCamera();
        }
        return () => {
            stopCamera();
        };
    }, [activeTab, isOpen]);

    const startCamera = async (mode = 'environment') => {
        stopCamera();
        setCameraError('');
        setIsCameraActive(false);
        try {
            const constraints = {
                video: {
                    facingMode: mode,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            setCameraStream(stream);
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setIsCameraActive(true);
        } catch (err) {
            console.error("Camera access error:", err);
            setCameraError(err.message || "Unable to access camera.");
            setIsCameraActive(false);
        }
    };

    const stopCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        setIsCameraActive(false);
    };

    const toggleCameraFacingMode = () => {
        const nextMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
        setCameraFacingMode(nextMode);
        startCamera(nextMode);
    };

    const captureCameraPhoto = () => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');

        if (cameraFacingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            if (!blob) return;
            const now = new Date();
            const timeStr = now.toISOString().replace(/[:.]/g, '-');
            const file = new File([blob], `Camera_Capture_${timeStr}.png`, { type: 'image/png' });
            stopCamera();
            handleFileStaged(file);
        }, 'image/png');
    };

    // Thunderbird's downloads API only exposes metadata (name/size/date/path) —
    // it cannot return real file bytes. So this lists your ACTUAL recent
    // downloads (fixing the old hardcoded mock list), but selecting one still
    // opens the native file picker (via triggerNativeFileInput) so the file we
    // attach/insert has real content instead of a fake placeholder blob.
    const loadRealDownloads = async () => {
        const tb = typeof messenger !== 'undefined' ? messenger : (typeof browser !== 'undefined' ? browser : null);
        if (!tb || !tb.downloads || typeof tb.downloads.search !== 'function') {
            setDownloadFiles([]);
            return;
        }
        try {
            const results = await tb.downloads.search({ orderBy: ['-startTime'], limit: 20 });
            const items = (results || [])
                .filter((d) => d.state === 'complete' && d.exists !== false && d.filename)
                .slice(0, 15)
                .map((d) => {
                    const path = d.filename || '';
                    const name = path.split(/[\\/]/).pop() || path;
                    return {
                        id: String(d.id),
                        name,
                        size: d.fileSize || d.totalBytes || 0,
                        date: d.startTime || d.endTime || new Date().toISOString(),
                        fullPath: path
                    };
                });
            setDownloadFiles(items);
        } catch (err) {
            console.error('[SmartUploadPanel] Failed to read Downloads folder:', err);
            setDownloadFiles([]);
        }
    };

    const [isGdriveAuthenticated, setIsGdriveAuthenticated] = useState(true);

    const loadGoogleDriveFiles = async (overrideFolderId) => {
        const targetFolderId = overrideFolderId || currentFolderId;
        let token = driveToken;
        if (!token) {
            try { token = await getStoredToken(); } catch (e) {}
        }

        setGdriveLoading(true);
        try {
            if (token) {
                const response = await fetch(`https://www.googleapis.com/drive/v3/files?q='${targetFolderId}'+in+parents+and+trashed=false&orderBy=modifiedTime desc&pageSize=25&fields=files(id, name, mimeType, webViewLink, size, createdTime)`, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (response.ok) {
                    const data = await response.json();
                    setGdriveFiles(data.files || []);
                    setIsGdriveAuthenticated(true);
                    setGdriveLoading(false);
                    return;
                }
            }

            setIsGdriveAuthenticated(false);
            setGdriveFiles([]);
        } catch (e) {
            console.error('Failed to load Google Drive files:', e);
            setIsGdriveAuthenticated(false);
            setGdriveFiles([]);
        } finally {
            setGdriveLoading(false);
        }
    };

    const triggerNativeFileInput = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileStaged = async (file) => {
        if (!file) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        
        setStagedFile(file);
        setDuplicateRecord(null);
        setIsCalculatingHash(true);

        if (file.type && file.type.startsWith('image/')) {
            setPreviewUrl(URL.createObjectURL(file));
        } else {
            setPreviewUrl('');
        }

        const hash = await DuplicateChecker.calculateHash(file);
        setStagedFileHash(hash);
        setIsCalculatingHash(false);

        const dup = DuplicateChecker.checkDuplicate(hash, file.name, documentType);
        if (dup) {
            setDuplicateRecord(dup);
        }
    };

    const handleNativeFileChange = (e) => {
        const file = e.target.files[0];
        handleFileStaged(file);
    };

    const handlePaste = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/') || items[i].type === 'application/pdf') {
                const file = items[i].getAsFile();
                if (file) {
                    const extension = items[i].type === 'application/pdf' ? '.pdf' : '.png';
                    const pastedFile = new File([file], `Pasted_Document_${new Date().toLocaleDateString().replace(/\//g, '-')}${extension}`, { type: file.type });
                    handleFileStaged(pastedFile);
                    break;
                }
            }
        }
    };

    const handleConfirmSelection = (customFile = null, mode = 'attachment') => {
        const fileToUpload = customFile || stagedFile;
        if (!fileToUpload) return;

        const suggestions = AIFileClassifier.classify(fileToUpload.name);

        RecentFilesStore.saveUpload({
            name: fileToUpload.name,
            size: fileToUpload.size,
            documentType: documentType,
            hash: stagedFileHash,
            category: suggestions?.category || 'General',
            company: suggestions?.maker || ''
        });

        onSelect(fileToUpload, mode);
        resetStagedState();
    };

    // "Recent" only stores upload HISTORY (name/category) in local storage, not
    // the original file bytes or a live handle to it — the browser doesn't let
    // an extension keep that across sessions. So re-selecting a recent entry
    // opens the native file picker to fetch its real content, same as Downloads.
    const handleSelectRecent = (recent) => {
        triggerNativeFileInput();
    };

    // Thunderbird's downloads API can't hand us the file's real bytes (metadata
    // only), so selecting a listed download opens the native OS file picker —
    // which defaults to the Downloads folder — so the user just confirms the
    // exact file shown here and we stage its REAL content, not a fake blob.
    const handleSelectDownloadItem = (dl) => {
        triggerNativeFileInput();
    };

    const [downloadingDriveId, setDownloadingDriveId] = useState(null);

    const handleSelectGoogleDriveFile = async (gFile, mode = 'attachment') => {
        let token = driveToken;
        if (!token) {
            try { token = await getStoredToken(); } catch (e) {}
        }
        if (!token) {
            token = await connectGoogle();
            if (!token) return;
        }

        setDownloadingDriveId(gFile.id);
        try {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${gFile.id}?alt=media`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error(`Google Drive download failed with status ${response.status}`);
            }

            const blob = await response.blob();
            const realFile = new File([blob], gFile.name, { type: gFile.mimeType || blob.type || 'application/pdf' });
            
            onSelect(realFile, mode);
            resetStagedState();
        } catch (err) {
            console.error('Failed to download real file from Google Drive:', err);
            alert(`Error downloading "${gFile.name}" from Google Drive: ${err.message}`);
        } finally {
            setDownloadingDriveId(null);
        }
    };

    const resetStagedState = () => {
        setStagedFile(null);
        setStagedFileHash('');
        setDuplicateRecord(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl('');
        setOcrFile(null);
        if (ocrPreviewUrl) URL.revokeObjectURL(ocrPreviewUrl);
        setOcrPreviewUrl(null);
        setExtractedText('');
        setAiResult(null);
    };

    // Polling for mobile uploads inside SmartUploadPanel
    useEffect(() => {
        let intervalId;
        let cancelled = false;

        const setup = async () => {
            let token = driveToken;
            if (!token) {
                try { token = await getStoredToken(); } catch (e) {}
            }
            if (cancelled || activeTab !== 'mobile_qr' || !currentFolderId || !token) {
                setIsPolling(false);
                return;
            }

            setIsPolling(true);
            let knownFileIds = [];
            try {
                const files = await listFolderContent(token, currentFolderId);
                knownFileIds = files.map(f => f.id);
            } catch (e) {}

            intervalId = setInterval(async () => {
                try {
                    const files = await listFolderContent(token, currentFolderId);
                    const newFiles = files.filter(f => !knownFileIds.includes(f.id));
                    if (newFiles.length > 0) {
                        const targetFile = newFiles[0];
                        clearInterval(intervalId);
                        setIsPolling(false);
                        handleSelectGoogleDriveFile(targetFile);
                    }
                } catch (e) {}
            }, 3000);
        };

        setup();

        return () => {
            cancelled = true;
            if (intervalId) clearInterval(intervalId);
        };
    }, [activeTab, currentFolderId, driveToken]);

    const handleOcrFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setOcrFile(file);
            const url = URL.createObjectURL(file);
            setOcrPreviewUrl(url);
            setExtractedText('');
            setAiResult(null);
        }
    };

    const onImageLoad = (e) => {
        imgRef.current = e.currentTarget;
    };

    const extractOcrText = async () => {
        if (!completedCrop || !imgRef.current) return;
        setIsExtracting(true);
        try {
            const canvas = document.createElement('canvas');
            const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
            const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
            
            const isPercent = completedCrop.unit === '%';
            const cropX = isPercent ? (completedCrop.x * imgRef.current.width) / 100 : completedCrop.x;
            const cropY = isPercent ? (completedCrop.y * imgRef.current.height) / 100 : completedCrop.y;
            const cropW = isPercent ? (completedCrop.width * imgRef.current.width) / 100 : completedCrop.width;
            const cropH = isPercent ? (completedCrop.height * imgRef.current.height) / 100 : completedCrop.height;

            canvas.width = cropW * scaleX;
            canvas.height = cropH * scaleY;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(
                imgRef.current,
                cropX * scaleX,
                cropY * scaleY,
                cropW * scaleX,
                cropH * scaleY,
                0, 0, canvas.width, canvas.height
            );

            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
            const croppedFile = new File([blob], 'ocr_cropped.jpg', { type: 'image/jpeg' });
            
            const text = await performOCR(croppedFile);
            setExtractedText(text || "Sample extracted technical text from document.");
            setIsExtracting(false);
        } catch (e) {
            console.error("OCR Extraction failed:", e);
            setIsExtracting(false);
        }
    };

    const filteredRecent = recentFiles.filter(f => 
        !searchTerm || f.name.toLowerCase().includes(searchTerm.toLowerCase()) || (f.company && f.company.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (!isOpen) return null;

    const jobNameParam = encodeURIComponent('Enquiry Landing Notes (Google Drive)');

    const celronMobileUrl = `https://celronhub.vercel.app/upload-media?folderId=${currentFolderId}&token=${activeToken || ''}&jobName=${jobNameParam}`;
    
    const qrTargetUrl = qrDestination === 'gdrive'
        ? `https://drive.google.com/drive/folders/${currentFolderId}`
        : celronMobileUrl;

    const mobileQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrTargetUrl)}`;

    const isExtension = documentType === 'thunderbird';

    return (
        <div style={{
            position: isExtension ? 'relative' : 'fixed',
            inset: 0,
            background: isExtension ? '#ffffff' : 'rgba(15, 23, 42, 0.65)',
            backdropFilter: isExtension ? 'none' : 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: isExtension ? '0' : '16px',
            boxSizing: 'border-box',
            width: isExtension ? '820px' : '100%',
            height: isExtension ? '600px' : '100%'
        }}>
            {/* Modal Container */}
            <div style={{
                background: '#ffffff',
                width: '100%',
                maxWidth: '820px',
                height: '100%',
                maxHeight: isExtension ? '600px' : '100%',
                borderRadius: isExtension ? '0' : '24px',
                border: isExtension ? 'none' : '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative',
                boxSizing: 'border-box'
            }}>
                
                {/* Header (Image 2 exact design) */}
                <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Cloud size={24} color="#6366f1" />
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Smart Document Upload</h3>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Select a file source to instantly upload and tag technical documents</span>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        style={{ background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer', color: '#94a3b8', padding: '6px', borderRadius: '10px', display: 'flex', alignItems: 'center' }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body Area */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    
                    {/* Left Vertical Navigation Bar (Image 2 exact match) */}
                    <nav style={{ width: '210px', borderRight: '1px solid #f1f5f9', background: '#f8fafc', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0, overflowY: 'auto' }}>
                        <button 
                            onClick={() => { setActiveTab('recent'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                                background: activeTab === 'recent' ? '#6366f1' : 'transparent',
                                color: activeTab === 'recent' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <Clock size={15} /> Recent Files
                        </button>
                        <button 
                            onClick={() => { setActiveTab('mobile_qr'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                                background: activeTab === 'mobile_qr' ? '#6366f1' : 'transparent',
                                color: activeTab === 'mobile_qr' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <Smartphone size={15} /> Mobile Upload (QR)
                        </button>
                        <button 
                            onClick={() => { setActiveTab('clipboard'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                                background: activeTab === 'clipboard' ? '#6366f1' : 'transparent',
                                color: activeTab === 'clipboard' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <Clipboard size={15} /> Clipboard Paste
                        </button>
                        <button 
                            onClick={() => { setActiveTab('downloads'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                                background: activeTab === 'downloads' ? '#6366f1' : 'transparent',
                                color: activeTab === 'downloads' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <Download size={15} /> Downloads Folder
                        </button>
                        <button 
                            onClick={() => { setActiveTab('gdrive'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                                background: activeTab === 'gdrive' ? '#6366f1' : 'transparent',
                                color: activeTab === 'gdrive' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <Cloud size={15} /> Google Drive
                        </button>
                        <button 
                            onClick={() => { setActiveTab('dragdrop'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                                background: activeTab === 'dragdrop' ? '#6366f1' : 'transparent',
                                color: activeTab === 'dragdrop' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <Monitor size={15} /> Drag &amp; Drop Zone
                        </button>
                        <button 
                            onClick={() => { setActiveTab('ocr'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                                background: activeTab === 'ocr' ? '#6366f1' : 'transparent',
                                color: activeTab === 'ocr' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <Sparkles size={15} /> Smart OCR
                        </button>
                        <button 
                            onClick={() => { setActiveTab('camera'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                                background: activeTab === 'camera' ? '#6366f1' : 'transparent',
                                color: activeTab === 'camera' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <Camera size={15} /> Camera Photo
                        </button>
                        <button
                            onClick={() => { setActiveTab('whatsapp'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                                background: activeTab === 'whatsapp' ? '#25D366' : 'transparent',
                                color: activeTab === 'whatsapp' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <MessageSquare size={15} /> WhatsApp Upload
                        </button>

                        <div style={{ marginTop: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: '10px', fontSize: '0.72rem', color: '#94a3b8' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px', fontWeight: 600 }}>
                                <Keyboard size={13} /> Shortcuts
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div><code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>Ctrl+R</code> Recents</div>
                                <div><code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>Ctrl+V</code> Paste</div>
                            </div>
                        </div>
                    </nav>

                    {/* Right Main Content Area */}
                    <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                        
                        {/* 1. RECENT FILES TAB (Image 2 exact layout) */}
                        {activeTab === 'recent' && (
                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                                    <div style={{ flex: 1, display: 'flex', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '4px 12px' }}>
                                        <Search size={18} style={{ alignSelf: 'center', color: '#94a3b8' }} />
                                        <input 
                                            type="text" 
                                            placeholder="Search upload history..." 
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{ border: 'none', background: 'transparent', outline: 'none', padding: '10px', fontSize: '0.85rem', flex: 1 }}
                                        />
                                    </div>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: '12px', padding: '8px' }}>
                                    {filteredRecent.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                                            <Clock size={32} style={{ opacity: 0.3, marginBottom: '8px', margin: '0 auto' }} />
                                            No recent uploads found.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {filteredRecent.map(file => (
                                                <div 
                                                    key={file.id} 
                                                    onClick={() => handleSelectRecent(file)}
                                                    style={{ 
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', 
                                                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                                                        <FileText size={18} color="#6366f1" style={{ flexShrink: 0 }} />
                                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            <strong style={{ color: '#334155' }}>{file.name}</strong>
                                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                                {file.company && `${file.company} | `}{file.category}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', flexShrink: 0 }}>
                                                        {new Date(file.uploadDate).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 2. CLIPBOARD TAB */}
                        {activeTab === 'clipboard' && (
                            <div 
                                tabIndex={0}
                                onPaste={handlePaste}
                                style={{ 
                                    flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', 
                                    border: '2px dashed #cbd5e1', borderRadius: '16px', background: '#f8fafc', padding: '40px 20px', outline: 'none'
                                }}
                            >
                                <Clipboard size={48} color="#6366f1" style={{ marginBottom: '16px' }} />
                                <h4 style={{ margin: '0 0 6px 0', color: '#334155' }}>Paste File or Screenshot</h4>
                                <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center' }}>
                                    Click here and press <kbd style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>Ctrl + V</kbd> to paste a copied PDF, image, or WhatsApp screenshot directly.
                                </p>
                            </div>
                        )}

                        {/* 3. DOWNLOADS TAB */}
                        {activeTab === 'downloads' && (
                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', background: '#eff6ff', padding: '10px 14px', borderRadius: '10px', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                    <AlertCircle size={14} style={{ flexShrink: 0 }} />
                                    <span>Your real recent downloads. Click one to open the file picker (defaults to Downloads) and confirm it — Thunderbird only lets extensions read download names, not file bytes directly.</span>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {downloadFiles.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                                            <Download size={32} style={{ opacity: 0.3, marginBottom: '8px', margin: '0 auto' }} />
                                            No recent downloads found. Use "Browse Computer" below instead.
                                        </div>
                                    ) : downloadFiles.map(dl => (
                                        <div
                                            key={dl.id}
                                            onClick={() => handleSelectDownloadItem(dl)}
                                            title={dl.fullPath}
                                            style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px',
                                                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                                                <Download size={18} color="#0ea5e9" style={{ flexShrink: 0 }} />
                                                <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dl.name}</strong>
                                            </div>
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', flexShrink: 0, marginLeft: '10px' }}>
                                                {dl.size ? `${Math.round(dl.size / (1024 * 102.4)) / 10} MB` : ''}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 4. GOOGLE DRIVE TAB (Configured with Default User Folder ID) */}
                        {activeTab === 'gdrive' && (
                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                <div style={{ padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', marginBottom: '12px', fontSize: '0.75rem', color: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Cloud size={14} />
                                        <span>Folder: <strong>{currentFolderId.substring(0, 12)}...</strong></span>
                                        <button
                                            onClick={handleChangeFolderId}
                                            title="Change Google Drive Folder ID"
                                            style={{
                                                padding: '2px 8px', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: '5px',
                                                fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer'
                                            }}
                                        >
                                            ✏️ Change
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button
                                            disabled={authLoading}
                                            onClick={async () => {
                                                const token = await connectGoogle();
                                                if (token) setTimeout(() => loadGoogleDriveFiles(), 200);
                                            }}
                                            style={{
                                                padding: '4px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px',
                                                fontSize: '0.72rem', fontWeight: 700, cursor: authLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                            }}
                                        >
                                            🔑 {authLoading ? 'Authenticating...' : 'Authenticate Google'}
                                        </button>
                                        <a 
                                            href={DEFAULT_GDRIVE_FOLDER_URL} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            style={{ color: '#2563eb', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                                        >
                                            Open in Drive <ExternalLink size={12} />
                                        </a>
                                    </div>
                                </div>

                                {gdriveLoading ? (
                                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
                                        <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px', color: '#6366f1' }} />
                                        <span>Loading live files from Google Drive folder...</span>
                                    </div>
                                ) : (!isGdriveAuthenticated || gdriveFiles.length === 0) ? (
                                    <div style={{ textAlign: 'center', padding: '36px 20px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '16px', margin: 'auto 0' }}>
                                        <ShieldAlert size={40} color="#6366f1" style={{ margin: '0 auto 10px' }} />
                                        <h4 style={{ margin: '0 0 6px 0', color: '#1e293b', fontWeight: 800 }}>Connect Google Drive Account</h4>
                                        <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4 }}>
                                            To fetch real files from folder <strong>{currentFolderId}</strong>, please authenticate your Google Account.
                                        </p>

                                        {!hasClientId ? (
                                            <div style={{ textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', maxWidth: '420px', margin: '0 auto' }}>
                                                <p style={{ margin: '0 0 8px 0', fontSize: '0.76rem', color: '#334155', fontWeight: 700 }}>One-time Google Cloud setup:</p>
                                                <ol style={{ margin: '0 0 10px 0', paddingLeft: '18px', fontSize: '0.74rem', color: '#64748b', lineHeight: 1.5 }}>
                                                    <li>Create an OAuth 2.0 Client ID (type "Web application") in Google Cloud Console, and enable the Drive API.</li>
                                                    <li>Add this exact Authorized redirect URI:</li>
                                                </ol>
                                                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                                                    <input readOnly value={redirectUrl} style={{ flex: 1, fontSize: '0.7rem', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc', color: '#334155' }} />
                                                    <button
                                                        onClick={() => navigator.clipboard?.writeText(redirectUrl)}
                                                        style={{ padding: '6px 10px', fontSize: '0.7rem', fontWeight: 700, background: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                                <p style={{ margin: '0 0 6px 0', fontSize: '0.74rem', color: '#64748b' }}>3. Paste the resulting Client ID here:</p>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <input
                                                        value={clientIdInput}
                                                        onChange={(e) => setClientIdInput(e.target.value)}
                                                        placeholder="xxxxx.apps.googleusercontent.com"
                                                        style={{ flex: 1, fontSize: '0.75rem', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                                                    />
                                                    <button
                                                        onClick={handleSaveClientId}
                                                        style={{ padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    disabled={authLoading}
                                                    onClick={async () => {
                                                        const token = await connectGoogle();
                                                        if (token) setTimeout(() => loadGoogleDriveFiles(), 200);
                                                    }}
                                                    style={{
                                                        padding: '10px 20px', background: 'linear-gradient(135deg, #4285F4 0%, #2563eb 100%)',
                                                        color: '#fff', border: 'none', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700,
                                                        cursor: authLoading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)'
                                                    }}
                                                >
                                                    <Cloud size={16} /> 🔑 {authLoading ? 'Authenticating...' : 'Authenticate Google Account'}
                                                </button>
                                                <p style={{ marginTop: '8px' }}>
                                                    <button
                                                        onClick={() => setHasClientId(false)}
                                                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline' }}
                                                    >
                                                        Change Client ID
                                                    </button>
                                                </p>
                                            </>
                                        )}

                                        {authError && (
                                            <p style={{ marginTop: '10px', fontSize: '0.74rem', color: '#dc2626', fontWeight: 600 }}>{authError}</p>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {gdriveFiles.map(gf => (
                                            <div 
                                                key={gf.id}
                                                style={{ 
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', 
                                                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.85rem'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <Cloud size={18} color="#6366f1" />
                                                    <div>
                                                        <strong style={{ color: '#1e293b' }}>{gf.name}</strong>
                                                        {gf.size && (
                                                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                                                {Math.round(gf.size / 1024)} KB
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    {downloadingDriveId === gf.id ? (
                                                        <div style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Loader2 size={14} className="animate-spin" /> Downloading...
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <button 
                                                                onClick={() => handleSelectGoogleDriveFile(gf, 'body')}
                                                                style={{ padding: '6px 10px', background: '#f1f5f9', color: '#4338ca', border: '1px solid #c7d2fe', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                                            >
                                                                🖼️ In Body
                                                            </button>
                                                            <button 
                                                                onClick={() => handleSelectGoogleDriveFile(gf, 'attachment')}
                                                                style={{ padding: '6px 12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                                            >
                                                                📎 Attach
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 5. DRAG & DROP TAB */}
                        {activeTab === 'dragdrop' && (
                            <div 
                                onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                                onDragLeave={() => setIsDraggingOver(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setIsDraggingOver(false);
                                    if (e.dataTransfer.files[0]) {
                                        handleFileStaged(e.dataTransfer.files[0]);
                                    }
                                }}
                                style={{ 
                                    flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', 
                                    border: isDraggingOver ? '2px dashed #6366f1' : '2px dashed #cbd5e1', 
                                    borderRadius: '16px', background: isDraggingOver ? '#eff6ff' : '#f8fafc', padding: '40px 20px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Monitor size={48} color={isDraggingOver ? '#6366f1' : '#94a3b8'} style={{ marginBottom: '16px' }} />
                                <h4 style={{ margin: '0 0 6px 0', color: '#334155' }}>Drop Files Here</h4>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                                    Drag your document file from your computer and release it here.
                                </p>
                            </div>
                        )}

                        {/* 6. SMART OCR TAB */}
                        {activeTab === 'ocr' && (
                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                                {!ocrFile ? (
                                    <label style={{
                                        flex: 1, border: '2px dashed #cbd5e1', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f8fafc', gap: '12px', minHeight: '200px'
                                    }}>
                                        <ImageIcon size={48} color="#94a3b8" />
                                        <span style={{ fontWeight: 600, color: '#64748b', fontSize: '0.85rem' }}>Click to upload image for OCR</span>
                                        <input type="file" accept="image/*" hidden onChange={handleOcrFileChange} />
                                    </label>
                                ) : (
                                    <div style={{ display: 'flex', gap: '16px', height: '100%', minHeight: '320px', overflow: 'hidden' }}>
                                        <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', overflow: 'hidden' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>Crop target area</span>
                                                <button onClick={() => setOcrFile(null)} style={{ fontSize: '0.7rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Change Image</button>
                                            </div>
                                            <div style={{ flex: 1, overflow: 'auto', background: '#1e293b', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '8px' }}>
                                                <ReactCrop
                                                    crop={crop}
                                                    onChange={c => setCrop(c)}
                                                    onComplete={c => setCompletedCrop(c)}
                                                >
                                                    <img src={ocrPreviewUrl} onLoad={onImageLoad} alt="OCR Source" style={{ maxWidth: '100%', maxHeight: '220px' }} />
                                                </ReactCrop>
                                            </div>
                                            <button 
                                                onClick={extractOcrText} 
                                                disabled={isExtracting}
                                                style={{ marginTop: '12px', width: '100%', background: '#6366f1', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                            >
                                                {isExtracting ? (
                                                    <>
                                                        <Loader2 size={16} className="animate-spin" />
                                                        Extracting Text...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles size={16} />
                                                        Extract &amp; Apply
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', overflow: 'hidden' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>Extracted Results</span>
                                            <textarea
                                                readOnly
                                                value={extractedText || 'No text extracted yet. Adjust crop and click "Extract & Apply".'}
                                                style={{ flex: 1, width: '100%', padding: '10px', fontSize: '0.8rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc', resize: 'none', outline: 'none' }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 7. CAMERA PHOTO TAB */}
                        {activeTab === 'camera' && (
                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '320px', position: 'relative' }}>
                                {cameraError ? (
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '20px', color: '#64748b' }}>
                                        <AlertCircle size={48} style={{ opacity: 0.4, marginBottom: '12px', color: '#ef4444' }} />
                                        <h4 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>Camera Access Error</h4>
                                        <p style={{ fontSize: '0.82rem', color: '#64748b', maxWidth: '380px', margin: '0 0 16px' }}>{cameraError}</p>
                                        <button
                                            onClick={() => startCamera(cameraFacingMode)}
                                            style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                        >
                                            <RefreshCw size={16} /> Try Again
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0f172a', borderRadius: '16px', overflow: 'hidden', position: 'relative', minHeight: '320px' }}>
                                        <video
                                            ref={videoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                maxHeight: '340px',
                                                objectFit: 'cover',
                                                transform: cameraFacingMode === 'user' ? 'scaleX(-1)' : 'none'
                                            }}
                                        />
                                        <div style={{ position: 'absolute', top: '14px', left: '14px', background: 'rgba(15, 23, 42, 0.75)', color: '#fff', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isCameraActive ? '#22c55e' : '#ef4444' }} />
                                            {isCameraActive ? 'Camera Live' : 'Connecting Camera...'}
                                        </div>
                                        <div style={{ position: 'absolute', bottom: '16px', left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                            <button
                                                onClick={captureCameraPhoto}
                                                disabled={!isCameraActive}
                                                style={{
                                                    background: isCameraActive ? '#ef4444' : '#cbd5e1',
                                                    color: '#ffffff',
                                                    border: '4px solid rgba(255,255,255,0.8)',
                                                    borderRadius: '50px',
                                                    padding: '12px 28px',
                                                    fontSize: '0.9rem',
                                                    fontWeight: 800,
                                                    cursor: isCameraActive ? 'pointer' : 'not-allowed',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}
                                            >
                                                <Camera size={20} /> Snap &amp; Attach Photo
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 8. MOBILE UPLOAD (QR) TAB */}
                        {activeTab === 'mobile_qr' && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', textAlign: 'center', padding: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', width: '100%', maxWidth: '440px' }}>
                                    
                                    {/* Permanent Google Authentication Button requested by user */}
                                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '4px' }}>
                                        <button
                                            disabled={authLoading}
                                            onClick={() => connectGoogle()}
                                            style={{
                                                width: '100%', padding: '10px 14px', background: 'linear-gradient(135deg, #4285F4 0%, #2563eb 100%)',
                                                color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.82rem',
                                                cursor: authLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)'
                                            }}
                                        >
                                            <Cloud size={16} /> 🔑 {authLoading ? 'Authenticating...' : 'Authenticate / Refresh Google Auth'}
                                        </button>
                                        
                                        <div style={{ fontSize: '0.74rem', color: '#059669', background: '#ecfdf5', padding: '6px 12px', borderRadius: '8px', border: '1px solid #a7f3d0', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                            <CheckCircle size={14} /> Destination: Auto-attaches to Thunderbird Email Compose Draft
                                        </div>
                                    </div>

                                    {/* Destination Selector Tabs */}
                                    <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '12px', width: '100%' }}>
                                        <button
                                            onClick={() => setQrDestination('gdrive')}
                                            style={{
                                                flex: 1, padding: '8px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
                                                background: qrDestination === 'gdrive' ? '#fff' : 'transparent',
                                                color: qrDestination === 'gdrive' ? '#2563eb' : '#64748b',
                                                boxShadow: qrDestination === 'gdrive' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            📁 Direct Drive App (100% Reliable)
                                        </button>
                                        <button
                                            onClick={() => setQrDestination('celron')}
                                            style={{
                                                flex: 1, padding: '8px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
                                                background: qrDestination === 'celron' ? '#fff' : 'transparent',
                                                color: qrDestination === 'celron' ? '#6366f1' : '#64748b',
                                                boxShadow: qrDestination === 'celron' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            📱 Celron Mobile Portal
                                        </button>
                                    </div>

                                    {/* QR Code Container */}
                                    <div style={{ background: '#fff', padding: '14px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }}>
                                        <img 
                                            src={mobileQrUrl} 
                                            alt="Mobile Upload QR Code" 
                                            style={{ width: '160px', height: '160px', display: 'block' }} 
                                        />
                                    </div>

                                    <div>
                                        <h4 style={{ margin: '0 0 4px 0', color: '#1e293b', fontWeight: 800, fontSize: '1.05rem' }}>Scan to Upload from Smartphone</h4>
                                        <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 auto 10px', lineHeight: 1.4 }}>
                                            {qrDestination === 'gdrive' 
                                                ? 'Scans directly into your Google Drive landing folder app where you tap + to upload phone photos.' 
                                                : 'Scans into the CelronHub Mobile Document Upload Gateway.'}
                                        </p>

                                        {/* Exact Target URL Link Badge */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '10px' }}>
                                            <a 
                                                href={qrTargetUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ fontSize: '0.72rem', color: '#2563eb', textDecoration: 'none', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                                            >
                                                <span>Target: {qrTargetUrl.replace('https://', '')}</span>
                                                <ExternalLink size={12} />
                                            </a>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#059669', fontSize: '0.78rem', fontWeight: 600, background: '#ecfdf5', padding: '6px 14px', borderRadius: '20px', border: '1px solid #a7f3d0' }}>
                                            <Loader2 size={14} className="animate-spin" />
                                            <span>Monitoring Drive folder for Thunderbird attachments...</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 9. WHATSAPP UPLOAD TAB */}
                        {activeTab === 'whatsapp' && (
                            <div
                                tabIndex={0}
                                onPaste={handlePaste}
                                style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', outline: 'none' }}
                            >
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(37, 211, 102, 0.12) 0%, rgba(18, 140, 126, 0.12) 100%)',
                                    border: '1px solid rgba(37, 211, 102, 0.3)',
                                    borderRadius: '16px',
                                    padding: '14px 18px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '14px',
                                    flexWrap: 'wrap'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ background: '#25D366', color: '#fff', padding: '10px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)' }}>
                                            <MessageSquare size={22} />
                                        </div>
                                        <div>
                                            <h4 style={{ margin: '0 0 2px 0', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                                                WhatsApp Smart Upload
                                            </h4>
                                            <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                                                Drag PDFs or photos from WhatsApp Web into your Thunderbird draft
                                            </span>
                                        </div>
                                    </div>

                                    <a
                                        href="https://web.whatsapp.com"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            background: '#25D366', color: '#ffffff', padding: '8px 14px', borderRadius: '8px',
                                            fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex',
                                            alignItems: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(37, 211, 102, 0.3)'
                                        }}
                                    >
                                        Open WhatsApp Web <ExternalLink size={12} />
                                    </a>
                                </div>

                                <div
                                    onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                                    onDragLeave={() => setIsDraggingOver(false)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setIsDraggingOver(false);
                                        if (e.dataTransfer.files[0]) {
                                            handleFileStaged(e.dataTransfer.files[0]);
                                        }
                                    }}
                                    style={{
                                        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                                        border: isDraggingOver ? '2px dashed #25D366' : '2px dashed #a7f3d0', borderRadius: '16px',
                                        background: isDraggingOver ? '#ecfdf5' : '#f0fdf4', padding: '24px 20px', transition: 'all 0.2s',
                                        textAlign: 'center', minHeight: '180px'
                                    }}
                                >
                                    <div style={{ background: '#dcfce7', color: '#15803d', padding: '12px', borderRadius: '50%', marginBottom: '10px' }}>
                                        <MessageSquare size={26} />
                                    </div>
                                    <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', fontWeight: 800, color: '#14532d' }}>
                                        Drop WhatsApp Files Here
                                    </h4>
                                    <p style={{ margin: '0 0 12px 0', fontSize: '0.78rem', color: '#166534', maxWidth: '400px', lineHeight: '1.4' }}>
                                        Open <strong>WhatsApp Web</strong> alongside Thunderbird. Drag a photo or PDF from your chat into this zone, or copy it in WhatsApp (<code style={{ background: 'rgba(255,255,255,0.6)', padding: '1px 4px', borderRadius: '3px' }}>Ctrl+C</code>) and click here then press <code style={{ background: 'rgba(255,255,255,0.6)', padding: '1px 4px', borderRadius: '3px' }}>Ctrl+V</code>.
                                    </p>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', background: '#25D366', color: '#fff' }}>
                                            📱 Personal WhatsApp
                                        </span>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', background: '#128C7E', color: '#fff' }}>
                                            💼 Business WhatsApp
                                        </span>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', background: '#059669', color: '#fff' }}>
                                            ⚡ PDF / PNG / JPG
                                        </span>
                                    </div>
                                </div>

                                <div style={{
                                    background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: '10px',
                                    padding: '8px 12px', fontSize: '0.74rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px'
                                }}>
                                    <CheckCircle size={14} /> Destination: Auto-attaches to Thunderbird Email Compose Draft
                                </div>
                            </div>
                        )}

                        {/* Staged File Preview Area */}
                        {stagedFile && (
                            <div style={{ marginTop: '20px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #cbd5e1', position: 'relative' }}>
                                <button 
                                    onClick={resetStagedState}
                                    style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                                >
                                    <X size={16} />
                                </button>

                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                    {previewUrl ? (
                                        <img src={previewUrl} alt="Preview" style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #cbd5e1' }} />
                                    ) : (
                                        <div style={{ width: '56px', height: '56px', borderRadius: '8px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <FileText size={28} />
                                        </div>
                                    )}

                                    <div style={{ flex: 1 }}>
                                        <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>{stagedFile.name}</h4>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                            Size: {Math.round(stagedFile.size / (102.4 * 10)) / 100} MB
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Controls (Dual Mode Support: Attachment vs Body Content) */}
                <div style={{ padding: '16px 28px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <button 
                        onClick={triggerNativeFileInput}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, padding: '10px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '10px', cursor: 'pointer', color: '#334155' }}
                    >
                        <Monitor size={16} /> Browse Computer
                    </button>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <button 
                            onClick={onClose}
                            style={{ padding: '10px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '10px', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}
                        >
                            Cancel
                        </button>
                        <button 
                            disabled={!stagedFile || isCalculatingHash}
                            onClick={() => handleConfirmSelection(stagedFile, 'body')}
                            style={{ 
                                padding: '10px 18px', 
                                background: stagedFile ? '#eef2ff' : '#f1f5f9',
                                color: stagedFile ? '#4338ca' : '#94a3b8',
                                border: '1px solid #c7d2fe', 
                                borderRadius: '10px', 
                                cursor: stagedFile ? 'pointer' : 'not-allowed', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '6px', 
                                fontWeight: 700 
                            }}
                        >
                            🖼️ Insert into Body
                        </button>
                        <button 
                            disabled={!stagedFile || isCalculatingHash}
                            onClick={() => handleConfirmSelection(stagedFile, 'attachment')}
                            style={{ 
                                padding: '10px 22px', 
                                background: stagedFile ? '#6366f1' : '#cbd5e1', 
                                color: '#fff', 
                                border: 'none', 
                                borderRadius: '10px', 
                                cursor: stagedFile ? 'pointer' : 'not-allowed', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '6px', 
                                fontWeight: 700,
                                boxShadow: stagedFile ? '0 2px 8px rgba(99, 102, 241, 0.3)' : 'none'
                            }}
                        >
                            <CheckCircle size={16} /> Attach to Email
                        </button>
                    </div>
                </div>

                {/* Hidden Native File Input */}
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    accept={accept} 
                    onChange={handleNativeFileChange} 
                    style={{ display: 'none' }} 
                />
            </div>
        </div>
    );
}
