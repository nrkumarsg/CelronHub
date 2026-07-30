import React, { useState, useEffect, useRef } from 'react';
import { 
    Search, Globe, Grid, List, Download, FileText, Smartphone, ArrowRight, 
    ExternalLink, RefreshCw, Move, Shield, QrCode, Sparkles, Plus, X, 
    Layers, DollarSign, Building2, Briefcase, User, Camera, CheckCircle2, Loader2
} from 'lucide-react';
import { isTokenValid, connectGoogleAPI } from '../lib/googleAuthService';
import { useAuth } from '../contexts/AuthContext';
import DriveFileMover from '../components/common/DriveFileMover';
import DriveExplorer from '../components/common/DriveExplorer';
import toast from 'react-hot-toast';

export default function ScannerModule() {
    const { profile } = useAuth();
    const [scans, setScans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [scanFolderId, setScanFolderId] = useState(localStorage.getItem('celron_scans_folder_id') || '1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w');
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [driveConnected, setDriveConnected] = useState(isTokenValid());
    
    // For Mover
    const [selectedScan, setSelectedScan] = useState(null);
    const [moverOpen, setMoverOpen] = useState(false);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [settings, setSettings] = useState(null);
    const [activeTab, setActiveTab] = useState('manage'); // 'manage' or 'setup'

    // Name Card Front & Back Merger Modal State
    const [showCardMergerModal, setShowCardMergerModal] = useState(false);
    const [cardFront, setCardFront] = useState(null);
    const [cardBack, setCardBack] = useState(null);
    const [cardFrontPreview, setCardFrontPreview] = useState('');
    const [cardBackPreview, setCardBackPreview] = useState('');
    const [isMergingCard, setIsMergingCard] = useState(false);
    const [parsedCardInfo, setParsedCardInfo] = useState(null);

    const CELRON_SCANS_DRIVE_URL = 'https://drive.google.com/drive/folders/1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w?usp=drive_link';
    const CELRONHUB_MOBILE_URL = window.location.origin || 'https://celronhub.vercel.app';

    const fetchScans = async () => {
        setLoading(true);
        const token = localStorage.getItem('google_access_token');
        if (!token) {
            console.error("ScannerModule: No google_access_token found in localStorage");
            setLoading(false);
            return;
        }

        try {
            const { listFolderContent } = await import('../lib/driveService');
            const { initializeVault } = await import('../lib/vaultService');
            const { getDocumentSettings } = await import('../lib/store');
            
            // Get raw settings for diagnostic
            const s = await getDocumentSettings(profile.company_id);
            setSettings(s);

            // Use initializeVault to get the consolidated 99. SCANS_INBOX
            const vaultRoots = await initializeVault(token, profile.company_id);
            const folderId = vaultRoots.scansInboxId;

            if (folderId) {
                console.log("ScannerModule: Using Scans Inbox Folder ID:", folderId);
                setScanFolderId(folderId);
                localStorage.setItem('celron_scans_folder_id', folderId);
                
                const files = await listFolderContent(token, folderId);
                console.log(`ScannerModule: Found ${files.length} items in Google Drive`);
                
                const onlyFiles = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
                
                let allFiles = [...onlyFiles];
                const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
                for(const f of folders) {
                    const subFiles = await listFolderContent(token, f.id);
                    allFiles = [...allFiles, ...subFiles.filter(sf => sf.mimeType !== 'application/vnd.google-apps.folder')];
                }
                setScans(allFiles);
            } else {
                console.warn("ScannerModule: No scansInboxId returned from initializeVault");
                // Aggressive fallback: find ALL folders named 99. SCANS_INBOX
                const query = "(name = '99. SCANS_INBOX' or name = 'Celron_Scans') and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
                const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name)`, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const { files } = await response.json();
                if (files && files.length > 0) {
                    setScanFolderId(files[0].id);
                    const foundFiles = await listFolderContent(token, files[0].id);
                    setScans(foundFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder'));
                }
            }
        } catch (err) {
            console.error("Error fetching scans:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleGlobalSearch = async () => {
        setLoading(true);
        const token = localStorage.getItem('google_access_token');
        try {
            // Search for ANY folder named 99. SCANS_INBOX in the entire Drive
            const query = "name = '99. SCANS_INBOX' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
            const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name)`, {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const { files } = await response.json();
            
            if (files && files.length > 0) {
                // Try to fetch from the first one found
                const { listFolderContent } = await import('../lib/driveService');
                const foundFiles = await listFolderContent(token, files[0].id);
                setScans(foundFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder'));
                setScanFolderId(files[0].id);
                alert(`Found ${files.length} Inbox folders. Loading from: ${files[0].id}`);
            } else {
                alert("No folder named '99. SCANS_INBOX' found in your entire Google Drive.");
            }
        } catch (err) {
            alert("Global search failed: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (driveConnected) {
            fetchScans();
        } else {
            setLoading(false);
        }
    }, [driveConnected]);


    const handleFrontImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setCardFront(file);
            setCardFrontPreview(URL.createObjectURL(file));
        }
    };

    const handleBackImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setCardBack(file);
            setCardBackPreview(URL.createObjectURL(file));
        }
    };

    const handleMergeAndParseNameCard = async () => {
        if (!cardFront && !cardBack) {
            toast.error("Please select at least Front or Back image of the business card");
            return;
        }

        setIsMergingCard(true);
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const loadImage = (src) => new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            });

            const imgFront = cardFrontPreview ? await loadImage(cardFrontPreview) : null;
            const imgBack = cardBackPreview ? await loadImage(cardBackPreview) : null;

            let width = 800;
            let height = 1000;

            if (imgFront && imgBack) {
                width = Math.max(imgFront.width, imgBack.width);
                height = imgFront.height + imgBack.height + 24;
                canvas.width = width;
                canvas.height = height;

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);

                ctx.drawImage(imgFront, (width - imgFront.width) / 2, 0);
                ctx.fillStyle = '#e2e8f0';
                ctx.fillRect(0, imgFront.height + 10, width, 4);
                ctx.drawImage(imgBack, (width - imgBack.width) / 2, imgFront.height + 24);
            } else if (imgFront) {
                canvas.width = imgFront.width;
                canvas.height = imgFront.height;
                ctx.drawImage(imgFront, 0, 0);
            } else if (imgBack) {
                canvas.width = imgBack.width;
                canvas.height = imgBack.height;
                ctx.drawImage(imgBack, 0, 0);
            }

            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            
            const { parseOCRBusinessCard } = await import('../lib/geminiService');
            const { saveContact } = await import('../lib/store');
            const { uploadFileToDrive } = await import('../lib/driveService');

            toast.loading("Analyzing Front & Back Card with AI...", { id: 'card-merge' });
            
            const cardData = await parseOCRBusinessCard(dataUrl);
            setParsedCardInfo(cardData);

            if (cardData) {
                const res = await fetch(dataUrl);
                const blob = await res.blob();
                const mergedFile = new File([blob], `Namecard_${(cardData.person_name || 'Contact').replace(/\s+/g, '_')}_Merged.jpg`, { type: 'image/jpeg' });

                let driveFileUrl = dataUrl;
                let driveFileId = '';

                const token = localStorage.getItem('google_access_token');
                if (token && scanFolderId) {
                    try {
                        const uploaded = await uploadFileToDrive(token, mergedFile, { folderId: scanFolderId });
                        if (uploaded && uploaded.id) {
                            driveFileId = uploaded.id;
                            driveFileUrl = uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`;
                        }
                    } catch (uploadErr) {
                        console.warn("Could not upload card to drive, saving dataUrl fallback:", uploadErr);
                    }
                }

                await saveContact({
                    company_name: cardData.company_name || 'Business Contact',
                    contact_person: cardData.person_name || 'Scanned Contact',
                    name: cardData.person_name || 'Scanned Contact',
                    email: cardData.email || '',
                    phone: cardData.phone || '',
                    handphone: cardData.phone || '',
                    designation: cardData.designation || '',
                    post: cardData.designation || '',
                    address: cardData.address || '',
                    business_card_url: driveFileUrl,
                    business_card_back_url: cardBackPreview || '',
                    card_drive_id: driveFileId,
                    notes: `Saved in CelronHub Business Card Repository on ${new Date().toLocaleDateString()}`
                });

                toast.success(`Merged & saved card for ${cardData.person_name || cardData.company_name}!`, { id: 'card-merge' });
                fetchScans();
            }
        } catch (err) {
            console.error("Error merging namecard:", err);
            toast.error("Error merging namecard: " + err.message, { id: 'card-merge' });
        } finally {
            setIsMergingCard(false);
        }
    };

    const handleOpenDrive = () => {
        window.open(CELRON_SCANS_DRIVE_URL, '_blank');
    };

    const handleReconnect = () => {
        connectGoogleAPI('scanner_module');
    };

    const handleDownloadApk = async () => {
        const { downloadApkByIdentifier } = await import('../lib/driveService');
        downloadApkByIdentifier('scanner');
    };

    const filteredScans = scans.filter(s =>
        s.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div style={{ padding: '24px', maxWidth: '100%', margin: '0', background: '#f8fafc', minHeight: '100vh' }}>
            {/* Quick Launcher Gateway Bar for Mobile / Desktop */}
            <div style={{
                background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                color: '#fff',
                padding: '16px 24px',
                borderRadius: '16px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
                boxShadow: '0 4px 16px rgba(49, 46, 129, 0.25)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.15)', padding: '10px', borderRadius: '12px', backdropFilter: 'blur(8px)' }}>
                        <Smartphone size={24} color="#a5b4fc" />
                    </div>
                    <div>
                        <h3 style={{ margin: '0 0 2px 0', fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.01em', color: '#fff' }}>
                            Celron Mobile Gateway & Scans Hub
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: '#c7d2fe' }}>
                            Primary Scan Inbox: <strong style={{ color: '#67e8f9' }}>Celron_Scans</strong> (1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w)
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* Button 1: Direct Google Drive Celron_Scans App launch */}
                    <a
                        href={CELRON_SCANS_DRIVE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            background: '#0284c7',
                            color: '#fff',
                            textDecoration: 'none',
                            padding: '8px 14px',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
                        }}
                    >
                        <Globe size={15} /> Open Celron_Scans (Drive App)
                    </a>

                    {/* Button 2: Front & Back Namecard Merger */}
                    <button
                        type="button"
                        onClick={() => setShowCardMergerModal(true)}
                        style={{
                            background: '#a855f7',
                            color: '#fff',
                            border: 'none',
                            padding: '8px 14px',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
                        }}
                    >
                        <Sparkles size={15} /> Merge Front+Back Namecard
                    </button>

                    {/* Button 3: Download Mobile Scanner APK */}
                    <button
                        type="button"
                        onClick={handleDownloadApk}
                        style={{
                            background: '#10b981',
                            color: '#fff',
                            border: 'none',
                            padding: '8px 14px',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
                        }}
                    >
                        <Download size={15} /> Download Mobile APK
                    </button>
                </div>
            </div>

            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px' }}>
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1e293b', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
                        Celron Scanner
                    </h1>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                        {activeTab === 'manage' ? 'Manage & organize your cloud scans into 5 business channels' : 'Get the mobile app for your phone'}
                    </p>
                </div>

                {/* Tab Navigation - Top Right as requested */}
                <div style={{ display: 'flex', gap: '6px', background: '#fff', padding: '4px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <button 
                        onClick={() => setActiveTab('manage')}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: activeTab === 'manage' ? '#6366f1' : 'transparent', color: activeTab === 'manage' ? '#fff' : '#64748b', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <List size={16} /> Manage Inbox
                    </button>
                    <button 
                        onClick={() => setActiveTab('setup')}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: activeTab === 'setup' ? '#6366f1' : 'transparent', color: activeTab === 'setup' ? '#fff' : '#64748b', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <Smartphone size={16} /> App Setup
                    </button>
                    <button 
                        onClick={() => setActiveTab('explorer')}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: activeTab === 'explorer' ? '#6366f1' : 'transparent', color: activeTab === 'explorer' ? '#fff' : '#64748b', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <Globe size={16} /> Hub Explorer
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => setShowDiagnostics(!showDiagnostics)}
                        style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', padding: '8px', borderRadius: '10px', cursor: 'pointer' }}
                        title="Diagnostics"
                    >
                        <Shield size={18} />
                    </button>
                    {activeTab === 'manage' && (
                        <>
                            <button
                                onClick={handleOpenDrive}
                                style={{ background: '#fff', color: '#475569', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                            >
                                <Globe size={16} color="#4285F4" /> Drive
                            </button>
                            <button
                                onClick={fetchScans}
                                className="btn btn-secondary"
                                style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '0.85rem' }}
                            >
                                <RefreshCw size={16} />
                            </button>
                        </>
                    )}
                </div>
            </header>

            {showDiagnostics && (
                <div style={{ background: '#1e293b', color: '#f8fafc', padding: '20px', borderRadius: '12px', marginBottom: '24px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontWeight: 800, color: '#94a3b8' }}>SYSTEM DIAGNOSTICS</span>
                        <button onClick={() => setShowDiagnostics(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>Close</button>
                    </div>
                    <p style={{ margin: '4px 0' }}>User ID: {profile?.id}</p>
                    <p style={{ margin: '4px 0' }}>Company ID: {profile?.company_id}</p>
                    <p style={{ margin: '4px 0' }}>Configured Root: {settings?.google_drive_folder_id || 'NOT SET'}</p>
                    <p style={{ margin: '4px 0' }}>Celron Root ID: {settings?.gdrive_celron_root_id || 'NOT RESOLVED'}</p>
                    <p style={{ margin: '4px 0' }}>Scans Inbox ID: {scanFolderId || 'NOT RESOLVED'}</p>
                    <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <p style={{ margin: '0 0 8px 0', color: '#3b82f6' }}>Is your Scan Inbox empty? Try a global search across all folders:</p>
                        <button 
                            onClick={handleGlobalSearch}
                            style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', marginRight: '8px' }}
                        >
                            Run Global Folder Search
                        </button>
                        <button 
                            onClick={async () => {
                                setLoading(true);
                                try {
                                    const token = localStorage.getItem('google_access_token');
                                    // Search specifically for the one in CELRONHUB
                                    const query = "name = '99. SCANS_INBOX' and trashed = false";
                                    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name, parents)`, {
                                        headers: { 'Authorization': 'Bearer ' + token }
                                    });
                                    const { files } = await res.json();
                                    if (files && files.length > 0) {
                                        const folderId = files[0].id;
                                        setScanFolderId(folderId);
                                        localStorage.setItem('celron_scans_folder_id', folderId);
                                        await fetchScans();
                                        alert("Successfully forced link to: " + folderId);
                                    } else {
                                        alert("Could not find folder. Please scan a document on your phone first.");
                                    }
                                } catch (e) {
                                    alert("Fix failed: " + e.message);
                                } finally {
                                    setLoading(false);
                                }
                            }}
                            style={{ background: '#10b981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Force Link to Current Folder
                        </button>
                    </div>
                </div>
            )}



            {activeTab === 'explorer' ? (
                <DriveExplorer />
            ) : activeTab === 'setup' ? (
                <>
                    {/* Instruction Banner for Mobile App */}
                    <div style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)', borderRadius: '16px', padding: '32px', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '24px', color: '#fff', boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.5)', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: '-10%', right: '-5%', width: '300px', height: '300px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', filter: 'blur(60px)' }}></div>
                        <div style={{ background: 'rgba(255,255,255,0.2)', padding: '20px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', zIndex: 1 }}>
                            <Smartphone size={48} color="#fff" />
                        </div>
                        <div style={{ flex: 1, zIndex: 1 }}>
                            <h2 style={{ fontSize: '1.5rem', margin: '0 0 8px 0', fontWeight: 800, letterSpacing: '-0.01em' }}>Get the Celron Scanner App</h2>
                            <p style={{ margin: '0 0 16px 0', opacity: 0.9, fontSize: '0.95rem', maxWidth: '600px', lineHeight: 1.6 }}>
                                Download the official Android APK to your phone to start scanning documents directly. Features include multi-page scanning, auto-crop, JPG/PDF output, and automatic upload to Google Drive.
                            </p>
                            <button
                                onClick={handleDownloadApk}
                                style={{ background: '#fff', color: '#4f46e5', border: 'none', padding: '12px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1rem', transition: 'all 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                                onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
                                onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
                            >
                                <Download size={18} /> Download APK to Phone
                            </button>
                        </div>
                    </div>

                    {/* How it Works Section */}
                    <div style={{ marginBottom: '40px' }}>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <RefreshCw size={20} color="#6366f1" /> How the Sync Flow Works
                        </h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                            {[
                                { step: '01', title: 'Scan on Phone', desc: 'Use the Celron Mobile App to capture crystal-clear document scans.', icon: <Smartphone size={24} color="#6366f1" /> },
                                { step: '02', title: 'Auto-Save to Cloud', desc: 'Scans are instantly uploaded to your secure Celron_Scans Drive folder.', icon: <Globe size={24} color="#10b981" /> },
                                { step: '03', title: 'Link to Hub', desc: 'Attach these scans directly to jobs, expenses, or partners in one click.', icon: <FileText size={24} color="#f59e0b" /> }
                            ].map((item, idx) => (
                                <div key={idx} className="glass-panel" style={{ padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', background: '#fff' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                        <div style={{ width: '48px', height: '48px', background: '#f1f5f9', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {item.icon}
                                        </div>
                                        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#e2e8f0' }}>{item.step}</span>
                                    </div>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>{item.title}</h3>
                                    <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>{item.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            ) : (
                <>
                    {!driveConnected ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ width: '64px', height: '64px', background: '#fef3c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <Globe size={32} color="#d97706" />
                    </div>
                    <h3 style={{ fontSize: '1.2rem', color: '#1e293b', margin: '0 0 8px 0' }}>Google Drive Disconnected</h3>
                    <p style={{ color: '#64748b', maxWidth: '400px', margin: '0 auto 24px' }}>Please connect your Google Drive account to view and manage scanned documents.</p>
                    <button
                        onClick={handleReconnect}
                        className="btn btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}
                    >
                        <RefreshCw size={18} /> Connect Google Drive
                    </button>
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center' }}>
                        <div style={{ flex: 1, display: 'flex', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '4px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', color: '#94a3b8' }}><Search size={20} /></div>
                            <input
                                type="text"
                                placeholder="Search scanned documents by name..."
                                style={{ flex: 1, border: 'none', outline: 'none', padding: '12px', fontSize: '1rem' }}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div style={{ display: 'flex', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '4px' }}>
                            <button onClick={() => setViewMode('grid')} style={{ padding: '8px', background: viewMode === 'grid' ? '#f1f5f9' : 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: viewMode === 'grid' ? '#6366f1' : '#64748b' }}>
                                <Grid size={20} />
                            </button>
                            <button onClick={() => setViewMode('list')} style={{ padding: '8px', background: viewMode === 'list' ? '#f1f5f9' : 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: viewMode === 'list' ? '#6366f1' : '#64748b' }}>
                                <List size={20} />
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '100px 0', color: '#64748b' }}>
                            <div className="animate-spin" style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #6366f1', borderRadius: '50%', margin: '0 auto 20px' }}></div>
                            <p>Loading scanned documents from Google Drive...</p>
                        </div>
                    ) : filteredScans.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '100px 0', background: '#fff', borderRadius: '16px', border: '2px dashed #e2e8f0' }}>
                            <FileText size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
                            <h3 style={{ color: '#475569', margin: '0 0 8px 0' }}>No scanned documents found</h3>
                            <p style={{ color: '#94a3b8', margin: '0 0 24px 0' }}>Documents scanned via the mobile app will automatically appear here.</p>
                            
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                        <button 
                                            onClick={async () => {
                                                setLoading(true);
                                                try {
                                                    const token = localStorage.getItem('google_access_token');
                                                    // Comprehensive name-based search
                                                    const query = "(name = '99. SCANS_INBOX' or name = 'Celron_Scans') and trashed = false and mimeType = 'application/vnd.google-apps.folder'";
                                                    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name)`, {
                                                        headers: { 'Authorization': 'Bearer ' + token }
                                                    });
                                                    const { files } = await res.json();
                                                    if (files && files.length > 0) {
                                                        let total = 0;
                                                        let combinedScans = [];
                                                        for (const f of files) {
                                                            const content = await fetch(`https://www.googleapis.com/drive/v3/files?q='${f.id}' in parents and trashed = false&fields=files(id, name, mimeType, thumbnailLink, webViewLink, createdTime)`, {
                                                                headers: { 'Authorization': 'Bearer ' + token }
                                                            });
                                                            const data = await content.json();
                                                            if (data.files) {
                                                                combinedScans = [...combinedScans, ...data.files];
                                                                total += data.files.length;
                                                            }
                                                        }
                                                        setScans(combinedScans);
                                                        setScanFolderId(files[0].id);
                                                        localStorage.setItem('celron_scans_folder_id', files[0].id);
                                                        alert(`Scanner synchronized! ${total} documents loaded.`);
                                                    } else {
                                                        alert("Could not find scan folder. Please scan a document on your phone first.");
                                                    }
                                                } catch (e) {
                                                    alert("Fix failed: " + e.message);
                                                } finally {
                                                    setLoading(false);
                                                }
                                            }}
                                            style={{ background: '#10b981', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 6px rgba(16, 185, 129, 0.2)' }}
                                        >
                                            <RefreshCw size={18} /> Refresh & Sync Scans
                                        </button>
                                    </div>
                        </div>
                    ) : (
                        <div style={{
                            display: viewMode === 'grid' ? 'grid' : 'block',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: '24px'
                        }}>
                            {filteredScans.map(scan => (
                                <div key={scan.id} className="glass-panel" style={{ padding: '20px', marginBottom: viewMode === 'list' ? '12px' : '0', display: viewMode === 'list' ? 'flex' : 'block', alignItems: 'center', gap: '20px', transition: 'all 0.2s', border: '1px solid #e2e8f0' }}>
                                    <div style={{ width: viewMode === 'list' ? '48px' : '100%', height: viewMode === 'list' ? '48px' : '180px', background: '#f8fafc', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: viewMode === 'grid' ? '16px' : '0', overflow: 'hidden', border: '1px solid #f1f5f9' }}>
                                        {scan.thumbnailLink ? (
                                            <img src={scan.thumbnailLink} alt={scan.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <FileText size={viewMode === 'list' ? 24 : 48} color="#94a3b8" />
                                        )}
                                    </div>
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={scan.name}>{scan.name}</h3>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', background: '#f1f5f9', color: '#64748b', borderRadius: '4px', fontWeight: 600 }}>{new Date(scan.createdTime).toLocaleDateString()}</span>
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {scan.mimeType.includes('pdf') ? 'PDF' : 'Image'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <a
                                                href={scan.webViewLink}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="btn btn-secondary"
                                                style={{ flex: 1, padding: '8px', fontSize: '0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                            >
                                                <ExternalLink size={14} /> View
                                            </a>
                                            <button
                                                onClick={() => {
                                                    setSelectedScan(scan);
                                                    setMoverOpen(true);
                                                }}
                                                style={{ flex: 1, padding: '8px', fontSize: '0.85rem', border: 'none', background: '#6366f1', color: '#fff', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                            >
                                                <Move size={14} /> Organize
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
            </>
        )}

            <DriveFileMover 
                isOpen={moverOpen}
                file={selectedScan}
                onClose={() => setMoverOpen(false)}
                onMoveComplete={(fileId, destinationName) => {
                    setScans(prev => prev.filter(s => s.id !== fileId));
                    alert(`Moved successfully to ${destinationName}`);
                }}
            />

            {/* Front & Back Namecard Merger Modal */}
            {showCardMergerModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
                    <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ background: '#f3e8ff', padding: '10px', borderRadius: '12px' }}>
                                    <Sparkles size={22} color="#a855f7" />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#1e293b' }}>
                                        Name Card Merger (Front & Back)
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                                        Upload Front & Back of business card &rarr; Merge into 1 file &rarr; Run AI Contact Extractor
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setShowCardMergerModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                            {/* Front Image Input */}
                            <div style={{ border: '2px dashed #cbd5e1', borderRadius: '14px', padding: '16px', textAlign: 'center', background: cardFrontPreview ? '#f8fafc' : '#fff' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '10px' }}>
                                    1. Front Side Image
                                </span>
                                {cardFrontPreview ? (
                                    <div style={{ position: 'relative' }}>
                                        <img src={cardFrontPreview} alt="Front Card" style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px' }} />
                                        <button onClick={() => { setCardFront(null); setCardFrontPreview(''); }} style={{ position: 'absolute', top: '6px', right: '6px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', padding: '4px', cursor: 'pointer' }}>
                                            <X size={12} />
                                        </button>
                                    </div>
                                ) : (
                                    <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '20px 0' }}>
                                        <Camera size={28} color="#94a3b8" />
                                        <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Click to select Front Card</span>
                                        <input type="file" accept="image/*" onChange={handleFrontImageChange} style={{ display: 'none' }} />
                                    </label>
                                )}
                            </div>

                            {/* Back Image Input */}
                            <div style={{ border: '2px dashed #cbd5e1', borderRadius: '14px', padding: '16px', textAlign: 'center', background: cardBackPreview ? '#f8fafc' : '#fff' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '10px' }}>
                                    2. Back Side Image
                                </span>
                                {cardBackPreview ? (
                                    <div style={{ position: 'relative' }}>
                                        <img src={cardBackPreview} alt="Back Card" style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px' }} />
                                        <button onClick={() => { setCardBack(null); setCardBackPreview(''); }} style={{ position: 'absolute', top: '6px', right: '6px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', padding: '4px', cursor: 'pointer' }}>
                                            <X size={12} />
                                        </button>
                                    </div>
                                ) : (
                                    <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '20px 0' }}>
                                        <Camera size={28} color="#94a3b8" />
                                        <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Click to select Back Card</span>
                                        <input type="file" accept="image/*" onChange={handleBackImageChange} style={{ display: 'none' }} />
                                    </label>
                                )}
                            </div>
                        </div>

                        {parsedCardInfo && (
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px', marginBottom: '20px' }}>
                                <h4 style={{ margin: '0 0 6px 0', fontSize: '0.9rem', color: '#166534', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <CheckCircle2 size={16} /> Extracted Contact Details
                                </h4>
                                <div style={{ fontSize: '0.82rem', color: '#14532d', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <div><strong>Name:</strong> {parsedCardInfo.person_name || 'N/A'}</div>
                                    <div><strong>Company:</strong> {parsedCardInfo.company_name || 'N/A'}</div>
                                    <div><strong>Email:</strong> {parsedCardInfo.email || 'N/A'}</div>
                                    <div><strong>Phone:</strong> {parsedCardInfo.phone || 'N/A'}</div>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={() => setShowCardMergerModal(false)} className="btn btn-secondary" style={{ borderRadius: '10px' }}>
                                Cancel
                            </button>
                            <button
                                onClick={handleMergeAndParseNameCard}
                                disabled={isMergingCard || (!cardFront && !cardBack)}
                                style={{
                                    background: isMergingCard ? '#cbd5e1' : '#a855f7',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '10px 20px',
                                    borderRadius: '10px',
                                    fontWeight: 700,
                                    fontSize: '0.88rem',
                                    cursor: isMergingCard ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                {isMergingCard ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                {isMergingCard ? 'Merging & Extracting...' : 'Merge & Save Contact'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
