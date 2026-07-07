import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Crop as CropIcon, Copy, Sparkles, Loader2, Image as ImageIcon, History, Trash2, FileText, CheckCircle2, Plus, HardDrive, Download, Eye, QrCode, Smartphone, Info } from 'lucide-react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import Tesseract from 'tesseract.js';
import { getOrCreateFolder, uploadFileToDrive, getFileContent, listFolderContent, deleteFile } from '../../lib/driveService';
import { connectGoogleAPI } from '../../lib/googleAuthService';
import UploadOverlay from '../../components/common/UploadOverlay';
import toast from 'react-hot-toast';

// Styles moved to constant to avoid build-time layout issues
const ocrStyles = `
    .glass-panel {
        background: rgba(255, 255, 255, 0.7);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.5);
        border-radius: 20px;
        box-shadow: 0 8px 32px rgba(31, 38, 135, 0.07);
    }
    .btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        border-radius: 10px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        border: 1px solid transparent;
        font-size: 0.9rem;
    }
    .btn-primary { color: white; background: #6366f1; }
    .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2); }
    .btn-secondary { background: #fff; border: 1px solid #e2e8f0; color: #64748b; }
    .btn-secondary:hover { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }
    .history-card:hover { border-color: #6366f1 !important; background: #fdfeff !important; box-shadow: 0 4px 12px -2px rgba(99, 102, 241, 0.1); transform: translateY(-2px); }
    .history-action-btn { padding: 6px; border: 1px solid #e2e8f0; background: #fff; border-radius: 6px; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
    .history-action-btn:hover { background: #6366f1; color: #fff; border-color: #6366f1; }
    .delete-btn:hover { background: #ef4444 !important; border-color: #ef4444 !important; color: #fff !important; }
`;

import { useAuth } from '../../contexts/AuthContext';

