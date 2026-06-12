import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Search, Plus, Book, FileText, Globe, Trash2, ExternalLink, 
    Edit, Sparkles, LayoutDashboard, Database, Upload, MessageSquare, 
    AlertTriangle, ShieldAlert, CheckCircle, RefreshCw, BarChart3, HelpCircle 
} from 'lucide-react';
import { getManuals, deleteManual } from '../lib/manualsService';
import BookCover from '../components/common/BookCover';
import { useAuth } from '../contexts/AuthContext';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export default function ManualsDirectory() {
    const [manuals, setManuals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [manualFolderId, setManualFolderId] = useState(localStorage.getItem('manual_drive_folder_id') || '');
    
    // UI Navigation State
    const [activeTab, setActiveTab] = useState('library'); // 'library', 'finder', 'chat', 'dashboard', 'import'
    
    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [filterMfg, setFilterMfg] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    
    // AI Finder State
    const [finderMfg, setFinderMfg] = useState('');
    const [finderModel, setFinderModel] = useState('');
    const [finderCategory, setFinderCategory] = useState('');
    const [finderStatus, setFinderStatus] = useState([]);
    const [finderSearching, setFinderSearching] = useState(false);
    
    // AI Chat State
    const [chatManualId, setChatManualId] = useState('');
    const [chatQuery, setChatQuery] = useState('');
    const [chatHistory, setChatHistory] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);
    
    // Dashboard State
    const [stats, setStats] = useState({ total: 0, missing: 0, duplicateCount: 0, duplicates: [], latest: [] });
    const [statsLoading, setStatsLoading] = useState(false);
    
    // Import State
    const [importData, setImportData] = useState([]);
    const [importing, setImporting] = useState(false);
    const [importLog, setImportLog] = useState('');

    const navigate = useNavigate();
    const { profile } = useAuth();
    
    const isSuperAdmin = profile?.role === 'superadmin';
    const isAdmin = profile?.role === 'admin' || isSuperAdmin;
    const backendUrl = ''; // Relative path for API endpoints

    useEffect(() => {
        fetchManuals();
        tryDetectFolder();
    }, []);

    useEffect(() => {
        if (activeTab === 'dashboard') {
            fetchDashboardStats();
        }
    }, [activeTab]);

    const tryDetectFolder = async () => {
        const token = sessionStorage.getItem('google_contacts_token') || localStorage.getItem('google_access_token');
        if (token && !manualFolderId) {
            try {
                const { getOrCreateFolder } = await import('../lib/driveService');
                const id = await getOrCreateFolder(token, 'Manual');
                if (id) {
                    setManualFolderId(id);
                    localStorage.setItem('manual_drive_folder_id', id);
                }
            } catch (err) {
                console.error("Error detecting folder:", err);
            }
        }
    };

    const handleOpenDrive = () => {
        const url = manualFolderId
            ? `https://drive.google.com/drive/folders/${manualFolderId}`
            : 'https://drive.google.com';
        window.open(url, '_blank');
    };

    const fetchManuals = async () => {
        setLoading(true);
        const { data } = await getManuals();
        if (data) {
            // Unpack custom fields stored in info JSON if applicable
            const parsed = data.map(m => {
                if (m.info && m.info.startsWith('{')) {
                    try {
                        const extra = JSON.parse(m.info);
                        return { ...m, ...extra };
                    } catch (e) {}
                }
                return m;
            });
            setManuals(parsed);
        }
        setLoading(false);
    };

    const fetchDashboardStats = async () => {
        setStatsLoading(true);
        try {
            const res = await fetch(`${backendUrl}/api/manuals/dashboard?company_id=${profile?.company_id}`);
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (e) {
            console.error('Failed to load stats:', e);
        } finally {
            setStatsLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Remove this manual from library?')) {
            await deleteManual(id);
            fetchManuals();
            fetchDashboardStats();
        }
    };

    // AI Finder Action
    const handleFindManual = async (e) => {
        e.preventDefault();
        if (!finderMfg || !finderModel) return;
        
        const token = sessionStorage.getItem('google_contacts_token') || localStorage.getItem('google_access_token');
        if (!token) {
            alert('Google Drive authentication is required to download manuals. Please connect GDrive.');
            return;
        }

        setFinderSearching(true);
        setFinderStatus(['Searching Google for official manual PDFs...']);
        
        try {
            const res = await fetch(`${backendUrl}/api/manuals/find-ai`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    manufacturer: finderMfg,
                    model: finderModel,
                    category: finderCategory,
                    googleToken: token,
                    userId: profile?.id,
                    companyId: profile?.company_id
                })
            });
            
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to search manual');
            }
            
            setFinderStatus(prev => [
                ...prev,
                'PDF manual located!',
                'Downloaded file from source website.',
                'Parsed PDF pages and extracted full text.',
                'Analyzed technical text via OpenAI.',
                `Saved manual to Google Drive folder: /Manuals/${data.manual.manufacturer}/${data.manual.model}`,
                'Stored technical library metadata in PostgreSQL.',
                '🎉 Successfully added to library!'
            ]);
            
            fetchManuals();
            setFinderMfg('');
            setFinderModel('');
            setFinderCategory('');
        } catch (err) {
            setFinderStatus(prev => [...prev, `❌ Error: ${err.message}`]);
        } finally {
            setFinderSearching(false);
        }
    };

    // AI Chat RAG Action
    const handleSendChat = async (e) => {
        e.preventDefault();
        if (!chatQuery || !chatManualId) return;
        
        const userMsg = { role: 'user', content: chatQuery };
        setChatHistory(prev => [...prev, userMsg]);
        setChatQuery('');
        setChatLoading(true);
        
        try {
            const res = await fetch(`${backendUrl}/api/manuals/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: chatQuery,
                    manualId: chatManualId
                })
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Chat failed');
            
            const aiMsg = { 
                role: 'assistant', 
                content: data.answer,
                citations: data.citations || [],
                confidenceScore: data.confidenceScore || 0.5
            };
            setChatHistory(prev => [...prev, aiMsg]);
        } catch (err) {
            setChatHistory(prev => [...prev, { role: 'assistant', content: `Sorry, I had trouble reading the manual: ${err.message}` }]);
        } finally {
            setChatLoading(false);
        }
    };

    // Bulk Import Action
    const handleImportFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'csv') {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    setImportData(results.data);
                    setImportLog(`Parsed ${results.data.length} rows from CSV.`);
                }
            });
        } else if (ext === 'xlsx' || ext === 'xls') {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                setImportData(data);
                setImportLog(`Parsed ${data.length} rows from Excel Sheet.`);
            };
            reader.readAsBinaryString(file);
        } else {
            alert('Please select a valid CSV or Excel (.xlsx) file.');
        }
    };

    const executeBulkImport = async () => {
        if (importData.length === 0) return;
        setImporting(true);
        setImportLog(prev => prev + '\nStarting upload to database...');
        
        try {
            const res = await fetch(`${backendUrl}/api/manuals/bulk-import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    manuals: importData,
                    userId: profile?.id,
                    companyId: profile?.company_id
                })
            });
            
            if (res.ok) {
                const result = await res.json();
                setImportLog(prev => prev + `\n🎉 Success! Successfully imported ${result.count} manual metadata records.`);
                fetchManuals();
                setImportData([]);
            } else {
                const err = await res.json();
                throw new Error(err.error || 'Server error');
            }
        } catch (err) {
            setImportLog(prev => prev + `\n❌ Import failed: ${err.message}`);
        } finally {
            setImporting(false);
        }
    };

    // Filter Logic
    const filteredManuals = manuals.filter(m => {
        const matchesSearch = 
            (m.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (m.group_name || m.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (m.author_company || m.manufacturer || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (m.model || '').toLowerCase().includes(searchTerm.toLowerCase());
            
        const matchesMfg = !filterMfg || (m.manufacturer || m.author_company || '').toLowerCase().includes(filterMfg.toLowerCase());
        const matchesCat = !filterCategory || (m.category || m.group_name || '').toLowerCase().includes(filterCategory.toLowerCase());
        
        return matchesSearch && matchesMfg && matchesCat;
    });

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
            {/* Notion-Style Sidebar Navigation */}
            <aside style={{ width: '260px', background: '#fff', borderRight: '1px solid #e2e8f0', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Book size={24} color="#6366f1" />
                    <span style={{ fontWeight: 800, fontSize: '1.15rem', color: '#1e293b', letterSpacing: '-0.02em' }}>Tech Library</span>
                </div>
                
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button 
                        onClick={() => setActiveTab('library')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
                            background: activeTab === 'library' ? '#f1f5f9' : 'transparent',
                            color: activeTab === 'library' ? '#6366f1' : '#475569',
                            textAlign: 'left'
                        }}
                    >
                        <Database size={18} /> Library Grid
                    </button>
                    <button 
                        onClick={() => setActiveTab('finder')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
                            background: activeTab === 'finder' ? '#f1f5f9' : 'transparent',
                            color: activeTab === 'finder' ? '#6366f1' : '#475569',
                            textAlign: 'left'
                        }}
                    >
                        <Sparkles size={18} /> AI Manual Finder
                    </button>
                    <button 
                        onClick={() => setActiveTab('chat')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
                            background: activeTab === 'chat' ? '#f1f5f9' : 'transparent',
                            color: activeTab === 'chat' ? '#6366f1' : '#475569',
                            textAlign: 'left'
                        }}
                    >
                        <MessageSquare size={18} /> AI RAG Chat
                    </button>
                    <button 
                        onClick={() => setActiveTab('dashboard')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
                            background: activeTab === 'dashboard' ? '#f1f5f9' : 'transparent',
                            color: activeTab === 'dashboard' ? '#6366f1' : '#475569',
                            textAlign: 'left'
                        }}
                    >
                        <LayoutDashboard size={18} /> Dashboard & Health
                    </button>
                    <button 
                        onClick={() => setActiveTab('import')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
                            background: activeTab === 'import' ? '#f1f5f9' : 'transparent',
                            color: activeTab === 'import' ? '#6366f1' : '#475569',
                            textAlign: 'left'
                        }}
                    >
                        <Upload size={18} /> Bulk Import
                    </button>
                </nav>

                <div style={{ marginTop: 'auto', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <Globe size={16} color="#4285F4" />
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>Google Drive</span>
                    </div>
                    <p style={{ margin: '0 0 12px 0', fontSize: '0.75rem', color: '#64748b' }}>Store all manuals securely in cloud directories.</p>
                    <button 
                        onClick={handleOpenDrive}
                        style={{ width: '100%', padding: '8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', color: '#475569' }}
                    >
                        Open Cloud Folder
                    </button>
                </div>
            </aside>

            {/* Main Content Workspace */}
            <main style={{ flex: 1, padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
                
                {/* 1. LIBRARY GRID TAB */}
                {activeTab === 'library' && (
                    <div>
                        <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>Technical Library</h1>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>Browse your collection of technical references and manuals.</p>
                            </div>
                            <button onClick={() => navigate('/manuals/new')} className="btn btn-primary" style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Plus size={18} /> Add New Manual
                            </button>
                        </header>

                        {/* Search & Filters */}
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '280px', display: 'flex', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '4px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', color: '#94a3b8' }}><Search size={20} /></div>
                                <input
                                    type="text"
                                    placeholder="Search by title, manufacturer, model..."
                                    style={{ flex: 1, border: 'none', outline: 'none', padding: '12px', fontSize: '0.95rem' }}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <input 
                                type="text"
                                placeholder="Filter Manufacturer"
                                style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.95rem', width: '180px' }}
                                value={filterMfg}
                                onChange={(e) => setFilterMfg(e.target.value)}
                            />
                            <input 
                                type="text"
                                placeholder="Filter Category"
                                style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.95rem', width: '180px' }}
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                            />
                        </div>

                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '100px 0', color: '#64748b' }}>
                                <div className="animate-spin" style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #6366f1', borderRadius: '50%', margin: '0 auto 20px' }}></div>
                                <p>Loading library...</p>
                            </div>
                        ) : filteredManuals.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '100px 0', background: '#fff', borderRadius: '16px', border: '2px dashed #e2e8f0' }}>
                                <Book size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
                                <h3 style={{ color: '#475569', margin: '0 0 8px 0' }}>No manuals found</h3>
                                <p style={{ color: '#94a3b8', margin: 0 }}>Try adjusting your search criteria or add a new manual.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '24px' }}>
                                {filteredManuals.map(manual => (
                                    <div key={manual.id} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', background: '#fff' }}>
                                        <div style={{ marginBottom: '16px' }}>
                                            <BookCover 
                                                title={manual.title} 
                                                group={manual.group_name || manual.category} 
                                                company={manual.author_company || manual.manufacturer} 
                                            />
                                        </div>
                                        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.05rem', fontWeight: 700, color: '#1e293b', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: '40px' }}>
                                            {manual.title}
                                        </h3>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: '#eff6ff', color: '#2563eb', borderRadius: '4px', fontWeight: 600 }}>
                                                {manual.manufacturer || manual.author_company}
                                            </span>
                                            {manual.model && (
                                                <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: '#f5f3ff', color: '#7c3aed', borderRadius: '4px', fontWeight: 600 }}>
                                                    {manual.model}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                                            <button 
                                                onClick={() => {
                                                    setChatManualId(manual.id);
                                                    setActiveTab('chat');
                                                    setChatHistory([{ role: 'assistant', content: `Hello! I have loaded "${manual.title}". Ask me any technical questions about this system!` }]);
                                                }}
                                                className="btn btn-primary"
                                                style={{ flex: 1, padding: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                            >
                                                <Sparkles size={14} /> AI Chat
                                            </button>
                                            <a href={manual.file_url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <ExternalLink size={14} />
                                            </a>
                                            <button onClick={() => navigate(`/manuals/${manual.id}`)} style={{ padding: '8px', background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#64748b', cursor: 'pointer' }}>
                                                <Edit size={14} />
                                            </button>
                                            {isAdmin && (
                                                <button onClick={() => handleDelete(manual.id)} style={{ padding: '8px', background: 'none', border: '1px solid #fee2e2', borderRadius: '8px', color: '#ef4444', cursor: 'pointer' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 2. AI MANUAL FINDER TAB */}
                {activeTab === 'finder' && (
                    <div style={{ maxWidth: '750px', margin: '0 auto' }}>
                        <header style={{ marginBottom: '32px' }}>
                            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Sparkles size={32} color="#6366f1" /> AI Auto Manual Finder
                            </h1>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>
                                Enter a manufacturer and model. The Smart Library AI will search official manufacturer directories, locate the PDF, extract metadata and full text, and automatically save the file to your library.
                            </p>
                        </header>

                        <form onSubmit={handleFindManual} className="glass-panel" style={{ padding: '32px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85rem', color: '#475569' }}>Manufacturer *</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Siemens, ABB, Danfoss"
                                        required
                                        style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                                        value={finderMfg}
                                        onChange={(e) => setFinderMfg(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85rem', color: '#475569' }}>Model / Series *</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. S7-1200, ACS880, VLT 3000"
                                        required
                                        style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                                        value={finderModel}
                                        onChange={(e) => setFinderModel(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85rem', color: '#475569' }}>Category / Group</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. PLC, Inverters, Flowmeters"
                                    style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                                    value={finderCategory}
                                    onChange={(e) => setFinderCategory(e.target.value)}
                                />
                            </div>
                            
                            <button 
                                type="submit" 
                                disabled={finderSearching}
                                className="btn btn-primary"
                                style={{ width: '100%', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#6366f1' }}
                            >
                                {finderSearching ? (
                                    <>
                                        <RefreshCw size={20} className="animate-spin" /> Running AI Search...
                                    </>
                                ) : (
                                    <>
                                        <Search size={20} /> Search and Auto-Import PDF
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Progress Status Logs */}
                        {finderStatus.length > 0 && (
                            <div className="glass-panel" style={{ padding: '24px', background: '#0f172a', color: '#38bdf8', borderRadius: '12px', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                                <div style={{ borderBottom: '1px solid #334155', paddingBottom: '8px', marginBottom: '12px', fontWeight: 'bold' }}>AI Finder Execution logs:</div>
                                {finderStatus.map((log, idx) => (
                                    <div key={idx} style={{ marginBottom: '6px', color: log.startsWith('❌') ? '#ef4444' : (log.startsWith('🎉') ? '#4ade80' : '#38bdf8') }}>
                                        {log}
                                    </div>
                                ))}
                                {finderSearching && (
                                    <div style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <RefreshCw size={14} className="animate-spin" /> AI Engine is fetching remote PDF and scanning technical content...
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* 3. AI RAG CHAT TAB */}
                {activeTab === 'chat' && (
                    <div style={{ display: 'flex', gap: '24px', height: 'calc(100vh - 150px)' }}>
                        {/* Selector sidebar */}
                        <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <label style={{ fontWeight: 700, color: '#334155' }}>Select Manual to Chat</label>
                            <select 
                                value={chatManualId} 
                                onChange={(e) => {
                                    setChatManualId(e.target.value);
                                    const selected = manuals.find(m => m.id === e.target.value);
                                    if (selected) {
                                        setChatHistory([{ role: 'assistant', content: `Hello! I have loaded the RAG context for "${selected.title}". Ask me anything about this model's specifications, service instructions, or troubleshooting!` }]);
                                    }
                                }} 
                                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.9rem' }}
                            >
                                <option value="">-- Choose a manual --</option>
                                {manuals.map(m => (
                                    <option key={m.id} value={m.id}>{m.manufacturer || m.author_company} - {m.title.slice(0, 35)}...</option>
                                ))}
                            </select>
                            
                            {chatManualId && (
                                <div className="glass-panel" style={{ padding: '16px', background: '#fff', fontSize: '0.85rem' }}>
                                    {(() => {
                                        const activeMan = manuals.find(m => m.id === chatManualId);
                                        if (!activeMan) return null;
                                        return (
                                            <div>
                                                <h4 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>Active Document Profile</h4>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#64748b' }}>
                                                    <div><strong>Mfg:</strong> {activeMan.manufacturer || activeMan.author_company}</div>
                                                    <div><strong>Model:</strong> {activeMan.model || 'N/A'}</div>
                                                    <div><strong>Category:</strong> {activeMan.category || activeMan.group_name}</div>
                                                    {activeMan.summary && (
                                                        <div style={{ marginTop: '8px', padding: '8px', background: '#f8fafc', borderRadius: '6px', fontStyle: 'italic' }}>
                                                            {activeMan.summary}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                        
                        {/* Chat box */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            {/* Header */}
                            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <MessageSquare size={20} color="#6366f1" />
                                    <span style={{ fontWeight: 700 }}>AI Document Chat Assistant</span>
                                </div>
                                {chatManualId && (
                                    <span style={{ fontSize: '0.75rem', background: '#dbeafe', color: '#1d4ed8', padding: '4px 8px', borderRadius: '12px', fontWeight: 600 }}>RAG Enabled</span>
                                )}
                            </div>
                            
                            {/* Messages */}
                            <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', background: '#fafafa' }}>
                                {chatHistory.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: '100px' }}>
                                        <MessageSquare size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                                        <p>Select a manual from the left sidebar to start chatting.</p>
                                    </div>
                                ) : (
                                    chatHistory.map((msg, idx) => (
                                        <div key={idx} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                                            <div style={{ 
                                                padding: '12px 18px', 
                                                borderRadius: '16px', 
                                                background: msg.role === 'user' ? '#6366f1' : '#fff', 
                                                color: msg.role === 'user' ? '#fff' : '#1e293b',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                                border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0',
                                                whiteSpace: 'pre-wrap',
                                                fontSize: '0.95rem'
                                            }}>
                                                {msg.content}
                                                
                                                {/* Citations and Confidence for AI replies */}
                                                {msg.role === 'assistant' && (msg.citations?.length > 0 || msg.confidenceScore) && (
                                                    <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '10px', paddingTop: '8px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                        {msg.confidenceScore && (
                                                            <span style={{ 
                                                                fontSize: '0.7rem', 
                                                                fontWeight: 700, 
                                                                background: msg.confidenceScore > 0.8 ? '#d1fae5' : (msg.confidenceScore > 0.5 ? '#fef3c7' : '#fee2e2'),
                                                                color: msg.confidenceScore > 0.8 ? '#065f46' : (msg.confidenceScore > 0.5 ? '#92400e' : '#991b1b'),
                                                                padding: '2px 6px', 
                                                                borderRadius: '4px' 
                                                            }}>
                                                                Confidence: {Math.round(msg.confidenceScore * 100)}%
                                                            </span>
                                                        )}
                                                        {msg.citations?.map((cite, cIdx) => (
                                                            <span key={cIdx} style={{ fontSize: '0.7rem', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                                                {cite}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                                {chatLoading && (
                                    <div style={{ alignSelf: 'flex-start', display: 'flex', gap: '8px', background: '#fff', padding: '12px 18px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', color: '#64748b', fontSize: '0.9rem' }}>
                                        <RefreshCw size={16} className="animate-spin" /> AI is reading pages and formulating response...
                                    </div>
                                )}
                            </div>
                            
                            {/* Input Form */}
                            <form onSubmit={handleSendChat} style={{ padding: '16px', borderTop: '1px solid #e2e8f0', background: '#fff', display: 'flex', gap: '12px' }}>
                                <input 
                                    type="text" 
                                    placeholder={chatManualId ? "Ask anything about the active manual..." : "Please select a manual to begin."}
                                    disabled={!chatManualId || chatLoading}
                                    value={chatQuery}
                                    onChange={(e) => setChatQuery(e.target.value)}
                                    style={{ flex: 1, padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', outline: 'none' }}
                                />
                                <button 
                                    type="submit" 
                                    disabled={!chatManualId || chatLoading || !chatQuery} 
                                    className="btn btn-primary"
                                    style={{ padding: '12px 24px' }}
                                >
                                    Send
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {/* 4. DASHBOARD TAB */}
                {activeTab === 'dashboard' && (
                    <div>
                        <header style={{ marginBottom: '32px' }}>
                            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <BarChart3 size={32} color="#6366f1" /> Library Dashboard
                            </h1>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>System diagnostics, duplicate checks, and catalog health.</p>
                        </header>

                        {statsLoading ? (
                            <div style={{ textAlign: 'center', padding: '100px 0' }}>
                                <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 12px', color: '#6366f1' }} />
                                <p>Loading dashboard metrics...</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                {/* Metrics Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
                                    <div className="glass-panel" style={{ padding: '24px', background: '#fff', display: 'flex', alignItems: 'center', gap: '20px' }}>
                                        <div style={{ padding: '16px', background: '#eff6ff', color: '#3b82f6', borderRadius: '12px' }}>
                                            <Book size={28} />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: '0 0 4px 0', color: '#64748b', fontSize: '0.9rem', fontWeight: 600 }}>Total Manuals</h3>
                                            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1e293b' }}>{stats.total}</span>
                                        </div>
                                    </div>
                                    <div className="glass-panel" style={{ padding: '24px', background: '#fff', display: 'flex', alignItems: 'center', gap: '20px' }}>
                                        <div style={{ padding: '16px', background: '#fffbeb', color: '#f59e0b', borderRadius: '12px' }}>
                                            <AlertTriangle size={28} />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: '0 0 4px 0', color: '#64748b', fontSize: '0.9rem', fontWeight: 600 }}>Duplicate Records</h3>
                                            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1e293b' }}>{stats.duplicateCount}</span>
                                        </div>
                                    </div>
                                    <div className="glass-panel" style={{ padding: '24px', background: '#fff', display: 'flex', alignItems: 'center', gap: '20px' }}>
                                        <div style={{ padding: '16px', background: '#fef2f2', color: '#ef4444', borderRadius: '12px' }}>
                                            <ShieldAlert size={28} />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: '0 0 4px 0', color: '#64748b', fontSize: '0.9rem', fontWeight: 600 }}>Missing Manuals</h3>
                                            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1e293b' }}>{stats.missing}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Duplicates Alert */}
                                {stats.duplicateCount > 0 && (
                                    <div className="glass-panel" style={{ padding: '24px', background: '#fffbf0', border: '1px solid #fde68a', borderRadius: '16px' }}>
                                        <h3 style={{ margin: '0 0 12px 0', color: '#d97706', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <AlertTriangle size={20} /> Duplicate Detection Alert
                                        </h3>
                                        <p style={{ color: '#b45309', margin: '0 0 16px 0', fontSize: '0.9rem' }}>
                                            The system detected multiple manual records sharing similar model or manufacturer keys:
                                        </p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {stats.duplicates.map((dup, idx) => (
                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', borderRadius: '8px', border: '1px solid #fde047', fontSize: '0.85rem' }}>
                                                    <div>
                                                        <strong>{dup.manufacturer}</strong> - {dup.title} (Model: {dup.model || 'N/A'})
                                                    </div>
                                                    <span style={{ color: '#ef4444', fontWeight: 600 }}>Duplicate</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Latest uploads */}
                                <div className="glass-panel" style={{ padding: '32px', background: '#fff' }}>
                                    <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', color: '#1e293b' }}>Recent Additions</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {stats.latest.map(l => (
                                            <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                    <FileText size={24} color="#6366f1" />
                                                    <div>
                                                        <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>{l.title}</h4>
                                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                            {l.manufacturer} | Added: {new Date(l.created_at).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                </div>
                                                <a href={l.file_url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.8rem' }}>
                                                    View PDF
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 5. BULK IMPORT TAB */}
                {activeTab === 'import' && (
                    <div style={{ maxWidth: '750px', margin: '0 auto' }}>
                        <header style={{ marginBottom: '32px' }}>
                            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Upload size={32} color="#6366f1" /> Bulk Manual Import
                            </h1>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>
                                Import your entire catalog spreadsheet in one go. Support formats: CSV, Excel (.xlsx, .xls).
                            </p>
                        </header>

                        <div className="glass-panel" style={{ padding: '32px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '32px' }}>
                            <div>
                                <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: '#334155' }}>Spreadsheet Guidelines</h3>
                                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 12px 0' }}>
                                    Your sheet must contain headers matching:
                                </p>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {['title', 'manufacturer', 'model', 'category', 'file_url', 'info'].map(h => (
                                        <code key={h} style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', color: '#6366f1', fontWeight: 700 }}>{h}</code>
                                    ))}
                                </div>
                            </div>
                            
                            <div style={{ border: '2px dashed #cbd5e1', padding: '40px 20px', borderRadius: '12px', textAlign: 'center', background: '#f8fafc', cursor: 'pointer', position: 'relative' }}>
                                <input 
                                    type="file" 
                                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                                    onChange={handleImportFile}
                                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                                />
                                <Upload size={48} color="#94a3b8" style={{ margin: '0 auto 16px' }} />
                                <h4 style={{ margin: '0 0 6px 0', color: '#475569' }}>Click to select or drag & drop file</h4>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>CSV or Excel (.xlsx) file up to 10MB</span>
                            </div>

                            {importData.length > 0 && (
                                <button 
                                    onClick={executeBulkImport}
                                    disabled={importing}
                                    className="btn btn-primary"
                                    style={{ width: '100%', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                >
                                    {importing ? (
                                        <>
                                            <RefreshCw size={18} className="animate-spin" /> Importing Records...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle size={18} /> Upload & Import {importData.length} Records
                                        </>
                                    )}
                                </button>
                            )}
                        </div>

                        {importLog && (
                            <div className="glass-panel" style={{ padding: '24px', background: '#1e293b', color: '#e2e8f0', borderRadius: '12px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                <div style={{ borderBottom: '1px solid #334155', paddingBottom: '6px', marginBottom: '10px', fontWeight: 'bold', color: '#38bdf8' }}>Import Status:</div>
                                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{importLog}</pre>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
