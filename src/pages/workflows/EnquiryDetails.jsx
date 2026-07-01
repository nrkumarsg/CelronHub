import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { updateEnquiry, shortlistSupplierQuote } from '../../lib/workflowService';
import { convertEnquiryToV2Document } from '../../lib/workflowV2Service';
import toast from 'react-hot-toast';

import { getPartners, getDocumentSettings, saveVessel, saveWorkLocation } from '../../lib/store';
import { getCatalogItems, createCatalogItem, updateCatalogItem } from '../../lib/catalogService';
import { ArrowLeft, ArrowRight, Send, Ship, Mail, Phone, ExternalLink, Database, FolderPlus, ArrowRightLeft, FileText, CheckCircle2, Clock, DollarSign, BadgeDollarSign, ShieldCheck, Plus, Search, Trash, Save, Edit, AlertTriangle, Users, Eye, MailCheck, Download, Calendar, ChevronDown, PlusCircle, MapPin, MessageSquare, Sparkles, Building2, Upload, ImageIcon, Copy, Loader2, Hash, X, Crop as CropIcon, QrCode, ClipboardList, Inbox, Package, FolderOpen, Folder, File, RefreshCw, Smartphone } from 'lucide-react';
import UploadOverlay from '../../components/common/UploadOverlay';
import SafeDriveLink from '../../components/common/SafeDriveLink';
import EmailPreviewModal from '../../components/workflows/EmailPreviewModal';
import FastFloatModal from '../../components/workflows/FastFloatModal';
import html2pdf from 'html2pdf.js';
import { buildRFQMailtoUrl, buildRFQWhatsAppUrl, buildQuotationMailtoUrl, openEmailUrl } from '../../lib/enquiryEmailService';
import { listFolderContent, deleteFile, getOrCreateFolder, uploadFileToDrive, provisionEnquiryFolderStructure } from '../../lib/driveService';
import { getStoredToken } from '../../lib/googleAuthService';

import { useEnquiry } from '../../hooks/useEnquiry';
import { useSupplierActions } from '../../hooks/useSupplierActions';
import DocumentManager from '../../components/workflows/DocumentManager';
import RichTextEditor from '../../components/common/RichTextEditor';
import CommunicationWall from '../../components/common/CommunicationWall';
import { ITEM_UNITS } from '../../utils/units';
import { WhatsAppShareModal } from '../../components/workflow/WhatsAppShareModal';
import { Modal, QuickPartnerContactDualAdd } from '../../components/workflow/QuickAddForms';
import SmartEnquiryParserModal from '../../components/workflow/SmartEnquiryParserModal';
import SmartOCRModal from '../../components/common/SmartOCRModal';