export default function SmartOCR() {
    const { profile } = useAuth();
    const [image, setImage] = useState(null);
    const [qrModal, setQrModal] = useState({ isOpen: false, folderId: null, folderName: '' });
    const [isPolling, setIsPolling] = useState(false);

    const handleOpenMobileUpload = async () => {
        const token = localStorage.getItem('google_access_token');
        if (!token) {
            sessionStorage.setItem('google_auth_return_url', window.location.pathname + window.location.search);
            connectGoogleAPI('ocr');
            return;
        }
        setQrModal({ isOpen: true, folderId: null, folderName: 'OCR Extractions' });
        try {
            const folderId = await getOrCreateFolder(token, 'OCR Extractions');
            setQrModal({ isOpen: true, folderId: folderId, folderName: 'OCR Extractions' });
        } catch (err) {
            console.error('Failed to prepare folder:', err);
            toast.error('Failed to connect to Google Drive.');
            setQrModal({ isOpen: false, folderId: null, folderName: '' });
        }
    };

    useEffect(() => {
        let intervalId = null;
        if (qrModal.isOpen && qrModal.folderId) {
            setIsPolling(true);
            const token = localStorage.getItem('google_access_token');
            let knownFileIds = [];

            const initFiles = async () => {
                try {
                    const files = await listFolderContent(token, qrModal.folderId);
                    knownFileIds = files.map(f => f.id);
                } catch (e) {
                    console.error("Failed to list initial files:", e);
                }
            };
            initFiles();

            intervalId = setInterval(async () => {
                try {
                    const files = await listFolderContent(token, qrModal.folderId);
                    const newFiles = files.filter(f => !knownFileIds.includes(f.id));
                    if (newFiles.length > 0) {
                        const targetFile = newFiles[0];
                        clearInterval(intervalId);
                        setQrModal({ isOpen: false, folderId: null, folderName: '' });
                        setIsPolling(false);
                        toast.success("Mobile upload detected! Loading document...");

                        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${targetFile.id}?alt=media`, {
                            headers: { 'Authorization': 'Bearer ' + token }
                        });
                        const blob = await response.blob();
                        const r = new FileReader();
                        r.onload = () => {
                            setImage(r.result);
                            toast.success("Document loaded successfully!");
                        };
                        r.readAsDataURL(blob);
                    }
                } catch (e) {
                    console.error("Polling error:", e);
                }
            }, 3000);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
            setIsPolling(false);
        };
    }, [qrModal.isOpen, qrModal.folderId]);

    const [crop, setCrop] = useState();
    const [completedCrop, setCompletedCrop] = useState(null);
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractedText, setExtractedText] = useState('');
    const [history, setHistory] = useState(() => {
        const saved = localStorage.getItem('ocr_history');
        return saved ? JSON.parse(saved) : [];
    });
    const [copied, setCopied] = useState(false);
    const [isSavingDrive, setIsSavingDrive] = useState(false);
    const [driveError, setDriveError] = useState(null);
    const [driveSuccess, setDriveSuccess] = useState(false);
    const [driveFileUrl, setDriveFileUrl] = useState(null);
    const [historyTab, setHistoryTab] = useState('local');
    const [cloudHistory, setCloudHistory] = useState([]);
    const [isLoadingCloud, setIsLoadingCloud] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadLink, setUploadLink] = useState(null);
    const imgRef = useRef(null);

    useEffect(() => {
        localStorage.setItem('ocr_history', JSON.stringify(history));
    }, [history]);

    useEffect(() => {
        if (historyTab === 'cloud') fetchCloudHistory();
    }, [historyTab]);

    const fetchCloudHistory = async () => {
        const accessToken = localStorage.getItem('google_access_token');
        if (!accessToken) return;
        setIsLoadingCloud(true);
        try {
            const folderId = await getOrCreateFolder(accessToken, 'OCR Extractions');
            const files = await listFolderContent(accessToken, folderId);
            setCloudHistory(files);
        } catch (err) {
            console.error('Cloud history error:', err);
        } finally {
            setIsLoadingCloud(false);
        }
    };

    const handleExtract = async () => {
        if (!completedCrop || !imgRef.current) return;
        setIsExtracting(true);
        try {
            const canvas = document.createElement('canvas');
            const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
            const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
            canvas.width = completedCrop.width * scaleX;
            canvas.height = completedCrop.height * scaleY;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgRef.current, completedCrop.x * scaleX, completedCrop.y * scaleY, completedCrop.width * scaleX, completedCrop.height * scaleY, 0, 0, completedCrop.width * scaleX, completedCrop.height * scaleY);
            const base64Image = canvas.toDataURL('image/jpeg');
            const result = await Tesseract.recognize(base64Image, 'eng');
            const newText = result.data.text.trim();
            setExtractedText(newText);
            if (newText) {
                const historyItem = { id: Date.now(), text: newText, timestamp: new Date().toLocaleString(), preview: base64Image };
                setHistory(prev => [historyItem, ...prev].slice(0, 20));
            }
        } catch (err) {
            console.error('OCR Error:', err);
            alert('Failed to extract text.');
        } finally {
            setIsExtracting(false);
        }
    };

    const handleSaveToDrive = async () => {
        if (!extractedText.trim()) return;
        const accessToken = localStorage.getItem('google_access_token');
        if (!accessToken) { setDriveError("Google account not connected."); return; }
        setIsSavingDrive(true);
        setDriveError(null);
        setDriveSuccess(false);
        try {
            const folderId = await getOrCreateFolder(accessToken, 'OCR Extractions');
            const fileName = `OCR_${extractedText.slice(0, 15).replace(/[^a-z0-9]/gi, '_')}_${new Date().getTime()}.txt`;
            const blob = new Blob([extractedText], { type: 'text/plain' });
            const result = await uploadFileToDrive(accessToken, new File([blob], fileName), { 
                title: fileName, 
                folderId: folderId,
                company_id: profile.company_id,
                onProgress: (p) => setUploadProgress(p)
            });
            setUploadLink(result.webViewLink);
            setDriveFileUrl(result.webViewLink);
            setDriveSuccess(true);
            if (historyTab === 'cloud') fetchCloudHistory();
            setTimeout(() => setDriveSuccess(false), 5000);
        } catch (err) {
            console.error('Drive Error:', err);
            setDriveError("Failed to save to Drive.");
        } finally {
            setIsSavingDrive(false);
            // setUploadProgress(0); // Handled by onClose
        }
    };

    const handleLoadFromDrive = async (fileId) => {
        const accessToken = localStorage.getItem('google_access_token');
        if (!accessToken) return;
        setIsExtracting(true);
        try {
            const content = await getFileContent(accessToken, fileId);
            setExtractedText(content);
        } catch (err) {
            console.error('Load error:', err);
        } finally {
            setIsExtracting(false);
        }
    };

    return (
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100%', borderRadius: '16px' }}>
            <header style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ padding: '10px', background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', borderRadius: '12px', color: '#fff' }}><Sparkles size={24} /></div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Smart OCR Assistant</h1>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '32px' }}>
                <div className="glass-panel" style={{ padding: '32px', minHeight: '700px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    {!image ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #e2e8f0', borderRadius: '24px', background: '#fff', padding: '32px' }}>
                            <div style={{ width: '80px', height: '80px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', color: '#6366f1' }}><Upload size={32} /></div>
                            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 700, color: '#1e293b' }}>Upload Document</h3>
                            <p style={{ margin: '0 0 20px 0', fontSize: '0.88rem', color: '#64748b', textAlign: 'center', maxWidth: '300px' }}>Upload a file from your computer or scan the QR code to capture directly with your mobile camera.</p>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                                    <Plus size={18} /> Select Local File
                                    <input type="file" accept="image/*" onChange={(e) => { if (e.target.files[0]) { const r = new FileReader(); r.onload = () => setImage(r.result); r.readAsDataURL(e.target.files[0]); } }} style={{ display: 'none' }} />
                                </label>
                                <button className="btn btn-primary" onClick={handleOpenMobileUpload}>
                                    <QrCode size={18} /> Scan from Mobile
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button onClick={handleExtract} disabled={isExtracting} className="btn btn-primary">{isExtracting ? <Loader2 size={18} className="animate-spin" /> : <CropIcon size={18} />}{isExtracting ? 'Extracting...' : 'Extract Text'}</button>
                                <button onClick={() => setImage(null)} className="btn btn-secondary"><X size={18} /> Clear</button>
                            </div>
                            <div style={{ background: '#1e293b', borderRadius: '16px', padding: '24px', display: 'flex', justifyContent: 'center' }}>
                                <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)}>
                                    <img ref={imgRef} src={image} onLoad={e => { const { width: w, height: h } = e.currentTarget; setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 90 }, 1, w, h), w, h)); }} style={{ maxWidth: '100%', maxHeight: '60vh' }} alt="OCR" />
                                </ReactCrop>
                            </div>
                        </div>
                    )}

                    <div className="glass-panel" style={{ padding: '24px', background: '#f8fafc', border: '1px solid #e2e8f0', marginTop: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={18} color="#6366f1" /> Extracted Result</h3>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button onClick={() => { navigator.clipboard.writeText(extractedText); setCopied(true); setTimeout(() => setCopied(false), 2000); }} disabled={!extractedText} className="btn btn-secondary" style={{ background: copied ? '#10b981' : '#fff', color: copied ? '#fff' : '#64748b' }}>{copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</button>
                                <button onClick={driveSuccess && driveFileUrl ? () => window.open(driveFileUrl, '_blank') : handleSaveToDrive} disabled={isSavingDrive || !extractedText} className="btn btn-primary" style={{ background: driveSuccess ? '#10b981' : '#6366f1', opacity: extractedText ? 1 : 0.7 }}>{isSavingDrive ? <Loader2 size={14} className="animate-spin" /> : (driveSuccess ? <CheckCircle2 size={14} /> : <HardDrive size={14} />)}{driveSuccess ? 'Saved!' : (driveError || 'To Drive')}</button>
                            </div>
                        </div>
                        <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', minHeight: '150px', maxHeight: '250px', overflowY: 'auto', fontSize: '0.95rem', whiteSpace: 'pre-wrap' }}>
                            {extractedText || "No text extracted yet."}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <button onClick={() => setHistoryTab('local')} style={{ flex: 1, padding: '14px', border: 'none', background: historyTab === 'local' ? '#fff' : 'transparent', borderBottom: historyTab === 'local' ? '2px solid #6366f1' : 'none', color: historyTab === 'local' ? '#6366f1' : '#64748b', fontWeight: 700, cursor: 'pointer' }}>Local</button>
                            <button onClick={() => setHistoryTab('cloud')} style={{ flex: 1, padding: '14px', border: 'none', background: historyTab === 'cloud' ? '#fff' : 'transparent', borderBottom: historyTab === 'cloud' ? '2px solid #6366f1' : 'none', color: historyTab === 'cloud' ? '#6366f1' : '#64748b', fontWeight: 700, cursor: 'pointer' }}>Cloud</button>
                        </div>
                        <div style={{ padding: '24px', maxHeight: '600px', overflowY: 'auto' }}>
                            {historyTab === 'local' ? (
                                history.map(item => (
                                    <div key={item.id} className="history-card" style={{ padding: '12px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '8px', display: 'flex', gap: '12px', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExtractedText(item.text)}>
                                        <div style={{ width: '40px', height: '40px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden' }}><img src={item.preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="P" /></div>
                                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.text.slice(0, 30)}...</div></div>
                                        <button onClick={(e) => { e.stopPropagation(); setHistory(h => h.filter(i => i.id !== item.id)); }} className="delete-btn" style={{ padding: '6px', border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                    </div>
                                ))
                            ) : (
                                cloudHistory.map(item => (
                                    <div key={item.id} className="history-card" style={{ padding: '12px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '8px', display: 'flex', gap: '12px', alignItems: 'center', cursor: 'pointer' }} onClick={() => handleLoadFromDrive(item.id)}>
                                        <FileText size={18} color="#8b5cf6" />
                                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div></div>
                                        <button onClick={(e) => { e.stopPropagation(); deleteFile(localStorage.getItem('google_access_token'), item.id).then(() => fetchCloudHistory()); }} className="delete-btn" style={{ padding: '6px', border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Guidance & Tips Card */}
                    <div className="glass-panel" style={{ padding: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '20px', marginTop: '16px' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Info size={18} color="#6366f1" /> Guidance & Tips
                        </h3>
                        <p style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                            You can absolutely use this Smart OCR Assistant page in the web app! It is a great, quick option for manual uploads.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ borderLeft: '3px solid #cbd5e1', paddingLeft: '12px' }}>
                                <strong style={{ fontSize: '0.8rem', color: '#1e293b', display: 'block', marginBottom: '4px' }}>Option 1: Using the Web Assistant</strong>
                                <span style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4, display: 'block' }}>
                                    Upload image, crop & extract text, then click <strong>"To Drive"</strong> to save to <code>OCR Extractions</code>. Rename & move both the image and <code>.txt</code> companion to the destination folder (e.g. <code>Raw_Supplier_Invoices</code> or <code>Raw_Bus_Cards</code>).
                                </span>
                            </div>
                            <div style={{ borderLeft: '3px solid #6366f1', paddingLeft: '12px' }}>
                                <strong style={{ fontSize: '0.8rem', color: '#6366f1', display: 'block', marginBottom: '4px' }}>Option 2: Local PaddleOCR (Recommended)</strong>
                                <span style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4, display: 'block' }}>
                                    PaddleOCR is significantly more accurate than browser-based OCR (Tesseract.js), especially for tables, low-light scans, or columns. Run your local script, save output as <code>.txt</code> next to the image, and upload both to Drive.
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <style>{ocrStyles}</style>

            {/* Standardized Upload Overlay */}
            <UploadOverlay 
                isVisible={uploadProgress > 0 || !!uploadLink} 
                progress={uploadProgress} 
                title="Saving to Drive..."
                locationLink={uploadLink}
                onClose={() => {
                    setUploadProgress(0);
                    setUploadLink(null);
                }}
            />

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
                                <Loader2 size={36} className="animate-spin text-primary" style={{ color: '#6366f1' }} />
                                <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Connecting Google Drive...</span>
                            </div>
                        ) : (
                            <div>
                                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px dashed #cbd5e1', display: 'inline-block', marginBottom: '24px' }}>
                                    <img 
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                                            `${window.location.origin}/upload-media?folderId=${qrModal.folderId}&token=${localStorage.getItem('google_access_token')}&jobName=${encodeURIComponent(qrModal.folderName)}`
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
                    </div>
                </div>
            )}
        </div>
    );
}
