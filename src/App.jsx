import { Routes, Route, useParams, useNavigate, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Smartphone } from 'lucide-react';
import { downloadApkByIdentifier } from './lib/driveService';
// Build cache invalidation: v1.0.1
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import GDriveConnectionTray from './components/common/GDriveConnectionTray';
import Dashboard from './pages/Dashboard';
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
import JobsDashboard from './pages/workflows/JobsDashboard';
import EnquiryList from './pages/workflows/EnquiryList';
import WorkflowEditor from './pages/workflows/WorkflowEditor';
import StatementOfAccount from './pages/workflows/StatementOfAccount';
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
import SmartOCR from './pages/tools/SmartOCR';
import Converter from './pages/tools/Converter';
import LiveLocator from './pages/tools/LiveLocator';
import HelpCenter from './pages/HelpCenter';
import FormsDirectory from './pages/FormsDirectory';
import FormEditor from './pages/FormEditor';
import CalibrationLab from './pages/CalibrationLab';
import SmartAssistant from './pages/workflows/SmartAssistant';
import FloatSupplierOrder from './pages/workflows/FloatSupplierOrder';
import CommercialWallPage from './pages/CommercialWallPage';
import SearchResults from './pages/SearchResults';
import ApkManagement from './pages/admin/ApkManagement';
import ActivityLogs from './pages/admin/ActivityLogs';
import BillsPortal from './pages/accounts/BillsPortal';
import UploadMediaGateway from './pages/workflows/UploadMediaGateway';


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

  // Auth routes shouldn't show the main layout
  if (!user) {
    return children;
  }

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-layout">
        <Header />
        <main className="main-content">
          {children}
        </main>
        <GDriveConnectionTray />
      </div>
    </div>
  );
};

import { Toaster } from 'react-hot-toast';

function App() {
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
            {import.meta.env.VITE_CATALOG_ONLY === 'true' ? (
              <Routes>
                <Route path="/" element={<ProtectedRoute requiredModule="catalog"><CatalogDirectory /></ProtectedRoute>} />
                <Route path="/catalog" element={<ProtectedRoute requiredModule="catalog"><CatalogDirectory /></ProtectedRoute>} />
                <Route path="/catalog/system/:id" element={<ProtectedRoute requiredModule="catalog"><SystemForm /></ProtectedRoute>} />
                <Route path="/catalog/:id" element={<ProtectedRoute requiredModule="catalog"><CatalogForm /></ProtectedRoute>} />
                <Route path="/catalog/labels" element={<ProtectedRoute requiredModule="catalog"><PrintLabels /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            ) : (
              <Routes>
              {/* Base Dashboard (Accessible if logged in and active, handled by wildcard ProtectedRoute) */}
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
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
              <Route path="/catalog/:id" element={<ProtectedRoute requiredModule="catalog"><CatalogForm /></ProtectedRoute>} />
              <Route path="/catalog/labels" element={<ProtectedRoute requiredModule="catalog"><PrintLabels /></ProtectedRoute>} />

              {/* Workflows & Universal Finder Module */}
              <Route path="/unified-supplier-hub" element={<ProtectedRoute><UnifiedSupplierHub /></ProtectedRoute>} />
              <Route path="/workflows/jobs-dashboard" element={<ProtectedRoute><JobsDashboard /></ProtectedRoute>} />
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
              <Route path="/manuals" element={<ProtectedRoute><ManualsDirectory /></ProtectedRoute>} />
              <Route path="/manuals/:id" element={<ProtectedRoute><ManualForm /></ProtectedRoute>} />

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
              <Route path="/tools/ocr" element={<ProtectedRoute><SmartOCR /></ProtectedRoute>} />
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
