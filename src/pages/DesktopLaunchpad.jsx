import { useState, useEffect } from 'react';
import { 
  FileText, Kanban, LayoutDashboard, Briefcase, Receipt, 
  ShoppingBag, Truck, FileSpreadsheet, FileBarChart, DollarSign, 
  Building2, Users, Ship, MapPin, Layers, BookOpen, 
  QrCode, ShieldCheck, Cloud, MailCheck, Cpu, 
  CheckSquare, Search, ExternalLink, Sparkles, Clock, 
  Monitor, RefreshCw, Compass, Sliders, Check, Download
} from 'lucide-react';

const CATEGORIES = [
  { id: 'all', label: 'All Modules' },
  { id: 'operations', label: 'Operations & Control' },
  { id: 'commercial', label: 'Commercial & Finances' },
  { id: 'marine', label: 'Marine & Logistics' },
  { id: 'catalog', label: 'Catalog & Assets' },
  { id: 'ai', label: 'AI & Automation' }
];

const MODULE_TILES = [
  // Operations & Control
  {
    id: 'enquiries',
    category: 'operations',
    title: 'Enquiries Ledger',
    subtitle: 'Customer RFQs, enquiry statuses & quotes',
    path: '/enquiries',
    icon: FileText,
    accent: 'amber',
    colorHex: '#f59e0b',
    badge: 'Core RFQ',
    shortcut: 'E'
  },
  {
    id: 'jobs-whiteboard',
    category: 'operations',
    title: 'Jobs Whiteboard',
    subtitle: 'Interactive live whiteboard & job assignments',
    path: '/workflows/whiteboard',
    icon: Kanban,
    accent: 'emerald',
    colorHex: '#10b981',
    badge: 'Live Board',
    shortcut: 'W'
  },
  {
    id: 'jobs-dashboard',
    category: 'operations',
    title: 'Jobs Dashboard',
    subtitle: 'Executive KPIs, active job statuses & metrics',
    path: '/workflows/jobs-dashboard',
    icon: LayoutDashboard,
    accent: 'blue',
    colorHex: '#3b82f6',
    badge: 'Control',
    shortcut: 'J'
  },
  {
    id: 'master-control',
    category: 'operations',
    title: 'Master Control Ledger',
    subtitle: 'Eagle-eye view across all workflow milestones',
    path: '/workflows/eagle-control',
    icon: Briefcase,
    accent: 'indigo',
    colorHex: '#6366f1',
    badge: 'Eagle View'
  },
  {
    id: 'workflow-wizard',
    category: 'operations',
    title: 'Workflow Wizard',
    subtitle: 'Guided workflow generator for jobs & orders',
    path: '/workflows/wizard',
    icon: Sparkles,
    accent: 'purple',
    colorHex: '#a855f7',
    badge: 'Wizard'
  },
  {
    id: 'universal-finder',
    category: 'operations',
    title: 'Universal Finder',
    subtitle: 'Global multi-entity search across all systems',
    path: '/workflows/universal-finder',
    icon: Compass,
    accent: 'cyan',
    colorHex: '#06b6d4',
    badge: 'Global'
  },

  // Commercial & Finances
  {
    id: 'quotations',
    category: 'commercial',
    title: 'Quotations',
    subtitle: 'Customer estimates, pricing & profit margins',
    path: '/quotations',
    icon: FileSpreadsheet,
    accent: 'amber',
    colorHex: '#f59e0b',
    badge: 'Commercial'
  },
  {
    id: 'purchase-orders',
    category: 'commercial',
    title: 'Purchase Orders (PO)',
    subtitle: 'Supplier purchase orders & procurement tracking',
    path: '/purchase-orders',
    icon: ShoppingBag,
    accent: 'rose',
    colorHex: '#f43f5e',
    badge: 'Procure'
  },
  {
    id: 'delivery-orders',
    category: 'commercial',
    title: 'Delivery Orders (DO)',
    subtitle: 'Dispatch notes, delivery proofs & logistics',
    path: '/delivery-orders',
    icon: Truck,
    accent: 'blue',
    colorHex: '#3b82f6',
    badge: 'Dispatch'
  },
  {
    id: 'invoices',
    category: 'commercial',
    title: 'Invoices & Billing',
    subtitle: 'Commercial tax invoices & revenue management',
    path: '/invoices',
    icon: Receipt,
    accent: 'emerald',
    colorHex: '#10b981',
    badge: 'Finance'
  },
  {
    id: 'soa',
    category: 'commercial',
    title: 'Statement of Account (SOA)',
    subtitle: 'Customer ledger balances & payment tracking',
    path: '/soa',
    icon: FileBarChart,
    accent: 'violet',
    colorHex: '#8b5cf6',
    badge: 'Ledger'
  },
  {
    id: 'expenses-profit',
    category: 'commercial',
    title: 'Expenses & Profit Wall',
    subtitle: 'Job profitability analytics & expense tracking',
    path: '/expenses-profit',
    icon: DollarSign,
    accent: 'emerald',
    colorHex: '#059669',
    badge: 'Margins'
  },

  // Marine & Logistics
  {
    id: 'partners',
    category: 'marine',
    title: 'Partners & Suppliers',
    subtitle: 'Customer accounts, suppliers & payment terms',
    path: '/partners',
    icon: Building2,
    accent: 'blue',
    colorHex: '#2563eb',
    badge: 'Network'
  },
  {
    id: 'contacts',
    category: 'marine',
    title: 'Contacts Directory',
    subtitle: 'Client contacts, emails & phone direct lines',
    path: '/contacts',
    icon: Users,
    accent: 'cyan',
    colorHex: '#0891b2',
    badge: 'Directory'
  },
  {
    id: 'vessels',
    category: 'marine',
    title: 'Vessels Registry',
    subtitle: 'Vessel IMO, technical specifications & profiles',
    path: '/vessels',
    icon: Ship,
    accent: 'sky',
    colorHex: '#0284c7',
    badge: 'Marine'
  },
  {
    id: 'work-locations',
    category: 'marine',
    title: 'Work Locations',
    subtitle: 'Shipyards, anchorages, wharfs & terminals',
    path: '/work-locations',
    icon: MapPin,
    accent: 'orange',
    colorHex: '#ea580c',
    badge: 'Sites'
  },

  // Catalog & Assets
  {
    id: 'catalog',
    category: 'catalog',
    title: 'Marine Equipment Catalog',
    subtitle: 'Spare parts, maker models, serials & barcodes',
    path: '/catalog',
    icon: Layers,
    accent: 'indigo',
    colorHex: '#4f46e5',
    badge: 'Spares'
  },
  {
    id: 'manuals',
    category: 'catalog',
    title: 'Manuals & Datasheets',
    subtitle: 'Technical service manuals, drawings & schematics',
    path: '/catalog/manuals',
    icon: BookOpen,
    accent: 'blue',
    colorHex: '#3b82f6',
    badge: 'Tech Docs'
  },
  {
    id: 'labels',
    category: 'catalog',
    title: 'Barcode & QR Center',
    subtitle: 'Generate & print warehouse barcode asset labels',
    path: '/catalog/labels',
    icon: QrCode,
    accent: 'amber',
    colorHex: '#d97706',
    badge: 'Labels'
  },
  {
    id: 'vault',
    category: 'catalog',
    title: 'Corporate Vault',
    subtitle: 'Confidential corporate archives & safe storage',
    path: '/vault',
    icon: ShieldCheck,
    accent: 'emerald',
    colorHex: '#059669',
    badge: 'Secure'
  },
  {
    id: 'storage',
    category: 'catalog',
    title: 'Drive & Media Storage',
    subtitle: 'Google Drive folders & uploaded job attachments',
    path: '/storage',
    icon: Cloud,
    accent: 'sky',
    colorHex: '#0284c7',
    badge: 'Drive'
  },

  // AI & Automation
  {
    id: 'ai-parser',
    category: 'ai',
    title: 'AI Email Parser',
    subtitle: 'Intelligent extraction of RFQs & equipment inquiries',
    path: '/partners/ai-parser',
    icon: MailCheck,
    accent: 'purple',
    colorHex: '#9333ea',
    badge: 'AI Engine'
  },
  {
    id: 'ai-drive-parser',
    category: 'ai',
    title: 'AI Drive Card Parser',
    subtitle: 'OCR and spec extraction from drive nameplates',
    path: '/partners/ai-drive-parser',
    icon: Cpu,
    accent: 'cyan',
    colorHex: '#06b6d4',
    badge: 'Vision AI'
  },
  {
    id: 'my-day',
    category: 'ai',
    title: 'Daily MyDay Tracker',
    subtitle: 'Priority agenda, task milestones & team focus',
    path: '/my-day',
    icon: CheckSquare,
    accent: 'emerald',
    colorHex: '#10b981',
    badge: 'Focus'
  }
];

