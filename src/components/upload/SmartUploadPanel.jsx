import React, { useState, useEffect, useRef } from 'react';
import { 
    Search, X, Clock, Clipboard, Download, Cloud, Monitor, 
    AlertCircle, FileText, CheckCircle, Pin, Folder, Star, 
    Sparkles, ShieldAlert, FileImage, FileCode, Keyboard,
    Smartphone, QrCode, Image as ImageIcon, Loader2
} from 'lucide-react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { performOCR } from '../../lib/googleAuthService';
import { parseOCRBusinessCard } from '../../lib/geminiService';
import { RecentFilesStore } from './RecentFilesStore';
import { AIFileClassifier } from './AIFileClassifier';
import { DuplicateChecker } from './DuplicateChecker';
import { listFolderContent } from '../../lib/driveService';
import { getStoredToken } from '../../lib/googleAuthService';

export default function SmartUploadPanel({ isOpen, onClose, onSelect, documentType = 'manual', accept = '.pdf', activeFolderId = null, activeFolderName = 'System Workspace', initialTab = 'recent' }) {
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

    // Cleanup object URL previews to prevent leaks
    useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

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
        onClose();
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
        onClose();
    };

    const handleSelectMockDownload = (mockDl) => {
        const mockFile = new File([], mockDl.name, { type: 'application/pdf' });
        const suggestions = AIFileClassifier.classify(mockDl.name);
        onSelect(mockFile, suggestions);
        onClose();
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
        onClose();
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

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
            
            {/* Modal Box */}
            <div className="glass-panel animate-scale-up" 
                style={{ 
                    background: '#ffffff', 
                    color: '#1e293b', 
                    maxWidth: '960px', 
                    width: '100%', 
                    height: '660px',
                    borderRadius: '24px', 
                    border: '1px solid #e2e8f0', 
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    overflow: 'hidden',
                    position: 'relative'
                }}
            >
                {/* Header */}
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
                                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', flexShrink: 0 }}>
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
                                ) : (
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
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <Cloud size={16} color="#6366f1" />
                                                    <strong>{gf.name}</strong>
                                                </div>
                                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                    {new Date(gf.createdTime).toLocaleDateString()}
                                                </span>
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

                        {/* 7. MOBILE UPLOAD (QR) TAB */}
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
        </div>
    );
}
