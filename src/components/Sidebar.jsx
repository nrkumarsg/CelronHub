import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link, NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, Settings, Smartphone, Ship, MapPin, Building2, Package, ShieldCheck, Search, Tags, Hexagon, CheckSquare, CheckCircle, StickyNote, CalendarDays, Database, Folder, Wrench, Pin, PinOff, Book, HardDrive, Sparkles, Calculator, Navigation2, Briefcase, DollarSign, ShoppingCart, Truck, Receipt, ClipboardList, FileCheck, RefreshCcw, QrCode, AlertCircle, Download, ArrowRightLeft, MessageSquare, Globe, History, Plus, ExternalLink } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { getTodos } from '../lib/todoService';
import { isTokenValid, connectGoogleAPI } from '../lib/googleAuthService';
import { downloadApkByIdentifier } from '../lib/driveService';

export default function Sidebar() {
    const { profile, signOut, companies, activeCompanyId, activeCompany } = useAuth();
    const [todoCount, setTodoCount] = useState(0);
    const [driveConnected, setDriveConnected] = useState(isTokenValid());
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const currentTab = searchParams.get('tab');
    const isSupplierToolsActive = location.pathname === '/unified-supplier-hub' && currentTab === 'supplier_tools';
    const isUnifiedSupplierHubActive = location.pathname === '/unified-supplier-hub' && currentTab !== 'supplier_tools';
    const isCardScannerActive = location.pathname === '/partners/ai-drive-parser';
    const isInvoiceScannerActive = location.pathname === '/accounts/bills' && currentTab === 'scanned';

    const [isPinned, setIsPinned] = useState(() => {
        const saved = localStorage.getItem('sidebar-pinned');
        return saved !== null ? JSON.parse(saved) : true;
    });

    const fetchTodoCount = async () => {
        try {
            const { data } = await getTodos();
            if (data) {
                const today = new Date().toISOString().split('T')[0];
                const todayCount = data.filter(t => !t.is_completed && t.due_date && t.due_date.startsWith(today)).length;
                setTodoCount(todayCount);
            }
        } catch (err) {
            console.error("Error fetching todo count:", err);
        }
    };

    useEffect(() => {
        if (profile) {
            fetchTodoCount();
        }

        // Check Drive status periodically
        const interval = setInterval(() => {
            setDriveConnected(isTokenValid());
        }, 30000);

        return () => clearInterval(interval);
    }, [profile]);

    useEffect(() => {
        localStorage.setItem('sidebar-pinned', JSON.stringify(isPinned));
        const root = document.querySelector('#root');
        if (root) {
            if (isPinned) {
                root.style.setProperty('--sidebar-current-width', 'var(--sidebar-expanded-width)');
            } else {
                root.style.setProperty('--sidebar-current-width', 'var(--sidebar-collapsed-width)');
            }
        }
    }, [isPinned]);


    const hasAccess = (moduleName) => {
        if (!profile) return false;
        
        // 1. Superadmins have override access for system management
        if (profile.role === 'superadmin') return true;

        // 2. Check if the module is enabled for the current company
        // If the company has no enabled_modules defined, we assume a legacy/all-access state for safety
        const companyModules = activeCompany?.enabled_modules;
        const isCompanyAllowed = !companyModules || companyModules.includes(moduleName);
        
        if (!isCompanyAllowed) return false;

        // 3. Check user-level module allotment
        return profile.accessible_modules?.includes(moduleName);
    };


    return (
        <aside className={`sidebar ${!isPinned ? 'collapsed' : ''}`}>
            <div className="sidebar-brand" style={{
                flexDirection: isPinned ? 'row' : 'column',
                gap: isPinned ? '12px' : '16px',
                justifyContent: isPinned ? 'space-between' : 'center',
                padding: isPinned ? '8px' : '12px 0'
            }}>
                <div className="brand-info" style={{ justifyContent: 'center', width: '100%' }}>
                    <img
                        src={activeCompany.logo_url || "/logo.png"}
                        alt={activeCompany.name}
                        className={isPinned && activeCompany.logo_url ? "sidebar-logo-expanded" : "sidebar-logo"}
                    />
                    {isPinned && !activeCompany.logo_url && <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{activeCompany.name}</h1>}
                </div>
                <button
                    className={`pin-button ${isPinned ? 'pinned' : ''}`}
                    onClick={() => setIsPinned(!isPinned)}
                    title={isPinned ? "Unpin Sidebar" : "Pin Sidebar"}
                    style={{ margin: isPinned ? '0' : '0 auto' }}
                >
                    {isPinned ? <Pin size={18} /> : <Pin size={18} style={{ transform: 'rotate(-45deg)' }} />}
                </button>
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
                <span className="nav-group-header">Core Hubs</span>
                
                <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end title="Dashboard">
                    <LayoutDashboard size={20} color="#94a3b8" />
                    <span className="nav-text">Dashboard</span>
                </NavLink>

                <NavLink to="/unified-supplier-hub" className={() => `nav-link ${isUnifiedSupplierHubActive ? 'active' : ''}`} title="Unified Supplier Hub">
                    <Building2 size={20} color="#f59e0b" />
                    <span className="nav-text" style={{ fontWeight: 800, color: '#f59e0b' }}>Unified Supplier Hub</span>
                </NavLink>

                <NavLink to="/unified-supplier-hub?tab=supplier_tools" className={() => `nav-link nav-sub-link ${isSupplierToolsActive ? 'active' : ''}`} title="Supplier Directory & Tools">
                    <Building2 size={16} color="#8b5cf6" />
                    <span className="nav-text" style={{ fontWeight: 600, color: isSupplierToolsActive ? '#ffffff' : '#94a3b8' }}>Supplier Directory &amp; Tools</span>
                </NavLink>

                <NavLink to="/workflows/jobs-dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Job Control">
                    <Briefcase size={20} color="#10b981" />
                    <span className="nav-text" style={{ fontWeight: 800, color: '#10b981' }}>Job Control</span>
                </NavLink>

                <NavLink to="/workflows" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="All Work Flow">
                    <ArrowRightLeft size={20} color="#6366f1" />
                    <span className="nav-text" style={{ fontWeight: 800, color: '#6366f1' }}>All Work Flow</span>
                </NavLink>

                <NavLink to="/soa" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Statement of Account">
                    <ClipboardList size={20} color="#ec4899" />
                    <span className="nav-text" style={{ fontWeight: 800, color: '#ec4899' }}>Statement of Account</span>
                </NavLink>
                {(hasAccess('catalog') || hasAccess('forms') || hasAccess('manuals')) && (
                    <>
                        <div className="nav-separator" />
                        <span className="nav-group-header">Inventory &amp; Tools</span>

                        {hasAccess('catalog') && (
                            <NavLink to="/catalog" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end title="Products &amp; Services">
                                <Package size={20} color="#06b6d4" />
                                <span className="nav-text">Products &amp; Services</span>
                            </NavLink>
                        )}

                        {hasAccess('forms') && (
                            <NavLink to="/forms/calibration-lab" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Calibration Lab">
                                <FileCheck size={20} color="#10b981" />
                                <span className="nav-text">Calibration Lab</span>
                            </NavLink>
                        )}

                        {hasAccess('forms') && (
                            <NavLink to="/forms" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end title="Forms Library">
                                <FileText size={20} color="#3b82f6" />
                                <span className="nav-text">Forms Library</span>
                            </NavLink>
                        )}

                        {hasAccess('manuals') && (
                            <NavLink to="/manuals" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Technical Manuals">
                                <Book size={20} color="#14b8a6" />
                                <span className="nav-text">Technical Manuals</span>
                            </NavLink>
                        )}

                        {hasAccess('forms') && (
                            <>
                                <a href="https://celron-pmr.vercel.app" target="_blank" rel="noopener noreferrer" className="nav-link" title="PMR App">
                                    <ExternalLink size={20} color="#3b82f6" style={{ transform: 'none' }} />
                                    <span className="nav-text" style={{ color: '#3b82f6', fontWeight: 600 }}>PMR App</span>
                                </a>

                                <NavLink to="/partners/ai-drive-parser" className={() => `nav-link nav-sub-link ${isCardScannerActive ? 'active' : ''}`} title="AI Google Drive Card Scanner">
                                    <Smartphone size={16} color="#ec4899" />
                                    <span className="nav-text" style={{ fontWeight: 600, color: isCardScannerActive ? '#ffffff' : '#94a3b8' }}>AI Card Scanner</span>
                                </NavLink>

                                <NavLink to="/accounts/bills?tab=scanned" className={() => `nav-link nav-sub-link ${isInvoiceScannerActive ? 'active' : ''}`} title="AI Invoice Scanner">
                                    <Sparkles size={16} color="#a855f7" />
                                    <span className="nav-text" style={{ fontWeight: 600, color: isInvoiceScannerActive ? '#ffffff' : '#94a3b8' }}>AI Invoice Scanner</span>
                                </NavLink>
                            </>
                        )}
                    </>
                )}

                <div className="nav-separator" />
                <span className="nav-group-header">System</span>

                <NavLink to="/help" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Help & Support">
                    <Book size={20} color="#3b82f6" />
                    <span className="nav-text">Help &amp; Support</span>
                </NavLink>

                <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Setting">
                    <Settings size={20} color="#94a3b8" />
                    <span className="nav-text">Setting</span>
                </NavLink>
            </nav>

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: isPinned ? '0' : '0 4px' }}>
                <div className="integration-status" style={{
                    padding: isPinned ? '12px' : '12px 0',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '40px'
                }}>
                    {isPinned ? (
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                            Integration Status: <span style={{ color: '#4ade80', fontWeight: 'bold' }}>•</span>
                        </p>
                    ) : (
                        <span style={{ color: '#4ade80', fontSize: '1.2rem' }} title="Integration Status: Online">•</span>
                    )}
                </div>

                <div className="copyright-text" style={{ textAlign: 'center', paddingBottom: '4px' }}>
                    {isPinned ? (
                        <p style={{ fontSize: '0.7rem', color: 'rgba(148, 163, 184, 0.5)', margin: 0, letterSpacing: '0.02em', lineHeight: 1.4 }}>
                            &copy; 2026 Cel-Ron Enterprises.<br />Global Maritime Excellence.
                        </p>
                    ) : (
                        <p style={{ fontSize: '0.6rem', color: 'rgba(148, 163, 184, 0.5)', margin: 0 }}>&copy;</p>
                    )}
                </div>
            </div>
        </aside >
    );
}
