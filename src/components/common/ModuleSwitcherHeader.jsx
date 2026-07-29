import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FolderKanban, FileSpreadsheet, Sparkles, Building2, Users, TrendingUp } from 'lucide-react';

export default function ModuleSwitcherHeader({ activeModule = 'filing', activeJobNo = '', activeCustomer = '' }) {
    const navigate = useNavigate();
    const location = useLocation();

    const isFilingModule = activeModule === 'filing' || location.pathname.includes('/workflows/wizard');
    const isProcessingModule = activeModule === 'processing' || (location.pathname.startsWith('/workflows') && !location.pathname.includes('/wizard'));

    return (
        <div style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
            color: '#ffffff',
            borderRadius: '16px',
            padding: '16px 20px',
            marginBottom: '24px',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.3)'
        }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                
                {/* Left Side: Brand & Active Context */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        padding: '10px',
                        background: 'rgba(99, 102, 241, 0.2)',
                        borderRadius: '12px',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Sparkles size={20} color="#a5b4fc" />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a5b4fc' }}>
                                Celron Document Workspace
                            </span>
                            {activeJobNo && (
                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.25)', color: '#c7d2fe', border: '1px solid rgba(99, 102, 241, 0.4)', fontFamily: 'monospace' }}>
                                    Linked Job: {activeJobNo} {activeCustomer ? `• ${activeCustomer}` : ''}
                                </span>
                            )}
                        </div>
                        <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', margin: '2px 0 0 0', letterSpacing: '-0.01em' }}>
                            {isFilingModule ? '📁 Module 1: Document Filing & Job Lifecycle' : '📄 Module 2: Document Processing & Print Studio'}
                        </h1>
                    </div>
                </div>

                {/* Right Side: Switcher Buttons + Quick Directory Links */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    
                    {/* Directories Quick Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(30, 41, 59, 0.8)', padding: '4px 6px', borderRadius: '12px', border: '1px solid rgba(51, 65, 85, 0.8)' }}>
                        <button
                            type="button"
                            onClick={() => navigate('/workflows/whiteboard')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                height: '32px',
                                padding: '0 12px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: 700,
                                color: '#f59e0b',
                                background: location.pathname === '/workflows/whiteboard' ? 'rgba(245, 158, 11, 0.25)' : 'transparent',
                                border: '1px solid rgba(245, 158, 11, 0.4)',
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                            }}
                            title="Open Jobs & Enquiry Whiteboard"
                        >
                            <span>📌 Whiteboard</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/partners')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                height: '32px',
                                padding: '0 12px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#38bdf8',
                                background: 'transparent',
                                border: '1px solid rgba(56, 189, 248, 0.25)',
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                            }}
                            title="Open Partners Directory"
                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <Building2 size={14} color="#38bdf8" />
                            <span>Partners</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/contacts')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                height: '32px',
                                padding: '0 12px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#34d399',
                                background: 'transparent',
                                border: '1px solid rgba(52, 211, 153, 0.25)',
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                            }}
                            title="Open Contacts Directory"
                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(52, 211, 153, 0.15)'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <Users size={14} color="#34d399" />
                            <span>Contacts</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/expenses-profit')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                height: '32px',
                                padding: '0 12px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#fbbf24',
                                background: 'transparent',
                                border: '1px solid rgba(251, 191, 36, 0.25)',
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                            }}
                            title="Open Expenses & Profit Dashboard"
                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(251, 191, 36, 0.15)'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <TrendingUp size={14} color="#fbbf24" />
                            <span>Expenses &amp; Profit</span>
                        </button>
                    </div>

                    {/* 2 Core Module Switcher Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(15, 23, 42, 0.9)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(51, 65, 85, 0.8)' }}>
                        <button
                            type="button"
                            onClick={() => navigate('/workflows/wizard')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                height: '34px',
                                padding: '0 14px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                                background: isFilingModule ? '#4f46e5' : 'transparent',
                                color: isFilingModule ? '#ffffff' : '#94a3b8',
                                border: isFilingModule ? '1px solid #6366f1' : '1px solid transparent',
                                boxShadow: isFilingModule ? '0 2px 8px rgba(79, 70, 229, 0.4)' : 'none'
                            }}
                        >
                            <FolderKanban size={15} />
                            <span>Module 1: Filing</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/workflows')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                height: '34px',
                                padding: '0 14px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                                background: isProcessingModule && !isFilingModule ? '#4f46e5' : 'transparent',
                                color: isProcessingModule && !isFilingModule ? '#ffffff' : '#94a3b8',
                                border: isProcessingModule && !isFilingModule ? '1px solid #6366f1' : '1px solid transparent',
                                boxShadow: isProcessingModule && !isFilingModule ? '0 2px 8px rgba(79, 70, 229, 0.4)' : 'none'
                            }}
                        >
                            <FileSpreadsheet size={15} />
                            <span>Module 2: Processing</span>
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
}

