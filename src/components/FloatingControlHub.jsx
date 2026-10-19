import React, { useState, useEffect, useRef } from 'react';
import { HardDrive, Brain, RefreshCw, X, GripHorizontal } from 'lucide-react';
import { getStoredToken, validateToken, connectGoogleAPI } from '../lib/googleAuthService';

export default function FloatingControlHub({ jobId }) {
    const [status, setStatus] = useState('checking'); // 'connected' | 'expired' | 'disconnected'
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: window.innerWidth - 100, y: 150 });
    const [rel, setRel] = useState(null); // position relative to the cursor
    const [isExpanded, setIsExpanded] = useState(false);
    const hubRef = useRef(null);

    // Visibility check
    const isVisible = localStorage.getItem('show_floating_hub') !== 'false';
    if (!isVisible) return null;

    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 30000); // Check every 30s
        return () => clearInterval(interval);
    }, []);

    const checkStatus = async () => {
        const token = getStoredToken();
        if (!token) {
            setStatus('disconnected');
            return;
        }
        const isValid = await validateToken(token);
        setStatus(isValid ? 'connected' : 'expired');
    };

    const onMouseDown = (e) => {
        if (e.button !== 0) return;
        const pos = hubRef.current.getBoundingClientRect();
        setRel({
            x: e.pageX - pos.left,
            y: e.pageY - pos.top
        });
        setIsDragging(true);
        e.stopPropagation();
        e.preventDefault();
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        setPosition({
            x: e.pageX - rel.x,
            y: e.pageY - rel.y
        });
        e.stopPropagation();
        e.preventDefault();
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

    const handleReconnect = () => {
        connectGoogleAPI(jobId ? `job_${jobId}` : 'general');
    };

    return (
        <div
            ref={hubRef}
            className="floating-control-hub hide-on-print"
            style={{
                position: 'fixed',
                left: `${position.x}px`,
                top: `${position.y}px`,
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                cursor: isDragging ? 'grabbing' : 'default',
                transition: isDragging ? 'none' : 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }}
        >
            {/* Drag Handle */}
            <div 
                onMouseDown={onMouseDown}
                style={{
                    background: 'rgba(30, 41, 59, 0.8)',
                    backdropFilter: 'blur(8px)',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    color: '#fff',
                    cursor: 'grab',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    fontSize: '10px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    userSelect: 'none'
                }}
            >
                <GripHorizontal size={12} />
                Hub
            </div>

            {/* Status Icon */}
            <div 
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '18px',
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                    border: `3px solid ${status === 'connected' ? '#10b981' : '#ef4444'}`,
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'transform 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
                <HardDrive size={24} color={status === 'connected' ? '#10b981' : '#ef4444'} />
                {status !== 'connected' && (
                    <div style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#ef4444', width: '14px', height: '14px', borderRadius: '50%', border: '2px solid #fff' }} />
                )}
            </div>

            {/* Expanded Menu */}
            {isExpanded && (
                <div style={{
                    background: '#fff',
                    borderRadius: '16px',
                    padding: '12px',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    minWidth: '180px',
                    border: '1px solid #e2e8f0'
                }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '4px', textAlign: 'center' }}>CONTROL CENTER</div>
                    
                    <button 
                        onClick={handleReconnect}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px',
                            background: status === 'connected' ? '#f0fdf4' : '#fff1f2',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            width: '100%',
                            textAlign: 'left',
                            transition: 'background 0.2s'
                        }}
                    >
                        <RefreshCw size={16} color={status === 'connected' ? '#10b981' : '#ef4444'} className={status === 'checking' ? 'animate-spin' : ''} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>Drive Status</span>
                            <span style={{ fontSize: '10px', color: status === 'connected' ? '#059669' : '#dc2626' }}>
                                {status === 'connected' ? 'Connected' : 'Click to Fix'}
                            </span>
                        </div>
                    </button>

                    <button 
                        onClick={() => window.open('/workflows/ai-assistant', '_blank')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px',
                            background: '#f5f3ff',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            width: '100%',
                            textAlign: 'left'
                        }}
                    >
                        <Brain size={16} color="#7c3aed" />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>AI Assistant</span>
                            <span style={{ fontSize: '10px', color: '#7c3aed' }}>Open NotebookLM</span>
                        </div>
                    </button>

                    <div style={{ height: '1px', background: '#f1f5f9', margin: '4px 0' }} />
                    
                    <button 
                        onClick={() => setIsExpanded(false)}
                        style={{
                            padding: '6px',
                            background: 'none',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: '11px',
                            cursor: 'pointer'
                        }}
                    >
                        Close Menu
                    </button>
                </div>
            )}
        </div>
    );
}