export default function DesktopLaunchpad() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [openInNewWindow, setOpenInNewWindow] = useState(true);
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [showShortcutModal, setShowShortcutModal] = useState(false);

  // Live Digital Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setCurrentDate(now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut listener ('/' to focus search)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        document.getElementById('launchpad-search')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLaunch = (tile) => {
    const targetUrl = tile.path.startsWith('http') ? tile.path : `${window.location.origin}${tile.path}`;
    
    if (openInNewWindow) {
      // Calculate dual-monitor friendly popout dimensions
      const screenW = window.screen.availWidth || 1920;
      const screenH = window.screen.availHeight || 1080;
      const winW = Math.min(Math.round(screenW * 0.94), 1540);
      const winH = Math.min(Math.round(screenH * 0.92), 940);
      const left = Math.max(20, Math.round((screenW - winW) / 2));
      const top = Math.max(20, Math.round((screenH - winH) / 2));
      
      const windowFeatures = `width=${winW},height=${winH},left=${left},top=${top},menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes`;
      window.open(targetUrl, `Celron_${tile.id}`, windowFeatures);
    } else {
      window.open(targetUrl, '_blank');
    }
  };

  const filteredTiles = MODULE_TILES.filter(tile => {
    const matchesCategory = activeCategory === 'all' || tile.category === activeCategory;
    const query = searchQuery.toLowerCase().trim();
    const matchesQuery = !query || 
      tile.title.toLowerCase().includes(query) || 
      tile.subtitle.toLowerCase().includes(query) ||
      tile.badge.toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, #0f172a 0%, #020617 100%)',
      color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '32px 40px',
      boxSizing: 'border-box'
    }}>
      {/* Top Executive Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '24px',
        paddingBottom: '28px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        marginBottom: '28px'
      }}>
        {/* Brand & Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{
            position: 'relative',
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
          }}>
            <img 
              src="/logo.png" 
              alt="CelronHub Logo" 
              style={{ width: '42px', height: '42px', objectFit: 'contain' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{
                fontSize: '1.65rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                margin: 0,
                background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                CELRON HUB
              </h1>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}>
                DESKTOP LAUNCHPAD
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
              Executive Multitasking Command Deck &middot; All Modules Open in Dedicated Windows
            </p>
          </div>
        </div>

        {/* Live Status & Clock Widget */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          {/* Clock */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Clock size={18} color="#38bdf8" />
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '0.04em', color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
                {currentTime || '00:00:00'}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                {currentDate}
              </div>
            </div>
          </div>

          {/* New Window Mode Switch */}
          <div 
            onClick={() => setOpenInNewWindow(!openInNewWindow)}
            style={{
              background: openInNewWindow ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${openInNewWindow ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
              borderRadius: '12px',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <Monitor size={18} color={openInNewWindow ? '#34d399' : '#94a3b8'} />
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: openInNewWindow ? '#34d399' : '#cbd5e1' }}>
                {openInNewWindow ? 'New Window Mode' : 'Standard Tab Mode'}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                {openInNewWindow ? 'Opens each module in new window' : 'Opens in standard browser tab'}
              </div>
            </div>
            <div style={{
              width: '18px',
              height: '18px',
              borderRadius: '6px',
              background: openInNewWindow ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: '6px'
            }}>
              {openInNewWindow && <Check size={12} color="#ffffff" strokeWidth={3} />}
            </div>
          </div>

          {/* Desktop Shortcut Guide Button */}
          <button
            onClick={() => setShowShortcutModal(true)}
            style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              border: 'none',
              borderRadius: '12px',
              padding: '10px 16px',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
              transition: 'transform 0.15s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <Download size={16} />
            Desktop Icon Setup
          </button>
        </div>
      </header>

      {/* Toolbar: Instant Search and Category Filters */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '28px'
      }}>
        {/* Category Pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                background: activeCategory === cat.id 
                  ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(37, 99, 235, 0.25) 100%)' 
                  : 'rgba(30, 41, 59, 0.4)',
                border: activeCategory === cat.id 
                  ? '1px solid rgba(96, 165, 250, 0.5)' 
                  : '1px solid rgba(255, 255, 255, 0.06)',
                color: activeCategory === cat.id ? '#60a5fa' : '#94a3b8',
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', minWidth: '280px', maxWidth: '400px', flex: 1 }}>
          <Search 
            size={16} 
            color="#64748b" 
            style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} 
          />
          <input
            id="launchpad-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search modules... (Press '/' to focus)"
            style={{
              width: '100%',
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '10px 16px 10px 40px',
              color: '#f8fafc',
              fontSize: '0.85rem',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '0.8rem'
              }}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Grid of Module Tiles */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '20px'
      }}>
        {filteredTiles.map((tile) => {
          const IconComp = tile.icon;
          return (
            <div
              key={tile.id}
              onClick={() => handleLaunch(tile)}
              style={{
                position: 'relative',
                background: 'rgba(15, 23, 42, 0.55)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '18px',
                padding: '22px 24px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = tile.colorHex;
                e.currentTarget.style.boxShadow = `0 14px 32px rgba(0, 0, 0, 0.4), 0 0 20px ${tile.colorHex}25`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.25)';
              }}
            >
              {/* Top Row: Icon + Badge + Launch Arrow */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '14px',
                  background: `${tile.colorHex}18`,
                  border: `1px solid ${tile.colorHex}35`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <IconComp size={24} color={tile.colorHex} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: `${tile.colorHex}15`,
                    color: tile.colorHex,
                    border: `1px solid ${tile.colorHex}30`,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase'
                  }}>
                    {tile.badge}
                  </span>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#94a3b8'
                  }}>
                    <ExternalLink size={16} />
                  </div>
                </div>
              </div>

              {/* Title & Subtitle */}
              <div>
                <h3 style={{
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  margin: '0 0 6px 0',
                  color: '#ffffff',
                  letterSpacing: '-0.01em'
                }}>
                  {tile.title}
                </h3>
                <p style={{
                  fontSize: '0.82rem',
                  color: '#94a3b8',
                  margin: 0,
                  lineHeight: '1.4'
                }}>
                  {tile.subtitle}
                </p>
              </div>

              {/* Bottom Quick-Launch Trigger Hint */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '18px',
                paddingTop: '14px',
                borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                fontSize: '0.75rem',
                color: '#64748b'
              }}>
                <span>Click to launch in new window</span>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: tile.colorHex,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  Open &rarr;
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredTiles.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '64px 20px',
          background: 'rgba(15, 23, 42, 0.4)',
          borderRadius: '16px',
          border: '1px dashed rgba(255, 255, 255, 0.1)',
          marginTop: '24px'
        }}>
          <p style={{ fontSize: '1rem', color: '#94a3b8', margin: '0 0 8px 0' }}>
            No modules match your search "{searchQuery}"
          </p>
          <button
            onClick={() => { setSearchQuery(''); setActiveCategory('all'); }}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '6px 14px',
              color: '#f8fafc',
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            Clear Search
          </button>
        </div>
      )}

      {/* Desktop Shortcut Helper Modal */}
      {showShortcutModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '20px',
            padding: '32px',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: 'rgba(37, 99, 235, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <img src="/celronhub.ico" alt="Icon" style={{ width: '28px', height: '28px' }} onError={(e) => { e.target.src = '/logo.png'; }} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                  Desktop Shortcut Created!
                </h2>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                  Launchpad is now installed on your Windows Desktop
                </p>
              </div>
            </div>

            <div style={{
              background: 'rgba(30, 41, 59, 0.5)',
              borderRadius: '12px',
              padding: '16px',
              fontSize: '0.85rem',
              lineHeight: 1.6,
              color: '#cbd5e1',
              marginBottom: '24px',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <p style={{ margin: '0 0 10px 0' }}>
                ✅ <strong>Shortcut Name:</strong> <code>CelronHub Launchpad.lnk</code><br />
                ✅ <strong>Location:</strong> Directly on your Windows Desktop<br />
                ✅ <strong>Icon:</strong> Custom CelronHub High-Res Logo<br />
                ✅ <strong>Experience:</strong> Launches in Chrome/Edge Standalone App mode (no distracting browser address bars).
              </p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                Tip: You can re-run <code>Create-CelronHub-Shortcut.bat</code> in the project folder at any time to regenerate the desktop shortcut.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowShortcutModal(false)}
                style={{
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 20px',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
