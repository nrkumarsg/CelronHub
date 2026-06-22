import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UploadCloud, Camera, CheckCircle, Loader2, AlertCircle, HardDrive, RefreshCw, Trash2, X, Plus } from 'lucide-react';
import { uploadFileToDrive, listFolderContent } from '../../lib/driveService';

export default function UploadMediaGateway() {
    const [searchParams] = useSearchParams();
    const jobId = searchParams.get('jobId');
    const folderId = searchParams.get('folderId');
    const token = searchParams.get('token');
    const jobName = searchParams.get('jobName') || 'Job Media';

    const [initError, setInitError] = useState('');
    const [queue, setQueue] = useState([]);
    const [existingFiles, setExistingFiles] = useState(new Set());
    const [duplicateAlert, setDuplicateAlert] = useState({ show: false, files: [] });
    
    const startedUploadsRef = useRef(new Set());
    const controllersRef = useRef({});

    useEffect(() => {
        // Simple sanity check
        if (!folderId || !token) {
            setInitError('Invalid or expired upload link. Please scan the QR code again.');
        }
    }, [folderId, token]);

    // Fetch existing files from Google Drive on load to prevent duplicates
    useEffect(() => {
        if (folderId && token) {
            const fetchExisting = async () => {
                try {
                    const files = await listFolderContent(token, folderId);
                    const fileNames = new Set(files.map(f => f.name));
                    setExistingFiles(fileNames);
                } catch (err) {
                    console.error("Failed to fetch existing files from Drive:", err);
                }
            };
            fetchExisting();
        }
    }, [folderId, token]);

    // Cleanup object URLs on unmount
    useEffect(() => {
        return () => {
            queue.forEach(item => {
                if (item.previewUrl) {
                    URL.revokeObjectURL(item.previewUrl);
                }
            });
        };
    }, []);

    // Queue processor
    useEffect(() => {
        const activeUploads = queue.filter(item => item.status === 'uploading').length;
        if (activeUploads >= 2) return; // Limit concurrency to 2 for mobile network stability

        const nextPending = queue.find(item => item.status === 'pending' && !startedUploadsRef.current.has(item.id));
        if (nextPending) {
            startedUploadsRef.current.add(nextPending.id);
            startUpload(nextPending.id, nextPending.file);
        }
    }, [queue]);

    const startUpload = async (id, file) => {
        // Set state to uploading
        setQueue(prev => prev.map(item => 
            item.id === id ? { ...item, status: 'uploading', progress: 0 } : item
        ));

        const controller = new AbortController();
        controllersRef.current[id] = controller;

        try {
            await uploadFileToDrive(token, file, { 
                folderId: folderId,
                signal: controller.signal
            }, (pct) => {
                setQueue(prev => prev.map(item => 
                    item.id === id ? { ...item, progress: pct } : item
                ));
            });

            // Mark success
            setQueue(prev => prev.map(item => 
                item.id === id ? { ...item, status: 'success', progress: 100 } : item
            ));
            // Add to existing files list
            setExistingFiles(prev => {
                const next = new Set(prev);
                next.add(file.name);
                return next;
            });
        } catch (err) {
            // Check if aborted
            if (err.name === 'AbortError') {
                console.log(`Upload for ${file.name} aborted.`);
            } else {
                console.error(`Upload failed for ${file.name}:`, err);
                setQueue(prev => prev.map(item => 
                    item.id === id ? { ...item, status: 'failed', errorMsg: err.message || 'Upload failed' } : item
                ));
            }
        } finally {
            delete controllersRef.current[id];
            startedUploadsRef.current.delete(id);
        }
    };

    const handleFilesSelected = (filesList) => {
        const files = Array.from(filesList);
        if (files.length === 0) return;

        const duplicates = [];
        const newItems = [];

        files.forEach(file => {
            // Check if already in queue (by name and size)
            const inQueue = queue.some(item => item.name === file.name && item.size === file.size);
            // Check if already in Drive (by name)
            const isUploaded = existingFiles.has(file.name);

            if (inQueue || isUploaded) {
                duplicates.push(file.name);
            } else {
                const id = `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                let previewUrl = '';
                if (file.type.startsWith('image/')) {
                    previewUrl = URL.createObjectURL(file);
                }
                newItems.push({
                    id,
                    file,
                    name: file.name,
                    size: file.size,
                    status: 'pending',
                    progress: 0,
                    errorMsg: '',
                    previewUrl
                });
            }
        });

        if (duplicates.length > 0) {
            setDuplicateAlert({
                show: true,
                files: duplicates
            });
        }

        if (newItems.length > 0) {
            setQueue(prev => [...prev, ...newItems]);
        }
    };

    const handleRetry = (id) => {
        startedUploadsRef.current.delete(id);
        setQueue(prev => prev.map(item => 
            item.id === id ? { ...item, status: 'pending', progress: 0, errorMsg: '' } : item
        ));
    };

    const handleRemove = (id) => {
        const controller = controllersRef.current[id];
        if (controller) {
            controller.abort();
            delete controllersRef.current[id];
        }

        const item = queue.find(f => f.id === id);
        if (item && item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
        }

        setQueue(prev => prev.filter(f => f.id !== id));
        startedUploadsRef.current.delete(id);
    };

    const handleRetryAllFailed = () => {
        const failedItems = queue.filter(item => item.status === 'failed');
        failedItems.forEach(item => {
            handleRetry(item.id);
        });
    };

    const handleCancelAllPending = () => {
        const pendingOrUploading = queue.filter(item => item.status === 'pending' || item.status === 'uploading');
        pendingOrUploading.forEach(item => {
            handleRemove(item.id);
        });
    };

    const handleClearCompleted = () => {
        const completed = queue.filter(item => item.status === 'success');
        completed.forEach(item => {
            if (item.previewUrl) {
                URL.revokeObjectURL(item.previewUrl);
            }
        });
        setQueue(prev => prev.filter(item => item.status !== 'success'));
    };

    const triggerFileInput = (id) => {
        const el = document.getElementById(id);
        if (el) el.click();
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const succeededCount = queue.filter(item => item.status === 'success').length;
    const failedCount = queue.filter(item => item.status === 'failed').length;
    const uploadingCount = queue.filter(item => item.status === 'uploading').length;
    const pendingCount = queue.filter(item => item.status === 'pending').length;
    const totalCount = queue.length;
    const isFinished = totalCount > 0 && uploadingCount === 0 && pendingCount === 0;

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            fontFamily: '"Outfit", "Inter", sans-serif'
        }}>
            {/* Header / Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                <HardDrive size={28} color="#38bdf8" />
                <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    CELRON HUB GATEWAY
                </span>
            </div>

            {/* Main Panel */}
            <div style={{
                width: '100%',
                maxWidth: '500px', // slightly wider for queue rows
                background: 'rgba(30, 41, 59, 0.7)',
                backdropFilter: 'blur(16px)',
                borderRadius: '24px',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '32px 24px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
                textAlign: 'center'
            }}>
                <div style={{ marginBottom: '24px' }}>
                    <div style={{ 
                        display: 'inline-block', 
                        padding: '6px 16px', 
                        borderRadius: '20px', 
                        background: 'rgba(56, 189, 248, 0.1)', 
                        color: '#38bdf8', 
                        fontSize: '0.8rem', 
                        fontWeight: 700, 
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                    }}>
                        Job Attachment Portal
                    </div>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: '#f1f5f9', wordBreak: 'break-word' }}>
                        {jobName}
                    </h2>
                </div>

                {initError ? (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '16px',
                        padding: '16px',
                        color: '#fca5a5',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '24px'
                    }}>
                        <AlertCircle size={32} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{initError}</span>
                    </div>
                ) : (
                    <div>
                        {duplicateAlert.show && (
                            <div style={{
                                background: 'rgba(245, 158, 11, 0.1)',
                                border: '1px solid rgba(245, 158, 11, 0.25)',
                                borderRadius: '16px',
                                padding: '16px',
                                color: '#fef08a',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                gap: '8px',
                                marginBottom: '20px',
                                textAlign: 'left',
                                position: 'relative'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                                    <AlertCircle size={20} color="#eab308" style={{ flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#facc15', flex: 1 }}>
                                        Duplicate Files Skipped ({duplicateAlert.files.length})
                                    </span>
                                    <button 
                                        onClick={() => setDuplicateAlert({ show: false, files: [] })}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#94a3b8',
                                            cursor: 'pointer',
                                            padding: '2px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                                <p style={{ fontSize: '0.75rem', color: '#cbd5e1', margin: 0 }}>
                                    Skipped because they are already uploaded or pending upload:
                                </p>
                                <div style={{ 
                                    maxHeight: '80px', 
                                    overflowY: 'auto', 
                                    width: '100%', 
                                    fontSize: '0.75rem', 
                                    color: '#94a3b8', 
                                    background: 'rgba(0,0,0,0.15)',
                                    padding: '8px',
                                    borderRadius: '8px',
                                    marginTop: '4px'
                                }} className="custom-scrollbar">
                                    {duplicateAlert.files.map((name, idx) => (
                                        <div key={idx} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            • {name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {queue.length === 0 ? (
                            /* EMPTY QUEUE: SHOW INITIAL BUTTONS */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Camera Capture Card */}
                        <div 
                            onClick={() => triggerFileInput('camera-input')}
                            style={{
                                border: '2px dashed rgba(255,255,255,0.15)',
                                background: 'rgba(255,255,255,0.02)',
                                borderRadius: '20px',
                                padding: '32px 20px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '12px',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.borderColor = '#38bdf8';
                                e.currentTarget.style.background = 'rgba(56, 189, 248, 0.02)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                                e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                            }}
                        >
                            <Camera size={44} color="#38bdf8" />
                            <div>
                                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f1f5f9' }}>Snap Photo</div>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>Use mobile camera directly</div>
                            </div>
                            <input 
                                id="camera-input" 
                                type="file" 
                                accept="image/*" 
                                capture="environment" 
                                multiple 
                                style={{ display: 'none' }} 
                                onChange={(e) => handleFilesSelected(e.target.files)} 
                            />
                        </div>

                        {/* Gallery Upload Card */}
                        <div 
                            onClick={() => triggerFileInput('gallery-input')}
                            style={{
                                border: '2px dashed rgba(255,255,255,0.15)',
                                background: 'rgba(255,255,255,0.02)',
                                borderRadius: '20px',
                                padding: '32px 20px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '12px',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.borderColor = '#818cf8';
                                e.currentTarget.style.background = 'rgba(129, 140, 248, 0.02)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                                e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                            }}
                        >
                            <UploadCloud size={44} color="#818cf8" />
                            <div>
                                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f1f5f9' }}>Upload from Gallery</div>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>Select multiple files or photos</div>
                            </div>
                            <input 
                                id="gallery-input" 
                                type="file" 
                                accept="image/*" 
                                multiple 
                                style={{ display: 'none' }} 
                                onChange={(e) => handleFilesSelected(e.target.files)} 
                            />
                        </div>
                    </div>
                ) : (
                    /* QUEUE LIST VIEW */
                    <div>
                        {/* Summary Header */}
                        <div style={{ marginBottom: '20px', textAlign: 'left' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#cbd5e1' }}>
                                    {isFinished 
                                        ? `Upload complete (${succeededCount}/${totalCount} succeeded)`
                                        : `Uploading: ${succeededCount + uploadingCount}/${totalCount} files`
                                    }
                                </span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8' }}>
                                    {Math.round((succeededCount / totalCount) * 100)}%
                                </span>
                            </div>
                            <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginBottom: '16px' }}>
                                <div style={{ 
                                    width: `${Math.round((succeededCount / totalCount) * 100)}%`, 
                                    height: '100%', 
                                    background: failedCount > 0 ? 'linear-gradient(to right, #f43f5e, #e11d48)' : 'linear-gradient(to right, #38bdf8, #818cf8)', 
                                    transition: 'width 0.3s ease' 
                                }} />
                            </div>

                            {/* Global Action Toolbar */}
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button 
                                    onClick={() => triggerFileInput('gallery-input-more')}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        background: 'rgba(56, 189, 248, 0.1)',
                                        color: '#38bdf8',
                                        border: '1px solid rgba(56, 189, 248, 0.2)',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Plus size={14} /> Add Photos
                                </button>

                                {failedCount > 0 && (
                                    <button 
                                        onClick={handleRetryAllFailed}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '8px',
                                            background: 'rgba(244, 63, 94, 0.15)',
                                            color: '#fb7185',
                                            border: '1px solid rgba(244, 63, 94, 0.25)',
                                            fontSize: '0.8rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <RefreshCw size={14} /> Retry Failed
                                    </button>
                                )}

                                {succeededCount > 0 && (
                                    <button 
                                        onClick={handleClearCompleted}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '8px',
                                            background: 'rgba(255,255,255,0.05)',
                                            color: '#94a3b8',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            fontSize: '0.8rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <Trash2 size={14} /> Clear Done
                                    </button>
                                )}

                                {(uploadingCount > 0 || pendingCount > 0) && (
                                    <button 
                                        onClick={handleCancelAllPending}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '8px',
                                            background: 'rgba(255,255,255,0.05)',
                                            color: '#cbd5e1',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            fontSize: '0.8rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <X size={14} /> Cancel All
                                    </button>
                                )}
                            </div>

                            {/* Hidden file input for adding more */}
                            <input 
                                id="gallery-input-more" 
                                type="file" 
                                accept="image/*" 
                                multiple 
                                style={{ display: 'none' }} 
                                onChange={(e) => handleFilesSelected(e.target.files)} 
                            />
                        </div>

                        {/* List container */}
                        <div style={{ maxHeight: '350px', overflowY: 'auto', paddingRight: '4px', textAlign: 'left' }} className="custom-scrollbar">
                            {queue.map(item => (
                                <div key={item.id} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    background: 'rgba(15, 23, 42, 0.3)',
                                    borderRadius: '16px',
                                    padding: '12px',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    marginBottom: '10px',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}>
                                    {/* Background progress indicator overlay for active uploads */}
                                    {item.status === 'uploading' && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            bottom: 0,
                                            width: `${item.progress}%`,
                                            background: 'rgba(56, 189, 248, 0.05)',
                                            transition: 'width 0.2s ease',
                                            zIndex: 0,
                                            pointerEvents: 'none'
                                        }} />
                                    )}

                                    {/* Thumbnail Preview */}
                                    <div style={{ position: 'relative', zIndex: 1 }}>
                                        {item.previewUrl ? (
                                            <img 
                                                src={item.previewUrl} 
                                                alt="preview" 
                                                style={{
                                                    width: '48px',
                                                    height: '48px',
                                                    objectFit: 'cover',
                                                    borderRadius: '8px',
                                                    background: '#0f172a',
                                                    border: '1px solid rgba(255,255,255,0.1)'
                                                }} 
                                            />
                                        ) : (
                                            <div style={{
                                                width: '48px',
                                                height: '48px',
                                                borderRadius: '8px',
                                                background: 'rgba(255,255,255,0.05)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#64748b',
                                                border: '1px solid rgba(255,255,255,0.1)'
                                            }}>
                                                <UploadCloud size={20} />
                                            </div>
                                        )}
                                    </div>

                                    {/* File Info */}
                                    <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                                        <div style={{ 
                                            fontSize: '0.85rem', 
                                            fontWeight: 700, 
                                            color: '#f1f5f9',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {item.name}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                {formatFileSize(item.size)}
                                            </span>
                                            
                                            {/* Status badge */}
                                            {item.status === 'pending' && (
                                                <span style={{ fontSize: '0.7rem', color: '#94a3b8', background: 'rgba(148, 163, 184, 0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                                    Pending
                                                </span>
                                            )}
                                            {item.status === 'uploading' && (
                                                <span style={{ fontSize: '0.7rem', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                    <Loader2 size={10} className="animate-spin" /> {item.progress}%
                                                </span>
                                            )}
                                            {item.status === 'success' && (
                                                <span style={{ fontSize: '0.7rem', color: '#4ade80', background: 'rgba(34, 197, 94, 0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                                    Success
                                                </span>
                                            )}
                                            {item.status === 'failed' && (
                                                <span style={{ fontSize: '0.7rem', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }} title={item.errorMsg}>
                                                    Failed
                                                </span>
                                            )}
                                        </div>

                                        {/* Inline Progress Bar (only during uploading) */}
                                        {item.status === 'uploading' && (
                                            <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', marginTop: '6px' }}>
                                                <div style={{ width: `${item.progress}%`, height: '100%', background: '#38bdf8', transition: 'width 0.2s ease' }} />
                                            </div>
                                        )}
                                        {item.status === 'failed' && (
                                            <div style={{ fontSize: '0.75rem', color: '#fca5a5', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {item.errorMsg}
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div style={{ display: 'flex', gap: '6px', zIndex: 1 }}>
                                        {item.status === 'failed' && (
                                            <button 
                                                onClick={() => handleRetry(item.id)}
                                                style={{
                                                    background: 'rgba(56, 189, 248, 0.1)',
                                                    border: 'none',
                                                    color: '#38bdf8',
                                                    borderRadius: '8px',
                                                    width: '32px',
                                                    height: '32px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                title="Retry"
                                            >
                                                <RefreshCw size={14} />
                                            </button>
                                        )}
                                        
                                        {(item.status === 'pending' || item.status === 'uploading') && (
                                            <button 
                                                onClick={() => handleRemove(item.id)}
                                                style={{
                                                    background: 'rgba(255, 255, 255, 0.05)',
                                                    border: 'none',
                                                    color: '#94a3b8',
                                                    borderRadius: '8px',
                                                    width: '32px',
                                                    height: '32px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                title="Cancel"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}

                                        {(item.status === 'success' || item.status === 'failed') && (
                                            <button 
                                                onClick={() => handleRemove(item.id)}
                                                style={{
                                                    background: 'rgba(239, 68, 68, 0.05)',
                                                    border: 'none',
                                                    color: '#fca5a5',
                                                    borderRadius: '8px',
                                                    width: '32px',
                                                    height: '32px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                title="Remove"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                    </div>
                )}
            </div>

            <p style={{ marginTop: '24px', fontSize: '0.75rem', color: '#475569' }}>
                Secure gateway powered by Celron Hub & Google Drive API
            </p>
        </div>
    );
}
