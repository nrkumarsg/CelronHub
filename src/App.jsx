import { Routes, Route, useParams, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Smartphone, Lock, ShieldAlert } from 'lucide-react';
import { downloadApkByIdentifier } from './lib/driveService';
// Build cache invalidation: v1.0.1
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import IndexRoute from './components/IndexRoute';
import Partners from './pages/Partners';
import PartnerForm from './pages/PartnerForm';
import ContactsForm from './pages/ContactsForm';
import ContactsDirectory from './pages/ContactsDirectory';
import AiEmailParser from './pages/AiEmailParser';
import AiDriveCardParser from './pages/AiDriveCardParser';
import VesselsDirectory from './pages/VesselsDirectory';
import VesselForm from './pages/VesselForm';
import VesselTracking from './pages/VesselTracking';
import ModuleSettings from './pages/ModuleSettings';
import Reports from './pages/Reports';
import WorkLocationsDirectory from './pages/WorkLocationsDirectory';
import WorkLocationForm from './pages/WorkLocationForm';
import CorporateVault from './pages/CorporateVault';
import CatalogDirectory from './pages/CatalogDirectory';
import CatalogForm from './pages/CatalogForm';
import SystemForm from './pages/SystemForm';
import PrintLabels from './pages/PrintLabels';
import WorkflowBoard from './pages/workflows/WorkflowBoard';
import UniversalFinder from './pages/workflows/UniversalFinder';
import EnquiryDetails from './pages/workflows/EnquiryDetails';
import JobDetails from './pages/workflows/JobDetails';
import UnifiedSupplierHub from './pages/workflows/UnifiedSupplierHub';
import WorkflowV2Board from './pages/workflows/WorkflowV2Board';
import JobsWhiteboard from './pages/workflows/JobsWhiteboard';
import JobsDashboard from './pages/workflows/JobsDashboard';
import EnquiryList from './pages/workflows/EnquiryList';
import WorkflowEditor from './pages/workflows/WorkflowEditor';
import StatementOfAccount from './pages/workflows/StatementOfAccount';
import ExpensesProfitPage from './pages/workflows/ExpensesProfitPage';
import WorkflowPrintPreview from './pages/workflows/WorkflowPrintPreview';
import EnquiryPrintPreview from './pages/workflows/EnquiryPrintPreview';
import CategoriesDirectory from './pages/CategoriesDirectory';
import BrandsDirectory from './pages/BrandsDirectory';
import TodoList from './pages/TodoList';
import NotesDirectory from './pages/NotesDirectory';
import NoteForm from './pages/NoteForm';
import Calendar from './pages/Calendar';
import StorageDirectory from './pages/StorageDirectory';
import Tools from './pages/Tools';
import MessagingHub from './pages/MessagingHub';
import ManualsDirectory from './pages/ManualsDirectory';
import ManualForm from './pages/ManualForm';
import ScannerModule from './pages/ScannerModule';
import ScanGateway from './pages/workflows/ScanGateway';
import SmartOCR from './pages/tools/SmartOCR';
import EmailComposer from './pages/tools/EmailComposer';
import Converter from './pages/tools/Converter';
import LiveLocator from './pages/tools/LiveLocator';
import HelpCenter from './pages/HelpCenter';
import FormsDirectory from './pages/FormsDirectory';
import FormEditor from './pages/FormEditor';
import CalibrationLab from './pages/CalibrationLab';
import SmartAssistant from './pages/workflows/SmartAssistant';
import MyDay from './pages/MyDay';
import FloatSupplierOrder from './pages/workflows/FloatSupplierOrder';
import CommercialWallPage from './pages/CommercialWallPage';
import SearchResults from './pages/SearchResults';
import ApkManagement from './pages/admin/ApkManagement';
import ActivityLogs from './pages/admin/ActivityLogs';
import BillsPortal from './pages/accounts/BillsPortal';
import UploadMediaGateway from './pages/workflows/UploadMediaGateway';
import FloatingControlHub from './components/FloatingControlHub';
import JobWorkflow from './pages/workflows/JobWorkflow';
import WorkflowWizard from './pages/workflows/WorkflowWizard';
import SupplierItemSearch from './pages/workflows/SupplierItemSearch';


