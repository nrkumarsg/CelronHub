import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
    Smartphone, Globe, Sparkles, Folder, FileText, QrCode, Download, 
    RefreshCw, ExternalLink, ArrowRight, Shield, CheckCircle2, Building2, 
    DollarSign, Camera, Layers, Plus, Loader2, Kanban
} from 'lucide-react';
import { isTokenValid, connectGoogleAPI } from '../../lib/googleAuthService';
import { useAuth } from '../../contexts/AuthContext';
import { listFolderContent, uploadFileToDrive } from '../../lib/driveService';
import { saveContact } from '../../lib/store';
import { generateDocNumber } from '../../lib/workflowV2Service';
import toast from 'react-hot-toast';

export default function ScanGateway() {
    const { profile } = useAuth();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [recentScans, setRecentScans] = useState([]);
    const [isParsing, setIsParsing] = useState(false);

    // Google Drive Folder IDs
    const CELRON_SCANS_ID = '1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w';
    const CELRON_SCANS_URL = `https://drive.google.com/drive/folders/${CELRON_SCANS_ID}?usp=drive_link`;

    useEffect(() => {
        fetchScans();
    }, []);

    const fetchScans = async () => {
        setLoading(true);
        const token = localStorage.getItem('google_access_token');
        if (!token) {
            setLoading(false);
            return;
        }

        try {
            const files = await listFolderContent(token, CELRON_SCANS_ID);
            const onlyFiles = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
            setRecentScans(onlyFiles.slice(0, 10));
        } catch (err) {
            console.error("Error loading gateway scans:", err);
        } finally {
            setLoading(false);
        }
    };

    // ⚡ START FROM SCAN: AUTO-BUILD JOB
    const handleStartFromScan = async () => {
        setIsParsing(true);
        toast.loading("Reading latest scan to auto-build Job Enquiry...", { id: 'gateway-build' });
        try {
            const token = localStorage.getItem('google_access_token');
            const companyId = profile?.company_id;

            // 1. Generate Next Enquiry Number
            const nextEnqNo = await generateDocNumber(companyId, 'Enquiry');

            // 2. Fetch latest file from Celron_Scans
            const files = await listFolderContent(token, CELRON_SCANS_ID);
            const latestScan = files.find(f => f.mimeType !== 'application/vnd.google-apps.folder');

            // 3. Provision Enquiry Folder Structure
            const { provisionEnquiryFolderStructure } = await import('../../lib/driveService');
            const year = new Date().getFullYear();
            const folderRes = await provisionEnquiryFolderStructure(token, CELRON_SCANS_ID, year, nextEnqNo);

            toast.success(`Job ${nextEnqNo} created! Redirecting to Workflow Wizard...`, { id: 'gateway-build' });
            
            // 4. Redirect to Workflow Wizard with initial data
            setTimeout(() => {
                navigate('/workflows/wizard', { 
                    state: { 
                        enquiryNo: nextEnqNo,
                        gdriveFolderId: folderRes?.enqFolderId || CELRON_SCANS_ID,
                        attachedScan: latestScan || null
                    } 
                });
            }, 800);
        } catch (err) {
            console.error("Error in Start From Scan Job Builder:", err);
            toast.error("Job Builder Error: " + err.message, { id: 'gateway-build' });
        } finally {
            setIsParsing(false);
        }
    };

    const handleDownloadApk = () => {
        window.open('https://celronhub.vercel.app/apks/celrongateway-v2.apk', '_blank');
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh' }}>
            {/* Header Banner */}
            <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
                borderRadius: '20px',
                padding: '28px',
                color: '#fff',
                marginBottom: '28px',
                boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.3)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ position: 'absolute', right: '-40px', top: '-40px', width: '220px', height: '220px', background: 'rgba(99, 102, 241, 0.15)', borderRadius: '50%', filter: 'blur(50px)' }}></div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px', position: 'relative', zIndex: 1 }}>
                    <div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8', marginBottom: '10px', border: '1px solid rgba(255,255,255,0.15)' }}>
                            <Smartphone size={14} /> DEDICATED MOBILE SCAN GATEWAY
                        </div>
                        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0 0 6px 0', letterSpacing: '-0.02em', color: '#fff' }}>
                            Start From Scan &amp; Direct Drive Launcher
                        </h1>
                        <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem', maxWidth: '600px' }}>
                            Tap any of the 3 Google Drive folder launchers below to scan paper using your phone's native camera scanner (with hardware edge-detection at 0 token cost), then tap <strong>Build Job</strong>.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <Link
                            to="/workflows/whiteboard"
                            style={{
                                background: '#f59e0b',
                                color: '#0f172a',
                                padding: '10px 18px',
                                borderRadius: '12px',
                                fontWeight: 800,
                                fontSize: '0.88rem',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
                            }}
                        >
                            <Kanban size={18} /> 📌 Jobs Whiteboard
                        </Link>
                        <button
                            onClick={handleDownloadApk}
                            style={{
                                background: '#10b981',
                                color: '#fff',
                                border: 'none',
                                padding: '10px 18px',
                                borderRadius: '12px',
                                fontWeight: 800,
                                fontSize: '0.88rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                            }}
                        >
                            <Download size={18} /> Download Scanner APK
                        </button>
                    </div>
                </div>
            </div>

            {/* Central "Start From Scan: Auto-Build Job" Engine Callout */}
            <div style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                borderRadius: '16px',
                padding: '20px 24px',
                marginBottom: '32px',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
                boxShadow: '0 8px 20px rgba(79, 70, 229, 0.3)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.2)', padding: '12px', borderRadius: '14px', backdropFilter: 'blur(8px)' }}>
                        <Sparkles size={28} color="#fff" />
                    </div>
                    <div>
                        <h3 style={{ margin: '0 0 2px 0', fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>
                            Start From Scan: Instant Job Auto-Builder
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.84rem', color: '#e0e7ff' }}>
                            Reads recent paper scan / email note -&gt; Auto-generates ENQ No -&gt; Provisions project folder &amp; builds job
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleStartFromScan}
                    disabled={isParsing}
                    style={{
                        background: '#fff',
                        color: '#4f46e5',
                        border: 'none',
                        padding: '12px 24px',
                        borderRadius: '12px',
                        fontWeight: 800,
                        fontSize: '0.95rem',
                        cursor: isParsing ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '10px',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.15)'
                    }}
                >
                    {isParsing ? <Loader2 size={18} className="animate-spin" /> : <RocketIcon />}
                    {isParsing ? 'Building Job...' : '🚀 Parse Scan & Build Job'}
                </button>
            </div>

            {/* 3 PRIMARY DIRECT 1-TAP GOOGLE DRIVE FOLDER LAUNCHERS */}
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Folder size={20} color="#6366f1" /> 3 Primary Direct 1-Tap Google Drive Folder Launchers
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '36px' }}>
                {/* LAUNCHER 1: Celron_Scans (Enquiries & Paper Notes) */}
                <div style={{
                    background: '#fff',
                    border: '2px solid #bfdbfe',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between',
                    position: 'relative'
                }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                            <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '12px' }}>
                                <Folder size={28} color="#2563eb" />
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#dbeafe', color: '#1e40af', padding: '3px 8px', borderRadius: '6px' }}>
                                FOLDER 1 (ENQUIRIES)
                            </span>
                        </div>
                        <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', fontWeight: 800, color: '#1e293b' }}>
                            Celron_Scans Inbox
                        </h3>
                        <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5 }}>
                            Primary landing folder for email enquiry printouts, paper notes &amp; job specs. Native edge-detection scanning on phone.
                        </p>
                    </div>

                    <div>
                        <a
                            href={CELRON_SCANS_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                background: '#2563eb',
                                color: '#fff',
                                textDecoration: 'none',
                                padding: '10px 16px',
                                borderRadius: '10px',
                                fontWeight: 800,
                                fontSize: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
                            }}
                        >
                            <Globe size={16} /> Open Celron_Scans (GDrive App) <ExternalLink size={14} />
                        </a>
                    </div>
                </div>

                {/* LAUNCHER 2: Celron_BusinessCards */}
                <div style={{
                    background: '#fff',
                    border: '2px solid #e9d5ff',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: '0 4px 12px rgba(168, 85, 247, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between',
                    position: 'relative'
                }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                            <div style={{ background: '#f3e8ff', padding: '12px', borderRadius: '12px' }}>
                                <Sparkles size={28} color="#a855f7" />
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#f3e8ff', color: '#6b21a8', padding: '3px 8px', borderRadius: '6px' }}>
                                FOLDER 2 (NAME CARDS)
                            </span>
                        </div>
                        <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', fontWeight: 800, color: '#1e293b' }}>
                            Celron_BusinessCards Repository
                        </h3>
                        <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5 }}>
                            Repository for single or merged Front &amp; Back business card scans. Auto-saves contacts to Supabase.
                        </p>
                    </div>

                    <div>
                        <a
                            href={CELRON_SCANS_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                background: '#a855f7',
                                color: '#fff',
                                textDecoration: 'none',
                                padding: '10px 16px',
                                borderRadius: '10px',
                                fontWeight: 800,
                                fontSize: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                boxShadow: '0 2px 6px rgba(168, 85, 247, 0.25)'
                            }}
                        >
                            <Globe size={16} /> Open Business Cards (GDrive App) <ExternalLink size={14} />
                        </a>
                    </div>
                </div>

                {/* LAUNCHER 3: Celron_Invoices */}
                <div style={{
                    background: '#fff',
                    border: '2px solid #a7f3d0',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between',
                    position: 'relative'
                }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                            <div style={{ background: '#ecfdf5', padding: '12px', borderRadius: '12px' }}>
                                <DollarSign size={28} color="#10b981" />
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#d1fae5', color: '#065f46', padding: '3px 8px', borderRadius: '6px' }}>
                                FOLDER 3 (BILLS &amp; GST)
                            </span>
                        </div>
                        <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', fontWeight: 800, color: '#1e293b' }}>
                            Celron_Invoices &amp; Bills Scan
                        </h3>
                        <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5 }}>
                            Purchased items, supplier invoices &amp; expense bills. Extracts 9% GST &amp; connects directly to Accounts Payable (P&amp;L).
                        </p>
                    </div>

                    <div>
                        <a
                            href={CELRON_SCANS_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                background: '#10b981',
                                color: '#fff',
                                textDecoration: 'none',
                                padding: '10px 16px',
                                borderRadius: '10px',
                                fontWeight: 800,
                                fontSize: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)'
                            }}
                        >
                            <Globe size={16} /> Open Invoices (GDrive App) <ExternalLink size={14} />
                        </a>
                    </div>
                </div>
            </div>

            {/* RECENT SCANS LIVE FEED */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={18} color="#6366f1" /> Recent Scanned Documents ({recentScans.length})
                    </h3>
                    <button onClick={fetchScans} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                        <RefreshCw size={14} /> Refresh Feed
                    </button>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                        <span>Loading Google Drive scans...</span>
                    </div>
                ) : recentScans.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                        <span>No recent scans found. Tap one of the launchers above to scan documents.</span>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {recentScans.map(scan => (
                            <div key={scan.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                                    <FileText size={20} color="#3b82f6" />
                                    <div style={{ overflow: 'hidden' }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{scan.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(scan.createdTime).toLocaleDateString()}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <a href={scan.webViewLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.78rem', color: '#2563eb', fontWeight: 700, textDecoration: 'none', padding: '4px 10px', background: '#eff6ff', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                                        View
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function RocketIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"/>
        </svg>
    );
}
