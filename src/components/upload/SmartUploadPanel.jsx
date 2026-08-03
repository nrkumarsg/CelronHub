import React, { useState, useEffect, useRef } from 'react';
import { 
    Search, X, Clock, Clipboard, Download, Cloud, Monitor, 
    AlertCircle, FileText, CheckCircle, Pin, Folder, Star, 
    Sparkles, ShieldAlert, FileImage, FileCode, Keyboard,
    Smartphone, QrCode, Image as ImageIcon, Loader2, Camera, RefreshCw, Mail, Inbox,
    ExternalLink, Grid, List, MessageSquare
} from 'lucide-react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { QRCodeSVG } from 'qrcode.react';
import { performOCR } from '../../lib/googleAuthService';
import { parseOCRBusinessCard } from '../../lib/geminiService';
import { RecentFilesStore } from './RecentFilesStore';
import { AIFileClassifier } from './AIFileClassifier';
import { DuplicateChecker } from './DuplicateChecker';
import { listFolderContent } from '../../lib/driveService';
import { getStoredToken } from '../../lib/googleAuthService';

const DEFAULT_GDRIVE_FOLDER_ID = '1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w';
const DEFAULT_GDRIVE_FOLDER_URL = `https://drive.google.com/drive/folders/${DEFAULT_GDRIVE_FOLDER_ID}?usp=drive_link`;