// Authentication & RBAC Components
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/auth/Login';
import SignUp from './pages/auth/SignUp';
import ForgotPassword from './pages/auth/ForgotPassword';
import UserManagement from './pages/UserManagement';
import StaffDirectory from './pages/StaffDirectory';
import OAuthCallback from './pages/auth/OAuthCallback';
import Unauthorized from './pages/auth/Unauthorized';

import GstReporting from './pages/GstReporting';

// App Layout wrapper to only show sidebar when logged in
const AppLayout = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);

  const isMobilePath = location.pathname.startsWith('/m/') || location.pathname === '/m';
  const isStandalone = searchParams.get('mobile') === 'true' || searchParams.get('standalone') === 'true' || isMobilePath;

  // Auto-redirect desktop route to /m/ route on mobile device detection
  useEffect(() => {
    const isMobileDevice = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (user && isMobileDevice && !isMobilePath) {
      const targetPath = `/m${location.pathname === '/' ? '' : location.pathname}${location.search}`;
      navigate(targetPath, { replace: true });
    }
  }, [user, location.pathname, isMobilePath, location.search, navigate]);

  // Auth routes shouldn't show the main layout
  if (!user) {
    return children;
  }

  if (isStandalone) {
    return (
      <div className="app-container standalone-mobile">
        <main className="main-content" style={{ width: '100%', margin: 0, padding: '16px 24px' }}>
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-layout">
        <Header />
        <main className="main-content">
          {children}
        </main>
      </div>
      <FloatingControlHub />
    </div>
  );
};

const RedirectToManual = () => {
  const { id } = useParams();
  return <Navigate to={`/catalog/manuals/${id}`} replace />;
};

import { Toaster } from 'react-hot-toast';

