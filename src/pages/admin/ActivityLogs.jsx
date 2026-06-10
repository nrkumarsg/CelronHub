import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { 
    History, 
    Search, 
    Filter, 
    Eye, 
    RefreshCw, 
    Play, 
    Pause, 
    Calendar, 
    User, 
    Copy, 
    Check, 
    Database, 
    AlertTriangle, 
    ChevronRight, 
    ArrowRight, 
    Clock, 
    Settings, 
    Building2, 
    Users, 
    Ship, 
    MapPin, 
    Package, 
    Briefcase, 
    FileText, 
    MessageSquare, 
    Key, 
    LogOut,
    ExternalLink,
    AlertCircle,
    Info,
    Laptop,
    Globe
} from 'lucide-react';

export default function ActivityLogs() {
    const { profile, loading: authLoading } = useAuth();
    
    // Core State
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tableMissing, setTableMissing] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);
    const [isStreaming, setIsStreaming] = useState(true);
    const [sqlCopied, setSqlCopied] = useState(false);
    const [limit, setLimit] = useState(300);

    // Filter Toolbar State
    const [searchQuery, setSearchQuery] = useState('');
    const [actionFilter, setActionFilter] = useState('ALL');
    const [moduleFilter, setModuleFilter] = useState('ALL');
    const [userFilter, setUserFilter] = useState('ALL');
    const [dateStart, setDateStart] = useState('');
    const [dateEnd, setDateEnd] = useState('');

    // SQL contents copy reference (cached from project SQL file conceptually)
    const sqlScriptPath = 'activity_audit_logs.sql';

    // RLS/Superadmin Bypass: Enforced strictly in JSX/render as well.
    if (authLoading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                    <RefreshCw size={40} className="animate-spin" style={{ color: 'var(--accent)' }} />
                    <p style={{ color: 'var(--text-secondary)' }}>Verifying Super Admin Authorization...</p>
                </div>
            </div>
        );
    }

    if (!profile || profile.role !== 'superadmin') {
        console.warn('[Security] Unauthorized access attempt to Activity Logs page blocked.');
        return <Navigate to="/unauthorized" replace />;
    }

    // Fetch Logs
    const fetchLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: dbError } = await supabase
                .from('audit_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (dbError) {
                // Table doesn't exist error code is 42P01 in Postgres
                if (dbError.code === '42P01' || dbError.message?.includes('does not exist')) {
                    setTableMissing(true);
                } else {
                    throw dbError;
                }
            } else {
                setLogs(data || []);
                setTableMissing(false);
            }
        } catch (err) {
            console.error('Error fetching audit logs:', err);
            setError(err.message || 'Failed to fetch logs from database.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [limit]);

    // Live Streaming / Postgres Real-Time subscription
    useEffect(() => {
        if (!isStreaming || tableMissing) return;

        console.log('[AuditLogs] Initializing Supabase Realtime Listener for audit_logs...');
        const channel = supabase
            .channel('public:audit_logs')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'audit_logs' },
                (payload) => {
                    console.log('[AuditLogs] Realtime event captured:', payload.new);
                    setLogs((prev) => {
                        // Avoid duplicates
                        if (prev.some(log => log.id === payload.new.id)) return prev;
                        return [payload.new, ...prev];
                    });
                }
            )
            .subscribe();

        return () => {
            console.log('[AuditLogs] Cleaning up Supabase Realtime Listener...');
            supabase.removeChannel(channel);
        };
    }, [isStreaming, tableMissing]);

    // Read and Copy SQL Trigger Script
    const handleCopySQLScript = async () => {
        try {
            // Fetch SQL file content from workspace root URL
            const response = await fetch('/activity_audit_logs.sql');
            let text = '';
            if (response.ok) {
                text = await response.text();
            } else {
                // Fallback basic setup query if fetching file fails in web dev
                text = `-- Run this in your Supabase SQL Editor:\n\n` + 
                       `CREATE TABLE IF NOT EXISTS public.audit_logs (\n` +
                       `    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n` +
                       `    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,\n` +
                       `    user_email TEXT,\n` +
                       `    company_id UUID,\n` +
                       `    action_type TEXT NOT NULL,\n` +
                       `    table_name TEXT,\n` +
                       `    record_id UUID,\n` +
                       `    old_data JSONB,\n` +
                       `    new_data JSONB,\n` +
                       `    metadata JSONB,\n` +
                       `    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL\n` +
                       `);`;
            }
            await navigator.clipboard.writeText(text);
            setSqlCopied(true);
            setTimeout(() => setSqlCopied(false), 3000);
        } catch (e) {
            console.error('Failed to copy SQL:', e);
            alert('Could not copy SQL trigger text automatically. You can read the activity_audit_logs.sql file directly in your project folder.');
        }
    };

    // Extract unique active users & modules for filtering dropdowns
    const uniqueUsersList = useMemo(() => {
        const users = new Set();
        logs.forEach(l => {
            if (l.user_email) users.add(l.user_email);
        });
        return Array.from(users).sort();
    }, [logs]);

    const uniqueModulesList = useMemo(() => {
        const tables = new Set();
        logs.forEach(l => {
            if (l.table_name) tables.add(l.table_name);
        });
        return Array.from(tables).sort();
    }, [logs]);

    // Client-side Visual Filtering
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            // 1. Search Query (email, table, action, record id, metadata)
            if (searchQuery) {
                const searchLower = searchQuery.toLowerCase();
                const emailMatch = log.user_email?.toLowerCase().includes(searchLower);
                const tableMatch = log.table_name?.toLowerCase().includes(searchLower);
                const actionMatch = log.action_type?.toLowerCase().includes(searchLower);
                const idMatch = log.record_id?.toLowerCase().includes(searchLower);
                const metadataMatch = log.metadata && JSON.stringify(log.metadata).toLowerCase().includes(searchLower);
                if (!emailMatch && !tableMatch && !actionMatch && !idMatch && !metadataMatch) {
                    return false;
                }
            }

            // 2. Action Type Filter
            if (actionFilter !== 'ALL') {
                if (log.action_type !== actionFilter) return false;
            }

            // 3. Module Filter
            if (moduleFilter !== 'ALL') {
                if (moduleFilter === 'AUTH') {
                    if (log.table_name) return false; // Authentication actions have no table_name
                } else if (log.table_name !== moduleFilter) {
                    return false;
                }
            }

            // 4. User Email Filter
            if (userFilter !== 'ALL') {
                if (log.user_email !== userFilter) return false;
            }

            // 5. Date Range Filter
            if (dateStart) {
                const logTime = new Date(log.created_at);
                const startTime = new Date(dateStart + 'T00:00:00');
                if (logTime < startTime) return false;
            }
            if (dateEnd) {
                const logTime = new Date(log.created_at);
                const endTime = new Date(dateEnd + 'T23:59:59');
                if (logTime > endTime) return false;
            }

            return true;
        });
    }, [logs, searchQuery, actionFilter, moduleFilter, userFilter, dateStart, dateEnd]);

    // Statistical Calculations from Current Viewport Logs
    const stats = useMemo(() => {
        const total = filteredLogs.length;
        let mutations = 0;
        let authCount = 0;
        const activeUsers = new Set();

        filteredLogs.forEach(l => {
            if (['INSERT', 'UPDATE', 'DELETE'].includes(l.action_type)) mutations++;
            if (['LOGIN', 'LOGOUT'].includes(l.action_type)) authCount++;
            if (l.user_email) activeUsers.add(l.user_email);
        });

        return {
            total,
            mutations,
            authCount,
            activeUsersSize: activeUsers.size
        };
    }, [filteredLogs]);

    // Helper: Color code different actions
    const getActionBadgeStyle = (action) => {
        switch (action) {
            case 'INSERT':
                return { background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.2)' };
            case 'UPDATE':
                return { background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.2)' };
            case 'DELETE':
                return { background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' };
            case 'LOGIN':
                return { background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.2)' };
            case 'LOGOUT':
                return { background: 'rgba(100, 116, 139, 0.12)', color: '#64748b', border: '1px solid rgba(100, 116, 139, 0.2)' };
            case 'SCAN_OCR':
                return { background: 'rgba(168, 85, 247, 0.12)', color: '#a855f7', border: '1px solid rgba(168, 85, 247, 0.2)' };
            case 'EXPORT':
                return { background: 'rgba(20, 184, 166, 0.12)', color: '#14b8a6', border: '1px solid rgba(20, 184, 166, 0.2)' };
            default:
                return { background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1', border: '1px solid rgba(99, 102, 241, 0.2)' };
        }
    };

    // Helper: Friendly icons for database modules
    const getModuleIcon = (moduleName) => {
        if (!moduleName) return <Key size={14} style={{ opacity: 0.7 }} />;
        switch (moduleName.toLowerCase()) {
            case 'partners':
                return <Building2 size={14} />;
            case 'contacts':
                return <Users size={14} />;
            case 'vessels':
                return <Ship size={14} />;
            case 'work_locations':
                return <MapPin size={14} />;
            case 'enquiries':
                return <FileText size={14} />;
            case 'jobs':
                return <Briefcase size={14} />;
            case 'quotations':
                return <FileText size={14} />;
            case 'invoices':
                return <Database size={14} />;
            default:
                return <Settings size={14} />;
        }
    };

    // Helper: Format column keys beautifully
    const formatFieldName = (fieldName) => {
        return fieldName
            .replace(/_/g, ' ')
            .split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    };

    // Helper: Render diff fields between old and new state
    const changeDiffsList = useMemo(() => {
        if (!selectedLog) return [];
        const oldVal = selectedLog.old_data;
        const newVal = selectedLog.new_data;

        if (selectedLog.action_type === 'INSERT' && newVal) {
            return Object.keys(newVal).map(key => ({
                field: key,
                oldValue: null,
                newValue: newVal[key]
            }));
        }

        if (selectedLog.action_type === 'DELETE' && oldVal) {
            return Object.keys(oldVal).map(key => ({
                field: key,
                oldValue: oldVal[key],
                newValue: null
            }));
        }

        if (selectedLog.action_type === 'UPDATE' && oldVal && newVal) {
            const diffs = [];
            const allKeys = new Set([...Object.keys(oldVal), ...Object.keys(newVal)]);
            
            // Filter standard database auditing noise in visual diffing
            const ignoredKeys = new Set(['updated_at', 'company_id', 'created_at', 'id']);

            for (const key of allKeys) {
                if (ignoredKeys.has(key)) continue;
                const oldField = oldVal[key];
                const newField = newVal[key];

                const oldStr = typeof oldField === 'object' ? JSON.stringify(oldField) : String(oldField ?? '');
                const newStr = typeof newField === 'object' ? JSON.stringify(newField) : String(newField ?? '');

                if (oldStr !== newStr) {
                    diffs.push({
                        field: key,
                        oldValue: oldField,
                        newValue: newField
                    });
                }
            }
            return diffs;
        }

        return [];
    }, [selectedLog]);

    // Format ISO Timestamp to clean string
    const formatTimestamp = (isoString) => {
        if (!isoString) return 'n/a';
        const d = new Date(isoString);
        return d.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }) + ' ' + d.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    };

    return (
        <div style={{ animation: 'fadeIn 0.4s ease-out', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header Area */}
            <header className="page-header" style={{ marginBottom: 0 }}>
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{
                            background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                            color: '#fff',
                            borderRadius: '12px',
                            padding: '10px',
                            display: 'inline-flex',
                            boxShadow: '0 8px 16px rgba(168, 85, 247, 0.25)'
                        }}>
                            <History size={26} />
                        </span>
                        System Audit Control
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '8px', fontSize: '0.95rem' }}>
                        Real-time tracking of modifications, additions, and log activities across the Celron Hub workspace.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Live Stream Toggle */}
                    {!tableMissing && (
                        <button
                            onClick={() => setIsStreaming(!isStreaming)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: isStreaming ? 'rgba(34, 197, 94, 0.12)' : 'rgba(100, 116, 139, 0.1)',
                                border: `1px solid ${isStreaming ? 'rgba(34, 197, 94, 0.25)' : 'rgba(100, 116, 139, 0.2)'}`,
                                color: isStreaming ? '#22c55e' : '#64748b',
                                padding: '10px 16px',
                                borderRadius: '12px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                textTransform: 'uppercase',
                                letterSpacing: '0.02em',
                                boxShadow: isStreaming ? '0 0 16px rgba(34, 197, 94, 0.1)' : 'none'
                            }}
                            title={isStreaming ? "Pause Live Event Streaming" : "Enable Live Event Streaming"}
                        >
                            {isStreaming ? (
                                <>
                                    <span style={{ width: '8px', height: '8px', background: '#22c55e', borderRadius: '50%', display: 'inline-block', animation: 'ping 1.5s infinite' }}></span>
                                    <Pause size={14} />
                                    <span>Live Streaming</span>
                                </>
                            ) : (
                                <>
                                    <span style={{ width: '8px', height: '8px', background: '#64748b', borderRadius: '50%', display: 'inline-block' }}></span>
                                    <Play size={14} />
                                    <span>Stream Paused</span>
                                </>
                            )}
                        </button>
                    )}

                    <button 
                        onClick={fetchLogs} 
                        disabled={loading}
                        className="btn btn-secondary" 
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '12px', padding: '10px 16px' }}
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        <span>Force Refresh</span>
                    </button>
                </div>
            </header>

            {/* Error Message */}
            {error && (
                <div className="glass-panel" style={{ background: '#fef2f2', borderColor: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <AlertTriangle size={22} />
                    <div>
                        <h4 style={{ fontWeight: 700 }}>Database Select Failure</h4>
                        <p style={{ fontSize: '0.85rem' }}>{error}</p>
                    </div>
                </div>
            )}

            {/* Supabase SQL Trigger Uninstalled Setup Guide */}
            {tableMissing && (
                <div className="glass-panel animate-fade-in" style={{
                    background: 'rgba(255,255,255,0.9)',
                    border: '1.5px dashed rgba(168, 85, 247, 0.4)',
                    boxShadow: '0 20px 40px rgba(168, 85, 247, 0.08)',
                    borderRadius: '24px',
                    padding: '36px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '24px',
                }}>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                        <div style={{
                            background: 'rgba(168, 85, 247, 0.1)',
                            borderRadius: '16px',
                            padding: '16px',
                            color: '#a855f7'
                        }}>
                            <Database size={40} className="animate-pulse" style={{ animationDuration: '3s' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, background: '#f3e8ff', color: '#a855f7', padding: '4px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SQL Schema Setup Required</span>
                            <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e293b', marginTop: '10px' }}>Activate System Activity Database</h3>
                            <p style={{ color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.6, fontSize: '0.95rem' }}>
                                The audit logger triggers are defined and ready inside the local file `activity_audit_logs.sql`. 
                                Because programmatic SQL executions are blocked by the database role security, you must execute this SQL file **once** manually via your Supabase Dashboard to create the logs table and establish database hooks.
                            </p>
                        </div>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px' }}>
                        <h4 style={{ fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <Info size={16} color="#6366f1" />
                            Setup Instructions
                        </h4>
                        <ol style={{ marginLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', color: '#475569', fontSize: '0.9rem' }}>
                            <li>Log in to your <strong>Supabase Dashboard</strong> at <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'underline', fontWeight: 600 }}>supabase.com <ExternalLink size={12} style={{ display: 'inline' }} /></a>.</li>
                            <li>Navigate to the <strong>SQL Editor</strong> using the left navigation panel.</li>
                            <li>Click the <strong>"New query"</strong> button in the editor.</li>
                            <li>Click the copy button below to copy the pre-configured logging query from `activity_audit_logs.sql`.</li>
                            <li>Paste the code into the query editor, click <strong>"Run"</strong> (or press Control+Enter).</li>
                            <li>Refresh this page! The control panel will instantly boot up.</li>
                        </ol>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            onClick={handleCopySQLScript}
                            className="btn btn-primary"
                            style={{
                                padding: '12px 24px',
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                                border: 'none',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 12px rgba(168, 85, 247, 0.2)'
                            }}
                        >
                            {sqlCopied ? <Check size={18} /> : <Copy size={18} />}
                            <span>{sqlCopied ? 'SQL Script Copied!' : 'Copy SQL Trigger Script'}</span>
                        </button>

                        <button
                            onClick={fetchLogs}
                            className="btn btn-secondary"
                            style={{ padding: '12px 24px', borderRadius: '12px', fontWeight: 600 }}
                        >
                            I Have Run the SQL, Refresh Dashboard
                        </button>
                    </div>
                </div>
            )}

            {!tableMissing && (
                <>
                    {/* STATS HIGHLIGHT CARDS (Glassmorphism layout) */}
                    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                        
                        {/* CARD 1: Total Logs */}
                        <div className="glass-panel" style={{
                            background: 'rgba(255,255,255,0.7)',
                            border: '1px solid rgba(255,255,255,0.6)',
                            padding: '24px',
                            borderRadius: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '20px',
                            boxShadow: '0 10px 20px rgba(0,0,0,0.02)',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: '56px',
                                height: '56px',
                                background: 'rgba(99, 102, 241, 0.08)',
                                color: '#6366f1',
                                borderRadius: '14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <History size={24} style={{ margin: 'auto' }} />
                            </div>
                            <div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Logged Events</span>
                                <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#1f2937', marginTop: '2px' }}>{stats.total}</h2>
                            </div>
                            <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', color: 'rgba(99, 102, 241, 0.03)', transform: 'rotate(-15deg)' }}>
                                <History size={96} />
                            </div>
                        </div>

                        {/* CARD 2: Database Mutations */}
                        <div className="glass-panel" style={{
                            background: 'rgba(255,255,255,0.7)',
                            border: '1px solid rgba(255,255,255,0.6)',
                            padding: '24px',
                            borderRadius: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '20px',
                            boxShadow: '0 10px 20px rgba(0,0,0,0.02)',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: '56px',
                                height: '56px',
                                background: 'rgba(245, 158, 11, 0.08)',
                                color: '#f59e0b',
                                borderRadius: '14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <Database size={24} style={{ margin: 'auto' }} />
                            </div>
                            <div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data Mutations</span>
                                <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#1f2937', marginTop: '2px' }}>{stats.mutations}</h2>
                            </div>
                            <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', color: 'rgba(245, 158, 11, 0.03)', transform: 'rotate(-15deg)' }}>
                                <Database size={96} />
                            </div>
                        </div>

                        {/* CARD 3: Authentication Logs */}
                        <div className="glass-panel" style={{
                            background: 'rgba(255,255,255,0.7)',
                            border: '1px solid rgba(255,255,255,0.6)',
                            padding: '24px',
                            borderRadius: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '20px',
                            boxShadow: '0 10px 20px rgba(0,0,0,0.02)',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: '56px',
                                height: '56px',
                                background: 'rgba(59, 130, 246, 0.08)',
                                color: '#3b82f6',
                                borderRadius: '14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <Key size={24} style={{ margin: 'auto' }} />
                            </div>
                            <div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Auth Logins</span>
                                <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#1f2937', marginTop: '2px' }}>{stats.authCount}</h2>
                            </div>
                            <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', color: 'rgba(59, 130, 246, 0.03)', transform: 'rotate(-15deg)' }}>
                                <Key size={96} />
                            </div>
                        </div>

                        {/* CARD 4: Unique active accounts */}
                        <div className="glass-panel" style={{
                            background: 'rgba(255,255,255,0.7)',
                            border: '1px solid rgba(255,255,255,0.6)',
                            padding: '24px',
                            borderRadius: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '20px',
                            boxShadow: '0 10px 20px rgba(0,0,0,0.02)',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: '56px',
                                height: '56px',
                                background: 'rgba(16, 185, 129, 0.08)',
                                color: '#10b981',
                                borderRadius: '14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <User size={24} style={{ margin: 'auto' }} />
                            </div>
                            <div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Staff</span>
                                <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#1f2937', marginTop: '2px' }}>{stats.activeUsersSize}</h2>
                            </div>
                            <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', color: 'rgba(16, 185, 129, 0.03)', transform: 'rotate(-15deg)' }}>
                                <User size={96} />
                            </div>
                        </div>

                    </section>

                    {/* FILTER TOOLBAR PANEL */}
                    <section className="glass-panel" style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '20px',
                        padding: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', marginBottom: '4px' }}>
                            <Filter size={16} color="var(--accent)" />
                            <h4 style={{ fontWeight: 700, color: '#334155', margin: 0 }}>Advanced Filter Audit Log Registry</h4>
                        </div>

                        {/* First Row: Search Query & Actions & Modules */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                            
                            {/* Search Input */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Search keywords</label>
                                <div style={{ position: 'relative' }}>
                                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                    <input
                                        type="text"
                                        placeholder="Search email, modules, keys..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="form-input"
                                        style={{ paddingLeft: '38px', borderRadius: '10px' }}
                                    />
                                </div>
                            </div>

                            {/* Action Type Dropdown */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Action operation</label>
                                <select
                                    value={actionFilter}
                                    onChange={(e) => setActionFilter(e.target.value)}
                                    className="form-select"
                                    style={{ borderRadius: '10px' }}
                                >
                                    <option value="ALL">All Actions</option>
                                    <option value="INSERT">INSERT (Additions)</option>
                                    <option value="UPDATE">UPDATE (Edits)</option>
                                    <option value="DELETE">DELETE (Removals)</option>
                                    <option value="LOGIN">LOGIN</option>
                                    <option value="LOGOUT">LOGOUT</option>
                                    <option value="SCAN_OCR">SCAN & OCR</option>
                                    <option value="EXPORT">EXPORTS</option>
                                </select>
                            </div>

                            {/* Modules Table Dropdown */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Module / Area</label>
                                <select
                                    value={moduleFilter}
                                    onChange={(e) => setModuleFilter(e.target.value)}
                                    className="form-select"
                                    style={{ borderRadius: '10px' }}
                                >
                                    <option value="ALL">All Modules</option>
                                    <option value="AUTH">Authentication Security</option>
                                    {uniqueModulesList.map(mod => (
                                        <option key={mod} value={mod}>{mod.charAt(0).toUpperCase() + mod.slice(1)}</option>
                                    ))}
                                </select>
                            </div>

                            {/* User Dropdown */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Initiated by user</label>
                                <select
                                    value={userFilter}
                                    onChange={(e) => setUserFilter(e.target.value)}
                                    className="form-select"
                                    style={{ borderRadius: '10px' }}
                                >
                                    <option value="ALL">All Accounts</option>
                                    {uniqueUsersList.map(usr => (
                                        <option key={usr} value={usr}>{usr}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Second Row: Date Ranges & Row Limiter */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
                            {/* Date Start */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">From Date</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="date"
                                        value={dateStart}
                                        onChange={(e) => setDateStart(e.target.value)}
                                        className="form-input"
                                        style={{ borderRadius: '10px' }}
                                    />
                                </div>
                            </div>

                            {/* Date End */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">To Date</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="date"
                                        value={dateEnd}
                                        onChange={(e) => setDateEnd(e.target.value)}
                                        className="form-input"
                                        style={{ borderRadius: '10px' }}
                                    />
                                </div>
                            </div>

                            {/* Row Limiter */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Logs buffer size</label>
                                <select
                                    value={limit}
                                    onChange={(e) => setLimit(Number(e.target.value))}
                                    className="form-select"
                                    style={{ borderRadius: '10px' }}
                                >
                                    <option value={100}>Fetch Latest 100 Logs</option>
                                    <option value={300}>Fetch Latest 300 Logs</option>
                                    <option value={500}>Fetch Latest 500 Logs</option>
                                    <option value={1000}>Fetch Latest 1000 Logs</option>
                                </select>
                            </div>

                            {/* Reset Filters Button */}
                            <div>
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        setActionFilter('ALL');
                                        setModuleFilter('ALL');
                                        setUserFilter('ALL');
                                        setDateStart('');
                                        setDateEnd('');
                                    }}
                                    className="btn btn-secondary"
                                    style={{
                                        width: '100%',
                                        borderRadius: '10px',
                                        padding: '10px',
                                        fontSize: '0.88rem',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    <span>Reset Filters</span>
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* MAIN AUDIT LOGS DISPLAY PANEL */}
                    <div style={{ display: 'flex', gap: '24px', position: 'relative', alignItems: 'flex-start' }}>
                        
                        {/* Table Listing */}
                        <div className="table-container animate-fade-in" style={{ flex: 1, padding: 0, overflow: 'visible' }}>
                            <table style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '180px' }}>Date &amp; Time</th>
                                        <th>Account</th>
                                        <th style={{ width: '120px' }}>Action</th>
                                        <th>Target / Module</th>
                                        <th>Operation Details</th>
                                        <th style={{ width: '80px', textAlign: 'center' }}>Changes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: '60px' }}>
                                                <RefreshCw size={32} className="animate-spin" style={{ color: 'var(--accent)', margin: '0 auto' }} />
                                                <p style={{ marginTop: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Refreshing log buffer...</p>
                                            </td>
                                        </tr>
                                    ) : filteredLogs.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: '60px' }}>
                                                <AlertCircle size={40} color="#94a3b8" style={{ margin: '0 auto 16px' }} />
                                                <h4 style={{ color: '#475569', fontWeight: 700 }}>No audit logs match criteria</h4>
                                                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '4px' }}>Try loosening your date range filters or search terms.</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredLogs.map((log) => {
                                            const hasDataDiff = log.old_data || log.new_data;
                                            return (
                                                <tr
                                                    key={log.id}
                                                    onClick={() => setSelectedLog(log)}
                                                    style={{
                                                        cursor: 'pointer',
                                                        background: selectedLog?.id === log.id ? '#f5f3ff' : 'transparent',
                                                        transition: 'background 0.2s',
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (selectedLog?.id !== log.id) e.currentTarget.style.background = '#f8fafc';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (selectedLog?.id !== log.id) e.currentTarget.style.background = 'transparent';
                                                    }}
                                                >
                                                    <td style={{ fontSize: '0.82rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Clock size={12} color="#94a3b8" />
                                                            {formatTimestamp(log.created_at)}
                                                        </div>
                                                    </td>
                                                    <td style={{ fontWeight: 600, color: '#334155', fontSize: '0.88rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div style={{
                                                                width: '26px',
                                                                height: '26px',
                                                                background: '#eef2ff',
                                                                border: '1px solid #e0e7ff',
                                                                borderRadius: '50%',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                color: '#6366f1',
                                                                fontSize: '0.75rem',
                                                                fontWeight: 700
                                                            }}>
                                                                {log.user_email?.charAt(0).toUpperCase() || 'S'}
                                                            </div>
                                                            <span style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {log.user_email || 'system-trigger@celron.ae'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="badge" style={{ ...getActionBadgeStyle(log.action_type), fontSize: '0.7rem', padding: '3px 8px' }}>
                                                            {log.action_type}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {log.table_name ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#4f46e5', fontWeight: 600, fontSize: '0.85rem' }}>
                                                                {getModuleIcon(log.table_name)}
                                                                <span>{formatFieldName(log.table_name)}</span>
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.85rem' }}>
                                                                <Key size={14} color="#94a3b8" />
                                                                <span>Authentication</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ fontSize: '0.85rem', color: '#475569' }}>
                                                        {log.action_type === 'LOGIN' && 'Authenticated successfully via session token'}
                                                        {log.action_type === 'LOGOUT' && 'Explicit session logout / terminated'}
                                                        {log.action_type === 'SCAN_OCR' && `Processed document barcode/OCR: ${log.metadata?.file_name || 'N/A'}`}
                                                        {log.action_type === 'EXPORT' && `Exported tabular data report: ${log.metadata?.report_type || 'Excel file'}`}
                                                        {['INSERT', 'UPDATE', 'DELETE'].includes(log.action_type) && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span style={{ color: '#94a3b8' }}>Record ID:</span>
                                                                <code style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '2px 4px', borderRadius: '4px' }}>
                                                                    {log.record_id ? `${log.record_id.slice(0, 8)}...` : 'trigger-action'}
                                                                </code>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        {hasDataDiff ? (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedLog(log);
                                                                }}
                                                                style={{
                                                                    background: 'rgba(99, 102, 241, 0.08)',
                                                                    border: '1px solid rgba(99, 102, 241, 0.15)',
                                                                    borderRadius: '8px',
                                                                    padding: '4px 8px',
                                                                    cursor: 'pointer',
                                                                    color: '#6366f1',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 700,
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    transition: 'all 0.2s'
                                                                }}
                                                                onMouseEnter={(e) => {
                                                                    e.currentTarget.style.background = '#6366f1';
                                                                    e.currentTarget.style.color = '#fff';
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                    e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)';
                                                                    e.currentTarget.style.color = '#6366f1';
                                                                }}
                                                            >
                                                                <Eye size={12} />
                                                                <span>Diff</span>
                                                            </button>
                                                        ) : (
                                                            <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* VISUAL DIFF VIEWER SIDE DRAWER */}
                        {selectedLog && (
                            <aside className="glass-panel animate-fade-in" style={{
                                width: '450px',
                                background: '#ffffff',
                                border: '1.5px solid #6366f1',
                                borderRadius: '20px',
                                boxShadow: '0 20px 40px rgba(99,102,241,0.12)',
                                padding: '24px',
                                position: 'sticky',
                                top: '80px',
                                maxHeight: 'calc(100vh - 120px)',
                                overflowY: 'auto',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '20px',
                                zIndex: 50
                            }}>
                                {/* Drawer Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span className="badge" style={getActionBadgeStyle(selectedLog.action_type)}>
                                                {selectedLog.action_type}
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>EVENT METRICS</span>
                                        </div>
                                        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e293b', marginTop: '6px' }}>
                                            {selectedLog.table_name ? `Record in ${formatFieldName(selectedLog.table_name)}` : 'Auth Action Details'}
                                        </h3>
                                    </div>
                                    <button
                                        onClick={() => setSelectedLog(null)}
                                        style={{
                                            background: '#f1f5f9',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: '28px',
                                            height: '28px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#64748b',
                                            cursor: 'pointer',
                                            fontWeight: 800,
                                            fontSize: '1rem',
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#e2e8f0'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                    >
                                        ×
                                    </button>
                                </div>

                                {/* Event Profile Info */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#94a3b8' }}>Actor account:</span>
                                        <span style={{ fontWeight: 600, color: '#334155' }}>{selectedLog.user_email || 'trigger-system'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: '#94a3b8' }}>Occurred on:</span>
                                        <span style={{ fontWeight: 600, color: '#334155' }}>{formatTimestamp(selectedLog.created_at)}</span>
                                    </div>
                                    {selectedLog.record_id && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed #e2e8f0' }}>
                                            <span style={{ color: '#94a3b8' }}>Target Record UUID:</span>
                                            <code style={{ fontSize: '0.75rem', background: '#ffffff', border: '1px solid #e2e8f0', padding: '4px 8px', borderRadius: '6px', overflowX: 'auto', display: 'block' }}>
                                                {selectedLog.record_id}
                                            </code>
                                        </div>
                                    )}
                                </div>

                                {/* Database Diff Viewer Section */}
                                <div>
                                    <h4 style={{ fontWeight: 700, color: '#475569', fontSize: '0.9rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Database size={16} color="var(--accent)" />
                                        Interactive Record Changes
                                    </h4>

                                    {changeDiffsList.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '24px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0', color: '#94a3b8', fontSize: '0.85rem' }}>
                                            {['LOGIN', 'LOGOUT'].includes(selectedLog.action_type) 
                                                ? 'Security authentication log has no column-level diffs.' 
                                                : 'No custom field modifications detected on this record.'}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {changeDiffsList.map(diff => (
                                                <div key={diff.field} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                                    {/* Field Key */}
                                                    <div style={{ background: '#f8fafc', padding: '8px 12px', fontSize: '0.8rem', fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                                                        {formatFieldName(diff.field)} <code style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 'normal' }}>({diff.field})</code>
                                                    </div>

                                                    {/* Compare Block */}
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '4px', padding: '10px', fontSize: '0.85rem', background: '#fff' }}>
                                                        {/* Old Value */}
                                                        {(diff.oldValue !== null && selectedLog.action_type !== 'INSERT') && (
                                                            <div style={{ display: 'flex', gap: '8px', color: '#b91c1c', background: '#fef2f2', padding: '6px 10px', borderRadius: '6px' }}>
                                                                <span style={{ fontWeight: 800 }}>-</span>
                                                                <div style={{ flex: 1, textDecoration: 'line-through', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                                                                    {typeof diff.oldValue === 'object' ? JSON.stringify(diff.oldValue, null, 2) : String(diff.oldValue)}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Arrow Indicator for Updates */}
                                                        {selectedLog.action_type === 'UPDATE' && (
                                                            <div style={{ display: 'flex', justifyContent: 'center', color: '#94a3b8', padding: '2px 0' }}>
                                                                <ArrowRight size={14} />
                                                            </div>
                                                        )}

                                                        {/* New Value */}
                                                        {(diff.newValue !== null && selectedLog.action_type !== 'DELETE') && (
                                                            <div style={{ display: 'flex', gap: '8px', color: '#15803d', background: '#f0fdf4', padding: '6px 10px', borderRadius: '6px' }}>
                                                                <span style={{ fontWeight: 800 }}>+</span>
                                                                <div style={{ flex: 1, overflowX: 'auto', whiteSpace: 'pre-wrap', fontWeight: 600 }}>
                                                                    {typeof diff.newValue === 'object' ? JSON.stringify(diff.newValue, null, 2) : String(diff.newValue)}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Metadata / Agent Info */}
                                {selectedLog.metadata && (
                                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                                        <h4 style={{ fontWeight: 700, color: '#475569', fontSize: '0.9rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Laptop size={16} color="var(--accent)" />
                                            Client System Metadata
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#64748b' }}>
                                            {selectedLog.metadata.page_path && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                                                    <span>Page Path:</span>
                                                    <span style={{ fontWeight: 600, color: '#475569', textAlign: 'right', overflowX: 'auto', maxWidth: '240px' }}>{selectedLog.metadata.page_path}</span>
                                                </div>
                                            )}
                                            {selectedLog.metadata.browser && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <span>User Agent / Browser:</span>
                                                    <span style={{ fontWeight: 600, color: '#475569', wordBreak: 'break-all', background: '#fff', padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.75rem' }}>{selectedLog.metadata.browser}</span>
                                                </div>
                                            )}
                                            {selectedLog.metadata.trigger && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Trigger Source:</span>
                                                    <span style={{ fontWeight: 700, color: '#c084fc' }}>POSTGRESQL DB TRIGGER</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </aside>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