export default function SmartUploadPanel({ 
    isOpen = true, 
    onClose, 
    onSelect, 
    documentType = 'manual', 
    accept = '.pdf,.png,.jpg,.jpeg', 
    activeFolderId = DEFAULT_GDRIVE_FOLDER_ID, 
    activeFolderName = 'System Workspace', 
    initialTab = 'recent',
    embedded = false,
    runningEnquiryNo = null
}) {
    const [activeTab, setActiveTab] = useState(initialTab || 'recent');
    const [searchTerm, setSearchTerm] = useState('');
    const [panelViewMode, setPanelViewMode] = useState('list'); // 'list' or 'grid' (Image 2 View Toggle)
    const [showDriveQrModal, setShowDriveQrModal] = useState(false);
    
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
    const [cameraFacingMode, setCameraFacingMode] = useState('environment'); // 'environment' or 'user'
    const videoRef = useRef(null);

    // Mobile QR state
    const [isPolling, setIsPolling] = useState(false);
    
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
    
    // Drag indicator state
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    
    const fileInputRef = useRef(null);

    // Load Local Store data on mount/open
    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab || 'recent');
            setRecentFiles(RecentFilesStore.getUploads(documentType));
            setFavorites(RecentFilesStore.getFavoriteFolders(documentType));
            setLastOpened(RecentFilesStore.getLastOpenedFolder(documentType));
            loadMockDownloads();
            loadGoogleDriveFiles();
        }
    }, [isOpen, documentType, initialTab]);

    // Handle Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!isOpen) return;
            
            // Escape to close
            if (e.key === 'Escape') {
                onClose();
            }
            
            // Ctrl+V (Clipboard)
            if (e.ctrlKey && e.key.toLowerCase() === 'v') {
                setActiveTab('clipboard');
            }
            
            // Ctrl+D (Downloads)
            if (e.ctrlKey && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                setActiveTab('downloads');
            }
            
            // Ctrl+R (Recent Files)
            if (e.ctrlKey && e.key.toLowerCase() === 'r') {
                e.preventDefault();
                setActiveTab('recent');
            }
            
            // Ctrl+B (Browse native explorer)
            if (e.ctrlKey && e.key.toLowerCase() === 'b') {
                e.preventDefault();
                triggerNativeFileInput();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Camera Stream Lifecycle & Functions
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
            setCameraError(err.message || "Unable to access camera. Please check camera permissions in browser.");
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

    // Load mock downloads suited for CelronHub shipping/marine themes
    const loadMockDownloads = () => {
        const mockPdfs = [
            { id: 'dl1', name: 'ABB_ACS880_Manual_v2.pdf', size: 1048576 * 8.4, date: new Date(Date.now() - 1000 * 60 * 10).toISOString() },
            { id: 'dl2', name: 'Siemens_G120_UserGuide.pdf', size: 1048576 * 5.2, date: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
            { id: 'dl3', name: 'Calibration_Report_CAL9918.pdf', size: 1024 * 450, date: new Date(Date.now() - 1000 * 60 * 120).toISOString() },
            { id: 'dl4', name: 'Fire_Pump_Safety_Cert.pdf', size: 1024 * 980, date: new Date(Date.now() - 1000 * 3600 * 4).toISOString() },
            { id: 'dl5', name: 'Invoice_2026_Celron_109.pdf', size: 1024 * 120, date: new Date(Date.now() - 1000 * 3600 * 24).toISOString() }
        ];
        setDownloadFiles(mockPdfs);
    };

    // Load actual Google Drive files if token exists
    const loadGoogleDriveFiles = async () => {
        const token = sessionStorage.getItem('google_contacts_token') || getStoredToken() || localStorage.getItem('google_access_token');
        if (!token) return;
        
        setGdriveLoading(true);
        try {
            // We can search for recently modified PDFs on Google Drive
            const response = await fetch('https://www.googleapis.com/drive/v3/files?q=mimeType=\'application/pdf\' and trashed=false&orderBy=modifiedTime desc&pageSize=15&fields=files(id, name, mimeType, webViewLink, size, createdTime)', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (response.ok) {
                const data = await response.json();
                setGdriveFiles(data.files || []);
            }
        } catch (e) {
            console.error('Failed to load Google Drive files:', e);
        } finally {
            setGdriveLoading(false);
        }
    };

    const triggerNativeFileInput = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    // Handle Local File staging
    const handleFileStaged = async (file) => {
        if (!file) return;
        
        // Clean old preview
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        
        setStagedFile(file);
        setDuplicateRecord(null);
        setIsCalculatingHash(true);

        // Generate Preview URL if image
        if (file.type.startsWith('image/')) {
            setPreviewUrl(URL.createObjectURL(file));
        } else {
            setPreviewUrl('');
        }

        // Calculate Hash & Check Duplicates
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

    // Universal Drag & Drop Handler for Files, Thunderbird EMLs, Outlook MSGs, and Gmail HTML
    const handleUniversalDrop = async (e) => {
        e.preventDefault();
        setIsDraggingOver(false);

        // Scenario 1: Standard files dragged (e.g. .eml, .msg, .pdf, .jpg, .docx from Thunderbird, Outlook, or File Explorer)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            handleFileStaged(file);
            return;
        }

        // Scenario 2: Dragged email HTML or plain text from Thunderbird, Outlook Web, or Gmail
        const htmlContent = e.dataTransfer.getData('text/html');
        const plainText = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');

        if (htmlContent || plainText) {
            let emailSubject = 'Thunderbird_Email';
            
            if (plainText) {
                const firstLine = plainText.split('\n')[0].trim();
                if (firstLine && firstLine.length > 2) {
                    emailSubject = firstLine.substring(0, 50).replace(/[/\\?%*:|"<>]/g, '_');
                }
            }

            if (htmlContent) {
                const match = htmlContent.match(/Subject:\s*([^\n<]+)/i) || htmlContent.match(/<title>(.*?)<\/title>/i);
                if (match && match[1]) {
                    emailSubject = match[1].trim().replace(/[/\\?%*:|"<>]/g, '_');
                }
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const fileName = `${emailSubject}_${timestamp}.eml`;
            const rawBody = htmlContent || plainText;

            const emlHeader = `From: Thunderbird/Outlook Drag <email@celron.net>\nSubject: ${emailSubject}\nDate: ${new Date().toUTCString()}\nMIME-Version: 1.0\nContent-Type: text/html; charset=utf-8\n\n`;
            const fullEmlData = emlHeader + rawBody;

            const blob = new Blob([fullEmlData], { type: 'message/rfc822' });
            const emailFile = new File([blob], fileName, { type: 'message/rfc822' });

            handleFileStaged(emailFile);
        }
    };

    // Keyboard clipboard paste
    const handlePaste = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/') || items[i].type === 'application/pdf') {
                const file = items[i].getAsFile();
                if (file) {
                    // Create name for pasted items
                    const extension = items[i].type === 'application/pdf' ? '.pdf' : '.png';
                    const pastedFile = new File([file], `Pasted_Document_${new Date().toLocaleDateString().replace(/\//g, '-')}${extension}`, { type: file.type });
                    handleFileStaged(pastedFile);
                    break;
                }
            }
        }
    };

    const handleConfirmSelection = (customFile = null) => {
        const fileToUpload = customFile || stagedFile;
        if (!fileToUpload) return;

        // Classify metadata suggestions using local AI
        const suggestions = AIFileClassifier.classify(fileToUpload.name);

        // Save entry in the local upload store history
        RecentFilesStore.saveUpload({
            name: fileToUpload.name,
            size: fileToUpload.size,
            documentType: documentType,
            hash: stagedFileHash,
            category: suggestions?.category || 'General',
            company: suggestions?.manufacturer || ''
        });

        // Callback
        onSelect(fileToUpload, suggestions);
        if (!embedded && onClose) onClose();
        resetStagedState();
    };

    const handleSelectRecent = (recent) => {
        // Automatically fetch/mock select for historical files
        const mockFile = new File([], recent.name, { type: 'application/pdf' });
        // Restore meta fields from history
        const suggestions = {
            title: recent.name.replace(/\.[^/.]+$/, ""),
            manufacturer: recent.company,
            model: recent.name.match(/([a-zA-Z]{1,4}[-]?\d{2,5})/)?.[0] || '',
            category: recent.category,
            tags: recent.category
        };
        onSelect(mockFile, suggestions);
        if (!embedded && onClose) onClose();
    };

    const handleSelectMockDownload = (mockDl) => {
        const mockFile = new File([], mockDl.name, { type: 'application/pdf' });
        const suggestions = AIFileClassifier.classify(mockDl.name);
        onSelect(mockFile, suggestions);
        if (!embedded && onClose) onClose();
    };

    const handleSelectGoogleDriveFile = (gFile) => {
        // For Google Drive files, we select it, returning file metadata
        const mockFile = {
            name: gFile.name,
            size: parseInt(gFile.size || 0),
            webViewLink: gFile.webViewLink,
            id: gFile.id,
            isGoogleDrive: true
        };
        const suggestions = AIFileClassifier.classify(gFile.name);
        onSelect(mockFile, suggestions);
        if (!embedded && onClose) onClose();
    };

    const resetStagedState = () => {
        setStagedFile(null);
        setStagedFileHash('');
        setDuplicateRecord(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl('');
        // Clean OCR states too
        setOcrFile(null);
        if (ocrPreviewUrl) URL.revokeObjectURL(ocrPreviewUrl);
        setOcrPreviewUrl(null);
        setExtractedText('');
        setAiResult(null);
    };

    // Polling for mobile uploads inside SmartUploadPanel
    useEffect(() => {
        let intervalId;
        const token = getStoredToken() || localStorage.getItem('google_access_token');
        if (activeTab === 'mobile_qr' && activeFolderId && token) {
            setIsPolling(true);
            let knownFileIds = [];

            const initFiles = async () => {
                try {
                    const files = await listFolderContent(token, activeFolderId);
                    knownFileIds = files.map(f => f.id);
                } catch (e) {
                    console.error("[SmartUploadPanel] Failed to list initial files:", e);
                }
            };
            initFiles();

            intervalId = setInterval(async () => {
                try {
                    const files = await listFolderContent(token, activeFolderId);
                    const newFiles = files.filter(f => !knownFileIds.includes(f.id) && f.mimeType !== 'application/vnd.google-apps.folder');
                    if (newFiles.length > 0) {
                        const targetFile = newFiles[0];
                        clearInterval(intervalId);
                        setIsPolling(false);
                        handleSelectGoogleDriveFile(targetFile);
                    }
                } catch (e) {
                    console.error("[SmartUploadPanel] Polling error:", e);
                }
            }, 3000);
        } else {
            setIsPolling(false);
        }

        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [activeTab, activeFolderId]);

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
                0,
                0,
                canvas.width,
                canvas.height
            );

            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
            const croppedFile = new File([blob], 'ocr_cropped.jpg', { type: 'image/jpeg' });
            
            const text = await performOCR(croppedFile);
            setExtractedText(text);

            if (text) {
                setIsAiProcessing(true);
                try {
                    const result = await parseOCRBusinessCard(text);
                    setAiResult(result);
                } catch (aiErr) {
                    console.warn('AI Parsing failed, using raw text', aiErr);
                } finally {
                    setIsAiProcessing(false);
                }
            }

            // Stage the cropped image file so it is ready for submit
            handleFileStaged(croppedFile);
        } catch (err) {
            console.error('OCR Extraction failed', err);
            alert('Failed to extract text from image. Please try again.');
        } finally {
            setIsExtracting(false);
        }
    };

    // Filter uploads based on Search query
    const filteredRecent = recentFiles.filter(u => {
        const term = searchTerm.toLowerCase();
        return (u.name || '').toLowerCase().includes(term) ||
               (u.company || '').toLowerCase().includes(term) ||
               (u.category || '').toLowerCase().includes(term);
    });

    if (!isOpen && !embedded) return null;

    const panelContent = (
        <div className="glass-panel animate-scale-up" 
            onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleUniversalDrop}
            style={{ 
                background: '#ffffff', 
                color: '#1e293b', 
                maxWidth: embedded ? '100%' : '960px', 
                width: '100%', 
                height: embedded ? '580px' : '660px',
                borderRadius: embedded ? '16px' : '24px', 
                border: isDraggingOver ? '2px dashed #6366f1' : '1px solid #e2e8f0', 
                boxShadow: embedded ? '0 4px 16px rgba(0,0,0,0.05)' : '0 25px 50px -12px rgba(0,0,0,0.25)', 
                display: 'flex', 
                flexDirection: 'column', 
                overflow: 'hidden',
                position: 'relative'
            }}
        >
            {/* Header */}
            <div style={{ padding: embedded ? '14px 20px' : '20px 28px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Cloud size={24} color="#6366f1" />
                    <div>
                        <h3 style={{ margin: 0, fontSize: embedded ? '1.05rem' : '1.2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            Smart Document Upload
                            {runningEnquiryNo && (
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '12px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
                                    Folder: {runningEnquiryNo}
                                </span>
                            )}
                        </h3>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {runningEnquiryNo 
                                ? `All uploaded files automatically reach the project folder for ${runningEnquiryNo}` 
                                : 'Select a file source to instantly upload and tag technical documents'}
                        </span>
                    </div>
                </div>
                {!embedded && onClose && (
                    <button 
                        onClick={onClose}
                        style={{ background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer', color: '#94a3b8', padding: '6px', borderRadius: '10px', display: 'flex', alignItems: 'center' }}
                    >
                        <X size={18} />
                    </button>
                )}
            </div>

            {/* Body Area */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    
                    {/* Left Tabs Nav */}
                    <nav style={{ width: '220px', borderRight: '1px solid #f1f5f9', background: '#f8fafc', padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <button 
                            onClick={() => { setActiveTab('recent'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 14px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                                background: activeTab === 'recent' ? '#6366f1' : 'transparent',
                                color: activeTab === 'recent' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <Clock size={16} /> Recent Files
                        </button>
                        <button 
                            onClick={() => { setActiveTab('clipboard'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 14px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                                background: activeTab === 'clipboard' ? '#6366f1' : 'transparent',
                                color: activeTab === 'clipboard' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <Clipboard size={16} /> Clipboard Paste
                        </button>
                        <button 
                            onClick={() => { setActiveTab('downloads'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 14px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                                background: activeTab === 'downloads' ? '#6366f1' : 'transparent',
                                color: activeTab === 'downloads' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <Download size={16} /> Downloads Folder
                        </button>
                        <button 
                            onClick={() => { setActiveTab('gdrive'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 14px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                                background: activeTab === 'gdrive' ? '#6366f1' : 'transparent',
                                color: activeTab === 'gdrive' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <Cloud size={16} /> Google Drive
                        </button>
                        <button 
                            onClick={() => { setActiveTab('dragdrop'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 14px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                                background: activeTab === 'dragdrop' ? '#6366f1' : 'transparent',
                                color: activeTab === 'dragdrop' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <Monitor size={16} /> Drag &amp; Drop Zone
                        </button>
                        <button 
                            onClick={() => { setActiveTab('ocr'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 14px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                                background: activeTab === 'ocr' ? '#6366f1' : 'transparent',
                                color: activeTab === 'ocr' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <Sparkles size={16} /> Smart OCR
                        </button>
                        <button 
                            onClick={() => { setActiveTab('camera'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 14px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                                background: activeTab === 'camera' ? '#6366f1' : 'transparent',
                                color: activeTab === 'camera' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <Camera size={16} /> Camera Photo
                        </button>
                        <button 
                            onClick={() => { setActiveTab('mobile_qr'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 14px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                                background: activeTab === 'mobile_qr' ? '#6366f1' : 'transparent',
                                color: activeTab === 'mobile_qr' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <Smartphone size={16} /> Mobile Upload (QR)
                        </button>
                        <button 
                            onClick={() => { setActiveTab('whatsapp'); resetStagedState(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 14px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                                background: activeTab === 'whatsapp' ? '#25D366' : 'transparent',
                                color: activeTab === 'whatsapp' ? '#fff' : '#475569',
                                textAlign: 'left', transition: 'all 0.2s'
                            }}
                        >
                            <MessageSquare size={16} /> WhatsApp Integration
                        </button>

                        <div style={{ marginTop: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: '16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontWeight: 600 }}>
                                <Keyboard size={14} /> Shortcuts
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div><code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>Ctrl+R</code> Recents</div>
                                <div><code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>Ctrl+V</code> Paste</div>
                                <div><code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>Ctrl+D</code> Downloads</div>
                                <div><code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>Ctrl+B</code> Browse</div>
                            </div>
                        </div>
                    </nav>

                    {/* Right Staging & Panel Content */}
                    <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                        
                        {/* 1. RECENT FILES TAB */}
                        {activeTab === 'recent' && (
                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
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
                                    {/* Image 2 View Toggle Component */}
                                    <div style={{ display: 'flex', background: '#f8fafc', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0', flexShrink: 0 }}>
                                        <button 
                                            type="button"
                                            onClick={() => setPanelViewMode('grid')} 
                                            title="Grid View Mode"
                                            style={{ padding: '6px 10px', background: panelViewMode === 'grid' ? '#fff' : 'transparent', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: panelViewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center' }}
                                        >
                                            <Grid size={16} color={panelViewMode === 'grid' ? '#6366f1' : '#64748b'} />
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setPanelViewMode('list')} 
                                            title="List View Mode"
                                            style={{ padding: '6px 10px', background: panelViewMode === 'list' ? '#fff' : 'transparent', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: panelViewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center' }}
                                        >
                                            <List size={16} color={panelViewMode === 'list' ? '#6366f1' : '#64748b'} />
                                        </button>
                                    </div>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: '12px', padding: '8px' }}>
                                    {filteredRecent.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                                            <Clock size={32} style={{ opacity: 0.3, marginBottom: '8px', margin: '0 auto' }} />
                                            No recent uploads found.
                                        </div>
                                    ) : panelViewMode === 'grid' ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                                            {filteredRecent.map(file => (
                                                <div 
                                                    key={file.id} 
                                                    onClick={() => handleSelectRecent(file)}
                                                    style={{ 
                                                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '12px', 
                                                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', fontSize: '0.8rem'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
                                                    onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                                                        <FileText size={20} color="#6366f1" style={{ flexShrink: 0 }} />
                                                        <strong style={{ color: '#334155', wordBreak: 'break-word', lineHeight: '1.3' }}>{file.name}</strong>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
                                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                            {new Date(file.uploadDate).toLocaleDateString()}
                                                        </span>
                                                        {file.url && (
                                                            <a
                                                                href={file.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '2px 6px', fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                                                                title="Direct Open Link"
                                                            >
                                                                Open <ExternalLink size={10} />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {filteredRecent.map(file => (
                                                <div 
                                                    key={file.id} 
                                                    onClick={() => handleSelectRecent(file)}
                                                    style={{ 
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', 
                                                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                                                        <FileText size={16} color="#6366f1" style={{ flexShrink: 0 }} />
                                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            <strong style={{ color: '#334155' }}>{file.name}</strong>
                                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                                {file.company && `${file.company} | `}{file.category}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                            {new Date(file.uploadDate).toLocaleDateString()}
                                                        </span>
                                                        {file.url && (
                                                            <a
                                                                href={file.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                                                title="Direct Open Link"
                                                            >
                                                                Open <ExternalLink size={10} />
                                                            </a>
                                                        )}
                                                    </div>
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
                                    Click here and press <kbd style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>Ctrl + V</kbd> to paste a copied PDF, image, or screenshot directly.
                                </p>
                            </div>
                        )}

                        {/* 3. DOWNLOADS TAB */}
                        {activeTab === 'downloads' && (
                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', background: '#eff6ff', padding: '10px 14px', borderRadius: '10px', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                    <AlertCircle size={14} style={{ flexShrink: 0 }} />
                                    <span>Simulating downloads folder contents due to browser security sandbox. Select a recently downloaded PDF below.</span>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {downloadFiles.map(dl => (
                                        <div 
                                            key={dl.id}
                                            onClick={() => handleSelectMockDownload(dl)}
                                            style={{ 
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', 
                                                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', fontSize: '0.8rem'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <Download size={16} color="#0ea5e9" />
                                                <strong>{dl.name}</strong>
                                            </div>
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                {Math.round(dl.size / (1024 * 102.4)) / 10} MB
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 4. GOOGLE DRIVE TAB */}
                        {activeTab === 'gdrive' && (
                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Cloud size={16} color="#6366f1" /> Google Drive Workspace Files ({gdriveFiles.length})
                                    </span>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {/* Mobile Direct GDrive Scan QR Button */}
                                        <button
                                            type="button"
                                            onClick={() => setShowDriveQrModal(!showDriveQrModal)}
                                            title="Scan QR code on mobile to open Celron_Scans Drive directory"
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                background: showDriveQrModal ? '#4f46e5' : '#eff6ff',
                                                color: showDriveQrModal ? '#fff' : '#2563eb',
                                                border: '1px solid ' + (showDriveQrModal ? '#4338ca' : '#bfdbfe'),
                                                padding: '5px 12px',
                                                borderRadius: '8px',
                                                fontSize: '0.78rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <QrCode size={15} />
                                            <span>Scan via Mobile QR</span>
                                        </button>

                                        {/* View Toggle Component */}
                                        <div style={{ display: 'flex', background: '#f8fafc', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                            <button 
                                                type="button"
                                                onClick={() => setPanelViewMode('grid')} 
                                                title="Grid View Mode"
                                                style={{ padding: '6px 10px', background: panelViewMode === 'grid' ? '#fff' : 'transparent', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: panelViewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center' }}
                                            >
                                                <Grid size={16} color={panelViewMode === 'grid' ? '#6366f1' : '#64748b'} />
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => setPanelViewMode('list')} 
                                                title="List View Mode"
                                                style={{ padding: '6px 10px', background: panelViewMode === 'list' ? '#fff' : 'transparent', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: panelViewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center' }}
                                            >
                                                <List size={16} color={panelViewMode === 'list' ? '#6366f1' : '#64748b'} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Expandable QR Code Card for Mobile Direct Drive Scan */}
                                {showDriveQrModal && (
                                    <div style={{
                                        background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)',
                                        border: '1px solid #bfdbfe',
                                        borderRadius: '12px',
                                        padding: '16px',
                                        marginBottom: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '20px',
                                        flexWrap: 'wrap',
                                        position: 'relative'
                                    }}>
                                        <div style={{ background: '#fff', padding: '10px', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexShrink: 0 }}>
                                            <QRCodeSVG 
                                                value={
                                                    activeFolderId && activeFolderId.startsWith('http') 
                                                        ? activeFolderId 
                                                        : `https://drive.google.com/drive/folders/${activeFolderId || DEFAULT_GDRIVE_FOLDER_ID}?usp=drive_link`
                                                } 
                                                size={110} 
                                                level="H" 
                                                includeMargin={true} 
                                            />
                                        </div>
                                        <div style={{ flex: 1, minWidth: '220px' }}>
                                            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.92rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Smartphone size={16} color="#2563eb" /> Mobile Google Drive Direct Scan
                                            </h4>
                                            <p style={{ margin: '0 0 8px 0', fontSize: '0.78rem', color: '#475569', lineHeight: '1.4' }}>
                                                Scan this QR code using your smartphone camera or Google Drive app to immediately open the <strong>Celron_Scans</strong> folder on your phone for direct document scanning.
                                            </p>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <a
                                                    href={
                                                        activeFolderId && activeFolderId.startsWith('http') 
                                                            ? activeFolderId 
                                                            : `https://drive.google.com/drive/folders/${activeFolderId || DEFAULT_GDRIVE_FOLDER_ID}?usp=drive_link`
                                                    }
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{ fontSize: '0.74rem', fontWeight: 700, color: '#2563eb', textDecoration: 'none', background: '#fff', padding: '4px 10px', borderRadius: '6px', border: '1px solid #bfdbfe', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    Open Drive Directory <ExternalLink size={10} />
                                                </a>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowDriveQrModal(false)}
                                            style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                )}

                                {gdriveLoading ? (
                                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
                                        <div className="animate-spin" style={{ width: '32px', height: '32px', border: '3px solid #f3f3f3', borderTop: '3px solid #6366f1', borderRadius: '50%', margin: '0 auto 12px' }}></div>
                                        <span>Listing Drive files...</span>
                                    </div>
                                ) : gdriveFiles.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                                        <Cloud size={36} style={{ opacity: 0.3, marginBottom: '8px', margin: '0 auto' }} />
                                        <span>No recent PDF files found on Google Drive. Make sure Google Drive is connected.</span>
                                    </div>
                                ) : panelViewMode === 'grid' ? (
                                    /* GRID VIEW MODE */
                                    <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', paddingRight: '4px' }}>
                                        {gdriveFiles.map(gf => (
                                            <div 
                                                key={gf.id}
                                                onClick={() => handleSelectGoogleDriveFile(gf)}
                                                style={{ 
                                                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '14px', 
                                                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', fontSize: '0.85rem', minHeight: '120px'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
                                                onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                                                    <div style={{ background: '#eff6ff', padding: '8px', borderRadius: '8px', flexShrink: 0 }}>
                                                        <Cloud size={20} color="#6366f1" />
                                                    </div>
                                                    <strong style={{ fontSize: '0.82rem', color: '#1e293b', lineHeight: '1.3', wordBreak: 'break-word' }}>{gf.name}</strong>
                                                </div>

                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                        {new Date(gf.createdTime || Date.now()).toLocaleDateString()}
                                                    </span>
                                                    {gf.webViewLink && (
                                                        <a
                                                            href={gf.webViewLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                                            title="Direct Open Link"
                                                        >
                                                            Open <ExternalLink size={10} />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    /* LIST VIEW MODE */
                                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {gdriveFiles.map(gf => (
                                            <div 
                                                key={gf.id}
                                                onClick={() => handleSelectGoogleDriveFile(gf)}
                                                style={{ 
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', 
                                                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                                                    <Cloud size={16} color="#6366f1" style={{ flexShrink: 0 }} />
                                                    <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gf.name}</strong>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                        {new Date(gf.createdTime || Date.now()).toLocaleDateString()}
                                                    </span>
                                                    {gf.webViewLink && (
                                                        <a
                                                            href={gf.webViewLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                            title="Direct Open Link"
                                                        >
                                                            Open Direct Link <ExternalLink size={12} />
                                                        </a>
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
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
                                <div>
                                    <h3 style={{ margin: '0 0 4px 0', fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                                        Document Uploader
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                                        Ingest new documents into the enterprise pipeline.
                                    </p>
                                </div>

                                {/* Drag & Drop Main Card */}
                                <div 
                                    onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                                    onDragLeave={() => setIsDraggingOver(false)}
                                    onDrop={handleUniversalDrop}
                                    style={{ 
                                        background: isDraggingOver ? '#eff6ff' : '#ffffff', 
                                        border: isDraggingOver ? '2px dashed #2563eb' : '1px solid #e2e8f0', 
                                        borderRadius: '16px', 
                                        padding: '40px 24px', 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        textAlign: 'center',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                                        <Cloud size={32} color="#475569" />
                                    </div>

                                    <h4 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                                        Drag and drop files here
                                    </h4>
                                    <p style={{ margin: '0 0 20px 0', fontSize: '0.82rem', color: '#64748b', maxWidth: '420px', lineHeight: '1.4' }}>
                                        Support for PDF, DOCX, XLSX, EML, and high-res images.<br />
                                        Documents are automatically indexed by the AI Engine.
                                    </p>

                                    <button 
                                        type="button"
                                        onClick={triggerNativeFileInput}
                                        style={{ 
                                            background: '#004AC6', 
                                            color: '#ffffff', 
                                            border: 'none', 
                                            borderRadius: '8px', 
                                            padding: '10px 24px', 
                                            fontSize: '0.88rem', 
                                            fontWeight: 700, 
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(0,74,198,0.25)',
                                            transition: 'transform 0.1s'
                                        }}
                                    >
                                        Select Files
                                    </button>
                                </div>

                                {/* DIRECT IMPORT CHANNELS */}
                                <div>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                                        DIRECT IMPORT CHANNELS
                                    </span>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('dragdrop')}
                                            style={{
                                                background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 12px',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer', transition: 'all 0.2s'
                                            }}
                                        >
                                            <Mail size={22} color="#3b82f6" />
                                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>Email</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('whatsapp')}
                                            style={{
                                                background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 12px',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer', transition: 'all 0.2s'
                                            }}
                                        >
                                            <MessageSquare size={22} color="#25D366" />
                                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>WhatsApp</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('ocr')}
                                            style={{
                                                background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 12px',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer', transition: 'all 0.2s'
                                            }}
                                        >
                                            <Sparkles size={22} color="#8b5cf6" />
                                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>Scan</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('mobile_qr')}
                                            style={{
                                                background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 12px',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer', transition: 'all 0.2s'
                                            }}
                                        >
                                            <Smartphone size={22} color="#059669" />
                                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>External API</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Pro Tip Banner */}
                                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.78rem', color: '#1e40af' }}>
                                    <span style={{ fontSize: '1rem' }}>💡</span>
                                    <span>
                                        <strong>Pro Tip:</strong> Connect your email or WhatsApp to automatically scrape attachments into the <strong>{runningEnquiryNo || 'Enquiries'}</strong> folder.
                                    </span>
                                </div>
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
                                        {/* Left: Crop area */}
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
                                        {/* Right: Results area */}
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', overflow: 'hidden' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>Extracted Results</span>
                                            {isAiProcessing ? (
                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#64748b' }}>
                                                    <Loader2 size={24} className="animate-spin" style={{ marginBottom: '8px' }} />
                                                    <span style={{ fontSize: '0.8rem' }}>AI parsing details...</span>
                                                </div>
                                            ) : (
                                                <textarea
                                                    readOnly
                                                    value={extractedText || 'No text extracted yet. Adjust crop and click "Extract & Apply".'}
                                                    style={{ flex: 1, width: '100%', padding: '10px', fontSize: '0.8rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc', resize: 'none', outline: 'none' }}
                                                />
                                            )}
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

                                        {/* Status Badge */}
                                        <div style={{ position: 'absolute', top: '14px', left: '14px', background: 'rgba(15, 23, 42, 0.75)', color: '#fff', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', backdropFilter: 'blur(4px)' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isCameraActive ? '#22c55e' : '#ef4444' }} />
                                            {isCameraActive ? 'Camera Live' : 'Connecting Camera...'}
                                        </div>

                                        {/* Flip Camera Button */}
                                        <button
                                            onClick={toggleCameraFacingMode}
                                            style={{ position: 'absolute', top: '14px', right: '14px', background: 'rgba(15, 23, 42, 0.75)', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', backdropFilter: 'blur(4px)' }}
                                            title="Switch Front / Rear Camera"
                                        >
                                            <RefreshCw size={14} /> Flip Camera
                                        </button>

                                        {/* Snap Photo Button */}
                                        <div style={{ position: 'absolute', bottom: '16px', left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                            <button
                                                onClick={captureCameraPhoto}
                                                disabled={!isCameraActive}
                                                style={{
                                                    background: isCameraActive ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : '#cbd5e1',
                                                    color: '#ffffff',
                                                    border: '4px solid rgba(255,255,255,0.8)',
                                                    borderRadius: '50px',
                                                    padding: '12px 28px',
                                                    fontSize: '0.9rem',
                                                    fontWeight: 800,
                                                    cursor: isCameraActive ? 'pointer' : 'not-allowed',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    boxShadow: '0 8px 20px rgba(239, 68, 68, 0.4)'
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
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', textAlign: 'center', padding: '20px' }}>
                                {!activeFolderId ? (
                                    <div style={{ color: '#64748b' }}>
                                        <AlertCircle size={48} style={{ opacity: 0.3, marginBottom: '12px', margin: '0 auto' }} />
                                        <h4 style={{ margin: '0 0 4px 0' }}>No Active Folder Linked</h4>
                                        <p style={{ fontSize: '0.8rem', margin: 0 }}>This page has not established a Google Drive folder structure yet. Please upload a document first to initialize the folders.</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                                        <div style={{ background: '#fff', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                                            <img 
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                                                    `${window.location.origin}/upload-media?folderId=${activeFolderId}&token=${getStoredToken() || localStorage.getItem('google_access_token') || ''}&jobName=${encodeURIComponent(activeFolderName)}`
                                                )}`} 
                                                alt="QR Code" 
                                                style={{ width: '180px', height: '180px' }} 
                                            />
                                        </div>
                                        <div>
                                            <h4 style={{ margin: '0 0 4px 0', color: '#1e293b' }}>Scan to Upload from Smartphone</h4>
                                            <p style={{ fontSize: '0.8rem', color: '#64748b', maxWidth: '360px', margin: '0 auto 8px' }}>
                                                Scan this QR code with your mobile camera or WhatsApp to easily take photos and upload them directly.
                                            </p>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#059669', fontSize: '0.8rem', fontWeight: 600 }}>
                                                <Loader2 size={14} className="animate-spin" />
                                                <span>{isPolling ? 'Waiting for mobile uploads...' : 'Connecting to Drive...'}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 8. WHATSAPP INTEGRATION TAB */}
                        {activeTab === 'whatsapp' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
                                <div style={{ 
                                    background: 'linear-gradient(135deg, rgba(37, 211, 102, 0.12) 0%, rgba(18, 140, 126, 0.12) 100%)', 
                                    border: '1px solid rgba(37, 211, 102, 0.3)', 
                                    borderRadius: '16px', 
                                    padding: '16px 20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '16px',
                                    flexWrap: 'wrap'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                        <div style={{ background: '#25D366', color: '#fff', padding: '10px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)' }}>
                                            <MessageSquare size={24} />
                                        </div>
                                        <div>
                                            <h4 style={{ margin: '0 0 2px 0', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                                                WhatsApp Smart Upload (Personal & Business)
                                            </h4>
                                            <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                                                Drag PDFs or photos directly from WhatsApp Web (`web.whatsapp.com`) into CelronHub
                                            </span>
                                        </div>
                                    </div>

                                    <a
                                        href="https://web.whatsapp.com"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            background: '#25D366',
                                            color: '#ffffff',
                                            padding: '8px 14px',
                                            borderRadius: '8px',
                                            fontSize: '0.8rem',
                                            fontWeight: 700,
                                            textDecoration: 'none',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            boxShadow: '0 2px 6px rgba(37, 211, 102, 0.3)'
                                        }}
                                    >
                                        Open WhatsApp Web <ExternalLink size={12} />
                                    </a>
                                </div>

                                <div 
                                    onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                                    onDragLeave={() => setIsDraggingOver(false)}
                                    onDrop={handleUniversalDrop}
                                    style={{ 
                                        flex: 1, 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        justifyContent: 'center', 
                                        alignItems: 'center', 
                                        border: isDraggingOver ? '2px dashed #25D366' : '2px dashed #a7f3d0', 
                                        borderRadius: '16px', 
                                        background: isDraggingOver ? '#ecfdf5' : '#f0fdf4', 
                                        padding: '24px 20px',
                                        transition: 'all 0.2s', 
                                        textAlign: 'center',
                                        minHeight: '200px'
                                    }}
                                >
                                    <div style={{ background: '#dcfce7', color: '#15803d', padding: '12px', borderRadius: '50%', marginBottom: '10px' }}>
                                        <MessageSquare size={28} />
                                    </div>
                                    <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 800, color: '#14532d' }}>
                                        Drag & Drop Purchase Orders / Quotations Here
                                    </h4>
                                    <p style={{ margin: '0 0 14px 0', fontSize: '0.8rem', color: '#166534', maxWidth: '420px', lineHeight: '1.4' }}>
                                        Open <strong>WhatsApp Web</strong> alongside CelronHub. Drag any PO document directly from your chat window into this zone, or copy an image/file in WhatsApp (`Ctrl+C`) and press `Ctrl+V`!
                                    </p>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', background: '#25D366', color: '#fff' }}>
                                            📱 Personal WhatsApp
                                        </span>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', background: '#128C7E', color: '#fff' }}>
                                            💼 Business WhatsApp
                                        </span>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', background: '#059669', color: '#fff' }}>
                                            ⚡ Drag PDF / PNG / JPG
                                        </span>
                                    </div>
                                </div>

                                <div style={{ 
                                    background: '#f8fafc', 
                                    border: '1px solid #e2e8f0', 
                                    borderRadius: '14px', 
                                    padding: '12px 16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '14px'
                                }}>
                                    <div style={{ background: '#fff', padding: '6px', borderRadius: '8px', border: '1px solid #cbd5e1', flexShrink: 0 }}>
                                        <QRCodeSVG 
                                            value={`https://wa.me/6597685891?text=Send%20document%20for%20${runningEnquiryNo || 'CelronHub'}`}
                                            size={70}
                                            level="M"
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <h5 style={{ margin: '0 0 2px 0', fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>
                                            WhatsApp Cloud Ingestion Bot (+65 97685891)
                                        </h5>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', lineHeight: '1.35' }}>
                                            Customers can also send orders directly to your WhatsApp Business number. Incoming files automatically sync with <strong>{runningEnquiryNo || 'your Job Suite'}</strong>.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Staged File Preview / Confirmation Area */}
                        {stagedFile && (
                            <div className="glass-panel" style={{ marginTop: '20px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #cbd5e1', position: 'relative' }}>
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
                                        {isCalculatingHash && (
                                            <div style={{ fontSize: '0.7rem', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                <div className="animate-spin" style={{ width: '10px', height: '10px', border: '1px solid #6366f1', borderTop: '1px solid transparent', borderRadius: '50%' }}></div>
                                                Calculating SHA-256 Checksum...
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Auto-Preview AI suggestion snippet */}
                                {!duplicateRecord && (
                                    <div style={{ marginTop: '12px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Sparkles size={14} color="#15803d" />
                                        <span style={{ fontSize: '0.75rem', color: '#166534' }}>
                                            <strong>Local AI Classified:</strong> Equipment brand/model and tags will be auto-suggested.
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Controls */}
                <div style={{ padding: '16px 28px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <button 
                        onClick={triggerNativeFileInput}
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, padding: '10px 16px', background: '#fff' }}
                    >
                        <Monitor size={16} /> Browse Computer
                    </button>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button 
                            onClick={onClose}
                            className="btn btn-secondary"
                            style={{ padding: '10px 20px', background: '#fff' }}
                        >
                            Cancel
                        </button>
                        <button 
                            disabled={!stagedFile || isCalculatingHash}
                            onClick={() => handleConfirmSelection()}
                            className="btn btn-primary"
                            style={{ padding: '10px 24px', background: '#6366f1', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}
                        >
                            <CheckCircle size={16} /> Confirm &amp; Upload
                        </button>
                    </div>
                </div>

                {/* Duplicate matches alert modal layer */}
                {duplicateRecord && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999 }}>
                        <div className="glass-panel animate-scale-up" style={{ background: '#fffbf0', border: '1px solid #fde68a', maxWidth: '400px', width: '90%', padding: '28px', borderRadius: '20px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                <ShieldAlert size={26} />
                            </div>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#92400e', marginBottom: '8px' }}>Duplicate File Detected</h3>
                            <p style={{ fontSize: '0.8rem', color: '#b45309', marginBottom: '20px', lineHeight: '1.4' }}>
                                This file checksum (SHA-256) matches a previously uploaded document:
                                <br />
                                <strong style={{ color: '#78350f' }}>{duplicateRecord.name}</strong>
                                <br />
                                Uploaded on: {new Date(duplicateRecord.uploadDate).toLocaleDateString()}
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <button 
                                    onClick={() => handleConfirmSelection(stagedFile)} // Upload anyway
                                    className="btn btn-primary"
                                    style={{ width: '100%', padding: '10px', background: '#d97706', border: 'none', color: '#fff', fontWeight: 700 }}
                                >
                                    Upload Anyway
                                </button>
                                <button 
                                    onClick={() => {
                                        // Open existing: return mock selected file and dismiss
                                        handleConfirmSelection(stagedFile);
                                    }}
                                    className="btn btn-secondary"
                                    style={{ width: '100%', padding: '10px', background: '#fff', border: '1px solid #d97706', color: '#d97706', fontWeight: 700 }}
                                >
                                    Use Existing
                                </button>
                                <button 
                                    onClick={resetStagedState}
                                    style={{ width: '100%', padding: '8px', background: 'none', border: 'none', color: '#b45309', cursor: 'pointer', fontSize: '0.8rem' }}
                                >
                                    Cancel Selection
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Hidden Native File Input */}
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    accept={accept} 
                    onChange={handleNativeFileChange} 
                    style={{ display: 'none' }} 
                />
            </div>
    );

    if (embedded) {
        return panelContent;
    }

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
            {panelContent}
        </div>
    );
}
