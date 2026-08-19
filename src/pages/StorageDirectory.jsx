import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getEnquiries, getJobs } from '../lib/workflowService';
import { getDocumentSettings } from '../lib/store';
import { 
    ExternalLink, Database, Search, Filter, ChevronDown, Folder, Briefcase, 
    FileText, Archive, Loader2, Plus, Upload, MoreVertical, Trash2, 
    Home, Shield, Zap, LayoutGrid, List, File, CheckCircle2, AlertCircle,
    FolderTree, HardDrive
} from 'lucide-react';
import DriveTreeExplorer, { DEFAULT_CELRON_ROOT_ID, DEFAULT_CELRON_ROOT_NAME } from '../components/common/DriveTreeExplorer';

export default function StorageDirectory() {
    const { profile } = useAuth();
    const [enquiries, setEnquiries] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('explorer');

    useEffect(() => {
        if (profile?.company_id) {
            fetchData();
        }
    }, [profile]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const tabParam = params.get('tab');
        if (tabParam) setActiveTab(tabParam);
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [enqRes, jobsRes, settingsData] = await Promise.all([
                getEnquiries(profile.company_id),
                getJobs(profile.company_id),
                getDocumentSettings(profile.company_id)
            ]);
            if (enqRes.data) setEnquiries(enqRes.data);
            if (jobsRes.data) setJobs(jobsRes.data);
            if (settingsData) setSettings(settingsData);
        } catch (error) {
            console.error('Error fetching storage data:', error);
        } finally {
            setLoading(false);
        }
    };

    const rootFolderId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id || DEFAULT_CELRON_ROOT_ID;
    const rootFolderName = settings?.company_name || DEFAULT_CELRON_ROOT_NAME;

    if (loading) {
        return (
            <div style={{ background: '#f8fafc', minHeight: '100vh', padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <Loader2 className="spin" size={36} color="#2563eb" />
                    <p style={{ color: '#64748b', marginTop: '14px', fontWeight: 600, fontSize: 14 }}>Connecting to Storage Hub...</p>
                </div>
            </div>
        );
    }

    const items = activeTab === 'enquiries' ? enquiries : jobs;

    return (
        <div style={{ background: '#f8fafc', minHeight: '100vh', padding: '20px 24px', color: '#334155' }}>
            {/* Header Area */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <HardDrive size={26} color="#2563eb" />
                        Storage &amp; Drive Explorer
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.875rem' }}>
                        <Database size={14} color="#3b82f6" />
                        <span>Connected to Google Drive: <strong>{rootFolderName}</strong></span>
                        <div style={{ width: '4px', height: '4px', background: '#cbd5e1', borderRadius: '50%' }} />
                        <a 
                            href={`https://drive.google.com/drive/folders/${DEFAULT_CELRON_ROOT_ID}?usp=drive_link`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, textDecoration: 'none' }}
                        >
                            Open CELRONHUB in Drive <ExternalLink size={12} />
                        </a>
                    </div>
                </div>
            </header>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '18px', borderBottom: '1px solid #e2e8f0' }}>
                <button
                    onClick={() => setActiveTab('explorer')}
                    style={{
                        padding: '10px 14px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeTab === 'explorer' ? '2px solid #2563eb' : '2px solid transparent',
                        color: activeTab === 'explorer' ? '#2563eb' : '#64748b',
                        fontWeight: activeTab === 'explorer' ? 700 : 500,
                        fontSize: '0.92rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s'
                    }}
                >
                    <FolderTree size={18} />
                    Full GDrive Tree Explorer
                </button>

                <button
                    onClick={() => setActiveTab('enquiries')}
                    style={{
                        padding: '10px 14px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeTab === 'enquiries' ? '2px solid #2563eb' : '2px solid transparent',
                        color: activeTab === 'enquiries' ? '#2563eb' : '#64748b',
                        fontWeight: activeTab === 'enquiries' ? 700 : 500,
                        fontSize: '0.92rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s'
                    }}
                >
                    <FileText size={18} />
                    Enquiries Drive Links
                </button>

                <button
                    onClick={() => setActiveTab('jobs')}
                    style={{
                        padding: '10px 14px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeTab === 'jobs' ? '2px solid #2563eb' : '2px solid transparent',
                        color: activeTab === 'jobs' ? '#2563eb' : '#64748b',
                        fontWeight: activeTab === 'jobs' ? 700 : 500,
                        fontSize: '0.92rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s'
                    }}
                >
                    <Briefcase size={18} />
                    Jobs Drive Links
                </button>
            </div>

            {/* Content Area */}
            {activeTab === 'explorer' ? (
                <DriveTreeExplorer
                    rootFolderId={DEFAULT_CELRON_ROOT_ID}
                    rootFolderName="CELRONHUB"
                    height="calc(100vh - 170px)"
                />
            ) : (
                /* Enquiries/Jobs Table View */
                <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div style={{ 
                        padding: '14px 20px', 
                        background: '#f8fafc', 
                        borderBottom: '1px solid #e2e8f0', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Folder size={18} color="#2563eb" />
                            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
                                Google Drive Mappings for {activeTab === 'enquiries' ? 'Enquiries' : 'Jobs'}
                            </span>
                        </div>
                        <a 
                            href={`https://drive.google.com/drive/folders/${DEFAULT_CELRON_ROOT_ID}?usp=drive_link`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '6px', 
                                background: '#fff', 
                                border: '1px solid #cbd5e1', 
                                padding: '6px 12px', 
                                borderRadius: '8px', 
                                fontSize: '0.8rem', 
                                fontWeight: 600, 
                                color: '#334155',
                                textDecoration: 'none',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                        >
                            <ExternalLink size={14} /> Open CELRONHUB Root
                        </a>
                    </div>
                    
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #f1f5f9', background: '#fafafa' }}>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem' }}>Reference</th>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem' }}>Customer / Partner</th>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem' }}>Status</th>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                                        No items found in {activeTab}.
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '14px 20px', fontWeight: 700, color: '#1e293b' }}>
                                            {activeTab === 'enquiries' ? item.enquiry_no : item.job_no}
                                        </td>
                                        <td style={{ padding: '14px 20px', color: '#475569' }}>
                                            {activeTab === 'enquiries' ? item.partners?.name : item.enquiries?.partners?.name || 'Customer'}
                                        </td>
                                        <td style={{ padding: '14px 20px' }}>
                                            <span style={{ background: item.google_drive_link ? '#dcfce7' : '#f1f5f9', color: item.google_drive_link ? '#166534' : '#64748b', padding: '4px 10px', borderRadius: '14px', fontSize: '0.75rem', fontWeight: 700 }}>
                                                {item.google_drive_link ? 'FOLDER LINKED' : 'NO FOLDER'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                {item.google_drive_link && (
                                                    <a
                                                        href={item.google_drive_link}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ 
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                            border: '1px solid #e2e8f0', 
                                                            background: '#fff', 
                                                            padding: '5px 10px', 
                                                            borderRadius: '8px', 
                                                            fontSize: '0.8rem', 
                                                            fontWeight: 600, 
                                                            color: '#2563eb',
                                                            textDecoration: 'none'
                                                        }}
                                                    >
                                                        Open Drive <ExternalLink size={12} />
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
