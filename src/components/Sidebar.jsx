import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link, NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, Settings, Smartphone, Ship, MapPin, Building2, Package, ShieldCheck, Search, Tags, Hexagon, CheckSquare, CheckCircle, StickyNote, CalendarDays, Database, Folder, FolderOpen, Wrench, Pin, PinOff, Book, HardDrive, Sparkles, Calculator, Navigation2, Briefcase, DollarSign, ShoppingCart, Truck, Receipt, ClipboardList, FileCheck, RefreshCcw, QrCode, AlertCircle, Download, ArrowRightLeft, MessageSquare, Globe, History, Plus, ExternalLink, Mail, TrendingUp, Kanban, Zap } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { getTodos } from '../lib/todoService';
import { isTokenValid, connectGoogleAPI } from '../lib/googleAuthService';
import { downloadApkByIdentifier } from '../lib/driveService';

export default function Sidebar() {
    const { profile, signOut, companies, activeCompanyId, activeCompany } = useAuth();
    const isCatalogOnly = window.location.hostname.includes('celronpricescanner') || 
                          window.location.hostname.includes('celronspares') || 
                          (import.meta.env.VITE_CATALOG_ONLY === 'true' && 
                           !window.location.hostname.includes('celronhub') && 
                           !window.location.hostname.includes('celron-partners'));
    const [todoCount, setTodoCount] = useState(0);
    const [driveConnected, setDriveConnected] = useState(isTokenValid());
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const currentTab = searchParams.get('tab');
    const isSupplierToolsActive = location.pathname === '/unified-supplier-hub' && currentTab === 'supplier_tools';
    const isUnifiedSupplierHubActive = location.pathname === '/unified-supplier-hub' && currentTab !== 'supplier_tools';
    const isCardScannerActive = location.pathname === '/partners/ai-drive-parser';
    const isInvoiceScannerActive = location.pathname === '/accounts/bills' && currentTab === 'scanned';
    const isOcrActive = location.pathname === '/tools/ocr';

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
                {isCatalogOnly ? (
                    <>
                        <span className="nav-group-header">Inventory &amp; Tools</span>
                        <NavLink to="/catalog" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end title="Products &amp; Services">
                            <Package size={20} color="#06b6d4" />
                            <span className="nav-text">Products &amp; Services</span>
                        </NavLink>
                        <NavLink to="/catalog/manuals" className={({ isActive }) => `nav-link nav-sub-link ${isActive ? 'active' : ''}`} title="Product Manuals">
                            <Book size={16} color="#14b8a6" />
                            <span className="nav-text">Product Manuals</span>
                        </NavLink>
                    </>
                ) : (
                    <>
                        <span className="nav-group-header">Core Hubs</span>
                        
                        <NavLink to="/my-day" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="My Day — Daily Command Center">
                            <span style={{ fontSize: 18, lineHeight: 1 }}>📅</span>
                            <span className="nav-text" style={{ fontWeight: 800, color: location.pathname === '/my-day' ? '#ffffff' : '#a5b4fc' }}>My Day</span>
                        </NavLink>

                        <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end title="Dashboard">
                            <LayoutDashboard size={20} color="#94a3b8" />
                            <span className="nav-text">Dashboard</span>
                        </NavLink>

                        <NavLink to="/workflows/wizard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Workflow Wizard">
                            <Sparkles size={20} color="#a855f7" />
                            <span className="nav-text" style={{ fontWeight: 800, color: location.pathname.includes('/wizard') ? '#ffffff' : '#c084fc' }}>Workflow Wizard</span>
                        </NavLink>

                        <NavLink to="/scan-gateway" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Start From Scan Gateway">
                            <Smartphone size={20} color="#38bdf8" />
                            <span className="nav-text" style={{ fontWeight: 800, color: location.pathname === '/scan-gateway' ? '#ffffff' : '#38bdf8' }}>Start From Scan Gateway</span>
                        </NavLink>

                        <NavLink to="/workflows/whiteboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Jobs & Enquiry Whiteboard">
                            <Kanban size={20} color="#f59e0b" />
                            <span className="nav-text" style={{ fontWeight: 800, color: location.pathname === '/workflows/whiteboard' ? '#ffffff' : '#f59e0b' }}>📌 Jobs Whiteboard</span>
                        </NavLink>

                        <NavLink to="/storage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Storage Explorer">
                            <FolderOpen size={20} color="#0ea5e9" />
                            <span className="nav-text" style={{ fontWeight: 800, color: '#0ea5e9' }}>Storage Explorer</span>
                        </NavLink>

                        <NavLink to="/tools/ocr" className={() => `nav-link nav-sub-link ${isOcrActive ? 'active' : ''}`} title="Smart OCR Assistant">
                            <Sparkles size={16} color="#0ea5e9" />
                            <span className="nav-text" style={{ fontWeight: 600, color: isOcrActive ? '#ffffff' : '#94a3b8' }}>Smart OCR Assistant</span>
                        </NavLink>

                        <NavLink to="/unified-supplier-hub" className={() => `nav-link ${isUnifiedSupplierHubActive ? 'active' : ''}`} title="Unified Supplier Hub">
                            <Building2 size={20} color="#f59e0b" />
                            <span className="nav-text" style={{ fontWeight: 800, color: '#f59e0b' }}>Unified Supplier Hub</span>
                        </NavLink>

                        <NavLink to="/unified-supplier-hub?tab=supplier_tools" className={() => `nav-link nav-sub-link ${isSupplierToolsActive ? 'active' : ''}`} title="Supplier Directory & Tools">
                            <Building2 size={16} color="#8b5cf6" />
                            <span className="nav-text" style={{ fontWeight: 600, color: isSupplierToolsActive ? '#ffffff' : '#94a3b8' }}>Supplier Directory &amp; Tools</span>
                        </NavLink>

                        <NavLink to="/supplier-search" className={({ isActive }) => `nav-link nav-sub-link ${isActive ? 'active' : ''}`} title="Supplier Search by Item">
                            <Search size={16} color="#14b8a6" />
                            <span className="nav-text" style={{ fontWeight: 600, color: location.pathname === '/supplier-search' ? '#ffffff' : '#94a3b8' }}>Supplier Search by Item</span>
                        </NavLink>

                        {hasAccess('partners') && (
                            <NavLink to="/partners/ai-drive-parser" className={() => `nav-link nav-sub-link ${isCardScannerActive ? 'active' : ''}`} title="AI Google Drive Card Scanner">
                                <Smartphone size={16} color="#ec4899" />
                                <span className="nav-text" style={{ fontWeight: 600, color: isCardScannerActive ? '#ffffff' : '#94a3b8' }}>AI Card Scanner</span>
                            </NavLink>
                        )}

                        <NavLink to="/enquiries" className={({ isActive }) => `nav-link nav-sub-link ${isActive ? 'active' : ''}`} title="Enquiry2Supplier">
                            <Mail size={16} color="#3b82f6" />
                            <span className="nav-text" style={{ fontWeight: 600, color: location.pathname === '/enquiries' ? '#ffffff' : '#94a3b8' }}>Enquiry2Supplier</span>
                        </NavLink>

                        <NavLink to="/quotations" className={({ isActive }) => `nav-link nav-sub-link ${isActive ? 'active' : ''}`} title="Quote2Customers">
                            <FileText size={16} color="#6366f1" />
                            <span className="nav-text" style={{ fontWeight: 600, color: location.pathname === '/quotations' ? '#ffffff' : '#94a3b8' }}>Quote2Customers</span>
                        </NavLink>

                        <NavLink to="/purchase-orders" className={({ isActive }) => `nav-link nav-sub-link ${isActive ? 'active' : ''}`} title="PO2 Suppliers">
                            <ShoppingCart size={16} color="#10b981" />
                            <span className="nav-text" style={{ fontWeight: 600, color: location.pathname === '/purchase-orders' ? '#ffffff' : '#94a3b8' }}>PO2 Suppliers</span>
                        </NavLink>

                        {/* ── Unified Supplier Hub-Pro ── */}
                        <NavLink to="/unified-supplier-hub-pro" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Unified Supplier Hub — Pro">
                            <Zap size={20} color="#f59e0b" />
                            <span className="nav-text" style={{ fontWeight: 800, color: '#f59e0b' }}>🏭 Supplier Hub-Pro</span>
                        </NavLink>

                        <NavLink to="/workflows/jobs-dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Job Control">
                            <Briefcase size={20} color="#10b981" />
                            <span className="nav-text" style={{ fontWeight: 800, color: '#10b981' }}>Job Control</span>
                        </NavLink>

                        <NavLink to="/accounts/bills?tab=scanned" className={() => `nav-link nav-sub-link ${isInvoiceScannerActive ? 'active' : ''}`} title="AI Invoice Scanner">
                            <Sparkles size={16} color="#a855f7" />
                            <span className="nav-text" style={{ fontWeight: 600, color: isInvoiceScannerActive ? '#ffffff' : '#94a3b8' }}>AI Invoice Scanner</span>
                        </NavLink>

                        <NavLink to="/workflows" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="All Work Flow">
                            <ArrowRightLeft size={20} color="#6366f1" />
                            <span className="nav-text" style={{ fontWeight: 800, color: '#6366f1' }}>All Work Flow</span>
                        </NavLink>

                        <NavLink to="/soa" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Statement of Account">
                            <ClipboardList size={20} color="#ec4899" />
                            <span className="nav-text" style={{ fontWeight: 800, color: '#ec4899' }}>Statement of Account</span>
                        </NavLink>

                        <NavLink to="/expenses-profit" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Expenses & Profit">
                            <TrendingUp size={20} color="#10b981" />
                            <span className="nav-text" style={{ fontWeight: 800, color: '#10b981' }}>Expenses &amp; Profit</span>
                        </NavLink>

                        <NavLink to="/tools/email-composer" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Email Composer">
                            <Mail size={20} color="#3b82f6" />
                            <span className="nav-text" style={{ fontWeight: 800, color: '#3b82f6' }}>Email Composer</span>
                        </NavLink>
                        {(hasAccess('catalog') || hasAccess('forms') || hasAccess('manuals')) && (
                            <>
                                <div className="nav-separator" />
                                <span className="nav-group-header">Inventory &amp; Tools</span>

                                {hasAccess('catalog') && (
                                    <>
                                        <NavLink to="/catalog" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end title="Products &amp; Services">
                                            <Package size={20} color="#06b6d4" />
                                            <span className="nav-text">Products &amp; Services</span>
                                        </NavLink>
                                        {hasAccess('manuals') && (
                                            <NavLink to="/catalog/manuals" className={({ isActive }) => `nav-link nav-sub-link ${isActive ? 'active' : ''}`} title="Product Manuals">
                                                <Book size={16} color="#14b8a6" />
                                                <span className="nav-text">Product Manuals</span>
                                            </NavLink>
                                        )}
                                    </>
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

                                {hasAccess('forms') && (
                                    <a href="https://celron-pmr.vercel.app" target="_blank" rel="noopener noreferrer" className="nav-link" title="PMR App">
                                        <ExternalLink size={20} color="#3b82f6" style={{ transform: 'none' }} />
                                        <span className="nav-text" style={{ color: '#3b82f6', fontWeight: 600 }}>PMR App</span>
                                    </a>
                                )}

                                {hasAccess('forms') && (
                                    <a href="https://pcb-repair-form.vercel.app" target="_blank" rel="noopener noreferrer" className="nav-link" title="PCB Repair Form">
                                        <ExternalLink size={20} color="#8b5cf6" style={{ transform: 'none' }} />
                                        <span className="nav-text" style={{ color: '#8b5cf6', fontWeight: 600 }}>PCB Repair Form</span>
                                    </a>
                                )}
                            </>
                        )}

                        <div className="nav-separator" />
                        <span className="nav-group-header">Desktop</span>
                        <a 
                            href="https://smartuploader.vercel.app" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="nav-link" 
                            title="Daily Upload"
                        >
                            <ExternalLink size={20} color="#38bdf8" style={{ transform: 'none' }} />
                            <span className="nav-text" style={{ color: '#38bdf8', fontWeight: 800 }}>Daily Upload</span>
                        </a>

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
                    </>
                )}
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