const PasscodeGate = ({ onUnlock }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  const handleKeyClick = (num) => {
    if (code.length < 5) {
      setCode(prev => {
        const val = prev + num;
        if (val.length === 5) {
          if (val === '55555') {
            localStorage.setItem('celron_app_unlocked', 'true');
            sessionStorage.setItem('celron_app_unlocked', 'true');
            onUnlock();
          } else {
            setError(true);
            setTimeout(() => setError(false), 600);
            return '';
          }
        }
        return val;
      });
    }
  };

  const handleClear = () => {
    setCode('');
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (/^\d$/.test(e.key)) {
        handleKeyClick(parseInt(e.key, 10));
      } else if (e.key === 'Backspace') {
        setCode(prev => prev.slice(0, -1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [code]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'radial-gradient(circle at center, #0f172a 0%, #020617 100%)',
      color: '#fff', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        background: 'rgba(30, 41, 59, 0.4)', backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '24px',
        padding: '40px', width: '100%', maxWidth: '380px', textAlign: 'center',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        animation: error ? 'shake 0.5s' : 'none'
      }}>
        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-8px); }
            40%, 80% { transform: translateX(8px); }
          }
        `}</style>
        
        <div style={{ display: 'inline-flex', padding: '16px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', marginBottom: '20px' }}>
          <Lock size={32} />
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '-0.02em', color: '#f8fafc' }}>Security Gate</h2>
        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 28px 0' }}>
          Enter the 5-digit passcode to open {window.location.hostname.includes('celronpricescanner') ? 'Celron Price Scanner' : (window.location.hostname.includes('celronspares') ? 'Celron Spares' : 'CelronHub')}
        </p>

        {/* Indicator dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '32px' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{
              width: '16px', height: '16px', borderRadius: '50%',
              background: i < code.length ? (error ? '#ef4444' : '#6366f1') : '#334155',
              boxShadow: i < code.length ? `0 0 12px ${error ? '#ef4444' : '#6366f1'}` : 'none',
              transition: 'all 0.15s ease'
            }} />
          ))}
        </div>

        {/* Digital Keypad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button key={num} onClick={() => handleKeyClick(num)} style={{
              background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '16px', padding: '16px', fontSize: '1.25rem', color: '#fff',
              fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s'
            }}>
              {num}
            </button>
          ))}
          <button onClick={handleClear} style={{
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '16px', padding: '16px', fontSize: '0.9rem', color: '#fca5a5',
            fontWeight: 700, cursor: 'pointer'
          }}>
            CLR
          </button>
          <button onClick={() => handleKeyClick(0)} style={{
            background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '16px', padding: '16px', fontSize: '1.25rem', color: '#fff',
            fontWeight: 700, cursor: 'pointer'
          }}>
            0
          </button>
          <button disabled style={{
            background: 'transparent', border: 'none', cursor: 'default'
          }} />
        </div>
      </div>
    </div>
  );
};

function App() {
  const location = useLocation();
  const normalizedLocation = location.pathname.startsWith('/m/')
    ? { ...location, pathname: location.pathname.replace(/^\/m/, '') || '/' }
    : location.pathname === '/m'
    ? { ...location, pathname: '/' }
    : location;

  const isCatalogOnly = window.location.hostname.includes('celronpricescanner') || 
                        window.location.hostname.includes('celronspares') || 
                        (import.meta.env.VITE_CATALOG_ONLY === 'true' && 
                         !window.location.hostname.includes('celronhub') && 
                         !window.location.hostname.includes('celron-partners'));

  const [isUnlocked, setIsUnlocked] = useState(() => {
    if (!isCatalogOnly) return true;
    return localStorage.getItem('celron_app_unlocked') === 'true' || 
           sessionStorage.getItem('celron_app_unlocked') === 'true';
  });

  if (isCatalogOnly && !isUnlocked) {
    return <PasscodeGate onUnlock={() => setIsUnlocked(true)} />;
  }

  return (
    <AuthProvider>
      <Toaster position="top-right" reverseOrder={false} />
      <Routes>
        {/* Public Authentication Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="/oauth-callback" element={<OAuthCallback />} />
        <Route path="/upload-media" element={<UploadMediaGateway />} />

        {/* Protected Application Layout and Routes */}
        <Route path="*" element={
          <AppLayout>
            {isCatalogOnly ? (
              <Routes location={normalizedLocation}>
                <Route path="/" element={<ProtectedRoute requiredModule="catalog"><CatalogDirectory /></ProtectedRoute>} />
                <Route path="/catalog" element={<ProtectedRoute requiredModule="catalog"><CatalogDirectory /></ProtectedRoute>} />
                <Route path="/catalog/system/:id" element={<ProtectedRoute requiredModule="catalog"><SystemForm /></ProtectedRoute>} />
                <Route path="/catalog/manuals" element={<ProtectedRoute requiredModule="catalog"><ManualsDirectory /></ProtectedRoute>} />
                <Route path="/catalog/manuals/:id" element={<ProtectedRoute requiredModule="catalog"><ManualForm /></ProtectedRoute>} />
                <Route path="/catalog/:id" element={<ProtectedRoute requiredModule="catalog"><CatalogForm /></ProtectedRoute>} />
                <Route path="/catalog/labels" element={<ProtectedRoute requiredModule="catalog"><PrintLabels /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            ) : (
              <Routes location={normalizedLocation}>
              {/* Base Dashboard (Accessible if logged in and active, handled by wildcard ProtectedRoute) */}
              <Route path="/" element={<ProtectedRoute><IndexRoute /></ProtectedRoute>} />
              <Route path="/my-day" element={<ProtectedRoute><MyDay /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/dashboard/job-workflow" element={<ProtectedRoute><JobWorkflow /></ProtectedRoute>} />
              <Route path="/dashboard/workflow-wizard" element={<ProtectedRoute><WorkflowWizard /></ProtectedRoute>} />
              <Route path="/workflows/wizard" element={<ProtectedRoute><WorkflowWizard /></ProtectedRoute>} />
              <Route path="/m/workflows/wizard" element={<ProtectedRoute><WorkflowWizard /></ProtectedRoute>} />
              <Route path="/m/job-workflow" element={<ProtectedRoute><JobWorkflow /></ProtectedRoute>} />
              <Route path="/search" element={<ProtectedRoute><SearchResults /></ProtectedRoute>} />

              {/* User Management (Superadmins & Admins only) */}
              <Route path="/admin/users" element={
                <ProtectedRoute>
                  <UserManagement />
                </ProtectedRoute>
              } />

              <Route path="/admin/staff" element={
                <ProtectedRoute>
                  <StaffDirectory />
                </ProtectedRoute>
              } />

              {/* Partners Module */}
              <Route path="/partners" element={<ProtectedRoute requiredModule="partners"><Partners /></ProtectedRoute>} />
              <Route path="/partners/ai-parser" element={<ProtectedRoute requiredModule="partners"><AiEmailParser /></ProtectedRoute>} />
              <Route path="/partners/ai-drive-parser" element={<ProtectedRoute requiredModule="partners"><AiDriveCardParser /></ProtectedRoute>} />
              <Route path="/partners/:id" element={<ProtectedRoute requiredModule="partners"><PartnerForm /></ProtectedRoute>} />
              <Route path="/supplier-search" element={<ProtectedRoute requiredModule="partners"><SupplierItemSearch /></ProtectedRoute>} />

              <Route path="/categories" element={<ProtectedRoute><CategoriesDirectory /></ProtectedRoute>} />
              <Route path="/brands" element={<ProtectedRoute><BrandsDirectory /></ProtectedRoute>} />

              {/* Contacts Module */}
              <Route path="/contacts" element={<ProtectedRoute requiredModule="contacts"><ContactsDirectory /></ProtectedRoute>} />
              <Route path="/contacts/:id" element={<ProtectedRoute requiredModule="contacts"><ContactsForm /></ProtectedRoute>} />

              {/* Vessels Module */}
              <Route path="/vessels" element={<ProtectedRoute requiredModule="vessels"><VesselsDirectory /></ProtectedRoute>} />
              <Route path="/vessels/:id" element={<ProtectedRoute requiredModule="vessels"><VesselForm /></ProtectedRoute>} />
              <Route path="/vessel-tracking/:id" element={<ProtectedRoute requiredModule="vessels"><VesselTracking /></ProtectedRoute>} />

              {/* Work Locations Module */}
              <Route path="/work-locations" element={<ProtectedRoute requiredModule="work-locations"><WorkLocationsDirectory /></ProtectedRoute>} />
              <Route path="/work-locations/:id" element={<ProtectedRoute requiredModule="work-locations"><WorkLocationForm /></ProtectedRoute>} />

              {/* Catalog Module */}
              <Route path="/catalog" element={<ProtectedRoute requiredModule="catalog"><CatalogDirectory /></ProtectedRoute>} />
              <Route path="/catalog/manuals" element={<ProtectedRoute><ManualsDirectory /></ProtectedRoute>} />
              <Route path="/catalog/manuals/:id" element={<ProtectedRoute><ManualForm /></ProtectedRoute>} />
              <Route path="/catalog/:id" element={<ProtectedRoute requiredModule="catalog"><CatalogForm /></ProtectedRoute>} />
              <Route path="/catalog/labels" element={<ProtectedRoute requiredModule="catalog"><PrintLabels /></ProtectedRoute>} />

              {/* Workflows & Universal Finder Module */}
              <Route path="/unified-supplier-hub" element={<ProtectedRoute><UnifiedSupplierHub /></ProtectedRoute>} />
              <Route path="/workflows/jobs-dashboard" element={<ProtectedRoute><JobsDashboard /></ProtectedRoute>} />
              <Route path="/workflows/whiteboard" element={<ProtectedRoute><JobsWhiteboard /></ProtectedRoute>} />
              <Route path="/workflows" element={<ProtectedRoute><WorkflowV2Board /></ProtectedRoute>} />
              <Route path="/enquiries" element={<ProtectedRoute><EnquiryList /></ProtectedRoute>} />
              <Route path="/quotations" element={<ProtectedRoute><WorkflowV2Board /></ProtectedRoute>} />
              <Route path="/purchase-orders" element={<ProtectedRoute><WorkflowV2Board /></ProtectedRoute>} />
              <Route path="/delivery-orders" element={<ProtectedRoute><WorkflowV2Board /></ProtectedRoute>} />
              <Route path="/service-reports" element={<ProtectedRoute><WorkflowV2Board /></ProtectedRoute>} />
              <Route path="/invoices" element={<ProtectedRoute><WorkflowV2Board /></ProtectedRoute>} />
              <Route path="/proforma-invoices" element={<ProtectedRoute><WorkflowV2Board /></ProtectedRoute>} />
              <Route path="/packing-lists" element={<ProtectedRoute><WorkflowV2Board /></ProtectedRoute>} />
              <Route path="/certificates" element={<ProtectedRoute><WorkflowV2Board /></ProtectedRoute>} />
              <Route path="/payment-received" element={<ProtectedRoute><WorkflowV2Board /></ProtectedRoute>} />
              <Route path="/soa" element={<ProtectedRoute><StatementOfAccount /></ProtectedRoute>} />
              <Route path="/expenses-profit" element={<ProtectedRoute><ExpensesProfitPage /></ProtectedRoute>} />
              <Route path="/m/expenses-profit" element={<ProtectedRoute><ExpensesProfitPage /></ProtectedRoute>} />
              <Route path="/payments" element={<ProtectedRoute><WorkflowV2Board /></ProtectedRoute>} />
              <Route path="/workflows/legacy" element={<ProtectedRoute><WorkflowBoard /></ProtectedRoute>} />
              <Route path="/workflows/enquiry/print/:id" element={<ProtectedRoute><EnquiryPrintPreview /></ProtectedRoute>} />
              <Route path="/workflows/enquiry/:id" element={<ProtectedRoute><EnquiryDetails /></ProtectedRoute>} />
              <Route path="/workflows/job/:id" element={<ProtectedRoute><JobDetails /></ProtectedRoute>} />
              <Route path="/workflows/editor/:type/:id" element={<ProtectedRoute><WorkflowEditor /></ProtectedRoute>} />
              <Route path="/workflows/float-supplier-order" element={<ProtectedRoute><FloatSupplierOrder /></ProtectedRoute>} />
              <Route path="/workflows/print/:id" element={<ProtectedRoute><WorkflowPrintPreview /></ProtectedRoute>} />
              <Route path="/workflows/universal-finder" element={<ProtectedRoute><UniversalFinder /></ProtectedRoute>} />
              <Route path="/workflows/finder" element={<ProtectedRoute><UniversalFinder /></ProtectedRoute>} />
              <Route path="/workflows/ai-assistant" element={<ProtectedRoute><SmartAssistant /></ProtectedRoute>} />
              <Route path="/storage" element={<ProtectedRoute><StorageDirectory /></ProtectedRoute>} />
              <Route path="/vault" element={<ProtectedRoute><CorporateVault /></ProtectedRoute>} />
              <Route path="/vault/:folderId" element={<ProtectedRoute><CorporateVault /></ProtectedRoute>} />
              <Route path="/manuals" element={<Navigate to="/catalog/manuals" replace />} />
              <Route path="/manuals/:id" element={<RedirectToManual />} />

              <Route path="/forms" element={<ProtectedRoute><FormsDirectory /></ProtectedRoute>} />
              <Route path="/forms/calibration-lab" element={<ProtectedRoute><CalibrationLab /></ProtectedRoute>} />
              <Route path="/forms/:id" element={<ProtectedRoute><FormEditor /></ProtectedRoute>} />

              {/* Reports */}
              <Route path="/reports" element={<ProtectedRoute requiredModule="reports"><Reports /></ProtectedRoute>} />
              <Route path="/gst-reporting" element={<ProtectedRoute><GstReporting /></ProtectedRoute>} />
              <Route path="/accounts/bills" element={<ProtectedRoute><BillsPortal /></ProtectedRoute>} />

              <Route path="/todo" element={<ProtectedRoute><TodoList /></ProtectedRoute>} />

              {/* Notes Module */}
              <Route path="/notes" element={<ProtectedRoute><NotesDirectory /></ProtectedRoute>} />
              <Route path="/notes/:id" element={<ProtectedRoute><NoteForm /></ProtectedRoute>} />
              <Route path="/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
              <Route path="/scanner" element={<ProtectedRoute><ScannerModule /></ProtectedRoute>} />
              <Route path="/scan-gateway" element={<ProtectedRoute><ScanGateway /></ProtectedRoute>} />
              <Route path="/tools/ocr" element={<ProtectedRoute><SmartOCR /></ProtectedRoute>} />
              <Route path="/tools/email-composer" element={<ProtectedRoute><EmailComposer /></ProtectedRoute>} />
              <Route path="/tools/converter" element={<ProtectedRoute><Converter /></ProtectedRoute>} />
              <Route path="/converter" element={<ProtectedRoute><Converter /></ProtectedRoute>} />
              <Route path="/tools/locator" element={<ProtectedRoute><LiveLocator /></ProtectedRoute>} />
              <Route path="/tools" element={<ProtectedRoute><Tools /></ProtectedRoute>} />

              <Route path="/messaging" element={<ProtectedRoute><MessagingHub /></ProtectedRoute>} />
              <Route path="/commercial-wall" element={<ProtectedRoute><CommercialWallPage /></ProtectedRoute>} />

              {/* Settings (Accessible to all for personal tools, admins see more) */}
              <Route path="/settings" element={<ProtectedRoute><ModuleSettings /></ProtectedRoute>} />
              
              {/* Admin Tools */}
              <Route path="/admin/apks" element={<ProtectedRoute><ApkManagement /></ProtectedRoute>} />
              <Route path="/admin/logs" element={<ProtectedRoute><ActivityLogs /></ProtectedRoute>} />

              {/* Direct APK Download Redirect (Handles /apks/scanner etc) */}
              <Route path="/apks/:identifier" element={<ApkDownloadHandler />} />

              {/* Help Center */}
              <Route path="/help" element={<ProtectedRoute><HelpCenter /></ProtectedRoute>} />

              {/* Fallback */}
              <Route path="*" element={<div style={{ textAlign: 'center', marginTop: '100px' }}><h1>Working on this feature...</h1></div>} />
              </Routes>
            )}
          </AppLayout>
        } />
      </Routes>
    </AuthProvider>
  );
}

/**
 * Component to handle direct APK downloads from URLs
 */
function ApkDownloadHandler() {
  const { identifier } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    // Standardize input (remove file extension if present)
    const id = identifier.replace('.apk', '');
    downloadApkByIdentifier(id);
    
    // Redirect back to dashboard after a short delay
    const timer = setTimeout(() => {
      navigate('/', { replace: true });
    }, 1500);
    
    return () => clearTimeout(timer);
  }, [identifier, navigate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
      <div className="glass-panel" style={{ padding: '40px', borderRadius: '24px', textAlign: 'center' }}>
        <Smartphone size={48} color="var(--accent)" className="animate-bounce" style={{ margin: '0 auto 24px' }} />
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '8px' }}>Processing Download</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Connecting to secure APK storage...</p>
      </div>
    </div>
  );
}

export default App;
