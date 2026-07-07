import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { HardDrive, CheckCircle2, AlertCircle, RefreshCw, LogOut, Link2, GripVertical, ChevronRight, ChevronLeft } from 'lucide-react';
import { validateToken, connectGoogleAPI, getStoredToken } from '../../lib/googleAuthService';
import { getCommunicationAccounts } from '../../lib/communicationService';

const GDriveConnectionTray = ({ variant = 'floating' }) => {
    const [status, setStatus] = useState('checking'); // 'checking', 'connected', 'disconnected'
    const [userInfo, setUserInfo] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(localStorage.getItem('gdrive_tray_collapsed') === 'true');
    
    // Draggability state
    const [position, setPosition] = useState(() => {
        const saved = localStorage.getItem('gdrive_tray_position');
        return saved ? JSON.parse(saved) : { x: window.innerWidth - 300, y: window.innerHeight - 100 };
    });
    const [isDragging, setIsDragging] = useState(false);
    const [rel, setRel] = useState(null);
    const trayRef = useRef(null);

    const checkConnection = async () => {
        const token = getStoredToken();
        if (!token) {
            setStatus('disconnected');
            setUserInfo(null);
            return;
        }

        try {
            const isValid = await validateToken(token);
            if (isValid) {
                // Fetch user info
                const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setUserInfo(data);
                    setStatus('connected');
                } else {
                    setStatus('disconnected');
                }
            } else {
                setStatus('disconnected');
            }
        } catch (error) {
            console.error('GDrive connection check failed:', error);
            setStatus('disconnected');
        }
    };

    useEffect(() => {
        checkConnection();
        const interval = setInterval(checkConnection, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const onMouseDown = (e) => {
        if (e.button !== 0) return;
        const pos = trayRef.current.getBoundingClientRect();
        setRel({
            x: e.pageX - pos.left,
            y: e.pageY - pos.top
        });
        setIsDragging(true);
        e.stopPropagation();
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const newPos = {
            x: e.pageX - rel.x,
            y: e.pageY - rel.y
        };
        setPosition(newPos);
        localStorage.setItem('gdrive_tray_position', JSON.stringify(newPos));
        e.stopPropagation();
    };

    const onMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        } else {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }, [isDragging]);

    const handleToggleCollapse = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        localStorage.setItem('gdrive_tray_collapsed', newState);
    };

    const { activeCompanyId } = useAuth();
    const [loginHint, setLoginHint] = useState(null);

    const handleConnect = () => {
        sessionStorage.setItem('google_auth_return_url', window.location.pathname + window.location.search);
        const state = activeCompanyId ? `drive_status_tray:${activeCompanyId}` : 'drive_status_tray';
        connectGoogleAPI(state, null, loginHint);
    };

    // Attempt to find a company-specific gmail communication account to use as login_hint
    useEffect(() => {
        let mounted = true;
        const fetchComm = async () => {
            try {
                const res = await getCommunicationAccounts();
                const accounts = res?.data || [];
                // Prefer gmail provider entries scoped to the active company
                const match = accounts.find(a => (a.provider === 'gmail' || a.provider === 'Gmail') && (a.company_id === activeCompanyId));
                if (mounted && match && match.email_address) {
                    setLoginHint(match.email_address);
                } else if (mounted) {
                    // Fallback: any gmail account for the user
                    const anyG = accounts.find(a => (a.provider === 'gmail' || a.provider === 'Gmail') && a.email_address);
                    if (anyG) setLoginHint(anyG.email_address);
                }
            } catch (err) {
                // ignore
            }
        };
        if (activeCompanyId) fetchComm();
        return () => { mounted = false; };
    }, [activeCompanyId]);

    const handleDisconnect = () => {
        localStorage.removeItem('google_access_token');
        localStorage.removeItem('google_token_expiry');
        setStatus('disconnected');
        setUserInfo(null);
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await checkConnection();
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    if (variant === 'docked') {
        return (
            <div 
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: status === 'connected' ? '#f0fdf4' : (status === 'checking' ? '#f0f9ff' : '#fef2f2'),
                    border: `1px solid ${status === 'connected' ? '#bbf7d0' : (status === 'checking' ? '#bae6fd' : '#fecaca')}`,
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: status === 'connected' ? '#15803d' : (status === 'checking' ? '#0369a1' : '#b91c1c'),
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    transition: 'all 0.2s ease',
                    height: '38px',
                    boxSizing: 'border-box'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <HardDrive size={16} className={status === 'checking' ? 'animate-spin' : ''} />
                    <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                        Google Drive: {status === 'connected' ? (userInfo?.name || 'Connected') : (status === 'checking' ? 'Checking...' : 'Disconnected')}
                    </span>
                    {status === 'connected' && userInfo?.email && (
                        <span style={{ fontSize: '0.75rem', opacity: 0.8, fontWeight: 400, whiteSpace: 'nowrap' }} title={userInfo.email}>
                            ({userInfo.email})
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginLeft: '4px', alignItems: 'center', borderLeft: `1px solid ${status === 'connected' ? '#bbf7d0' : (status === 'checking' ? '#bae6fd' : '#fecaca')}`, paddingLeft: '8px' }}>
                    <button 
                        onClick={handleRefresh}
                        style={{ 
                            background: 'none', 
                            border: 'none', 
                            padding: '2px', 
                            cursor: 'pointer', 
                            color: 'inherit', 
                            display: 'flex', 
                            alignItems: 'center',
                            borderRadius: '4px',
                            transition: 'background 0.2s'
                        }}
                        title="Refresh Connection"
                        className="hover-bg-docked"
                    >
                        <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                    </button>
                    
                    {status === 'connected' ? (
                        <button 
                            onClick={handleDisconnect}
                            style={{ 
                                background: 'none', 
                                border: 'none', 
                                padding: '2px', 
                                cursor: 'pointer', 
                                color: '#b91c1c', 
                                display: 'flex', 
                                alignItems: 'center',
                                borderRadius: '4px',
                                transition: 'background 0.2s'
                            }}
                            title="Disconnect Drive"
                            className="hover-bg-docked"
                        >
                            <LogOut size={13} />
                        </button>
                    ) : (
                        <button 
                            onClick={handleConnect}
                            style={{ 
                                background: 'none', 
                                border: 'none', 
                                padding: '2px', 
                                cursor: 'pointer', 
                                color: '#0369a1', 
                                display: 'flex', 
                                alignItems: 'center',
                                borderRadius: '4px',
                                transition: 'background 0.2s'
                            }}
                            title="Connect Drive"
                            className="hover-bg-docked"
                        >
                            <Link2 size={13} />
                        </button>
                    )}
                </div>
                <style>{`
                    .hover-bg-docked:hover { background: rgba(0,0,0,0.05); }
                `}</style>
            </div>
        );
    }

    return (
        <div 
            ref={trayRef}
            style={{
                position: 'fixed',
                left: `${position.x}px`,
                top: `${position.y}px`,
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: isDragging ? 'grabbing' : 'default',
                transition: isDragging ? 'none' : 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
        >
            <div className="glass-panel animate-fade-in" style={{
                padding: isCollapsed ? '8px' : '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: isCollapsed ? '0' : '12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(12px)',
                minWidth: isCollapsed ? 'auto' : '260px'
            }}>
                {/* Drag Handle */}
                <div 
                    onMouseDown={onMouseDown}
                    style={{ 
                        cursor: 'grab', 
                        color: '#94a3b8', 
                        padding: '4px 2px',
                        display: 'flex',
                        alignItems: 'center',
                        userSelect: 'none'
                    }}
                    title="Drag to move"
                >
                    <GripVertical size={16} />
                </div>

                {!isCollapsed && (
                    <>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '10px',
                            background: status === 'connected' ? 'rgba(16, 185, 129, 0.1)' : (status === 'checking' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(239, 68, 68, 0.1)'),
                            color: status === 'connected' ? '#10b981' : (status === 'checking' ? '#6366f1' : '#ef4444'),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <HardDrive size={18} />
                        </div>

                        <div style={{ flex: 1, minWidth: '120px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                    Google Drive
                                </span>
                                {status === 'connected' ? (
                                    <CheckCircle2 size={12} color="#10b981" />
                                ) : (
                                    status === 'disconnected' ? <AlertCircle size={12} color="#ef4444" /> : null
                                )}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {status === 'connected' ? (
                                    <>
                                        <span style={{ fontWeight: 600 }}>{userInfo?.name || 'Connected'}</span>
                                        <div style={{ fontSize: '10px', opacity: 0.7 }}>{userInfo?.email}</div>
                                    </>
                                ) : (status === 'checking' ? 'Syncing...' : 'Disconnected')}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '2px' }}>
                            <button 
                                onClick={handleRefresh}
                                style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: 'var(--text-secondary)', borderRadius: '6px' }}
                                title="Refresh"
                                className="hover-bg"
                            >
                                <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                            </button>
                            {status === 'connected' ? (
                                <button 
                                    onClick={handleDisconnect}
                                    style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: '#ef4444', borderRadius: '6px' }}
                                    title="Logout"
                                    className="hover-bg"
                                >
                                    <LogOut size={12} />
                                </button>
                            ) : (
                                <button 
                                    onClick={handleConnect}
                                    style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: '#6366f1', borderRadius: '6px' }}
                                    title="Connect"
                                    className="hover-bg"
                                >
                                    <Link2 size={12} />
                                </button>
                            )}
                        </div>
                    </>
                )}

                {isCollapsed && (
                     <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: status === 'connected' ? '#10b981' : '#ef4444',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                    }} onClick={handleToggleCollapse} title="Expand Drive Status">
                        <HardDrive size={18} />
                    </div>
                )}

                <button 
                    onClick={handleToggleCollapse}
                    style={{ 
                        background: 'none', 
                        border: 'none', 
                        padding: '4px', 
                        cursor: 'pointer', 
                        color: '#94a3b8',
                        marginLeft: isCollapsed ? '4px' : '8px',
                        display: 'flex',
                        alignItems: 'center'
                    }}
                    title={isCollapsed ? "Expand" : "Minimize"}
                >
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>
            </div>
            <style>{`
                .hover-bg:hover { background: rgba(0,0,0,0.05); }
                .animate-fade-in { animation: fadeIn 0.3s ease-out; }
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
            `}</style>
        </div>
    );
};

export default GDriveConnectionTray;
