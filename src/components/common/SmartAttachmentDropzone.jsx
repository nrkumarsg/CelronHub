import React, { useState, useEffect } from 'react';
import { UploadCloud, QrCode, Plus, Smartphone, X, Info, Sparkles, MessageSquare } from 'lucide-react';
import { listFolderContent } from '../../lib/driveService';
import { getStoredToken } from '../../lib/googleAuthService';
import toast from 'react-hot-toast';

export default function SmartAttachmentDropzone({ 
    activeFolderId, 
    activeFolderName = 'Email Workspace', 
    onFileAdded,
    isDriveConnected = false,
    onOpenAuth,
    onOpenSmartUpload
}) {
    const [isDragging, setIsDragging] = useState(false);
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const [isPolling, setIsPolling] = useState(false);
    const fileInputId = React.useId();

    // Polling for mobile uploads
    useEffect(() => {
        let intervalId;
        if (qrModalOpen && activeFolderId && isDriveConnected) {
            setIsPolling(true);
            const token = getStoredToken() || localStorage.getItem('google_access_token');
            let knownFileIds = [];

            // Initialize known files in folder
            const initFiles = async () => {
                try {
                    const files = await listFolderContent(token, activeFolderId);
                    knownFileIds = files.map(f => f.id);
                } catch (e) {
                    console.error("[Dropzone] Failed to list initial files:", e);
                }
            };
            initFiles();

            // Start polling every 3 seconds
            intervalId = setInterval(async () => {
                try {
                    const files = await listFolderContent(token, activeFolderId);
                    const newFiles = files.filter(f => !knownFileIds.includes(f.id) && f.mimeType !== 'application/vnd.google-apps.folder');
                    if (newFiles.length > 0) {
                        const targetFile = newFiles[0];
                        clearInterval(intervalId);
                        setQrModalOpen(false);
                        setIsPolling(false);
                        toast.success(`Mobile upload detected: "${targetFile.name}"!`);
                        
                        // Pass file metadata back to parent to attach
                        if (onFileAdded) {
                            onFileAdded({
                                name: targetFile.name,
                                id: targetFile.id,
                                webViewLink: targetFile.webViewLink,
                                size: parseInt(targetFile.size || 0),
                                mimeType: targetFile.mimeType,
                                isGoogleDrive: true
                            });
                        }
                    }
                } catch (e) {
                    console.error("[Dropzone] Polling error:", e);
                }
            }, 3000);
        }

        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [qrModalOpen, activeFolderId, isDriveConnected, onFileAdded]);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            files.forEach(file => {
                if (onFileAdded) onFileAdded(file);
            });
            toast.success(`Staged ${files.length} local file(s)`);
        }
    };

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            files.forEach(file => {
                if (onFileAdded) onFileAdded(file);
            });
            toast.success(`Staged ${files.length} local file(s)`);
        }
        e.target.value = null; // reset input
    };

    const handleOpenMobileUpload = () => {
        if (!isDriveConnected) {
            if (onOpenAuth) {
                onOpenAuth();
            } else {
                toast.error("Please connect your Google Drive account first.");
            }
            return;
        }
        if (!activeFolderId) {
            toast.error("Please link or create a folder before using mobile upload.");
            return;
        }
        setQrModalOpen(true);
    };

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
        `${window.location.origin}/upload-media?folderId=${activeFolderId}&token=${getStoredToken() || localStorage.getItem('google_access_token')}&jobName=${encodeURIComponent(activeFolderName)}`
    )}`;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{ 
                    border: isDragging ? '2px dashed #3b82f6' : '2px dashed #cbd5e1', 
                    borderRadius: '12px', 
                    padding: '24px 16px', 
                    textAlign: 'center', 
                    background: isDragging ? '#eff6ff' : '#fff', 
                    transition: 'all 0.2s', 
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '160px',
                    position: 'relative'
                }}
            >
                <div style={{ width: '48px', height: '48px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', color: '#3b82f6' }}>
                    <UploadCloud size={24} />
                </div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                    Upload Document
                </h4>
                <p style={{ margin: '0 0 16px 0', fontSize: '11px', color: '#64748b', maxWidth: '300px', lineHeight: '1.4' }}>
                    Upload files from computer, drag directly from WhatsApp Web (`web.whatsapp.com`), or scan QR code.
                </p>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {onOpenSmartUpload && (
                        <button 
                            type="button" 
                            onClick={() => onOpenSmartUpload('whatsapp')}
                            style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '6px', 
                                cursor: 'pointer', 
                                background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)', 
                                border: 'none',
                                color: '#fff', 
                                padding: '6px 14px', 
                                borderRadius: '6px', 
                                fontSize: '11px', 
                                fontWeight: 700, 
                                transition: 'all 0.2s',
                                boxShadow: '0 2px 6px rgba(37, 211, 102, 0.3)'
                            }}
                        >
                            <MessageSquare size={13} /> WhatsApp Upload
                        </button>
                    )}

                    {onOpenSmartUpload && (
                        <button 
                            type="button" 
                            onClick={() => onOpenSmartUpload()}
                            style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '6px', 
                                cursor: 'pointer', 
                                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', 
                                border: 'none',
                                color: '#fff', 
                                padding: '6px 14px', 
                                borderRadius: '6px', 
                                fontSize: '11px', 
                                fontWeight: 700, 
                                transition: 'all 0.2s',
                                boxShadow: '0 2px 6px rgba(99, 102, 241, 0.25)'
                            }}
                        >
                            <Sparkles size={13} /> ✨ Open Smart Upload Hub
                        </button>
                    )}

                    <label 
                        htmlFor={fileInputId} 
                        style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            cursor: 'pointer', 
                            background: '#f1f5f9', 
                            border: '1px solid #cbd5e1',
                            color: '#334155', 
                            padding: '6px 14px', 
                            borderRadius: '6px', 
                            fontSize: '11px', 
                            fontWeight: 700, 
                            transition: 'all 0.2s' 
                        }}
                    >
                        <Plus size={13} /> Local File
                    </label>
                    <input 
                        type="file" 
                        id={fileInputId} 
                        multiple 
                        onChange={handleFileChange} 
                        style={{ display: 'none' }} 
                    />

                    <button 
                        type="button" 
                        onClick={handleOpenMobileUpload}
                        style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            cursor: 'pointer', 
                            background: '#3b82f6', 
                            border: 'none',
                            color: '#fff', 
                            padding: '6px 14px', 
                            borderRadius: '6px', 
                            fontSize: '11px', 
                            fontWeight: 700, 
                            transition: 'all 0.2s',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                    >
                        <QrCode size={13} /> Mobile QR
                    </button>
                </div>
            </div>

            {/* QR Modal Popup */}
            {qrModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
                    <div style={{ background: '#fff', color: '#1e293b', maxWidth: '400px', width: '100%', padding: '32px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', textAlign: 'center', position: 'relative' }}>
                        <button 
                            type="button"
                            onClick={() => setQrModalOpen(false)}
                            style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                        >
                            <X size={24} />
                        </button>

                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justify: 'center', margin: '0 auto 16px' }}>
                            <Smartphone size={24} />
                        </div>

                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0' }}>Mobile Upload Gateway</h3>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 24px 0', lineHeight: '1.4' }}>
                            Scan this QR code with your smartphone camera to upload files directly to your <strong>{activeFolderName}</strong> folder.
                        </p>

                        <div>
                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px dashed #cbd5e1', display: 'inline-block', marginBottom: '24px' }}>
                                <img 
                                    src={qrCodeUrl}
                                    alt="Upload QR Code"
                                    style={{ width: '200px', height: '200px', display: 'block' }}
                                />
                            </div>

                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                <Info size={14} style={{ flexShrink: 0 }} />
                                <span>{isPolling ? 'Waiting for upload...' : 'Session active. QR code is valid.'}</span>
                            </div>
                        </div>

                        <button 
                            type="button"
                            className="btn btn-primary" 
                            style={{ width: '100%', marginTop: '24px', padding: '12px', borderRadius: '12px', fontWeight: 700 }}
                            onClick={() => setQrModalOpen(false)}
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
