import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link, NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, Settings, Smartphone, Ship, MapPin, Building2, Package, ShieldCheck, Search, Tags, Hexagon, CheckSquare, CheckCircle, StickyNote, CalendarDays, Database, Folder, Wrench, Pin, PinOff, Book, HardDrive, Sparkles, Calculator, Navigation2, Briefcase, DollarSign, ShoppingCart, Truck, Receipt, ClipboardList, FileCheck, RefreshCcw, QrCode, AlertCircle, Download, ArrowRightLeft, MessageSquare, Globe, History } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { getTodos } from '../lib/todoService';
import { isTokenValid, connectGoogleAPI } from '../lib/googleAuthService';
import { downloadApkByIdentifier } from '../lib/driveService';

export default function Sidebar() {
    const { profile, signOut, companies, activeCompanyId, activeCompany } = useAuth();
    const [todoCount, setTodoCount] = useState(0);
    const [driveConnected, setDriveConnected] = useState(isTokenValid());
    const location = useLocation();

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
                <span className="nav-group-header">Productivity</span>
                <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end title="Dashboard">
                    <LayoutDashboard size={20} />
                    <span className="nav-text">Dashboard</span>
                </NavLink>

                <NavLink to="/todo" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="To-Do List">
                    <CheckSquare size={20} color="#10b981" />
                    <span className="nav-text">To-Do List {todoCount > 0 ? `(${todoCount})` : ''}</span>
                </NavLink>

                <NavLink to="/notes" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Notes">
                    <StickyNote size={20} color="#f59e0b" />
                    <span className="nav-text">Notes</span>
                </NavLink>

                <NavLink to="/calendar" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Calendar">
                    <CalendarDays size={20} color="#6366f1" />
                    <span className="nav-text">Calendar</span>
                </NavLink>

                <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '4px' }}>
                    <NavLink to="/scanner" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Celron Scanner" style={{ flex: 1 }}>
                        <QrCode size={20} color="#f43f5e" />
                        <span className="nav-text">Celron Scanner</span>
                    </NavLink>
                    {isPinned && (
                        <button 
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                downloadApkByIdentifier('celron-scanner');
                            }}
                            className="btn-icon-sm"
                            title="Download APK Directly"
                            style={{ 
                                background: 'rgba(255,255,255,0.1)', 
                                border: 'none', 
                                borderRadius: '6px', 
                                padding: '6px', 
                                cursor: 'pointer',
                                color: '#f43f5e',
                                transition: 'all 0.2s',
                                marginRight: '8px'
                            }}
                            onMouseOver={(e) => e.target.style.background = 'rgba(244, 63, 94, 0.2)'}
                            onMouseOut={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                        >
                            <Download size={16} />
                        </button>
                    )}
                </div>


                <NavLink to="/tools/ocr" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Smart OCR">
                    <Sparkles size={20} color="#a855f7" />
                    <span className="nav-text">Smart OCR</span>
                </NavLink>

                <NavLink to="/converter" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Converter">
                    <Calculator size={20} color="#10b981" />
                    <span className="nav-text">Converter</span>
                </NavLink>

                <NavLink to="/tools/locator" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Live Locator">
                    <Navigation2 size={20} color="#3b82f6" />
                    <span className="nav-text">Live Locator</span>
                </NavLink>

                <NavLink to="/forms" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Forms Directory (Stationery)">
                    <FileCheck size={20} color="#10b981" />
                    <span className="nav-text">Stationery Directory</span>
                </NavLink>

                <div className="nav-separator" />


                <span className="nav-group-header">Messaging Hub & Search</span>
                <NavLink to="/messaging" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Messaging Hub">
                    <Hexagon size={20} color="#8b5cf6" />
                    <span className="nav-text">Messaging Hub</span>
                </NavLink>

                <NavLink to="/commercial-wall" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Commercial Wall">
                    <MessageSquare size={20} color="#6366f1" />
                    <span className="nav-text">Commercial Wall</span>
                </NavLink>

                <div className="nav-separator" />
                <span className="nav-group-header">Storage Hub & Search</span>
                
                <NavLink to="/storage?tab=explorer" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Advanced Storage Hub">
                    <HardDrive size={20} color="#6366f1" />
                    <span className="nav-text" style={{ fontWeight: 700, color: '#6366f1' }}>Advanced Storage Hub</span>
                </NavLink>

                <NavLink to="/workflows/universal-finder" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Universal Finder">
                    <Search size={20} color="#3b82f6" />
                    <span className="nav-text">Universal Finder</span>
                </NavLink>

                <a 
                    href="https://global-parts-find.base44.app/Finder" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="nav-link" 
                    title="Global Finder"
                >
                    <Globe size={20} color="#10b981" />
                    <span className="nav-text">Global Finder</span>
                </a>

                <NavLink to="/workflows/ai-assistant" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="AI Document Assistant">
                    <Sparkles size={20} color="#a855f7" />
                    <span className="nav-text">AI Document Assistant</span>
                </NavLink>

                <div className="nav-separator" />
                <span className="nav-group-header">High-Efficiency Workflow</span>
                <NavLink to="/unified-supplier-hub" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Unified Supplier Hub">
                    <Sparkles size={20} color="#f59e0b" />
                    <span className="nav-text" style={{ fontWeight: 800, color: '#f59e0b' }}>Unified Supplier Hub</span>
                </NavLink>

                <NavLink to="/quotations" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Quote2Customers">
                    <Briefcase size={20} color="#6366f1" />
                    <span className="nav-text" style={{ fontWeight: 800, color: '#6366f1' }}>Quote2Customers</span>
                </NavLink>

                <NavLink to="/workflows/jobs-dashboard" className={`nav-link ${(location.pathname === '/workflows/jobs-dashboard' || (location.pathname === '/workflows' && location.search.includes('type=Job'))) ? 'active' : ''}`} title="JOBS">
                    <ShieldCheck size={20} color="#10b981" />
                    <span className="nav-text" style={{ fontWeight: 800, color: '#10b981' }}>JOBS</span>
                </NavLink>

                <NavLink 
                    to="/invoices" 
                    className={`nav-link ${(location.pathname === '/invoices' || (location.pathname === '/workflows' && location.search.includes('type=Tax+Invoice'))) ? 'active' : ''}`} 
                    title="Invoices"
                >
                    <DollarSign size={20} color="#14b8a6" />
                    <span className="nav-text" style={{ fontWeight: 800, color: '#14b8a6' }}>Invoices</span>
                </NavLink>

                <NavLink 
                    to="/workflows?type=Payment Received" 
                    className={`nav-link ${(location.pathname === '/workflows' && location.search.includes('type=Payment+Received')) ? 'active' : ''}`} 
                    title="Payment Received"
                >
                    <CheckCircle size={20} color="#22c55e" />
                    <span className="nav-text" style={{ fontWeight: 800, color: '#22c55e' }}>Payment Received</span>
                </NavLink>                <NavLink 
                    to="/soa" 
                    className={({ isActive }) => `nav-link ${isActive && !location.search.includes('tab=automated') ? 'active' : ''}`} 
                    title="Statement of Account"
                >
                    <ClipboardList size={20} color="#ec4899" />
                    <span className="nav-text" style={{ fontWeight: 800, color: '#ec4899' }}>Statement of Account</span>
                </NavLink>
                {isPinned && (
                    <NavLink 
                        to="/soa?tab=automated" 
                        className={`nav-link shortcut-link ${(location.pathname === '/soa' && location.search.includes('tab=automated')) ? 'active' : ''}`} 
                        title="Automated Dispatch Center"
                    >
                        <CalendarDays size={16} color="#ec4899" style={{ marginLeft: '12px' }} />
                        <span className="nav-text" style={{ fontSize: '0.85rem', color: '#f472b6', fontWeight: 600 }}>Automated SOA Dispatch</span>
                    </NavLink>
                )}

                <div className="nav-separator" />
                <span className="nav-group-header">Finance &amp; Accounts</span>

                <NavLink to="/accounts/bills" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Accounts Payable (Suppliers)">
                    <Receipt size={20} color="#f97316" />
                    <span className="nav-text" style={{ fontWeight: 800, color: '#f97316' }}>Accounts Payable</span>
                </NavLink>

                <NavLink to="/gst-reporting" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="GST Reporting">
                    <Calculator size={20} color="#10b981" />
                    <span className="nav-text" style={{ fontWeight: 800, color: '#10b981' }}>GST Reporting</span>
                </NavLink>

                <div className="nav-separator" />
                <span className="nav-group-header">Jobs Control (Legacy)</span>

                {/* 1. Enquiries & Supplier Management */}
                <div style={{ padding: '0 8px 0 16px', fontSize: '0.65rem', fontWeight: 700, color: '#f97316', opacity: 0.85, marginTop: '8px', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }} title="Phase 1: Enquiry & Supplier Management">
                    {isPinned ? "1. ENQUIRY & SUPPLIER PHASE" : "1."}
                </div>

                <NavLink to="/enquiries" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Enquiries & RFQ Hub">
                    <LayoutDashboard size={20} color="#6366f1" />
                    <span className="nav-text">Enquiries & RFQ Hub</span>
                </NavLink>

                <NavLink to="/workflows?type=Enquiry&view=depository" className={`nav-link ${(location.pathname === '/workflows' && location.search.includes('view=depository')) ? 'active' : ''}`} title="RFQ Repository">
                    <FileText size={20} color="#f59e0b" />
                    <span className="nav-text">RFQ Depository</span>
                </NavLink>

                <NavLink 
                    to="/workflows/float-supplier-order" 
                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    style={({ isActive }) => isActive ? { borderLeft: '4px solid #f97316', background: 'rgba(249, 115, 22, 0.05)' } : {}}
                    title="Float Supplier Order"
                >
                    <ArrowRightLeft size={20} color="#f97316" />
                    <span className="nav-text" style={{ color: '#f97316', fontWeight: 600 }}>Float Supplier Order</span>
                </NavLink>

                <NavLink to="/purchase-orders" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="P.O. 2 Suppliers">
                    <ShoppingCart size={20} color="#8b5cf6" />
                    <span className="nav-text">P.O. 2 Suppliers</span>
                </NavLink>

                <NavLink to="/workflows?type=Order+Acknowledgment" className={`nav-link ${(location.pathname === '/workflows' && location.search.includes('Order+Acknowledgment')) ? 'active' : ''}`} title="Order Acknowledgments">
                    <FileCheck size={20} color="#059669" />
                    <span className="nav-text">Order Acknowledgments</span>
                </NavLink>

                {/* 2. Jobs & Quote2Customers */}
                <div style={{ padding: '0 8px 0 16px', fontSize: '0.65rem', fontWeight: 700, color: '#6366f1', opacity: 0.85, marginTop: '8px', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }} title="Phase 2: Job & Quotation Phase">
                    {isPinned ? "2. JOB & QUOTATION PHASE" : "2."}
                </div>

                <NavLink 
                    to="/workflows" 
                    className={({ isActive }) => `nav-link ${isActive ? (isActive && !location.search.includes('view=depository') ? 'active' : '') : ''}`} 
                    style={({ isActive }) => (isActive && !location.search.includes('view=depository')) ? { borderLeft: '4px solid #6366f1', background: 'rgba(99, 102, 241, 0.05)' } : {}}
                    title="All Workflows (Master Board)"
                >
                    <LayoutDashboard size={20} color="#6366f1" />
                    <span className="nav-text">All Workflows</span>
                </NavLink>



                {/* 3. Operations */}
                <div style={{ padding: '0 8px 0 16px', fontSize: '0.65rem', fontWeight: 700, color: '#f97316', opacity: 0.85, marginTop: '8px', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }} title="Phase 3: Operations & Logistics">
                    {isPinned ? "3. Operations" : "3."}
                </div>

                <NavLink to="/delivery-orders" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Delivery Orders">
                    <Truck size={20} color="#10b981" />
                    <span className="nav-text">Delivery Orders</span>
                </NavLink>

                <NavLink to="/service-reports" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Service Reports">
                    <ClipboardList size={20} color="#ec4899" />
                    <span className="nav-text">Service Reports</span>
                </NavLink>

                <NavLink to="/packing-lists" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Packing Lists">
                    <Package size={20} color="#f97316" />
                    <span className="nav-text">Packing Lists</span>
                </NavLink>

                {/* 4. Finance */}
                <NavLink to="/proforma-invoices" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Proforma Invoices">
                    <Receipt size={20} color="#ef4444" />
                    <span className="nav-text">Proforma Invoices</span>
                </NavLink>

                <NavLink to="/accounts/bills" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Accounts Payable">
                    <Receipt size={20} color="#f97316" />
                    <span className="nav-text" style={{ fontWeight: 700, color: '#f97316' }}>Accounts Payable</span>
                </NavLink>

                <NavLink to="/gst-reporting" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="GST Reporting">
                    <Calculator size={20} color="#10b981" />
                    <span className="nav-text">GST Reporting</span>
                </NavLink>

                <div className="nav-separator" />
                <span className="nav-group-header">File Management</span>
                <NavLink to="/storage?tab=explorer" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Storage Hub">
                    <Folder size={20} color="#3b82f6" />
                    <span className="nav-text">Storage Hub</span>
                </NavLink>

                <NavLink to="/storage?tab=explorer&folder=vault" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Corporate Vault">
                    <HardDrive size={20} color="#22c55e" />
                    <span className="nav-text">Corporate Vault</span>
                </NavLink>

                <NavLink to="/settings?tab=communications" className={`nav-link ${(location.pathname === '/settings' && location.search.includes('tab=communications')) ? 'active' : ''}`} title="Google Drive Sync">
                    <RefreshCcw size={20} color={driveConnected ? "#10b981" : "#f59e0b"} className={driveConnected ? "" : "animate-pulse"} />
                    <span className="nav-text">
                        Google Drive Sync
                        {!driveConnected && <span style={{ marginLeft: '8px', fontSize: '0.65rem', background: '#f59e0b', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>RECONNECT</span>}
                    </span>
                </NavLink>

                {/* Dynamic Vault Shortcuts (e.g., IRAS, GST) */}
                {profile?.company_id && (() => {
                    try {
                        // We'll need a way to pass settings to Sidebar or fetch them here
                        // For now, we'll implement a stub that can be populated via settings later
                        const shortcuts = []; // getVaultShortcuts(settings)
                        return shortcuts.map(s => (
                            <NavLink key={s.id} to={`/vault/${s.id}`} className={({ isActive }) => `nav-link shortcut-link ${isActive ? 'active' : ''}`} title={s.name}>
                                <Folder size={16} color="#10b981" style={{ marginLeft: '12px' }} />
                                <span className="nav-text" style={{ fontSize: '0.85rem' }}>{s.name}</span>
                            </NavLink>
                        ));
                    } catch (e) { return null; }
                })()}


                <div className="nav-separator" />

                {(hasAccess('partners') || hasAccess('contacts')) && (
                    <>
                        <span className="nav-group-header">Partnership</span>
                        {hasAccess('partners') && (
                            <>
                                <NavLink to="/partners" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end title="Partners">
                                    <Building2 size={20} color="#94a3b8" />
                                    <span className="nav-text">Partners</span>
                                </NavLink>
                                {isPinned && (
                                    <>
                                        <NavLink to="/partners/ai-drive-parser" className={({ isActive }) => `nav-link shortcut-link ${isActive ? 'active' : ''}`} title="AI Drive Card Scanner">
                                            <HardDrive size={16} color="#ec4899" style={{ marginLeft: '12px' }} />
                                            <span className="nav-text" style={{ fontSize: '0.85rem', color: '#f472b6', fontWeight: 600 }}>AI Drive Card Scanner</span>
                                        </NavLink>
                                        <a href="https://business-card-merger.vercel.app" target="_blank" rel="noopener noreferrer" className="nav-link shortcut-link" title="Business Card Merger">
                                            <Sparkles size={16} color="#ec4899" style={{ marginLeft: '12px' }} />
                                            <span className="nav-text" style={{ fontSize: '0.85rem', color: '#f472b6', fontWeight: 600 }}>Business Card Merger</span>
                                        </a>
                                        <NavLink to="/partners/ai-parser" className={({ isActive }) => `nav-link shortcut-link ${isActive ? 'active' : ''}`} title="AI Parser">
                                            <Sparkles size={16} color="#a855f7" style={{ marginLeft: '12px' }} />
                                            <span className="nav-text" style={{ fontSize: '0.85rem', color: '#c084fc', fontWeight: 600 }}>AI Parser</span>
                                        </NavLink>
                                    </>
                                )}
                            </>
                        )}
                        {hasAccess('contacts') && (
                            <>
                                <NavLink to="/contacts" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end title="Contacts">
                                    <Users size={20} color="#94a3b8" />
                                    <span className="nav-text">Contacts</span>
                                </NavLink>
                                {isPinned && (
                                    <NavLink to="/partners/ai-parser" className={({ isActive }) => `nav-link shortcut-link ${isActive ? 'active' : ''}`} title="AI Email & Contact Parser">
                                        <Sparkles size={16} color="#a855f7" style={{ marginLeft: '12px' }} />
                                        <span className="nav-text" style={{ fontSize: '0.85rem', color: '#c084fc', fontWeight: 600 }}>AI Email &amp; Contact Parser</span>
                                    </NavLink>
                                )}
                            </>
                        )}
                        <div className="nav-separator" />
                    </>
                )}

                {(hasAccess('vessels') || hasAccess('work-locations')) && (
                    <>
                        <span className="nav-group-header">Vessels & Locations</span>
                        {hasAccess('vessels') && (
                            <NavLink to="/vessels" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Vessels">
                                <Ship size={20} color="#94a3b8" />
                                <span className="nav-text">Vessels</span>
                            </NavLink>
                        )}
                        {hasAccess('work-locations') && (
                            <NavLink to="/work-locations" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Work Locations">
                                <MapPin size={20} color="#94a3b8" />
                                <span className="nav-text">Work Locations</span>
                            </NavLink>
                        )}
                        <div className="nav-separator" />
                    </>
                )}

                <span className="nav-group-header">Operations & Certificates</span>
                <NavLink to="/forms/calibration-lab" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Calibration Lab">
                    <CheckSquare size={20} color="#059669" />
                    <span className="nav-text">Calibration Lab</span>
                </NavLink>

                <NavLink to="/manuals" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Manuals & Ref. Books">
                    <Book size={20} color="#f97316" />
                    <span className="nav-text">Manuals & Ref. Books</span>
                </NavLink>

                <NavLink to="/tools" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Weblinks & Resources">
                    <Wrench size={20} color="#ec4899" />
                    <span className="nav-text">Weblinks & Resources</span>
                </NavLink>

                <div className="nav-separator" />

                {hasAccess('catalog') && (
                    <>
                        <span className="nav-group-header">Catalog & Brands</span>
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '4px' }}>
                            <NavLink to="/catalog" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Catalog" style={{ flex: 1 }}>
                                <Package size={20} color="#94a3b8" />
                                <span className="nav-text">Catalog</span>
                            </NavLink>
                            {isPinned && (
                                <button 
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        downloadApkByIdentifier('celron-price-scanner');
                                    }}
                                    className="btn-icon-sm"
                                    title="Download Celron Price Scanner APK"
                                    style={{ 
                                        background: 'rgba(255,255,255,0.1)', 
                                        border: 'none', 
                                        borderRadius: '6px', 
                                        padding: '6px', 
                                        cursor: 'pointer',
                                        color: '#3b82f6',
                                        transition: 'all 0.2s',
                                        marginRight: '8px'
                                    }}
                                    onMouseOver={(e) => e.target.style.background = 'rgba(59, 130, 246, 0.2)'}
                                    onMouseOut={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                                >
                                    <Download size={16} />
                                </button>
                            )}
                        </div>
                        <NavLink to="/catalog/labels" className={({ isActive }) => `nav-link shortcut-link ${isActive ? 'active' : ''}`} title="Print QR Labels">
                            <QrCode size={16} color="#94a3b8" style={{ marginLeft: '12px' }} />
                            <span className="nav-text" style={{ fontSize: '0.85rem' }}>Print QR Labels</span>
                        </NavLink>
                        <NavLink to="/categories" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Categories">
                            <Tags size={20} color="#94a3b8" />
                            <span className="nav-text">Categories</span>
                        </NavLink>
                        <NavLink to="/brands" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Brands">
                            <Hexagon size={20} color="#94a3b8" />
                            <span className="nav-text">Brands</span>
                        </NavLink>
                        <div className="nav-separator" />
                    </>
                )}

                <span className="nav-group-header">System</span>
                {hasAccess('reports') && (
                    <NavLink to="/reports" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Reports">
                        <FileText size={20} color="#94a3b8" />
                        <span className="nav-text">Reports</span>
                    </NavLink>
                )}

                {(profile?.role === 'superadmin' || profile?.role === 'admin') && (
                    <>
                        <NavLink to="/admin/users" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="User Control">
                            <ShieldCheck size={20} color="#60a5fa" />
                            <span className="nav-text" style={{ color: '#93c5fd' }}>User Control</span>
                        </NavLink>
                        <NavLink to="/admin/staff" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Staff Directory">
                            <Users size={20} color="#fbbf24" />
                            <span className="nav-text">Staff Directory</span>
                        </NavLink>
                        <NavLink to="/admin/apks" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="APK Manager">
                            <Smartphone size={20} color="#10b981" />
                            <span className="nav-text">APK Manager</span>
                        </NavLink>
                        {profile?.role === 'superadmin' && (
                            <NavLink to="/admin/logs" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Activity Logs">
                                <History size={20} color="#a855f7" />
                                <span className="nav-text" style={{ color: '#c084fc' }}>Activity Logs</span>
                            </NavLink>
                        )}
                    </>
                )}

                <NavLink to="/help" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} title="Help & Support">
                    <Book size={20} color="#3b82f6" />
                    <span className="nav-text">Help & Support</span>
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
