import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UploadCloud, Camera, CheckCircle, Loader2, AlertCircle, HardDrive } from 'lucide-react';
import { uploadFileToDrive } from '../../lib/driveService';

export default function UploadMediaGateway() {
    const [searchParams] = useSearchParams();
    const jobId = searchParams.get('jobId');
    const folderId = searchParams.get('folderId');
    const token = searchParams.get('token');
    const jobName = searchParams.get('jobName') || 'Job Media';

    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('idle'); // idle, uploading, success, error
    const [errorMsg, setErrorMsg] = useState('');
    const [uploadedFiles, setUploadedFiles] = useState([]);

    useEffect(() => {
        // Simple sanity check
        if (!folderId || !token) {
            setStatus('error');
            setErrorMsg('Invalid or expired upload link. Please scan the QR code again.');
        }
    }, [folderId, token]);

    const handleUploadFiles = async (filesList) => {
        const files = Array.from(filesList);
        if (files.length === 0) return;

        setUploading(true);
        setStatus('uploading');
        setProgress(0);
        setErrorMsg('');

        try {
            const uploadedNames = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                // Direct call to drive service with token
                const result = await uploadFileToDrive(token, file, { 
                    folderId: folderId,
                    onProgress: (pct) => {
                        // Calculate overall progress
                        const overallPct = Math.round(((i + pct / 100) / files.length) * 100);
                        setProgress(overallPct);
                    }
                });
                uploadedNames.push(file.name);
            }
            setUploadedFiles(prev => [...prev, ...uploadedNames]);
            setStatus('success');
        } catch (err) {
            console.error('Mobile upload failed:', err);
            setStatus('error');
            setErrorMsg(err.message || 'Failed to upload files. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    const triggerFileInput = (id) => {
        document.getElementById(id).click();
    };

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
                maxWidth: '450px',
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

                {status === 'error' && (
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
                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{errorMsg}</span>
                    </div>
                )}

                {status === 'uploading' && (
                    <div style={{ padding: '24px 0' }}>
                        <Loader2 size={48} className="animate-spin" style={{ margin: '0 auto 20px', color: '#38bdf8' }} />
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>Uploading to Google Drive...</h3>
                        <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '20px' }}>Please keep this page open</p>
                        
                        <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(to right, #38bdf8, #818cf8)', transition: 'width 0.3s ease' }} />
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8' }}>{progress}% Complete</div>
                    </div>
                )}

                {status === 'success' && (
                    <div style={{ padding: '16px 0' }}>
                        <div style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: '50%',
                            background: 'rgba(34, 197, 94, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 16px',
                            color: '#4ade80',
                            border: '2px solid rgba(34, 197, 94, 0.2)'
                        }}>
                            <CheckCircle size={36} />
                        </div>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f1f5f9', marginBottom: '8px' }}>Upload Successful!</h3>
                        <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '24px' }}>Files are saved directly to the project folder.</p>
                        
                        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '12px', padding: '12px', textAlign: 'left', marginBottom: '24px', maxHeight: '120px', overflowY: 'auto' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Uploaded Files:</div>
                            {uploadedFiles.map((f, idx) => (
                                <div key={idx} style={{ fontSize: '0.8rem', color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '2px 0' }}>
                                    ✓ {f}
                                </div>
                            ))}
                        </div>

                        <button 
                            onClick={() => setStatus('idle')}
                            style={{
                                width: '100%',
                                padding: '14px',
                                borderRadius: '14px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(255,255,255,0.05)',
                                color: '#f8fafc',
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            Upload More Photos
                        </button>
                    </div>
                )}

                {status === 'idle' && (
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
                                onChange={(e) => handleUploadFiles(e.target.files)} 
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
                                onChange={(e) => handleUploadFiles(e.target.files)} 
                            />
                        </div>
                    </div>
                )}
            </div>

            <p style={{ marginTop: '24px', fontSize: '0.75rem', color: '#475569' }}>
                Secure gateway powered by Celron Hub & Google Drive API
            </p>
        </div>
    );
}