export default function EnquiryDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { profile } = useAuth();

    // Core Logic Hooks
    const {
        enquiry, setEnquiry, catalog, selectedItems, setSelectedItems,
        loading, isSavingNewItem,
        handleAddItem, handleUpdateItem, handleRemoveItem, handleUpdateHeader, setCatalog, refresh: refreshEnquiry
    } = useEnquiry(profile?.company_id, id);
    const [supplierSearch, setSupplierSearch] = useState('');
    const [editingPartnerId, setEditingPartnerId] = useState(null);
    const [editingContactId, setEditingContactId] = useState(null);
    const [addingContactToPartnerId, setAddingContactToPartnerId] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [supplierModalOpen, setSupplierModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);

    // Gallery / Photos states
    const [galleryFiles, setGalleryFiles] = useState([]);
    const [loadingGallery, setLoadingGallery] = useState(false);
    const [galleryUploadProgress, setGalleryUploadProgress] = useState(0);
    const [galleryUploadSuccess, setGalleryUploadSuccess] = useState(false);
    const [galleryFolderId, setGalleryFolderId] = useState(null);
    const [isDraggingPhotos, setIsDraggingPhotos] = useState(false);
    const [showGalleryOCRModal, setShowGalleryOCRModal] = useState(false);

    const {
        suppliers,
        selectedSuppliers,
        setSelectedSuppliers,
        supplierContacts,
        recipientOverrides,
        setRecipientOverrides,
        isFloating,
        isSavingContact,
        fetchSuppliers,
        handleToggleSupplier,
        handleUpdateRecipientOverride,
        handleSaveNewContact,
        handleUpdatePartner,
        handleUpdateContact,
        handleDeleteContact,
        handleCreatePartner,
        handleDeletePartner,
        handleFloatQuotation,
        trackRFQFloat
    } = useSupplierActions(profile?.company_id, id, enquiry);

    const [showNewSupplierForm, setShowNewSupplierForm] = useState(false);
    const [searchParams] = useSearchParams();

    // Local UI State
    const [settings, setSettings] = useState(null);
    const [driveLink, setDriveLink] = useState('');
    const [showLinkInput, setShowLinkInput] = useState(false);
    const [supplierQuotes, setSupplierQuotes] = useState([]);
    const [vessels, setVessels] = useState([]);
    const [locations, setLocations] = useState([]);
    const [allPartners, setAllPartners] = useState([]);
    const [isConverting, setIsConverting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadLink, setUploadLink] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCatalogList, setShowCatalogList] = useState(false);
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [emailPreviewData, setEmailPreviewData] = useState(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showNewVesselModal, setShowNewVesselModal] = useState(false);
    const [showNewLocationModal, setShowNewLocationModal] = useState(false);
    const [editingCatalogItem, setEditingCatalogItem] = useState(null);
    const [newItemForm, setNewItemForm] = useState({ name: '', specification: '' });
    const [whatsappShareModal, setWhatsappShareModal] = useState({ isOpen: false });
    const [isOCRLoading, setIsOCRLoading] = useState(false);
    const [showOCRModal, setShowOCRModal] = useState(false);

    // ─── Paste-in parser ─────────────────────────────────────────────────────
    const [pasteText, setPasteText] = useState('');
    const [showPastePanel, setShowPastePanel] = useState(false);
    const [parsedPreview, setParsedPreview] = useState([]);
    const [showParsedPreview, setShowParsedPreview] = useState(false);

    // ─── Float RFQ (detail page FAB) ─────────────────────────────────────────
    const [isFloatRFQOpen, setIsFloatRFQOpen] = useState(false);

    // ─── QR Code ─────────────────────────────────────────────────────────────
    const [showQrPanel, setShowQrPanel] = useState(false);
    const [qrUrl, setQrUrl] = useState('');

    // ─── Supplier Quote Log ───────────────────────────────────────────────────
    const [showQuoteLogPanel, setShowQuoteLogPanel] = useState(false);
    const [quoteLogForm, setQuoteLogForm] = useState({ supplier_name: '', unit_price: '', currency: 'SGD', lead_time: '', remarks: '', quote_date: new Date().toISOString().split('T')[0] });
    const [isSavingQuoteLog, setIsSavingQuoteLog] = useState(false);
    const [localQuoteLogs, setLocalQuoteLogs] = useState([]);

    // --- Tabs and Explorer States ---
    const [activeTab, setActiveTab] = useState('items');
    const [explorerFiles, setExplorerFiles] = useState([]);
    const [loadingExplorer, setLoadingExplorer] = useState(false);
    const [explorerError, setExplorerError] = useState(null);
    const [explorerPath, setExplorerPath] = useState([]); // [{id, name}]
    const [explorerFolderId, setExplorerFolderId] = useState(null);
    const [isDraggingExplorer, setIsDraggingExplorer] = useState(false);
    const [uploadingExplorer, setUploadingExplorer] = useState(false);
    const [authStatus, setAuthStatus] = useState('disconnected'); // 'connected' | 'expired' | 'disconnected'

    // Sync supplierQuotes to localQuoteLogs (fix legacy bug)
    useEffect(() => {
        if (supplierQuotes && supplierQuotes.length > 0) {
            setLocalQuoteLogs(supplierQuotes);
        }
    }, [supplierQuotes]);

    // Check Drive Connection Status
    useEffect(() => {
        const checkAuth = () => {
            const token = getStoredToken();
            if (token) {
                setAuthStatus('connected');
            } else {
                setAuthStatus('disconnected');
            }
        };
        checkAuth();
    }, []);

    // Set initial explorer path when enquiry is loaded
    useEffect(() => {
        if (enquiry?.gdrive_folder_id) {
            setExplorerFolderId(enquiry.gdrive_folder_id);
            setExplorerPath([{ id: enquiry.gdrive_folder_id, name: enquiry.enquiry_no || 'Enquiry Root' }]);
        }
    }, [enquiry]);

    // Auto-fetch gallery files when switching to photos tab
    useEffect(() => {
        if (activeTab === 'photos' && enquiry?.gdrive_folder_id) {
            fetchGallery();
        }
    }, [activeTab, enquiry?.gdrive_folder_id]);

    const fetchGallery = async () => {
        if (!enquiry?.gdrive_folder_id) return;
        setLoadingGallery(true);
        try {
            const token = getStoredToken();
            const rootId = enquiry.gdrive_folder_id;
            const mediaFolderId = await getOrCreateFolder(token, 'Photos & Gallery', rootId);
            setGalleryFolderId(mediaFolderId);
            const files = await listFolderContent(token, mediaFolderId);
            setGalleryFiles(files.filter(f => f.mimeType.startsWith('image/') || f.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)));
        } catch (err) {
            console.error('Error fetching gallery:', err);
        } finally {
            setLoadingGallery(false);
        }
    };

    const handleGalleryUpload = async (file) => {
        if (!file) return;
        setLoadingGallery(true);
        setGalleryUploadProgress(0);
        setGalleryUploadSuccess(false);
        try {
            const token = getStoredToken();
            const rootId = await ensureEnquiryFolder();
            if (!rootId) throw new Error("Could not provision or find Google Drive folder.");
            const mediaFolderId = await getOrCreateFolder(token, 'Photos & Gallery', rootId);
            
            await uploadFileToDrive(token, file, { 
                folderId: mediaFolderId,
                onProgress: (pct) => setGalleryUploadProgress(pct)
            });
            
            setGalleryUploadSuccess(true);
            setTimeout(() => setGalleryUploadSuccess(false), 3000);
            fetchGallery();
        } catch (err) {
            console.error('Gallery upload failed:', err);
            toast.error('Upload failed: ' + err.message);
        } finally {
            setLoadingGallery(false);
            setGalleryUploadProgress(0);
        }
    };

    // Auto-fetch files when switching to explorer tab
    useEffect(() => {
        if (activeTab === 'explorer' && explorerFolderId) {
            fetchExplorerFiles(explorerFolderId, true);
        }
    }, [activeTab, explorerFolderId]);

    useEffect(() => {
        if (profile?.company_id) {
            fetchLookups();
            fetchSuppliers();
        }
    }, [profile]);

    useEffect(() => {
        if (enquiry) {
            if (enquiry.gdrive_file_link) {
                setDriveLink(enquiry.gdrive_file_link);
            }
            
            // Smart Defaults for missing fields
            const updates = {};
            if (!enquiry.enquiry_date) {
                updates.enquiry_date = new Date().toISOString().split('T')[0];
            }
            if (!enquiry.due_date) {
                const baseDate = enquiry.enquiry_date ? new Date(enquiry.enquiry_date) : new Date();
                updates.due_date = new Date(baseDate.getTime() + 86400000).toISOString().split('T')[0];
            }
            if (!enquiry.customer_ref && enquiry.enquiry_no) {
                updates.customer_ref = enquiry.enquiry_no === 'Draft' ? 'Ref: Enquiry' : `Ref: ${enquiry.enquiry_no}`;
            }
            
            if (Object.keys(updates).length > 0) {
                handleUpdateHeader(updates);
            }
        }
    }, [enquiry]);

    const fetchLookups = async () => {
        try {
            const [settingsData, quoteRes, vesselsData, locationsData, partnersData] = await Promise.all([
                getDocumentSettings(),
                import('../../lib/workflowService').then(m => m.getSupplierQuotes(id)),
                import('../../lib/store').then(m => m.getVessels()),
                import('../../lib/store').then(m => m.getWorkLocations()),
                import('../../lib/store').then(m => m.getPartners())
            ]);
            if (settingsData) setSettings(settingsData);
            if (quoteRes.data) setSupplierQuotes(quoteRes.data);
            if (vesselsData) setVessels(vesselsData);
            if (locationsData) setLocations(locationsData);
            if (partnersData) setAllPartners(partnersData);
        } catch (err) {
            console.error("Failed to load secondary lookups", err);
        }
    };

    // --- Explorer Tab Helpers ---
    const fetchExplorerFiles = async (folderId = null, forceRoot = false) => {
        const targetId = folderId || explorerFolderId;
        if (!targetId) return;

        setLoadingExplorer(true);
        setExplorerError(null);
        try {
            const token = getStoredToken();
            if (!token) {
                setAuthStatus('disconnected');
                throw new Error("Google Drive connection expired or not set. Please reconnect.");
            }
            setAuthStatus('connected');
            let files = await listFolderContent(token, targetId);
            setExplorerFiles(files);
        } catch (err) {
            console.error('Error fetching explorer files:', err);
            setExplorerError(err.message || 'Failed to load files from Google Drive.');
        } finally {
            setLoadingExplorer(false);
        }
    };

    const handleExplorerNavigate = (file) => {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
            const newPath = [...explorerPath, { id: file.id, name: file.name }];
            setExplorerPath(newPath);
            setExplorerFolderId(file.id);
            fetchExplorerFiles(file.id, false);
        }
    };

    const handleExplorerBack = (idx) => {
        if (idx < 0 || idx >= explorerPath.length) return;
        const newPath = explorerPath.slice(0, idx + 1);
        const target = newPath[newPath.length - 1];
        setExplorerPath(newPath);
        setExplorerFolderId(target.id);
        fetchExplorerFiles(target.id, newPath.length === 1);
    };

    const handleExplorerUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setUploadingExplorer(true);
        setUploadProgress(0);
        try {
            const token = getStoredToken();
            const rootId = await ensureEnquiryFolder();
            if (!rootId) throw new Error("Could not provision or find Google Drive folder.");

            for (let i = 0; i < files.length; i++) {
                await uploadFileToDrive(token, files[i], { folderId: rootId });
                setUploadProgress(((i + 1) / files.length) * 100);
            }
            toast.success("File(s) uploaded successfully!");
            fetchExplorerFiles(rootId, explorerPath.length === 1);
        } catch (err) {
            console.error('Upload error:', err);
            toast.error(err.message || 'Failed to upload files.');
        } finally {
            setUploadingExplorer(false);
            setUploadProgress(0);
        }
    };

    const handleExplorerDelete = async (fileId, fileName) => {
        if (!window.confirm(`Are you sure you want to delete "${fileName}"?`)) return;
        setLoadingExplorer(true);
        try {
            const token = getStoredToken();
            await deleteFile(token, fileId);
            toast.success("File deleted successfully!");
            fetchExplorerFiles(explorerFolderId, explorerPath.length === 1);
        } catch (err) {
            console.error('Delete error:', err);
            toast.error('Failed to delete file.');
        } finally {
            setLoadingExplorer(false);
        }
    };

    const ensureEnquiryFolder = async () => {
        if (explorerFolderId) return explorerFolderId;
        if (enquiry?.gdrive_folder_id) {
            setExplorerFolderId(enquiry.gdrive_folder_id);
            return enquiry.gdrive_folder_id;
        }

        // Provision folder structure if GDrive is connected
        const token = getStoredToken();
        if (!token) {
            toast.error("Please connect Google Drive first.");
            return null;
        }

        setLoadingExplorer(true);
        try {
            const settings = await getDocumentSettings();
            let celronRootId = settings?.gdrive_celron_root_id;
            if (!celronRootId) {
                let parentId = settings?.google_drive_folder_id || 'root';
                if (parentId.includes('drive.google.com')) {
                    const match = parentId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || parentId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (match) parentId = match[1];
                    else parentId = 'root';
                }
                celronRootId = await getOrCreateFolder(token, 'CELRONHUB', parentId);
                const { saveDocumentSettings } = await import('../../lib/store');
                await saveDocumentSettings({
                    ...settings,
                    gdrive_celron_root_id: celronRootId
                });
            }

            const year = `YEAR${new Date().getFullYear()}`;
            const partner = allPartners.find(c => c.id === enquiry.customer_id)?.name || 'Unknown Partner';
            const enq_no = enquiry.enquiry_no === 'Draft' ? 'NEW' : enquiry.enquiry_no;
            const vesselName = vessels.find(v => v.id === enquiry.vessel_id)?.vessel_name || '';
            const locationName = locations.find(l => l.id === enquiry.work_location_id)?.location_name || '';
            const suffix = vesselName || locationName || '';
            const folderTitle = suffix ? `${enq_no} - ${partner} - ${suffix}` : `${enq_no} - ${partner}`;
            const cleanTitle = folderTitle.replace(/[/\\?%*:|"<>]/g, '-');

            const result = await provisionEnquiryFolderStructure(token, celronRootId, year, cleanTitle);
            const folderId = result?.enqFolderId;
            if (folderId) {
                await updateEnquiry(id, { 
                    gdrive_folder_id: folderId,
                    gdrive_file_link: result.webViewLink
                });
                setEnquiry(prev => ({ ...prev, gdrive_folder_id: folderId, gdrive_file_link: result.webViewLink }));
                setExplorerFolderId(folderId);
                setExplorerPath([{ id: folderId, name: enquiry.enquiry_no || 'Enquiry Root' }]);
                toast.success("Google Drive folder provisioned!");
                return folderId;
            }
        } catch (e) {
            console.error("Manual provisioning failed:", e);
            toast.error("Failed to provision folder: " + e.message);
        } finally {
            setLoadingExplorer(false);
        }
        return null;
    };

    const handleExplorerReconnect = () => {
        sessionStorage.setItem('google_auth_return_url', window.location.pathname + window.location.search);
        connectGoogleAPI();
    };

    const getExplorerFileIcon = (mimeType) => {
        if (mimeType === 'application/vnd.google-apps.folder') {
            return <Folder size={24} color="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />;
        }
        if (mimeType?.includes('pdf')) {
            return <FileText size={24} color="#ef4444" />;
        }
        if (mimeType?.includes('image')) {
            return <ImageIcon size={24} color="#3b82f6" />;
        }
        if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel') || mimeType?.includes('csv')) {
            return <FileText size={24} color="#10b981" />;
        }
        return <File size={24} color="#64748b" />;
    };

    const handlePrepareFloat = () => {
        if (selectedSuppliers.length === 0) return alert("Select at least one supplier.");
        if (selectedItems.length === 0) return alert("Add at least one item from the catalog.");

        const toVal = selectedSuppliers.map(s => {
            const override = recipientOverrides[s.id];
            return override?.email || s.email1;
        }).filter(e => e).join('; ');

        const subjectVal = `Request for Quotation: ${enquiry?.enquiry_no || 'Draft'} - CELRON ENTERPRISES`;

        let itemRows = selectedItems.map((item, idx) => {
            const specPrefix = item.specification ? `\n   - Spec: ${item.specification.substring(0, 100)}${item.specification.length > 100 ? '...' : ''}` : '';
            return `${idx + 1}. ${item.name} (${item.qty} ${item.unit || 'pcs'})${specPrefix}`;
        }).join('\n\n');

        const greeting = selectedSuppliers.length === 1 
            ? `Dear ${recipientOverrides[selectedSuppliers[0].id]?.attn_name || 'Supplier'},\n\n`
            : `Dear Supplier,\n\n`;

        const gdriveNote = enquiry.gdrive_file_link ? `You can view photos and additional attachments here: ${enquiry.gdrive_file_link}\n\n` : '';
        const bodyVal = `${greeting}We are pleased to invite you to quote for the following items:\n\n${itemRows}\n\n${gdriveNote}Please revert with your best price and lead time at your earliest convenience.\n\nThank you,\nN.R.KUMAR HP:+65 97685891\nCELRON ENTERPRISES PTE LTD\n10, Jln, Besar,"Sim Lim Tower", #03-05, Singapore 208787\nEmail: sales@celron.net | Tel: +6597685891/81962270 Web : https://www.celron.net    / https://celron.shop`;

        setEmailPreviewData({
            to: toVal,
            cc: 'accounts@celron.net; acct.celron.sg@gmail.com',
            bcc: 'celron.simlim0305@gmail.com',
            subject: subjectVal,
            body: bodyVal,
            selectedSuppliers,
            supplierContacts,
            gdriveLink: enquiry.gdrive_file_link || 'https://drive.google.com/drive/folders/1Hr9-SFbjS-1pPIYu1kY57cRdc-1PVRij?usp=sharing',
            enquiryNo: enquiry?.enquiry_no,
            enquiryId: id,
            enquiryFolderId: enquiry.gdrive_folder_id
        });
    };

    const handleWhatsApp = () => {
        // Customer-facing WhatsApp — share enquiry summary with the customer
        const customer = allPartners.find(p => p.id === enquiry?.customer_id);
        if (!customer) {
            setWhatsappShareModal({ isOpen: true });
            return;
        }
        const waUrl = buildRFQWhatsAppUrl(enquiry, customer);
        if (!waUrl) {
            setWhatsappShareModal({ isOpen: true }); // Fallback to modal if no phone
            return;
        }
        window.open(waUrl, '_blank');
    };

    /**
     * handleEmailCustomer — opens a pre-filled mailto to send a quotation to the customer.
     * Called from the Quote2Cust button after a quotation has been generated.
     * @param {string} pdfUrl - optional GDrive link to the quotation PDF
     */
    const handleEmailCustomer = (pdfUrl = null) => {
        const customer = allPartners.find(p => p.id === enquiry?.customer_id);
        if (!customer) { toast.error('Customer not set on enquiry.'); return; }
        const url = buildQuotationMailtoUrl(
            { ...enquiry, document_no: enquiry.enquiry_no, enquiry_no: enquiry.enquiry_no },
            customer,
            settings,
            pdfUrl
        );
        openEmailUrl(url, 'Could not build email — check customer email address.');
    };


    const confirmFloat = async () => {
        const supplierIds = selectedSuppliers.map(s => s.id);
        const success = await trackRFQFloat(id, supplierIds, profile?.company_id);
        if (success) {
            setEmailPreviewData(null);
            refreshEnquiry();
        }
    };

    const updateDriveLink = async () => {
        try {
            await updateEnquiry(id, { gdrive_file_link: driveLink });
            setEnquiry({ ...enquiry, gdrive_file_link: driveLink });
            setShowLinkInput(false);
        } catch (error) {
            console.error('Failed to update storage link:', error);
            alert('Failed to update storage link');
        }
    };

    const handleConvertToV2 = async () => {
        if (!window.confirm("Convert this Enquiry to a Detailed Quotation for manual editing?")) return;
        setIsConverting(true);
        try {
            const doc = await convertEnquiryToV2Document(id, 'Quotation');
            navigate(`/workflows/editor/quotation/${doc.id}`);
        } catch (error) {
            console.error('Conversion Failed:', error);
            alert('Failed to convert to detailed document');
            setIsConverting(false);
        }
    };

    const handleConvertToOrder = async () => {
        if (!window.confirm("Convert this Enquiry to a Purchase Order?")) return;
        setIsConverting(true);
        try {
            const doc = await convertEnquiryToV2Document(id, 'Purchase Order');
            navigate(`/workflows/editor/purchase-order/${doc.id}`);
        } catch (error) {
            console.error('Order Conversion Failed:', error);
            alert('Failed to convert to Order');
            setIsConverting(false);
        }
    };
    const handleSaveVessel = async (vesselName) => {
        if (!vesselName) return;
        try {
            const data = await saveVessel({ vessel_name: vesselName, company_id: profile.company_id });
            setVessels(prev => [...prev, data].sort((a,b) => a.vessel_name.localeCompare(b.vessel_name)));
            handleUpdateHeader({ vessel_id: data.id });
            setShowNewVesselModal(false);
        } catch (err) {
            alert("Failed to save vessel");
        }
    };

    const handleSaveWorkLocation = async (locationName) => {
        if (!locationName) return;
        try {
            const data = await saveWorkLocation({ location_name: locationName, company_id: profile.company_id });
            setLocations(prev => [...prev, data].sort((a,b) => a.location_name.localeCompare(b.location_name)));
            handleUpdateHeader({ work_location_id: data.id });
            setShowNewLocationModal(false);
        } catch (err) {
            alert("Failed to save location");
        }
    };

    const handleSaveCatalogItem = async (e) => {
        e.preventDefault();
        try {
            let res;
            if (editingCatalogItem.id) {
                res = await updateCatalogItem(editingCatalogItem.id, editingCatalogItem);
            } else {
                res = await createCatalogItem({ ...editingCatalogItem, company_id: profile.company_id });
            }
            if (res.error) throw res.error;
            
            // Refresh catalog list
            const catRes = await getCatalogItems(1, 100, {}, '');
            if (catRes.data) setCatalog(catRes.data);
            
            setEditingCatalogItem(null);
        } catch (err) {
            alert("Failed to save catalog item: " + (err.message || err));
        }
    };


    // ─── Paste & Parse Items ──────────────────────────────────────────────────
    const handlePasteAndParse = () => {
        if (!pasteText.trim()) return;
        const lines = pasteText.split('\n').map(l => l.trim()).filter(Boolean);
        const parsed = [];
        lines.forEach((line) => {
            // Skip pure numeric lines (like item numbers alone)
            if (/^\d+\.?$/.test(line)) return;
            // Remove leading number prefix like "1." or "1)" or "(1)"
            const cleaned = line.replace(/^[\(]?\d+[\)\.]?\s*/, '').trim();
            if (!cleaned) return;
            // Try to detect qty pattern at end: "xxx - 2 pcs" or "xxx (qty:3)"
            let name = cleaned;
            let qty = '';
            let uom = 'pcs';
            const qtyMatch = cleaned.match(/[\s\-]+([\d.]+)\s*(pcs|sets?|nos?|units?|kgs?|mtrs?|rolls?|pairs?|lots?)?\s*$/i);
            if (qtyMatch) {
                qty = qtyMatch[1];
                uom = qtyMatch[2] || 'pcs';
                name = cleaned.substring(0, cleaned.lastIndexOf(qtyMatch[0])).trim();
            }
            parsed.push({ name, qty: qty || '1', uom, is_section: false, is_note: false });
        });
        setParsedPreview(parsed);
        setShowParsedPreview(true);
    };

    const handleConfirmParsedItems = () => {
        parsedPreview.forEach(item => handleAddItem({ name: item.name, quantity: item.qty, qty: item.qty, uom: item.uom, unit: item.uom }));
        setPasteText('');
        setParsedPreview([]);
        setShowParsedPreview(false);
        setShowPastePanel(false);
        toast.success(`${parsedPreview.length} item(s) added from paste!`);
    };

    // ─── QR Code ─────────────────────────────────────────────────────────────
    const handleShowQr = () => {
        const folderId = enquiry?.gdrive_folder_id;
        if (!folderId) { toast('No Drive folder linked to this enquiry yet. Save first.', { icon: '💡' }); return; }
        const driveLink = `https://drive.google.com/drive/folders/${folderId}`;
        setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(driveLink)}`);
        setShowQrPanel(true);
    };

    // ─── Log Supplier Quote ───────────────────────────────────────────────────
    const handleSaveQuoteLog = async () => {
        if (!quoteLogForm.supplier_name) { toast.error('Please enter a supplier name.'); return; }
        setIsSavingQuoteLog(true);
        try {
            const { supabase } = await import('../../lib/supabase');
            const logEntry = {
                enquiry_id: id,
                company_id: profile.company_id,
                ...quoteLogForm,
                unit_price: parseFloat(quoteLogForm.unit_price) || null
            };
            const { data, error } = await supabase.from('supplier_quotes').insert([logEntry]).select().single();
            if (error) throw error;
            setLocalQuoteLogs(prev => [...prev, data]);
            setQuoteLogForm({ supplier_name: '', unit_price: '', currency: 'SGD', lead_time: '', remarks: '', quote_date: new Date().toISOString().split('T')[0] });
            toast.success('Supplier quote logged!');
        } catch (err) {
            console.error(err);
            toast.error('Failed to save quote: ' + (err.message || 'Check if supplier_quotes table exists'));
        } finally {
            setIsSavingQuoteLog(false);
        }
    };

    const [isSavingMaster, setIsSavingMaster] = useState(false);
    const [attachment, setAttachment] = useState(null);

    const handleSaveMaster = async () => {
        if (!enquiry.customer_id) return alert("Please select a customer first.");
        
        setIsSavingMaster(true);
        try {
            const { createEnquiry, generateEnquiryNo } = await import('../../lib/workflowService');
            const { validateToken } = await import('../../lib/googleAuthService');
            
            let gdriveFileId = enquiry?.gdrive_file_id || null;
            let gdriveFileLink = enquiry?.gdrive_file_link || null;
            let projectFolderId = enquiry?.gdrive_folder_id || null;

            const accessToken = localStorage.getItem('google_access_token');
            const isValid = await validateToken(accessToken);

            if (attachment && (!accessToken || !isValid)) {
                const { connectGoogleAPI } = await import('../../lib/googleAuthService');
                if (window.confirm('You have selected an attachment but your Google connection has expired or is not connected. Connect now to upload?')) {
                    sessionStorage.setItem('google_auth_return_url', window.location.pathname + window.location.search);
                    connectGoogleAPI();
                    setIsSavingMaster(false);
                    return;
                }
            }

            // 1. Provision Folder Structure if needed
            if (accessToken && isValid && !projectFolderId) {
                try {
                    const { provisionEnquiryFolderStructure, getOrCreateFolder } = await import('../../lib/driveService');
                    const settings = await getDocumentSettings();
                    let celronRootId = settings?.gdrive_celron_root_id;
                    if (!celronRootId) {
                        let parentId = settings?.google_drive_folder_id || 'root';
                        if (parentId.includes('drive.google.com')) {
                            const match = parentId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || parentId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                            if (match) parentId = match[1];
                            else parentId = 'root';
                        }
                        celronRootId = await getOrCreateFolder(accessToken, 'CELRONHUB', parentId);
                        const { saveDocumentSettings } = await import('../../lib/store');
                        await saveDocumentSettings({
                            ...settings,
                            gdrive_celron_root_id: celronRootId
                        });
                    }
                    const topRootId = celronRootId;
                    if (topRootId) {
                        const year = `YEAR${new Date().getFullYear()}`;
                        const partner = allPartners.find(c => c.id === enquiry.customer_id)?.name || 'Unknown Partner';
                        const enq_no = enquiry.enquiry_no === 'Draft' ? 'NEW' : enquiry.enquiry_no;
                        const vesselName = vessels.find(v => v.id === enquiry.vessel_id)?.vessel_name || '';
                        const locationName = locations.find(l => l.id === enquiry.work_location_id)?.location_name || '';
                        const suffix = vesselName || locationName || '';
                        const folderTitle = suffix ? `${enq_no} - ${partner} - ${suffix}` : `${enq_no} - ${partner}`;
                        const cleanTitle = folderTitle.replace(/[/\\?%*:|"<>]/g, '-');
                        
                        const result = await provisionEnquiryFolderStructure(accessToken, topRootId, year, cleanTitle);
                        projectFolderId = result?.enqFolderId;
                        gdriveFileLink = result?.webViewLink;
                    }
                } catch (e) { console.error("Folder creation failed", e); }
            }

            // 2. Handle Attachment Upload (Option B - Upload directly to root folder)
            if (attachment && accessToken && isValid && projectFolderId) {
                const { uploadFileToDrive } = await import('../../lib/driveService');
                const uploadResult = await uploadFileToDrive(accessToken, attachment, {
                    folderId: projectFolderId,
                    title: attachment.name,
                    company_id: profile.company_id
                });
                gdriveFileId = uploadResult.id;
                gdriveFileLink = uploadResult.webViewLink;
            }

            const payload = {
                ...enquiry,
                company_id: profile.company_id,
                user_id: profile.id,
                catalog_items: selectedItems,
                gdrive_file_id: gdriveFileId,
                gdrive_file_link: gdriveFileLink,
                gdrive_folder_id: projectFolderId
            };

            // Sanitize UUID fields - force null if empty string
            const uuidFields = ['customer_id', 'contact_id', 'vessel_id', 'work_location_id'];
            uuidFields.forEach(field => {
                if (!payload[field] || payload[field] === '') {
                    payload[field] = null;
                }
            });

            // Remove non-schema fields
            const invalidColumns = ['vessels', 'work_locations', 'customer', 'contact', 'vessel_name', 'location_name'];
            invalidColumns.forEach(p => delete payload[p]);

            if (id === 'new') {
                const enq_no = await generateEnquiryNo(profile.company_id);
                payload.enquiry_no = enq_no;
                const { data, error } = await createEnquiry(payload);
                if (error) throw error;
                alert(`Enquiry ${enq_no} created successfully!`);
                navigate(`/workflows/enquiry/${data.id}`, { replace: true });
            } else {
                const { error } = await updateEnquiry(id, payload);
                if (error) throw error;
                alert("Changes saved successfully!");
                refreshEnquiry();
            }
        } catch (err) {
            console.error("Master Save Failed:", err);
            alert("Failed to save enquiry: " + (err.message || err));
        } finally {
            setIsSavingMaster(false);
        }
    };
    if (loading) return <div className="loading-state">Loading details...</div>;
    if (!enquiry) return <div className="page-container"><h2>Enquiry Not Found</h2></div>;

    return (
        <div className="page-container" style={{ background: '#f8fafc', minHeight: '100vh', padding: '24px' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* 1. Status Navigation Bar */}
            <div style={{ display: 'flex', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px', overflow: 'hidden' }}>
                {['New Enquiry', 'RFQ Floated', 'Quotation Sent', 'Job Created'].map((status) => (
                    <div 
                        key={status} 
                        style={{ 
                            flex: 1, 
                            textAlign: 'center', 
                            padding: '12px', 
                            borderRadius: '10px', 
                            fontSize: '0.85rem', 
                            fontWeight: 700,
                            background: enquiry?.status === status ? '#eff6ff' : 'transparent',
                            color: enquiry?.status === status ? '#3b82f6' : '#94a3b8',
                            position: 'relative',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            cursor: 'default'
                        }}
                    >
                        {status}
                        <div style={{ 
                            position: 'absolute', 
                            bottom: 0, 
                            left: enquiry.status === status ? '20%' : '50%', 
                            right: enquiry.status === status ? '20%' : '50%', 
                            height: '3px', 
                            background: '#3b82f6',
                            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                            opacity: enquiry.status === status ? 1 : 0,
                            borderRadius: '2px'
                        }} />
                    </div>
                ))}
            </div>

            {/* 2. Page Header Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Link to="/unified-supplier-hub" style={{ color: '#94a3b8', display: 'flex' }}><ArrowLeft size={20} /></Link>
                    <div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Enquiry</div>
                        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#4f46e5', margin: 0 }}>{enquiry.enquiry_no || 'Draft'}</h2>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button 
                        onClick={handleSaveMaster}
                        disabled={isSavingMaster}
                        className="btn btn-sm btn-primary" 
                        style={{ background: '#6366f1', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
                    >
                        {isSavingMaster ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                        {id === 'new' ? 'Create Enquiry' : 'Save'}
                    </button>
                    {id !== 'new' && (
                        <>
                            <button onClick={() => window.open(`/workflows/enquiry/print/${id}`, '_blank')} className="btn btn-sm btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Download size={14} /> Print</button>
                            <button onClick={() => setIsFloatRFQOpen(true)} className="btn btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 14px', fontWeight: 700, cursor: 'pointer' }}><Send size={14} /> Float RFQ</button>
                            <button onClick={handleWhatsApp} className="btn btn-sm btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#25D366', color: '#fff', border: 'none' }}><MessageSquare size={14} /> WhatsApp</button>
                            <button onClick={handleConvertToV2} className="btn btn-sm btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#6366f1', borderColor: '#6366f1' }}><ArrowRightLeft size={14} /> Quote2Cust</button>
                            <button onClick={handleConvertToOrder} className="btn btn-sm btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#059669', borderColor: '#059669' }}><BadgeDollarSign size={14} /> Order2Supp</button>
                            <button onClick={handleShowQr} className="btn btn-sm btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#0891b2', borderColor: '#0891b2' }} title="QR Code — Mobile file transfer"><QrCode size={14} /> QR</button>
                        </>
                    )}
                </div>
            </div>
            {/* QR Panel */}
            {showQrPanel && qrUrl && (
                <div style={{ background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: '12px', padding: '16px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                    <img src={qrUrl} alt="QR Drive Link" style={{ width: 90, height: 90, borderRadius: '8px' }} />
                    <div>
                        <div style={{ fontWeight: 700, color: '#164e63', marginBottom: '4px' }}>📱 Scan to open Enquiry Drive Folder on your mobile</div>
                        <div style={{ fontSize: '0.78rem', color: '#0e7490' }}>Use your phone camera to scan. Upload documents or photos directly from mobile to the enquiry folder.</div>
                        <button onClick={() => setShowQrPanel(false)} style={{ marginTop: '8px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}><X size={12} /> Close</button>
                    </div>
                </div>
            )}

            {/* 3. Info Grid (Enquiry Template) */}
            <div className="glass-panel" style={{ padding: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', marginBottom: '24px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                        <div className="form-group">
                            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6 }}>Customer *</label>
                            <div style={{ position: 'relative' }}>
                                <select 
                                    className="form-select"
                                    required
                                    value={enquiry.customer_id || ''}
                                    onChange={(e) => handleUpdateHeader({ customer_id: e.target.value, contact_id: '' })}
                                    style={{ width: '100%', borderRadius: '8px', padding: '10px 12px 10px 36px', appearance: 'none', background: '#f8fafc', border: '1px solid #e2e8f0', fontWeight: 600 }}
                                >
                                    <option value="">Select a customer...</option>
                                    {allPartners.filter(p => Array.isArray(p.types) && p.types.includes('Customer')).map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                <Building2 size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent)' }} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6 }}>Contact</label>
                            <div style={{ position: 'relative' }}>
                                <select 
                                    className="form-select"
                                    value={enquiry.contact_id || ''}
                                    onChange={(e) => handleUpdateHeader({ contact_id: e.target.value })}
                                    style={{ width: '100%', borderRadius: '8px', padding: '10px 12px 10px 36px', appearance: 'none', background: '#f8fafc', border: '1px solid #e2e8f0' }}
                                    disabled={!enquiry.customer_id}
                                >
                                    <option value="">{enquiry.customer_id ? 'Select a contact...' : 'Select a customer first...'}</option>
                                    {(allPartners.find(p => p.id === enquiry.customer_id)?.contacts || []).map(cnt => (
                                        <option key={cnt.id} value={cnt.id}>{cnt.name}</option>
                                    ))}
                                </select>
                                <Users size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6 }}>Mode of Enquiry</label>
                            <div style={{ position: 'relative' }}>
                                <select 
                                    className="form-select"
                                    value={enquiry.source_type || 'Email'}
                                    onChange={(e) => handleUpdateHeader({ source_type: e.target.value })}
                                    style={{ width: '100%', borderRadius: '8px', padding: '10px 12px 10px 36px', appearance: 'none', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#3b82f6', fontWeight: 600 }}
                                >
                                    <option value="Email">Email</option>
                                    <option value="WhatsApp">WhatsApp</option>
                                    <option value="Portal">Supplier Portal</option>
                                    <option value="Verbal">Verbal / Phone</option>
                                    <option value="Website">Website Form</option>
                                    <option value="Other">Other</option>
                                </select>
                                <Hash size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#3b82f6' }} />
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="form-group">
                            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6 }}>Subject / Project Notes</label>
                            <input 
                                type="text"
                                className="form-input"
                                value={enquiry?.customer_ref || ''}
                                onChange={(e) => handleUpdateHeader({ customer_ref: e.target.value })}
                                placeholder={enquiry.enquiry_no && enquiry.enquiry_no !== 'Draft' ? `Ref: ${enquiry.enquiry_no}` : "E.g. Spares for MV Brave..."}
                                style={{ borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px 12px' }}
                            />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div className="form-group">
                            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6 }}>Date</label>
                            <div style={{ position: 'relative' }}>
                                <input 
                                    type="date"
                                    value={enquiry.enquiry_date || new Date().toISOString().split('T')[0]}
                                    onChange={(e) => handleUpdateHeader({ enquiry_date: e.target.value })}
                                    style={{ width: '100%', borderRadius: '8px', padding: '8px 12px 8px 36px', background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                                />
                                <Calendar size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6 }}>Expiration / Due Date</label>
                            <div style={{ position: 'relative' }}>
                                <input 
                                    type="date"
                                    value={enquiry.due_date || (enquiry.enquiry_date ? new Date(new Date(enquiry.enquiry_date).getTime() + 86400000).toISOString().split('T')[0] : '')}
                                    onChange={(e) => handleUpdateHeader({ due_date: e.target.value })}
                                    style={{ width: '100%', borderRadius: '8px', padding: '8px 12px 8px 36px', background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.9rem', color: '#f97316' }}
                                />
                                <Clock size={16} color="#f97316" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                            </div>
                        </div>
                        <div className="form-group" style={{ gridColumn: 'span 2' }}>
                            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6 }}>Vessel / Service Location</label>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <select 
                                        className="form-select"
                                        value={enquiry.vessel_id || ''}
                                        onChange={(e) => {
                                            if (e.target.value === 'ADD_NEW') {
                                                setShowNewVesselModal(true);
                                            } else {
                                                handleUpdateHeader({ vessel_id: e.target.value });
                                            }
                                        }}
                                        style={{ width: '100%', borderRadius: '8px', padding: '10px 12px 10px 36px', appearance: 'none', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#10b981', fontWeight: 600 }}
                                    >
                                        <option value="">No Vessel</option>
                                        {vessels.map(v => (
                                            <option key={v.id} value={v.id}>{v.vessel_name}</option>
                                        ))}
                                    </select>
                                    <Ship size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#10b981' }} />
                                    <ChevronDown size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                                </div>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <select 
                                        className="form-select"
                                        value={enquiry.work_location_id || ''}
                                        onChange={(e) => {
                                            if (e.target.value === 'ADD_NEW') {
                                                setShowNewLocationModal(true);
                                            } else {
                                                handleUpdateHeader({ work_location_id: e.target.value });
                                            }
                                        }}
                                        style={{ width: '100%', borderRadius: '8px', padding: '10px 12px 10px 32px', appearance: 'none', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}
                                    >
                                        <option value="">General / Local</option>
                                        {locations.map(l => (
                                            <option key={l.id} value={l.id}>{l.location_name}</option>
                                        ))}
                                    </select>
                                    <Database size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                    <ChevronDown size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            {/* Main Action Tabs */}
            <div className="tab-container">
                <button type="button" className={`tab tab-items ${activeTab === 'items' ? 'active' : ''}`} onClick={() => setActiveTab('items')}>
                    <Package size={16} /> 1) Line Items
                </button>
                <button type="button" className={`tab tab-other ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>
                    <FolderPlus size={16} /> 2) Supplier Enquiry Upload
                </button>
                <button type="button" className={`tab tab-workflow ${activeTab === 'send' ? 'active' : ''}`} onClick={() => setActiveTab('send')}>
                    <Send size={16} /> 3) Enquiry Send
                </button>
                <button type="button" className={`tab tab-payments ${activeTab === 'quotes' ? 'active' : ''}`} onClick={() => setActiveTab('quotes')}>
                    <BadgeDollarSign size={16} /> 4) Quotations Received
                </button>
                <button type="button" className={`tab tab-gallery ${activeTab === 'photos' ? 'active' : ''}`} onClick={() => setActiveTab('photos')}>
                    <ImageIcon size={16} /> 5) Photos &amp; Media
                </button>
                <button type="button" className={`tab tab-explorer ${activeTab === 'explorer' ? 'active' : ''}`} onClick={() => setActiveTab('explorer')}>
                    <FolderOpen size={16} /> 6) Explorer
                </button>
            </div>

            {/* 4. Content Area — Enquiry Lines */}
            {activeTab === 'items' && (
                <div style={{ marginBottom: '24px' }} className="animate-fade-in">

                {/* ── Paste-in Quick Import Panel ── */}
                <div style={{ marginBottom: '12px' }}>
                    <button onClick={() => setShowPastePanel(!showPastePanel)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '10px', border: '1.5px dashed #6366f1', background: showPastePanel ? '#eef2ff' : '#fafafa', color: '#4f46e5', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s' }}>
                        <ClipboardList size={16} /> {showPastePanel ? 'Hide' : '📋 Paste-in Items'} — Quick import from email/PDF/WhatsApp text
                    </button>
                    {showPastePanel && (
                        <div style={{ marginTop: '8px', background: '#fff', border: '1.5px solid #c7d2fe', borderRadius: '14px', padding: '16px', boxShadow: '0 4px 8px rgba(99,102,241,0.08)' }}>
                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '8px', fontWeight: 600 }}>Paste your enquiry items below (one per line). Format: item name - quantity uom OR numbered list.</div>
                            <textarea
                                value={pasteText}
                                onChange={e => { setPasteText(e.target.value); setShowParsedPreview(false); }}
                                placeholder={`Example:\n1. Bilge pump impeller - 2 pcs\n2. Sea water strainer basket\n3. Shaft seal kit (type: XR-200) - 1 set\nHeat exchanger tube bundle - 4 nos`}
                                rows={8}
                                style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.85rem', fontFamily: 'monospace', lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box', color: '#1e293b' }}
                            />
                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', alignItems: 'center' }}>
                                <button onClick={handlePasteAndParse} style={{ padding: '9px 18px', borderRadius: '10px', background: '#6366f1', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>Parse & Preview Lines →</button>
                                <button onClick={() => { setPasteText(''); setParsedPreview([]); setShowParsedPreview(false); }} style={{ padding: '9px 14px', borderRadius: '10px', background: '#f1f5f9', color: '#64748b', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem' }}>Clear</button>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{pasteText.split('\n').filter(Boolean).length} line(s)</span>
                            </div>
                            {showParsedPreview && parsedPreview.length > 0 && (
                                <div style={{ marginTop: '14px', border: '1px solid #bbf7d0', borderRadius: '12px', background: '#f0fdf4', padding: '14px' }}>
                                    <div style={{ fontWeight: 700, color: '#065f46', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={16} /> {parsedPreview.length} items parsed — review below:</div>
                                    {parsedPreview.map((item, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px', background: '#fff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', width: '20px' }}>{i+1}</span>
                                            <input value={item.name} onChange={e => { const p = [...parsedPreview]; p[i].name = e.target.value; setParsedPreview(p); }} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', outline: 'none' }} />
                                            <input value={item.qty} onChange={e => { const p = [...parsedPreview]; p[i].qty = e.target.value; setParsedPreview(p); }} style={{ width: '50px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 6px', fontSize: '0.82rem', textAlign: 'center' }} />
                                            <input value={item.uom} onChange={e => { const p = [...parsedPreview]; p[i].uom = e.target.value; setParsedPreview(p); }} style={{ width: '55px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 6px', fontSize: '0.82rem' }} />
                                            <button onClick={() => setParsedPreview(parsedPreview.filter((_, ii) => ii !== i))} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}><X size={14} /></button>
                                        </div>
                                    ))}
                                    <button onClick={handleConfirmParsedItems} style={{ marginTop: '10px', padding: '10px 20px', borderRadius: '10px', background: '#10b981', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={16} /> Add {parsedPreview.length} Items to Enquiry Lines</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'visible', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</th>
                                    <th style={{ padding: '16px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', width: '100px' }}>Quantity</th>
                                    <th style={{ padding: '16px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', width: '100px' }}>UoM</th>
                                    <th style={{ padding: '16px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', width: '80px' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedItems.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                            <Database size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
                                            <p style={{ margin: 0, fontSize: '0.9rem' }}>No items added yet</p>
                                        </td>
                                    </tr>
                                ) : (
                                    selectedItems.map((item, idx) => (
                                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: item.is_section ? '#f8fafc' : 'transparent' }}>
                                            <td style={{ padding: '12px 16px' }}>
                                                {item.is_note ? (
                                                    <textarea 
                                                        style={{ width: '100%', border: 'none', background: 'transparent', fontWeight: 500, fontSize: '0.9rem', outline: 'none', color: '#1e293b', resize: 'vertical', minHeight: '40px', fontFamily: 'inherit' }}
                                                        value={item.description || item.name}
                                                        onChange={(e) => handleUpdateItem(idx, { description: e.target.value, name: e.target.value })}
                                                        placeholder="Note content..."
                                                        rows={2}
                                                    />
                                                ) : (
                                                    <input 
                                                        style={{ width: '100%', border: 'none', background: 'transparent', fontWeight: item.is_section ? 700 : 500, fontSize: '0.9rem', outline: 'none', color: item.is_section ? '#3b82f6' : '#1e293b' }}
                                                        value={item.description || item.name}
                                                        onChange={(e) => handleUpdateItem(idx, { description: e.target.value, name: e.target.value })}
                                                        placeholder={item.is_section ? "SECTION TITLE" : "Product name..."}
                                                    />
                                                )}
                                                {!item.is_section && !item.is_note && (
                                                    <textarea 
                                                        style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '0.75rem', color: '#64748b', outline: 'none', marginTop: '4px', resize: 'none' }}
                                                        value={item.details || item.specification}
                                                        onChange={(e) => handleUpdateItem(idx, { details: e.target.value, specification: e.target.value })}
                                                        placeholder="Add specifications..."
                                                        rows={1}
                                                    />
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                {!item.is_section && !item.is_note && (
                                                    <input 
                                                        type="number"
                                                        style={{ width: '60px', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px', fontSize: '0.9rem', textAlign: 'center' }}
                                                        value={item.quantity || item.qty}
                                                        onChange={(e) => handleUpdateItem(idx, { quantity: e.target.value, qty: e.target.value })}
                                                    />
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                {!item.is_section && !item.is_note && (
                                                    <input 
                                                        type="text" 
                                                        value={item.uom || item.unit || ''} 
                                                        onChange={(e) => handleUpdateItem(idx, { uom: e.target.value, unit: e.target.value })}
                                                        style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', textAlign: 'center', fontSize: '0.85rem' }}
                                                        placeholder="pcs"
                                                    />
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                <button 
                                                    onClick={() => handleRemoveItem(idx)}
                                                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', transition: 'color 0.2s' }}
                                                    onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                                                    onMouseOut={e => e.currentTarget.style.color = '#94a3b8'}
                                                >
                                                    <Trash size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                        
                        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button 
                                    onClick={() => handleAddItem({ name: '', unit_price: 0 })}
                                    style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <PlusCircle size={16} /> Add a product
                                </button>
                                <button 
                                    onClick={() => handleAddItem({ name: 'NEW SECTION', is_section: true })}
                                    style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                                >
                                    Add a section
                                </button>
                                <button 
                                    onClick={() => handleAddItem({ name: '', is_note: true })}
                                    style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                                >
                                    Add a note
                                </button>
                                <button 
                                    onClick={() => setShowOCRModal(true)}
                                    style={{ background: 'none', border: 'none', color: '#8b5cf6', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <Sparkles size={16} /> Image to Items
                                </button>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <div style={{ position: 'relative' }}>
                                    <button 
                                        onClick={() => setShowCatalogList(!showCatalogList)}
                                        style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 12px', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                    >
                                        <Database size={14} /> From Catalog <ChevronDown size={14} />
                                    </button>
                                    
                                     {showCatalogList && (
                                        <div style={{ position: 'absolute', bottom: '100%', right: 0, zIndex: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 -10px 15px -3px rgba(0,0,0,0.1)', marginBottom: '8px', minWidth: '800px', maxWidth: '90vw', maxHeight: '450px', display: 'flex', flexDirection: 'column' }}>
                                            <div style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '8px' }}>
                                                <div style={{ position: 'relative', flex: 1 }}>
                                                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                                    <input 
                                                        autoFocus
                                                        type="text"
                                                        placeholder="Search catalog..."
                                                        style={{ width: '100%', padding: '8px 8px 8px 32px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', outline: 'none' }}
                                                        value={searchQuery}
                                                        onChange={(e) => setSearchQuery(e.target.value)}
                                                    />
                                                </div>
                                                <button 
                                                    onClick={() => { setEditingCatalogItem({ name: searchQuery, specification: '', type: 'Supply' }); }}
                                                    className="btn btn-sm btn-primary"
                                                    style={{ padding: '0 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    <Plus size={16} /> New
                                                </button>
                                            </div>
                                            <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 1, borderBottom: '1.5px solid #cbd5e1' }}>
                                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Type</th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Item Name</th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Location</th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Qty</th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Price</th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Barcode</th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Specification</th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {catalog.filter(c => c.name?.toLowerCase().includes(searchQuery.toLowerCase()) || c.specification?.toLowerCase().includes(searchQuery.toLowerCase()) || c.barcode?.includes(searchQuery)).map(c => (
                                                            <tr 
                                                                key={c.id} 
                                                                onClick={() => { handleAddItem(c); setShowCatalogList(false); }}
                                                                style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer', transition: 'background 0.15s' }}
                                                                onMouseOver={e => e.currentTarget.style.background = '#eef2ff'}
                                                                onMouseOut={e => e.currentTarget.style.background = 'none'}
                                                            >
                                                                <td style={{ padding: '10px 12px' }}>
                                                                    <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, background: c.type?.toLowerCase().includes('service') ? '#faf5ff' : '#eff6ff', color: c.type?.toLowerCase().includes('service') ? '#6d28d9' : '#1d4ed8' }}>
                                                                        {c.type || 'Supply Part'}
                                                                    </span>
                                                                 </td>
                                                                 <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>{c.name}</td>
                                                                 <td style={{ padding: '10px 12px', color: '#64748b' }}>{c.stored_location || '—'}</td>
                                                                 <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>{c.qty ?? 0}</td>
                                                                 <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>${c.price || '0.00'}</td>
                                                                 <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b', fontFamily: 'monospace' }}>{c.barcode || '—'}</td>
                                                                 <td style={{ padding: '10px 12px', color: '#64748b', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.specification}>{c.specification || '—'}</td>
                                                                 <td style={{ padding: '10px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                                     <button 
                                                                         onClick={() => setEditingCatalogItem(c)}
                                                                         style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', padding: '4px' }}
                                                                     >
                                                                         <Edit size={14} />
                                                                     </button>
                                                                 </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <button 
                                    onClick={handleSaveMaster}
                                    disabled={isSavingMaster}
                                    className="btn btn-sm btn-primary" 
                                    style={{ background: '#6366f1', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    {isSavingMaster ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                                    {id === 'new' ? 'Create Enquiry' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Floating Module (Supplier Management) - Pinned to bottom of Line Items */}
                    <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', display: 'flex', flexDirection: 'column', marginTop: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>Floating Module</h4>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '10px' }}>Supplier Management</span>
                            </div>
                            <button 
                                onClick={() => { setEditingSupplier(null); setSupplierModalOpen(true); }}
                                className="btn-vibrant"
                                style={{ 
                                    padding: '6px 12px', 
                                    borderRadius: '10px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '6px',
                                    background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                                    border: 'none',
                                    color: 'white',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    fontSize: '0.8rem'
                                }}
                            >
                                <Plus size={14} /> Add Supplier
                            </button>
                        </div>

                        <div style={{ position: 'relative', marginBottom: '12px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input 
                                type="text"
                                placeholder="Search suppliers..."
                                value={supplierSearch}
                                onChange={(e) => setSupplierSearch(e.target.value)}
                                style={{ width: '100%', padding: '8px 8px 8px 32px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                            />
                        </div>
                        <div className="custom-scrollbar" style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase())).map(supplier => {
                                const isSelected = selectedSuppliers.some(s => s.id === supplier.id);
                                return (
                                    <div key={supplier.id} style={{ 
                                        border: isSelected ? '1px solid #6366f1' : '1px solid #f1f5f9', 
                                        borderRadius: '12px', 
                                        padding: '12px', 
                                        background: isSelected ? '#f8faff' : '#fff', 
                                        transition: 'all 0.2s'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={isSelected}
                                                    onChange={() => handleToggleSupplier(supplier)}
                                                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#6366f1' }}
                                                />
                                                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: isSelected ? '#4f46e5' : '#1e293b' }}>{supplier.name}</span>
                                            </label>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button onClick={() => { setEditingSupplier(supplier); setSupplierModalOpen(true); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><Edit size={14} /></button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <button onClick={() => setIsPreviewModalOpen(true)} className="btn btn-sm btn-outline" style={{ flex: 1 }}>Preview</button>
                            <button onClick={handlePrepareFloat} disabled={selectedSuppliers.length === 0} className="btn btn-sm btn-primary" style={{ flex: 1, background: '#4f46e5' }}>Float RFQ</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Supplier Quote Log Panel ── */}
            {activeTab === 'quotes' && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', marginBottom: '24px' }} className="animate-fade-in">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>Supplier Quotes Received</h4>
                            {localQuoteLogs.length > 0 && <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '20px', padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700 }}>{localQuoteLogs.length} quote(s)</span>}
                        </div>
                        <button onClick={() => setShowQuoteLogPanel(!showQuoteLogPanel)}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '10px', border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4f46e5', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                            <Plus size={14} /> Log Received Quote
                        </button>
                    </div>

                    {showQuoteLogPanel && (
                        <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', marginBottom: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                <div><label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>SUPPLIER NAME *</label>
                                    <input value={quoteLogForm.supplier_name} onChange={e => setQuoteLogForm(f => ({...f, supplier_name: e.target.value}))} placeholder="e.g. ABC Marine Pte Ltd" style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', boxSizing: 'border-box' }} /></div>
                                <div><label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>UNIT PRICE</label>
                                    <input type="number" value={quoteLogForm.unit_price} onChange={e => setQuoteLogForm(f => ({...f, unit_price: e.target.value}))} placeholder="0.00" style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', boxSizing: 'border-box' }} /></div>
                                <div><label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>CURRENCY</label>
                                    <select value={quoteLogForm.currency} onChange={e => setQuoteLogForm(f => ({...f, currency: e.target.value}))} style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem' }}>
                                        {['SGD','USD','EUR','GBP','MYR','AED'].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select></div>
                                <div><label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>LEAD TIME</label>
                                    <input value={quoteLogForm.lead_time} onChange={e => setQuoteLogForm(f => ({...f, lead_time: e.target.value}))} placeholder="e.g. 2 weeks" style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', boxSizing: 'border-box' }} /></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '10px', marginBottom: '10px' }}>
                                <div><label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>REMARKS / NOTES</label>
                                    <input value={quoteLogForm.remarks} onChange={e => setQuoteLogForm(f => ({...f, remarks: e.target.value}))} placeholder="Brand, part no, conditions, etc." style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', boxSizing: 'border-box' }} /></div>
                                <div><label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>QUOTE DATE</label>
                                    <input type="date" value={quoteLogForm.quote_date} onChange={e => setQuoteLogForm(f => ({...f, quote_date: e.target.value}))} style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', boxSizing: 'border-box' }} /></div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={handleSaveQuoteLog} disabled={isSavingQuoteLog} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', borderRadius: '10px', background: '#10b981', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                                    {isSavingQuoteLog ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Save Quote Log
                                </button>
                                <button onClick={() => setShowQuoteLogPanel(false)} style={{ padding: '9px 14px', borderRadius: '10px', background: '#f1f5f9', color: '#64748b', border: 'none', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>Cancel</button>
                            </div>
                        </div>
                    )}

                    {localQuoteLogs.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                            {localQuoteLogs.map((q, i) => (
                                <div key={i} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px' }}>
                                    <div style={{ fontWeight: 700, color: '#065f46', marginBottom: '4px' }}>{q.supplier_name}</div>
                                    {q.unit_price && <div style={{ fontSize: '0.82rem', color: '#374151' }}>Price: <strong>{q.currency} {q.unit_price}</strong></div>}
                                    {q.lead_time && <div style={{ fontSize: '0.82rem', color: '#374151' }}>Lead Time: {q.lead_time}</div>}
                                    {q.remarks && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>{q.remarks}</div>}
                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '6px' }}>{q.quote_date}</div>
                                </div>
                            ))}
                        </div>
                    )}
                    {localQuoteLogs.length === 0 && !showQuoteLogPanel && (
                        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0, fontStyle: 'italic' }}>No supplier quotes logged yet. Click "Log Received Quote" to add one.</p>
                    )}
                </div>
            )}

            {/* 6. Advanced Workflow Section (Full Width Notes & Comments) */}
            {activeTab === 'send' && (
                <div style={{ marginTop: '24px' }} className="animate-fade-in">
                    {/* Notes & Comments Section */}
                    <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', display: 'flex', flexDirection: 'column' }}>
                        <h4 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileText size={16} color="#3b82f6" /> Notes & Comments
                        </h4>
                        <RichTextEditor 
                            value={enquiry?.description || ''} 
                            onChange={(val) => handleUpdateHeader({ description: val })}
                            placeholder="Please submit your best competitive offer for the attached purchase inquiry by return."
                        />
                    </div>
                </div>
            )}



            {/* Standardized Upload Overlay */}
            <UploadOverlay 
                isVisible={uploadProgress > 0 || !!uploadLink} 
                progress={uploadProgress} 
                title="Uploading Quote..."
                locationLink={uploadLink}
                onClose={() => {
                    setUploadProgress(0);
                    setUploadLink(null);
                }}
            />
            {/* Enquiry Preview Modal */}
            {isPreviewModalOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '850px', maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                        <div style={{ padding: '24px 32px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ margin: 0, color: '#1e293b', fontSize: '1.25rem', fontWeight: 700 }}>RFQ Preview</h2>
                                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>{enquiry.enquiry_no} • {new Date().toLocaleDateString()}</p>
                            </div>
                            <button onClick={() => setIsPreviewModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer' }}>
                                <Plus size={20} style={{ transform: 'rotate(45deg)' }} color="#64748b" />
                            </button>
                        </div>
                        
                        <div id="rfq-preview-content" style={{ padding: '40px', overflowY: 'auto', flex: 1, background: '#fff' }}>
                            {/* Document Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px', borderBottom: '2px solid #f1f5f9', paddingBottom: '20px' }}>
                                <div style={{ maxWidth: '400px' }}>
                                    <h1 style={{ margin: 0, fontSize: '1.4rem', color: '#1e3a8a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.025em' }}>REQUEST FOR QUOTATION</h1>
                                    <p style={{ margin: '6px 0 0 0', color: '#64748b', fontSize: '0.95rem', fontWeight: 500 }}>Enquiry Ref: {enquiry.enquiry_no}</p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b' }}>CEL-RON ENTERPRISES PTE LTD</h3>
                                    <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.8rem', lineHeight: 1.4 }}>
                                        10, Jln, Besar, "Sim Lim Tower", #03-05, Singapore 208787<br />
                                        Phone: +65 8196 2270 | Email: sales@celron.net
                                    </p>
                                </div>
                            </div>

                            {/* Recipients Section */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                                {selectedSuppliers.map(s => {
                                    const override = recipientOverrides[s.id] || {};
                                    return (
                                        <div key={s.id} style={{ padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#1e293b', fontWeight: 700 }}>{s.name}</h4>
                                            <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.5 }}>
                                                <div style={{ marginBottom: '4px' }}>{override.address || s.address}</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                    <Mail size={12} /> {override.email || s.email1 || 'N/A'}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Phone size={12} /> {override.phone || s.phone || 'N/A'}
                                                </div>
                                            </div>
                                            {override.attn_name && (
                                                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1' }}>
                                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Attention To</div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>{override.attn_name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>{override.attn_phone} | {override.attn_email}</div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Items Table (Strictly No Prices) */}
                            <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', marginBottom: '30px', background: '#fff' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>PRODUCT / DESCRIPTION</th>
                                            <th style={{ padding: '14px 20px', textAlign: 'center', fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', width: '120px' }}>QUANTITY</th>
                                            <th style={{ padding: '14px 20px', textAlign: 'center', fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', width: '120px' }}>UNIT</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedItems.map((item, idx) => (
                                            <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '20px' }}>
                                                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '6px', fontSize: '0.95rem' }}>{idx + 1}. {item.name}</div>
                                                    <div style={{ fontSize: '0.85rem', color: '#64748b', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{item.specification || 'No specification provided'}</div>
                                                </td>
                                                <td style={{ padding: '20px', textAlign: 'center', fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>
                                                    {item.qty}
                                                </td>
                                                <td style={{ padding: '20px', textAlign: 'center', fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>
                                                    {item.unit || 'pcs'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Attachments Note */}
                            {enquiry.gdrive_file_link && (
                                <div style={{ padding: '16px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                    <FileText size={20} color="#3b82f6" style={{ marginTop: '2px' }} />
                                    <div>
                                        <div style={{ fontWeight: 700, color: '#1e40af', fontSize: '0.9rem' }}>Photos & Attachments Included</div>
                                        <div style={{ fontSize: '0.85rem', color: '#1e40af', opacity: 0.8, marginTop: '2px' }}>
                                            Suppliers will receive a link to the project folder to view technical drawings or photos.
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div style={{ marginTop: '40px', fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>
                                This is an electronically generated RFQ. No signature is required for quotation purposes.
                            </div>
                        </div>

                        <div style={{ padding: '24px 32px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottomLeftRadius: '20px', borderBottomRightRadius: '20px' }}>
                            <button onClick={() => setIsPreviewModalOpen(false)} className="btn btn-outline" style={{ background: '#fff' }}>Close</button>
                            
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button 
                                    onClick={async () => {
                                        setIsDownloading(true);
                                        const element = document.getElementById('rfq-preview-content');
                                        const opt = {
                                            margin: 10,
                                            filename: `RFQ_${enquiry.enquiry_no}.pdf`,
                                            image: { type: 'jpeg', quality: 0.98 },
                                            html2canvas: { scale: 2, useCORS: true, allowTaint: false, scrollX: 0, scrollY: 0 },
                                            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                                        };
                                        try {
                                            await html2pdf().set(opt).from(element).save();
                                        } finally {
                                            setIsDownloading(false);
                                        }
                                    }}
                                    disabled={isDownloading}
                                    className="btn btn-outline" 
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff' }}
                                >
                                    {isDownloading ? <><Clock size={16} className="animate-spin" /> Saving...</> : <><Download size={16} /> Download PDF</>}
                                </button>
                                
                                <button 
                                    onClick={() => { setIsPreviewModalOpen(false); handlePrepareFloat(); }} 
                                    disabled={selectedSuppliers.length === 0}
                                    className="btn btn-primary" 
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#4f46e5', borderColor: '#4f46e5' }}
                                >
                                    <MailCheck size={18} /> Send as RFQ Email
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Email Draft Preview Modal */}
            <EmailPreviewModal 
                isOpen={!!emailPreviewData}
                onClose={() => setEmailPreviewData(null)}
                onSent={confirmFloat}
                data={emailPreviewData || {}}
            />

            {/* Modals for Inline creation */}
            {showNewVesselModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Add New Vessel</h3>
                        <input 
                            autoFocus
                            type="text" 
                            className="form-input" 
                            placeholder="Vessel Name" 
                            style={{ width: '100%', marginBottom: '16px', padding: '10px' }}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveVessel(e.target.value); }}
                            id="newVesselName"
                        />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowNewVesselModal(false)} className="btn btn-outline">Cancel</button>
                            <button onClick={() => handleSaveVessel(document.getElementById('newVesselName').value)} className="btn btn-primary">Save Vessel</button>
                        </div>
                    </div>
                </div>
            )}

            {showNewLocationModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Add New Location</h3>
                        <input 
                            autoFocus
                            type="text" 
                            className="form-input" 
                            placeholder="Location Name" 
                            style={{ width: '100%', marginBottom: '16px', padding: '10px' }}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveWorkLocation(e.target.value); }}
                            id="newLocationName"
                        />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowNewLocationModal(false)} className="btn btn-outline">Cancel</button>
                            <button onClick={() => handleSaveWorkLocation(document.getElementById('newLocationName').value)} className="btn btn-primary">Save Location</button>
                        </div>
                    </div>
                </div>
            )}

            {editingCatalogItem && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <form onSubmit={handleSaveCatalogItem} style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '500px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px' }}>{editingCatalogItem.id ? 'Edit Catalog Item' : 'New Catalog Item'}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="form-group">
                                <label className="form-label">Item Name</label>
                                <input 
                                    autoFocus
                                    required
                                    type="text" 
                                    value={editingCatalogItem.name || ''} 
                                    onChange={e => setEditingCatalogItem({...editingCatalogItem, name: e.target.value})}
                                    className="form-input" 
                                    style={{ width: '100%', padding: '10px' }}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Specification</label>
                                <textarea 
                                    value={editingCatalogItem.specification || ''} 
                                    onChange={e => setEditingCatalogItem({...editingCatalogItem, specification: e.target.value})}
                                    className="form-input" 
                                    style={{ width: '100%', padding: '10px', minHeight: '80px' }}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Type</label>
                                <select 
                                    className="form-select"
                                    value={editingCatalogItem.type || 'Supply'}
                                    onChange={e => setEditingCatalogItem({...editingCatalogItem, type: e.target.value})}
                                >
                                    <option value="Supply">Supply</option>
                                    <option value="Service">Service</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '24px' }}>
                            <button type="button" onClick={() => setEditingCatalogItem(null)} className="btn btn-outline">Cancel</button>
                            <button type="submit" className="btn btn-primary">Save Item</button>
                        </div>
                    </form>
                </div>
            )}



            {/* 7. Unified Functional Area (Vault & OCR) */}
            {activeTab === 'upload' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '40px' }} className="animate-fade-in">
                    {/* Vault / Project Attachment */}
                    <div className="glass-panel" style={{ padding: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '24px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <div style={{ padding: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent)', borderRadius: '10px' }}>
                                <FolderPlus size={20} />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Project Vault</h3>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>
                            Manage enquiry documents here. All files are synced to your central **GDrive Repository**.
                        </p>
                        
                        <div style={{ border: '2px dashed #e2e8f0', borderRadius: '16px', padding: '32px', textAlign: 'center', background: '#f8fafc', transition: 'all 0.2s' }}>
                            <Upload size={40} color="#94a3b8" style={{ marginBottom: '16px' }} />
                            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '6px' }}>Enquiry Document</div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '20px' }}>Drag & drop or browse for PDF/Images</div>
                            <input 
                                type="file" 
                                style={{ display: 'none' }} 
                                id="vault-upload" 
                                onChange={(e) => {
                                    const file = e.target.files[0];
                                    if (!file) return;
                                    setAttachment(file);
                                }}
                            />
                            <label htmlFor="vault-upload" className="btn btn-primary" style={{ padding: '10px 24px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                {attachment ? <CheckCircle2 size={16} /> : <Plus size={16} />} 
                                {attachment ? attachment.name.substring(0, 20) + '...' : 'Select Document'}
                            </label>
                        </div>

                        {enquiry.gdrive_file_link && (
                            <div style={{ marginTop: '20px', padding: '16px', background: '#f0f9ff', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <CheckCircle2 size={14} /> Synced from Vault
                                </div>
                                <SafeDriveLink url={enquiry.gdrive_file_link} label="Open Synced File" />
                            </div>
                        )}
                    </div>

                    {/* Smart OCR Assistant */}
                    <div className="glass-panel" style={{ padding: '24px', background: 'linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%)', border: '1px solid #ddd6fe', borderRadius: '24px', boxShadow: '0 10px 25px -5px rgba(139, 92, 246, 0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <div style={{ padding: '8px', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', borderRadius: '10px' }}>
                                <Sparkles size={20} />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>AI OCR Assistant</h3>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>
                            Automatically convert photos of enquiry lists into system line items using AI.
                        </p>
                        <div 
                            onClick={() => setShowOCRModal(true)}
                            style={{ border: '2px dashed #ddd6fe', borderRadius: '16px', padding: '32px', textAlign: 'center', background: 'rgba(255,255,255,0.5)', cursor: 'pointer', transition: 'all 0.2s', minHeight: '180px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                            onMouseOver={e => e.currentTarget.style.borderColor = '#8b5cf6'}
                            onMouseOut={e => e.currentTarget.style.borderColor = '#ddd6fe'}
                        >
                            <ImageIcon size={48} color="#8b5cf6" style={{ marginBottom: '16px' }} />
                            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>Process Image to Text</div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '6px' }}>Supports hand-written lists</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 5: Project Photos & Media */}
            {activeTab === 'photos' && (
                <div 
                    style={{ 
                        background: '#fff', 
                        borderRadius: '16px', 
                        border: '1px solid #e2e8f0', 
                        padding: '24px', 
                        marginBottom: '40px',
                        position: 'relative' 
                    }} 
                    className="animate-fade-in"
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingPhotos(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDraggingPhotos(false); }}
                    onDrop={async (e) => {
                        e.preventDefault();
                        setIsDraggingPhotos(false);
                        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                        if (files.length > 0) {
                            for (const f of files) {
                                await handleGalleryUpload(f);
                            }
                        }
                    }}
                >
                    {isDraggingPhotos && (
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(244, 63, 94, 0.95)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '16px',
                            zIndex: 50,
                            borderRadius: '16px',
                            color: '#fff',
                            border: '3px dashed #fff',
                            margin: '8px'
                        }}>
                            <Upload size={48} className="animate-bounce" />
                            <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>Drop Photos Here to Upload</span>
                        </div>
                    )}
                    
                    <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Ship size={20} color="#f43f5e" />
                            <h3 style={{ margin: 0, color: '#1e293b', fontWeight: 800 }}>Project Photos &amp; Media</h3>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            {loadingGallery && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '120px', height: '6px', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                        <div style={{ width: `${galleryUploadProgress}%`, height: '100%', background: '#f43f5e', transition: 'width 0.3s ease' }} />
                                    </div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f43f5e' }}>{galleryUploadProgress}%</span>
                                </div>
                            )}
                            {galleryUploadSuccess && (
                                <div className="animate-bounce" style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 600 }}>
                                    <CheckCircle2 size={18} /> Upload Success!
                                </div>
                            )}
                            {enquiry?.gdrive_folder_id && (
                                <a 
                                    href={`https://drive.google.com/drive/folders/${galleryFolderId || enquiry.gdrive_folder_id}`} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="btn btn-secondary"
                                    style={{ 
                                        background: 'linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)', 
                                        border: '1px solid #a5f3fc', 
                                        color: '#0891b2', 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        gap: '8px', 
                                        textDecoration: 'none',
                                        fontWeight: 600,
                                        fontSize: '0.9rem'
                                    }}
                                >
                                    <FolderOpen size={16} /> Explorer (Drive)
                                </a>
                            )}
                            <button 
                                className="btn btn-secondary" 
                                onClick={() => setShowGalleryOCRModal(true)}
                                style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)', border: '1px solid #ddd6fe', color: '#7c3aed' }}
                            >
                                <Sparkles size={16} /> Smart OCR
                            </button>
                            <button 
                                className="btn btn-secondary" 
                                onClick={handleShowQr}
                                style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid #bbf7d0', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <Smartphone size={16} /> Mobile Upload (QR)
                            </button>
                            <button 
                                className="btn btn-secondary" 
                                onClick={() => fetchGallery()}
                                title="Synchronize photos with Google Drive"
                                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <RefreshCw size={16} className={loadingGallery ? 'animate-spin' : ''} />
                                Synchronize
                            </button>
                            <label className="btn btn-primary" style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden', background: '#f43f5e', border: '1px solid #f43f5e' }}>
                                <Upload size={16} /> Upload Photo
                                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => {
                                    const files = Array.from(e.target.files);
                                    const uploadSequence = async () => {
                                        for (const f of files) {
                                            await handleGalleryUpload(f);
                                        }
                                    };
                                    uploadSequence();
                                }} />
                            </label>
                        </div>
                    </div>

                    <SmartOCRModal 
                        isOpen={showGalleryOCRModal}
                        onClose={() => setShowGalleryOCRModal(false)}
                        title="Enquiry Gallery OCR Assistant"
                        onApply={(res) => {
                            if (res.rawText) {
                                handleUpdateHeader({
                                    description: (enquiry.description || '') + '\n\n[OCR DATA FROM GALLERY]:\n' + res.rawText
                                });
                                toast.success('Extracted text has been appended to the Enquiry Notes.');
                            }
                        }}
                    />

                    {loadingGallery && galleryFiles.length === 0 ? (
                        <div style={{ padding: '80px', textAlign: 'center', color: '#64748b' }}>
                            <div className="upload-animation-ring-enq">
                                <div />
                                <div />
                                <div />
                                <div />
                            </div>
                            <p style={{ marginTop: '24px', fontWeight: 600 }}>Syncing with Google Drive...</p>
                            <style>{`
                                .upload-animation-ring-enq { display: inline-block; position: relative; width: 80px; height: 80px; }
                                .upload-animation-ring-enq div { box-sizing: border-box; display: block; position: absolute; width: 64px; height: 64px; margin: 8px; border: 8px solid #f43f5e; border-radius: 50%; animation: upload-ring-enq 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite; border-color: #f43f5e transparent transparent transparent; }
                                .upload-animation-ring-enq div:nth-child(1) { animation-delay: -0.45s; }
                                .upload-animation-ring-enq div:nth-child(2) { animation-delay: -0.3s; }
                                .upload-animation-ring-enq div:nth-child(3) { animation-delay: -0.15s; }
                                @keyframes upload-ring-enq { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                            `}</style>
                        </div>
                    ) : galleryFiles.length === 0 ? (
                        <div style={{ padding: '80px', textAlign: 'center', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #cbd5e1' }}>
                            <Ship size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
                            <p style={{ color: '#64748b', fontSize: '1.1rem', fontWeight: 600 }}>No photos uploaded yet for this enquiry.</p>
                            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '4px' }}>Capture and upload project photos directly here.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                            {galleryFiles.map(file => (
                                <div key={file.id} className="gallery-item" style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#fff', border: '1px solid #e2e8f0', aspectRatio: '4/3', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', transition: 'transform 0.2s' }}>
                                    <img 
                                        src={file.thumbnailLink?.replace('=s220', '=s600')} 
                                        alt={file.name} 
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                    />
                                    <div className="gallery-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', opacity: 0, transition: 'opacity 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                                        <a href={file.webViewLink} target="_blank" rel="noreferrer" style={{ color: '#fff', padding: '8px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%' }}><ExternalLink size={20} /></a>
                                    </div>
                                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px', background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', color: '#fff', fontSize: '0.7rem', fontWeight: 600 }}>
                                        {file.name}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <style>{`
                        .gallery-item:hover .gallery-overlay { opacity: 1; } 
                        .gallery-item:hover { transform: translateY(-4px); }
                    `}</style>
                </div>
            )}

            {/* Tab 6: Explorer */}
            {activeTab === 'explorer' && (
                <div className="glass-panel animate-fade-in" style={{ padding: '32px', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '40px' }}>
                    {/* Auth Status Bar */}
                    <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        background: authStatus === 'connected' ? '#f0fdf4' : '#fef2f2', 
                        padding: '12px 20px', 
                        borderRadius: '12px', 
                        marginBottom: '24px',
                        border: `1px solid ${authStatus === 'connected' ? '#bbf7d0' : '#fecaca'}`
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: authStatus === 'connected' ? '#22c55e' : '#ef4444' }} />
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: authStatus === 'connected' ? '#166534' : '#991b1b' }}>
                                Google Drive: {authStatus === 'connected' ? 'Connected' : 'Disconnected'}
                            </span>
                        </div>
                        {authStatus !== 'connected' && (
                            <button type="button" onClick={handleExplorerReconnect} className="btn btn-sm btn-primary" style={{ fontSize: '0.8rem', padding: '6px 16px' }}>
                                <RefreshCw size={14} style={{ marginRight: '6px' }} /> Reconnect Now
                            </button>
                        )}
                    </div>

                    {/* Navigation / Actions Bar */}
                    {authStatus === 'connected' && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <button 
                                        type="button"
                                        onClick={() => handleExplorerBack(explorerPath.length - 2)} 
                                        disabled={explorerPath.length <= 1}
                                        style={{ background: 'none', border: 'none', cursor: explorerPath.length > 1 ? 'pointer' : 'default', color: explorerPath.length > 1 ? '#4f46e5' : '#cbd5e1' }}
                                    >
                                        <ArrowLeft size={20} />
                                    </button>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '1rem', fontWeight: 600 }}>
                                        {explorerPath.map((segment, idx) => (
                                            <React.Fragment key={segment.id}>
                                                <span 
                                                    onClick={() => handleExplorerBack(idx)}
                                                    style={{ cursor: 'pointer', color: idx === explorerPath.length - 1 ? '#1e293b' : '#64748b' }}
                                                >
                                                    {segment.name}
                                                </span>
                                                {idx < explorerPath.length - 1 && <span style={{ color: '#cbd5e1' }}>/</span>}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <button type="button" onClick={() => fetchExplorerFiles()} className="btn btn-secondary" title="Refresh list" style={{ height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <RefreshCw size={18} className={loadingExplorer ? 'animate-spin' : ''} />
                                    </button>
                                    
                                    {!explorerFolderId ? (
                                        <button 
                                            type="button"
                                            onClick={ensureEnquiryFolder} 
                                            className="btn btn-primary" 
                                            style={{ height: '42px', display: 'flex', alignItems: 'center', gap: '8px' }}
                                        >
                                            <FolderPlus size={16} /> Provision Folder
                                        </button>
                                    ) : (
                                        <div
                                            onDragOver={(e) => { e.preventDefault(); setIsDraggingExplorer(true); }}
                                            onDragLeave={(e) => { e.preventDefault(); setIsDraggingExplorer(false); }}
                                            onDrop={async (e) => {
                                                e.preventDefault();
                                                setIsDraggingExplorer(false);
                                                const files = Array.from(e.dataTransfer.files);
                                                if (files.length > 0) {
                                                    setUploadingExplorer(true);
                                                    setUploadProgress(0);
                                                    try {
                                                        const token = getStoredToken();
                                                        for (let i = 0; i < files.length; i++) {
                                                            await uploadFileToDrive(token, files[i], { folderId: explorerFolderId });
                                                            setUploadProgress(((i + 1) / files.length) * 100);
                                                        }
                                                        fetchExplorerFiles();
                                                    } catch (err) {
                                                        console.error('Upload error:', err);
                                                        alert('Failed to upload files.');
                                                    } finally {
                                                        setUploadingExplorer(false);
                                                        setUploadProgress(0);
                                                    }
                                                }
                                            }}
                                            onClick={() => document.getElementById('explorer-upload').click()}
                                            style={{
                                                border: isDraggingExplorer ? '2px dashed #4f46e5' : '2px dashed #cbd5e1',
                                                background: isDraggingExplorer ? '#eff6ff' : '#f8fafc',
                                                padding: '0 20px',
                                                borderRadius: '10px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                cursor: 'pointer',
                                                color: '#4f46e5',
                                                fontWeight: 600,
                                                fontSize: '0.85rem',
                                                transition: 'all 0.2s ease',
                                                height: '42px',
                                                justifyContent: 'center',
                                                position: 'relative',
                                                overflow: 'hidden'
                                            }}
                                        >
                                            <Upload size={18} />
                                            <span>{isDraggingExplorer ? 'Drop Files Here' : 'Drop Files to Upload'}</span>
                                            {uploadingExplorer && (
                                                <div style={{ 
                                                    position: 'absolute', 
                                                    left: 0, 
                                                    top: 0, 
                                                    bottom: 0, 
                                                    width: `${uploadProgress}%`, 
                                                    background: 'rgba(99, 102, 241, 0.15)', 
                                                    transition: 'width 0.2s ease',
                                                    pointerEvents: 'none'
                                                }} />
                                            )}
                                        </div>
                                    )}
                                    <input id="explorer-upload" type="file" multiple hidden onChange={handleExplorerUpload} />
                                </div>
                            </div>

                            {explorerError && (
                                <div style={{ color: '#ef4444', background: '#fef2f2', padding: '12px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <AlertTriangle size={18} /> {explorerError}
                                </div>
                            )}

                            {loadingExplorer && explorerFiles.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                                    <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 16px' }} />
                                    <p>Syncing with Google Drive...</p>
                                </div>
                            ) : !explorerFolderId ? (
                                <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #e2e8f0' }}>
                                    <FolderOpen size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                                    <p style={{ fontSize: '1.1rem' }}>No Drive Folder Linked</p>
                                    <p style={{ fontSize: '0.9rem', marginTop: '4px' }}>Click "Provision Folder" above to automatically create the folder structure in CELRONHUB.</p>
                                </div>
                            ) : explorerFiles.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #e2e8f0' }}>
                                    <FolderOpen size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                                    <p style={{ fontSize: '1.1rem' }}>This folder is empty.</p>
                                    <p style={{ fontSize: '0.9rem', marginTop: '4px' }}>Upload drawings, photos, or documents to keep them with this enquiry.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
                                    {explorerFiles.map(file => (
                                        <div key={file.id} style={{ padding: '16px', borderRadius: '12px', background: '#fff', border: '1px solid #e2e8f0', transition: 'transform 0.2s' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                                <div 
                                                    style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: file.mimeType.includes('folder') ? 'pointer' : 'default', flex: 1, overflow: 'hidden' }}
                                                    onClick={() => file.mimeType.includes('folder') && handleExplorerNavigate(file)}
                                                >
                                                    {getExplorerFileIcon(file.mimeType)}
                                                    <div style={{ overflow: 'hidden' }}>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={file.name}>
                                                            {file.name}
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'Folder'}</div>
                                                    </div>
                                                </div>
                                                <button 
                                                    type="button"
                                                    onClick={() => handleExplorerDelete(file.id, file.name)}
                                                    style={{ background: 'none', border: 'none', color: '#cbd5e1', padding: '4px', cursor: 'pointer' }}
                                                >
                                                    <Trash size={14} />
                                                </button>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <a href={file.webViewLink} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: '#4f46e5', fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <ExternalLink size={12} /> Open in Cloud
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

                <WhatsAppShareModal 
                    isOpen={whatsappShareModal.isOpen}
                    onClose={() => setWhatsappShareModal({ isOpen: false })}
                    contacts={allPartners.find(p => p.id === enquiry.customer_id)?.contacts || []}
                    partner={allPartners.find(p => p.id === enquiry.customer_id)}
                    documentData={{
                        document_type: 'Enquiry',
                        document_no: enquiry.enquiry_no,
                        subject: enquiry.customer_ref,
                        currency: 'SGD',
                        total_amount: 0,
                        salesperson_name: profile?.full_name || 'CEL-RON Team'
                    }}
                />

                {/* Supplier Management Modal (Image 2 style) */}
                <Modal 
                    isOpen={supplierModalOpen} 
                    onClose={() => setSupplierModalOpen(false)}
                    title={editingSupplier ? "Edit Supplier Details" : "Add New Supplier"}
                    icon={Users}
                    size="xl"
                >
                    <QuickPartnerContactDualAdd 
                        company_id={profile.company_id}
                        initialPartner={editingSupplier || { types: ['Supplier'] }}
                        partners={suppliers}
                        onSuccess={async ({ partner, contact }) => {
                            await fetchSuppliers();
                            setSupplierModalOpen(false);
                        }}
                        onCancel={() => setSupplierModalOpen(false)}
                        title={editingSupplier ? "Edit Supplier Details" : "Add New Supplier"}
                        defaultType="Supplier"
                    />
                </Modal>

                {/* Premium AI Enquiry Document Parser Modal */}
                <SmartEnquiryParserModal 
                    isOpen={showOCRModal}
                    onClose={() => setShowOCRModal(false)}
                    partners={allPartners}
                    onApply={({ header, items: scannedItems, file: uploadedFile }) => {
                        const headerUpdates = {};
                        if (header.customer_id) headerUpdates.customer_id = header.customer_id;
                        if (header.customer_ref) headerUpdates.customer_ref = header.customer_ref;
                        if (header.enquiry_date) headerUpdates.enquiry_date = header.enquiry_date;
                        if (header.due_date) headerUpdates.due_date = header.due_date;
                        if (header.subject) headerUpdates.description = header.subject;
                        if (Object.keys(headerUpdates).length > 0) handleUpdateHeader(headerUpdates);
                        const newItems = [...selectedItems];
                        scannedItems.forEach(item => {
                            if (!newItems.some(i => i.name.toLowerCase() === item.name.toLowerCase())) newItems.push(item);
                        });
                        setSelectedItems(newItems);
                        if (id !== 'new') {
                            import('../../lib/workflowService').then(({ updateEnquiry }) => updateEnquiry(id, { catalog_items: newItems }));
                        }
                        setEnquiry(prev => ({ ...prev, catalog_items: newItems }));
                        if (uploadedFile) setAttachment(uploadedFile);
                        toast.success(`Successfully loaded ${scannedItems.length} items and header fields!`);
                    }}
                />

                {/* Fast Float RFQ Modal */}
                <FastFloatModal
                    isOpen={isFloatRFQOpen}
                    onClose={() => setIsFloatRFQOpen(false)}
                    onConfirm={async (suppliers, sentCount) => {
                        setIsFloatRFQOpen(false);
                        if (sentCount > 0) {
                            const { supabase } = await import('../../lib/supabase');
                            await supabase.from('customer_enquiries').update({ status: 'RFQ Floated' }).eq('id', id);
                            toast.success(`RFQ floated to ${sentCount} supplier(s)! Status updated.`);
                            refreshEnquiry();
                        }
                    }}
                    enquiry={enquiry}
                />

                {/* Float RFQ FAB */}
                {id !== 'new' && (
                    <button
                        onClick={() => setIsFloatRFQOpen(true)}
                        style={{
                            position: 'fixed', bottom: '32px', right: '32px', zIndex: 500,
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '14px 22px', borderRadius: '50px',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            color: '#fff', border: 'none', cursor: 'pointer',
                            fontSize: '0.92rem', fontWeight: 800,
                            boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
                            transition: 'all 0.2s', letterSpacing: '0.01em'
                        }}
                        onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.03)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(99,102,241,0.5)'; }}
                        onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.4)'; }}
                    >
                        <Send size={18} /> Float RFQ
                    </button>
                )}

                <style>{`
                    .tab-container {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px;
                        margin: 30px 0 20px 0;
                        padding: 8px;
                        background: #f8fafc;
                        border-radius: 16px;
                        border: 1px solid #e2e8f0;
                    }
                    .tab {
                        padding: 10px 20px;
                        background: #ffffff;
                        border: 1px solid #e2e8f0;
                        color: #64748b;
                        font-weight: 700;
                        font-size: 0.88rem;
                        cursor: pointer;
                        border-radius: 12px;
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
                    }
                    
                    /* Items tab - Indigo */
                    .tab.tab-items:hover {
                        background: rgba(99, 102, 241, 0.05);
                        color: #4f46e5;
                        border-color: rgba(99, 102, 241, 0.25);
                    }
                    .tab.tab-items.active {
                        background: #4f46e5;
                        color: #ffffff;
                        border-color: #4f46e5;
                        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
                    }
                    
                    /* Upload tab - Amber / Orange */
                    .tab.tab-other:hover {
                        background: rgba(217, 119, 6, 0.05);
                        color: #d97706;
                        border-color: rgba(217, 119, 6, 0.25);
                    }
                    .tab.tab-other.active {
                        background: #d97706;
                        color: #ffffff;
                        border-color: #d97706;
                        box-shadow: 0 4px 12px rgba(217, 119, 6, 0.25);
                    }
                    
                    /* Send tab - Violet */
                    .tab.tab-workflow:hover {
                        background: rgba(124, 58, 237, 0.05);
                        color: #7c3aed;
                        border-color: rgba(124, 58, 237, 0.25);
                    }
                    .tab.tab-workflow.active {
                        background: #7c3aed;
                        color: #ffffff;
                        border-color: #7c3aed;
                        box-shadow: 0 4px 12px rgba(124, 58, 237, 0.25);
                    }
                    
                    /* Quotes tab - Emerald */
                    .tab.tab-payments:hover {
                        background: rgba(16, 185, 129, 0.05);
                        color: #10b981;
                        border-color: rgba(16, 185, 129, 0.25);
                    }
                    .tab.tab-payments.active {
                        background: #10b981;
                        color: #ffffff;
                        border-color: #10b981;
                        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
                    }

                    /* Photos tab - Pink / Rose */
                    .tab.tab-gallery:hover {
                        background: rgba(244, 63, 94, 0.05);
                        color: #f43f5e;
                        border-color: rgba(244, 63, 94, 0.25);
                    }
                    .tab.tab-gallery.active {
                        background: #f43f5e;
                        color: #ffffff;
                        border-color: #f43f5e;
                        box-shadow: 0 4px 12px rgba(244, 63, 94, 0.25);
                    }

                    /* Explorer tab - Sky Blue */
                    .tab.tab-explorer:hover {
                        background: rgba(14, 165, 233, 0.05);
                        color: #0ea5e9;
                        border-color: rgba(14, 165, 233, 0.25);
                    }
                    .tab.tab-explorer.active {
                        background: #0ea5e9;
                        color: #ffffff;
                        border-color: #0ea5e9;
                        box-shadow: 0 4px 12px rgba(14, 165, 233, 0.25);
                    }

                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(4px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .animate-fade-in {
                        animation: fadeIn 0.2s ease-out forwards;
                    }
                `}</style>
            </div>
        </div>
    );
}