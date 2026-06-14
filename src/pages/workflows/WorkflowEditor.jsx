import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    Save, ArrowLeft, Plus, Trash2,
    Printer, Send, X, Package,
    FileText, Calculator, Ship,
    MoreHorizontal, Search, Settings,
    ChevronDown, CreditCard, User, Users, MapPin, Paperclip, Pencil, Sparkles, Edit2,
    FileCheck, Play, RefreshCw, AlertCircle, Loader2,
    ExternalLink, Folder, File as FileIcon, HardDrive, Upload, MessageSquare,
    ArrowRightLeft,
    CheckCircle,
    Copy,
    Users2,
    Eye,
    EyeOff,
    Info,
    Image, FolderOpen, DollarSign,
    List
} from 'lucide-react';
import SearchableSelect from '../../components/common/SearchableSelect';
import { getExchangeRateWithGemini } from '../../lib/geminiService';
import { listFolderContent, uploadFileToDrive, deleteFile, getOrCreateFolder, provisionFullProjectStructure, provisionPartnerStructure } from '../../lib/driveService';
import { validateToken, connectGoogleAPI, getStoredToken, performOCR, isTokenValid } from '../../lib/googleAuthService';
import SmartEnquiryParserModal from '../../components/workflow/SmartEnquiryParserModal';
import { useAuth } from '../../contexts/AuthContext';
import {
    getWorkflowDocumentById,
    getWorkflowDocuments,
    saveWorkflowDocument,
    generateDocNumber,
    createDocumentRevision,
    convertQuotationToJob,
    revertJobToQuotation,
    revertQuotationToEnquiry,
    convertInvoiceToJob,
    convertProformaToTaxInvoice,
    getGDriveFolderIdForStage,
    duplicateWorkflowDocument,
    deleteWorkflowDocument
} from '../../lib/workflowV2Service';
import { getPartners, getContacts, getDocumentSettings, getJobMajorCategories, saveJobMajorCategory } from '../../lib/store';
import { getCatalogItems } from '../../lib/catalogService';
import { supabase } from '../../lib/supabase';
import { getJobExpenses, saveJobExpense, deleteJobExpense } from '../../lib/jobExpenseService';
import { getJobPayments, saveCustomerPayment, saveSupplierPayment, deletePayment } from '../../lib/paymentService';
import {
    Modal,
    QuickPartnerAdd,
    QuickContactAdd,
    QuickPartnerContactDualAdd,
    QuickVesselAdd,
    QuickWorkLocationAdd,
    QuickExpenseAdd,
    QuickJobMajorAdd
} from '../../components/workflow/QuickAddForms';
import FloatingControlHub from '../../components/FloatingControlHub';
import ReceivePaymentModal from '../../components/workflow/ReceivePaymentModal';
import RichTextEditor from '../../components/common/RichTextEditor';
import { ITEM_UNITS } from '../../utils/units';

const NOTES_PRESETS = {
    'General': `Please ensure all documents are referenced with the enquiry number.<br/>All goods must be securely packed for sea transport.`,
    'Delivery': `Delivery must be made to:<br/>Celron Enterprises Pte Ltd<br/>10, Jln, Besar, "Sim Lim Tower", #03-05, Singapore 208787`,
    'Payment': `Payment will be processed via telegraphic transfer upon receipt of original invoices and delivery orders.`
};

const DEFAULT_JOB_MAJORS = [
    "PCB Repair",
    "Supply Spares",
    "Automation Services",
    "Manpower Supply",
    "Annual Calibration"
];

const TC_PRESETS = {
    'Enquiry': `1. PLEASE QUOTE YOUR BEST PRICE AND EARLIEST DELIVERY.
2. QUOTATION SHOULD BE VALID FOR AT LEAST 30 DAYS.
3. SPECIFY LEAD TIME AND COUNTRY OF ORIGIN.
4. PRICES SHOULD BE IN SGD/USD AS SPECIFIED.`,
    'Quotation': `1. VALIDITY: 30 DAYS FROM DATE OF QUOTATION.
2. DELIVERY: TO BE ADVISED UPON ORDER CONFIRMATION.
3. PAYMENT TERMS: 30 DAYS FROM DATE OF INVOICE (SUBJECT TO CREDIT APPROVAL).
4. WARRANTY: 6 MONTHS AGAINST MANUFACTURING DEFECTS.`,
    'Purchase Order': `1. DELIVERY DATE MUST BE STRICTLY ADHERED TO.
2. QUALITY MUST CONFORM TO SPECIFICATIONS PROVIDED.
3. PACKING LIST AND INVOICE MUST ACCOMPANY THE GOODS.
4. PAYMENT TERMS AS PER AGREED UPON TERMS.`
};
import WorkflowDocumentLayout from '../../components/workflow/WorkflowDocumentLayout';
import html2pdf from 'html2pdf.js';
import { generateSleekPDF } from '../../lib/pdfGeneratorV2';
import { WhatsAppShareModal } from '../../components/workflow/WhatsAppShareModal';
import SmartOCRModal from '../../components/common/SmartOCRModal';

export default function WorkflowEditor() {
    const { type, id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const linkedJobId = searchParams.get('job_id');
    const sourceId = searchParams.get('source_id');

    const { profile } = useAuth();
    const canAdmin = ['admin', 'finance', 'superadmin'].includes(profile?.role);
    const isNew = id === 'new';

    // UI State
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('items'); // 'items' | 'other'
    const [modal, setModal] = useState({ isOpen: false, type: null });
    const [jobMajorCategories, setJobMajorCategories] = useState([]);
    const getJobMajorOptions = () => {
        const dbNames = jobMajorCategories.map(c => c.name);
        const combined = new Set([...DEFAULT_JOB_MAJORS, ...dbNames]);
        return Array.from(combined);
    };
    const [whatsappShareModal, setWhatsappShareModal] = useState({ isOpen: false });
    const [emailPreview, setEmailPreview] = useState(null);
    
    // Stale closure protection for async handlers (id changes after save)
    const currentIdRef = useRef(id);
    useEffect(() => {
        currentIdRef.current = id;
    }, [id]);
    const [poModal, setPoModal] = useState({ isOpen: false });
    const [poFile, setPoFile] = useState(null);
    const [lineItems, setLineItems] = useState([]);
    const [workflowDocs, setWorkflowDocs] = useState([]); // Documents in the same job suite
    const [expenses, setExpenses] = useState([]);
    const [loadingExpenses, setLoadingExpenses] = useState(false);
    const [expenseModal, setExpenseModal] = useState({ isOpen: false, data: null });
    const [galleryFiles, setGalleryFiles] = useState([]);
    const [loadingGallery, setLoadingGallery] = useState(false);
    const [galleryUploadProgress, setGalleryUploadProgress] = useState(0);
    const [galleryUploadSuccess, setGalleryUploadSuccess] = useState(false);
    const [showOCRModal, setShowOCRModal] = useState(false);
    const [showDocumentParserModal, setShowDocumentParserModal] = useState(false);

    // Payments State
    const [customerPayments, setCustomerPayments] = useState([]);
    const [supplierPayments, setSupplierPayments] = useState([]);
    const [loadingPayments, setLoadingPayments] = useState(false);
    const [paymentModal, setPaymentModal] = useState({ isOpen: false, type: null, data: null }); // type: 'customer' | 'supplier'
    const [signedProofs, setSignedProofs] = useState([]);
    const [loadingSignedProofs, setLoadingSignedProofs] = useState(false);
    const [partnerInvoices, setPartnerInvoices] = useState([]);

    // Explorer State
    const [explorerFiles, setExplorerFiles] = useState([]);
    const [loadingExplorer, setLoadingExplorer] = useState(false);
    const [authStatus, setAuthStatus] = useState('checking'); // 'checking' | 'connected' | 'expired' | 'disconnected'
    const [explorerFolderId, setExplorerFolderId] = useState(null);
    const [explorerPath, setExplorerPath] = useState([]); // Array of {id, name} for breadcrumbs
    const [explorerError, setExplorerError] = useState(null);
    const [uploadingExplorer, setUploadingExplorer] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [paymentQuarter, setPaymentQuarter] = useState('All'); // 'All' | 'Q1' | 'Q2' | 'Q3' | 'Q4'
    const [isOCRLoading, setIsOCRLoading] = useState(false);
    const [discountType, setDiscountType] = useState('percent'); // 'percent' | 'lumpsum'

    const [settings, setSettings] = useState(null);
    const [showSignature, setShowSignature] = useState(true);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentPrefill, setPaymentPrefill] = useState(null);
    const [logoBase64, setLogoBase64] = useState('');
    const [signatureBase64, setSignatureBase64] = useState('');
    const [paynowBase64, setPaynowBase64] = useState('');
    const printRef = useRef();

    // Open General Celron Jobs Folder in Google Drive
    const handleOpenRootDrive = () => {
        let celronRootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
        if (!celronRootId) {
            toast.error('Google Drive Root Folder ID is not configured in Settings.');
            return;
        }
        if (celronRootId.includes('drive.google.com')) {
            window.open(celronRootId, '_blank');
        } else {
            window.open(`https://drive.google.com/drive/folders/${celronRootId}`, '_blank');
        }
    };

    // Open Specific Job Google Drive Folder
    const handleOpenJobDrive = async () => {
        let folderId = formData.drive_folder_id || formData.gdrive_folder_id || explorerFolderId;
        if (!folderId) {
            const loadToast = toast.loading('Provisioning/retrieving Google Drive folder...');
            try {
                folderId = await ensureJobFolder();
                if (folderId) {
                    setFormData(prev => ({ ...prev, drive_folder_id: folderId }));
                    await supabase.from('workflow_documents').update({ drive_folder_id: folderId }).eq('id', id);
                    toast.dismiss(loadToast);
                    toast.success('Folder created successfully!');
                } else {
                    toast.dismiss(loadToast);
                    toast.error('Could not create or retrieve the folder.');
                    return;
                }
            } catch (err) {
                toast.dismiss(loadToast);
                toast.error('Failed to create folder: ' + err.message);
                return;
            }
        }
        if (folderId) {
            window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
        } else {
            toast.error('No Google Drive folder linked for this Job.');
        }
    };

    // Inline Contact Editing States
    const [editingContact, setEditingContact] = useState(null);
    const [isAddingContact, setIsAddingContact] = useState(false);
    const [contactFormName, setContactFormName] = useState('');
    const [contactFormEmail, setContactFormEmail] = useState('');
    const [isSavingContact, setIsSavingContact] = useState(false);

    const handleSaveInlineContact = async (e) => {
        if (e) e.preventDefault();
        if (!contactFormName.trim() || !contactFormEmail.trim()) {
            alert('Please enter both Name and Email.');
            return;
        }
        
        setIsSavingContact(true);
        try {
            const { saveContact } = await import('../../lib/store');
            const contactData = {
                name: contactFormName.trim(),
                email: contactFormEmail.trim(),
                partnerId: formData.partner_id,
                company_id: profile.company_id
            };
            
            if (editingContact) {
                contactData.id = editingContact.id;
            }
            
            await saveContact(contactData);
            
            // Reload contacts list
            await fetchMasterData();
            
            // Reset state
            setEditingContact(null);
            setIsAddingContact(false);
            setContactFormName('');
            setContactFormEmail('');
        } catch (err) {
            console.error('Failed to save contact:', err);
            alert('Failed to save contact: ' + (err.message || err));
        } finally {
            setIsSavingContact(false);
        }
    };

    const getSuggestedEmails = () => {
        const selectedPartner = partners.find(p => p.id === formData.partner_id);
        const suggestions = [];
        
        if (selectedPartner) {
            if (selectedPartner.email1) {
                suggestions.push({ 
                    name: selectedPartner.name, 
                    email: selectedPartner.email1, 
                    type: 'HQ' 
                });
            }
            
            // Filter from global contacts state (which is reactive and updates instantly when we add/edit contacts!)
            const companyContacts = contacts.filter(c => {
                if (c.partnerId === formData.partner_id) return true;
                if (selectedPartner?.name) {
                    const contactPartner = partners.find(p => p.id === c.partnerId);
                    return contactPartner && contactPartner.name && contactPartner.name.trim().toLowerCase() === selectedPartner.name.trim().toLowerCase();
                }
                return false;
            });
            companyContacts.forEach(contact => {
                if (contact.email) {
                    suggestions.push({ 
                        id: contact.id,
                        name: contact.name, 
                        email: contact.email, 
                        type: 'Contact' 
                    });
                }
            });
        }
        
        const officeEmail = isAnithaType ? 'accounts@celron.net' : (settings?.email || 'sales@celron.net');
        suggestions.push({ name: 'Our Office', email: officeEmail, type: 'Internal' });
        if (isAnithaType) {
            suggestions.push({ name: 'Director Review', email: 'director@celron.net', type: 'Internal' });
        }
        
        return suggestions;
    };

    const addEmailToField = (field, email) => {
        if (field === 'to') {
            setEmailPreview(prev => ({ ...prev, to: email }));
        } else if (field === 'cc') {
            const currentCc = emailPreview.cc ? emailPreview.cc.trim() : '';
            if (!currentCc) {
                setEmailPreview(prev => ({ ...prev, cc: email }));
            } else if (!currentCc.includes(email)) {
                setEmailPreview(prev => ({ ...prev, cc: `${currentCc}; ${email}` }));
            }
        }
    };

    const [showFloatModal, setShowFloatModal] = useState(false);
    const [selectedSuppliers, setSelectedSuppliers] = useState([]);
    const [floatingProcess, setFloatingProcess] = useState({
        isActive: false,
        suppliers: [],
        currentIndex: 0
    });
    const [isFetchingRate, setIsFetchingRate] = useState(false);
    
    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const tab = queryParams.get('tab');
        if (tab) {
            let active = tab;
            if (tab === 'po') active = 'other';
            if (['items', 'other', 'workflow', 'costing', 'payments', 'gallery', 'explorer'].includes(active)) {
                setActiveTab(active);
            }
        }
    }, [location.search]);

    const toBase64 = url => fetch(url, { mode: 'cors' })
        .then(response => response.blob())
        .then(blob => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        }));

    // Master Data
    const [partners, setPartners] = useState([]);
    const [contacts, setContacts] = useState([]);

    // Image 2 Standardized Email Header States
    const [companySearch, setCompanySearch] = useState('');
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
    const [officeSearch, setOfficeSearch] = useState('');
    const [showOfficeDropdown, setShowOfficeDropdown] = useState(false);

    const [customVisibleContacts, setCustomVisibleContacts] = useState([]);
    const [customOfficeContacts, setCustomOfficeContacts] = useState([]);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [modalContactType, setModalContactType] = useState('customer'); // 'customer' or 'office'
    const [modalEditingContact, setModalEditingContact] = useState(null);
    const [modalName, setModalName] = useState('');
    const [modalEmail, setModalEmail] = useState('');
    const [isSavingContactModal, setIsSavingContactModal] = useState(false);

    const toggleEmailInField = (field, email) => {
        if (!email) return;
        setEmailPreview(prev => {
            if (!prev) return prev;
            const current = prev[field] || '';
            let emails = current.split(';').map(e => e.trim()).filter(Boolean);
            const lowerEmail = email.trim().toLowerCase();
            const matched = emails.find(e => e.toLowerCase() === lowerEmail);

            if (matched) {
                emails = emails.filter(e => e.toLowerCase() !== lowerEmail);
            } else {
                emails.push(email);
            }
            return { ...prev, [field]: emails.join('; ') };
        });
    };

    const getCustomerContacts = () => {
        const partner = partners.find(p => p.id === formData.partner_id);
        const direct = partner ? contacts.filter(c => {
            if (c.partnerId === partner.id) return true;
            return partner.name && (() => {
                const contactPartner = partners.find(p => p.id === c.partnerId);
                return contactPartner && contactPartner.name && contactPartner.name.trim().toLowerCase() === partner.name.trim().toLowerCase();
            })();
        }) : [];
        const combined = [...direct];
        customVisibleContacts.forEach(c => {
            if (c.email && !combined.find(x => x.email && x.email.toLowerCase() === c.email.toLowerCase())) {
                combined.push(c);
            }
        });
        return combined;
    };

    const getOfficeContacts = () => {
        const defaults = [
            { name: 'Our Office', email: 'accounts@celron.net' }
        ];

        const celronContact = contacts.find(c => {
            const emailLower = (c.email || '').toLowerCase();
            return emailLower.endsWith('@celron.net') || emailLower.endsWith('@celron.com');
        });
        const celronPartnerId = celronContact?.partnerId || 'ae0c632b-d56b-425b-9773-79aa3fa33bd0';

        const isCelronContact = (c) => {
            if (!c.email) return false;
            const emailLower = c.email.toLowerCase();
            const nameLower = (c.name || '').toLowerCase();
            
            const isCelronEmail = emailLower.endsWith('@celron.net') || 
                                  emailLower.endsWith('@celron.com') ||
                                  emailLower.includes('celron');
                                  
            const isCelronPartner = c.partnerId === celronPartnerId;
            const isCelronName = nameLower.includes('celron') || nameLower.includes('cel-ron');
            
            return isCelronEmail || isCelronPartner || isCelronName;
        };

        const staffContacts = contacts.filter(c => isCelronContact(c));

        const combined = [...defaults];
        staffContacts.forEach(c => {
            if (c.email && !combined.find(x => x.email && x.email.toLowerCase() === c.email.toLowerCase())) {
                combined.push({ id: c.id, name: c.name, email: c.email });
            }
        });
        customOfficeContacts.forEach(c => {
            if (c.email && !combined.find(x => x.email && x.email.toLowerCase() === c.email.toLowerCase())) {
                combined.push(c);
            }
        });
        return combined;
    };

    const getCompanyDropdownOptions = () => {
        const query = companySearch.trim().toLowerCase();
        if (!query) {
            const currentEmails = getCustomerContacts().map(c => (c.email || '').toLowerCase()).filter(Boolean);
            return contacts.filter(c => c.partnerId && c.email && !currentEmails.includes(c.email.toLowerCase()));
        }
        return contacts.filter(c => 
            c.email && 
            (c.name?.toLowerCase().includes(query) || c.email?.toLowerCase().includes(query))
        );
    };

    const getOfficeDropdownOptions = () => {
        const query = officeSearch.trim().toLowerCase();
        const currentEmails = getOfficeContacts().map(c => (c.email || '').toLowerCase()).filter(Boolean);

        const celronContact = contacts.find(c => {
            const emailLower = (c.email || '').toLowerCase();
            return emailLower.endsWith('@celron.net') || emailLower.endsWith('@celron.com');
        });
        const celronPartnerId = celronContact?.partnerId || 'ae0c632b-d56b-425b-9773-79aa3fa33bd0';

        const isCelronContact = (c) => {
            if (!c.email) return false;
            const emailLower = c.email.toLowerCase();
            const nameLower = (c.name || '').toLowerCase();
            
            const isCelronEmail = emailLower.endsWith('@celron.net') || 
                                  emailLower.endsWith('@celron.com') ||
                                  emailLower.includes('celron');
                                  
            const isCelronPartner = c.partnerId === celronPartnerId;
            const isCelronName = nameLower.includes('celron') || nameLower.includes('cel-ron');
            
            return isCelronEmail || isCelronPartner || isCelronName;
        };

        const celronStaff = contacts.filter(c => isCelronContact(c) && !currentEmails.includes(c.email.toLowerCase()));

        if (!query) {
            return celronStaff;
        }
        return celronStaff.filter(c => 
            c.name?.toLowerCase().includes(query) || c.email?.toLowerCase().includes(query)
        );
    };

    const handleSaveModalContact = async (e) => {
        if (e) e.preventDefault();
        if (!modalName.trim() || !modalEmail.trim()) {
            alert('Please enter both Name and Email.');
            return;
        }

        setIsSavingContactModal(true);
        try {
            const { saveContact } = await import('../../lib/store');
            const partner = partners.find(p => p.id === formData.partner_id);
            const contactData = {
                name: modalName.trim(),
                email: modalEmail.trim(),
                partnerId: modalContactType === 'customer' ? partner?.id : null,
                company_id: partner?.company_id || profile?.company_id || null
            };

            if (modalEditingContact) {
                contactData.id = modalEditingContact.id;
            }

            const saved = await saveContact(contactData);

            // Reload database contacts list
            const allContacts = await getContacts(profile);
            if (allContacts) {
                setContacts(allContacts);
            }

            // Instantly display and active-toggle the newly created contact card
            if (modalContactType === 'customer') {
                if (saved) {
                    setCustomVisibleContacts(prev => [...prev, saved]);
                    toggleEmailInField('to', saved.email);
                }
            } else {
                if (saved) {
                    setCustomOfficeContacts(prev => [...prev, saved]);
                    toggleEmailInField('cc', saved.email);
                }
            }

            // Close modal & reset fields
            setIsAddModalOpen(false);
            setModalEditingContact(null);
            setModalName('');
            setModalEmail('');
        } catch (err) {
            console.error('Failed to save contact:', err);
            alert('Failed to save contact: ' + (err.message || err));
        } finally {
            setIsSavingContactModal(false);
        }
    };
    const [vessels, setVessels] = useState([]);
    const [workLocations, setWorkLocations] = useState([]);
    const [catalog, setCatalog] = useState([]);
    const [staff, setStaff] = useState([]);
    const [catalogSearch, setCatalogSearch] = useState('');
    const [showCatalogDropdown, setShowCatalogDropdown] = useState(false);
    const [originalJobNo, setOriginalJobNo] = useState('');
    const [attachmentUploadProgress, setAttachmentUploadProgress] = useState(null); // { fileName, percent }
    const [modalItemIndex, setModalItemIndex] = useState(null);
    const [modalItemDetails, setModalItemDetails] = useState('');
    const [showDetailsModal, setShowDetailsModal] = useState(false);



    // Default Dates
    const defaultIssue = new Date();
    const defaultExpiry = new Date();
    defaultExpiry.setDate(defaultExpiry.getDate() + 30);

    // Form Data
    const [formData, setFormData] = useState(() => {
        const docType = (type || 'Enquiry').split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        const isAnithaDoc = ['Tax Invoice', 'Purchase Order', 'Delivery Order', 'Proforma Invoice', 'Packing List', 'Statement Of Account', 'Order Acknowledgment'].includes(docType);
        
        return {
        document_type: docType,
        document_no: '',
        job_id: '',
        enquiry_id: '',
        issue_date: defaultIssue.toISOString().split('T')[0],
        expiry_date: defaultExpiry.toISOString().split('T')[0],
        partner_id: '',
        contact_id: '',
        vessel_id: '',
        work_location_id: '',
        salesperson_name: isAnithaDoc ? 'ANITHA' : (profile?.full_name || 'N.R.KUMAR'),
        salesperson_phone: isAnithaDoc ? '+6591090347' : (profile?.phone || '+6597685891'),
        salesperson_email: isAnithaDoc ? 'accounts@celron.net' : (profile?.professional_email || 'sales@celron.net'),
        subject: '',
        customer_ref: 'WALK IN',
        currency: 'SGD',
        exchange_rate: 1.0,
        base_currency: 'SGD',
        tax_type: 'GST',
        tax_rate: 9,
        discount: 0,
        status: 'Draft',
        terms: TC_PRESETS[docType] || '',
        notes: '',
        vessel_name: '',
        location_name: '',
        customer_name: '',
        subtotal: 0,
        tax_amount: 0,
        total_amount: 0,
        discount_amount: 0,
        discount_percent: 0,
        customer_po_no: '',
        customer_po_date: '',
        customer_po_by_id: '',
        customer_po_attachment_url: '',
        is_job: false,
        assigned_job_no: '',
        payment_terms: '',
        original_document_id: '',
        revision_no: 0,
        attachment_urls: [],
        payment_method: 'Bank Transfer',
        payment_ref: '',
        delivery_verification: {}
        };
    });

    const isAnithaType = ['Tax Invoice', 'Purchase Order', 'Delivery Order', 'Proforma Invoice', 'Packing List', 'Statement Of Account', 'Order Acknowledgment'].includes(formData.document_type);

    useEffect(() => {
        fetchMasterData();
        if (!isNew) {
            fetchDocument();
        } else {
            initNewDocument();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, type]);

    useEffect(() => {
        if (formData.partner_id && formData.document_type === 'Payment Received') {
            fetchPartnerInvoices();
        }
    }, [formData.partner_id, formData.document_type]);

    const fetchPartnerInvoices = async () => {
        const { data } = await getWorkflowDocuments(profile.company_id, ['Tax Invoice', 'Proforma Invoice']);
        if (data) {
            setPartnerInvoices(data.filter(d => d.partner_id === formData.partner_id));
        }
    };

    const fetchMasterData = async () => {
        const [pRes, vRes, wlRes, cRes, sRes, allContacts, jmRes] = await Promise.all([
            getPartners(profile),
            supabase.from('vessels').select('*').order('vessel_name'),
            supabase.from('work_locations').select('*').order('location_name'),
            getCatalogItems(1, 100),
            getDocumentSettings(profile?.company_id),
            getContacts(profile),
            getJobMajorCategories(profile?.company_id)
        ]);

        if (pRes) setPartners(pRes);
        if (vRes.data) setVessels(vRes.data);
        if (wlRes.data) setWorkLocations(wlRes.data);
        if (cRes.data) setCatalog(cRes.data);
        if (sRes) {
            setSettings(sRes);
            if (sRes.logo_url) toBase64(sRes.logo_url).then(setLogoBase64).catch(console.error);
            if (sRes.signature_url) toBase64(sRes.signature_url).then(setSignatureBase64).catch(console.error);
            if (sRes.paynow_url) toBase64(sRes.paynow_url).then(setPaynowBase64).catch(console.error);
        }
        if (allContacts) setContacts(allContacts);
        if (jmRes) setJobMajorCategories(jmRes);
        
        const { data: staffData } = await supabase.from('staff').select('*').order('full_name');
        if (staffData) setStaff(staffData);
    };

    const checkGoogleAuth = async () => {
        const token = getStoredToken();
        if (!token) {
            setAuthStatus('disconnected');
            return false;
        }
        const isValid = await validateToken(token);
        if (!isValid) {
            setAuthStatus('expired');
            return false;
        }
        setAuthStatus('connected');
        return true;
    };

    const handleExplorerReconnect = () => {
        connectGoogleAPI(`job_${id}`);
    };

    const fetchExplorerFiles = async (folderId = null, forceRoot = false) => {
        const targetId = folderId || explorerFolderId;
        if (!targetId) return;

        setLoadingExplorer(true);
        setExplorerError(null);
        try {
            const token = getStoredToken();
            let files = await listFolderContent(token, targetId);

            // Filter logic: Only show 8 major SOP folders at the root level
            const isAtRoot = forceRoot || explorerPath.length <= 1;

            if (isAtRoot && targetId) {
                const sopFolders = [
                    '1. Enquiries & Quotations',
                    '2. Supplier Bids & POs',
                    '3. Operations & Logistics',
                    '4. Finance & Invoices',
                    '5. Expenses & Payments',
                    '6. Job Gallery & Photos',
                    '7. Correspondence & Admin',
                    '8. Technical Documents'
                ];
                // Strict filter: only these 8 folders, or non-folder files
                const seenFolders = new Set();
                files = files.filter(f => {
                    const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
                    if (isFolder) {
                        const name = f.name.trim();
                        if (sopFolders.includes(name)) {
                            if (seenFolders.has(name)) return false; // Deduplicate
                            seenFolders.add(name);
                            return true;
                        }
                        return false; // Hide other folders
                    }
                    return true; // Show all files
                });
            }
            setExplorerFiles(files);
        } catch (err) {
            console.error('Error fetching explorer files:', err);
            setExplorerError('Failed to load files from Google Drive.');
        } finally {
            setLoadingExplorer(false);
        }
    };

    const getProjectFolderName = () => {
        const jobNo = formData.assigned_job_no || formData.document_no || formData.enquiry_no || 'Job Folder';
        const p = partners.find(part => part.id === formData.partner_id)?.name || 'Walk-in';
        const v = vessels.find(ves => ves.id === formData.vessel_id)?.vessel_name || '';
        const l = workLocations.find(wl => wl.id === formData.work_location_id)?.location_name || '';
        const suffix = v || l || '';
        const folderTitle = suffix ? `${jobNo} - ${p} - ${suffix}` : `${jobNo} - ${p}`;
        return folderTitle.replace(/[/\\?%*:|"<>]/g, '-');
    };

    const ensureJobFolder = async () => {
        const docNo = formData.assigned_job_no || formData.document_no || formData.enquiry_no;
        if (!docNo || explorerFolderId) return explorerFolderId;

        setLoadingExplorer(true);
        try {
            const token = getStoredToken();
            const year = new Date(formData.issue_date || new Date()).getFullYear().toString();
            const projName = getProjectFolderName();
            const folderId = await provisionFullProjectStructure(
                token, 
                settings?.gdrive_celron_root_id || settings?.google_drive_folder_id, 
                year, 
                projName
            );
            setExplorerFolderId(folderId);
            setExplorerPath([{ id: folderId, name: projName }]);
            return folderId;
        } catch (err) {
            console.error('Error ensuring project folder:', err);
            setExplorerError('Failed to connect to Google Drive project folder.');
        } finally {
            setLoadingExplorer(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'explorer') {
            const run = async () => {
                const isAuthed = await checkGoogleAuth();
                if (isAuthed) {
                    const folderId = await ensureJobFolder();
                    if (folderId) fetchExplorerFiles(folderId);
                    else if (explorerFolderId) fetchExplorerFiles();
                }
            };
            run();
        } else if (activeTab === 'costing' && !isNew) {
            fetchExpenses();
        } else if (activeTab === 'gallery' && !isNew) {
            fetchGallery();
        } else if (activeTab === 'payments' && !isNew) {
            fetchPayments();
        } else if (activeTab === 'explorer' && !isNew) {
            fetchSignedProofs();
        }
    }, [activeTab, formData.assigned_job_no]);

    const fetchSignedProofs = async () => {
        if (!formData.assigned_job_no) return;
        setLoadingSignedProofs(true);
        try {
            const token = getStoredToken();
            const rootId = await ensureJobFolder();
            const files = await listFolderContent(token, rootId);
            const nonFolderFiles = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
            setSignedProofs(nonFolderFiles);
        } catch (err) {
            console.error('Error fetching signed proofs:', err);
        } finally {
            setLoadingSignedProofs(false);
        }
    };

    const getDocumentDisplayName = (docOverride = null) => {
        const d = docOverride || formData;
        const p = partners.find(p => p.id === d.partner_id)?.name || 'Walk-in';
        const v = vessels.find(v => v.id === d.vessel_id)?.vessel_name || '';
        const l = workLocations.find(wl => wl.id === d.work_location_id)?.location_name || '';
        
        const vesselOrLocation = v || l || '';
        const description = (d.subject || '').trim();
        const docNo = d.document_no || 'Draft';
        
        let parts = [docNo];
        if (description) parts.push(description);
        if (vesselOrLocation) parts.push(vesselOrLocation);
        if (p) parts.push(p);
        
        return parts.join(' - ').replace(/[/\\?%*:|"<>]/g, '-');
    };

    const handleUploadSignedProofDirect = async (file) => {
        if (!file) return;
        setLoadingSignedProofs(true);
        try {
            const token = getStoredToken();
            const rootId = await ensureJobFolder();
            const signedFolderId = rootId;
            
            const result = await uploadFileToDrive(token, file, { folderId: signedFolderId });
            const proofUrl = `https://drive.google.com/file/d/${result.id}/view`;

            const newAttachments = [...(formData.attachment_urls || []), proofUrl];
            setFormData(prev => ({ ...prev, attachment_urls: newAttachments }));
            
            alert('Signed proof uploaded successfully!');
            fetchSignedProofs();
        } catch (err) {
            console.error('Proof upload failed:', err);
            alert('Upload failed: ' + err.message);
        } finally {
            setLoadingSignedProofs(false);
        }
    };

    const handleUploadPODirect = async (file) => {
        if (!file || !formData.assigned_job_no) return;
        setSaving(true);
        try {
            const token = getStoredToken();
            const year = new Date(formData.issue_date).getFullYear().toString();
            const rootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
            
            const projName = getProjectFolderName();
            const projectFolderId = await provisionFullProjectStructure(token, rootId, year, projName);
            const targetFolderId = projectFolderId;
            
            const result = await uploadFileToDrive(token, file, { folderId: targetFolderId });
            const poUrl = `https://drive.google.com/file/d/${result.id}/view`;

            // Update state and DB
            setFormData(prev => ({ ...prev, customer_po_attachment_url: poUrl }));
            
            await supabase.from('workflow_documents').update({ 
                customer_po_attachment_url: poUrl,
                attachment_urls: [...(formData.attachment_urls || []), poUrl]
            }).eq('assigned_job_no', formData.assigned_job_no);

            alert('Purchase Order uploaded and synced successfully!');
        } catch (err) {
            console.error('PO upload failed:', err);
            alert('Upload failed: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const fetchGallery = async () => {
        if (!formData.assigned_job_no) return;
        setLoadingGallery(true);
        try {
            const token = getStoredToken();
            const rootId = await ensureJobFolder();
            const mediaFolderId = await getOrCreateFolder(token, 'Photos & Gallery', rootId);
            const files = await listFolderContent(token, mediaFolderId);
            setGalleryFiles(files.filter(f => f.mimeType.startsWith('image/')));
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
            const rootId = await ensureJobFolder();
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
            alert('Upload failed: ' + err.message);
        } finally {
            setLoadingGallery(false);
            setGalleryUploadProgress(0);
        }
    };

    const fetchExpenses = async () => {
        setLoadingExpenses(true);
        const { data } = await getJobExpenses(id);
        if (data) setExpenses(data);
        setLoadingExpenses(false);
    };

    const addExpenseRow = () => {
        setExpenseModal({ isOpen: true, data: null });
    };

    const updateExpenseRow = (index, field, value) => {
        const updated = [...expenses];
        updated[index][field] = value;

        // Recalculate totals
        if (['unit_price', 'quantity', 'gst_rate', 'gst_amount'].includes(field)) {
            const up = parseFloat(updated[index].unit_price) || 0;
            const qty = parseFloat(updated[index].quantity) || 0;
            const sub = up * qty;
            updated[index].total_before_tax = sub;
            
            // If field isn't gst_amount, auto-calculate amount based on rate
            if (field !== 'gst_amount') {
                const rate = parseFloat(updated[index].gst_rate) || 0;
                updated[index].gst_amount = sub * (rate / 100);
            }
            
            updated[index].grand_total = sub + (parseFloat(updated[index].gst_amount) || 0);
        }

        setExpenses(updated);
    };

    const handleSaveExpense = async (index) => {
        const row = expenses[index];
        if (!row.supplier_id) {
            alert('Please select a supplier');
            return;
        }
        const { data, error } = await saveJobExpense(row);
        if (error) {
            alert('Error saving expense: ' + error.message);
        } else {
            const updated = [...expenses];
            updated[index] = data;
            setExpenses(updated);
        }
    };

    const handleDeleteExpense = async (index) => {
        const row = expenses[index];
        if (!window.confirm('Delete this expense record?')) return;
        
        if (!row.id.startsWith('temp_')) {
            const { error } = await deleteJobExpense(row.id);
            if (error) {
                alert('Error deleting: ' + error.message);
                return;
            }
        }
        
        const updated = expenses.filter((_, i) => i !== index);
        setExpenses(updated);
    };

    const handleBillUpload = async (index, file) => {
        if (!file) return;
        
        const updated = [...expenses];
        updated[index].uploading = true;
        setExpenses(updated);

        try {
            const token = getStoredToken();
            const folderId = await ensureJobFolder(); // Get or create root
            const financeFolder = folderId;
            
            const result = await uploadFileToDrive(token, file, { folderId: financeFolder });
            
            // Save link to DB
            const fileUrl = `https://drive.google.com/file/d/${result.id}/view`;
            const { data, error } = await saveJobExpense({ ...expenses[index], bill_url: fileUrl });
            
            if (error) throw error;
            
            const final = [...expenses];
            final[index] = { ...data, uploading: false };
            setExpenses(final);
        } catch (err) {
            console.error('Upload failed:', err);
            alert('Upload failed: ' + err.message);
            const reset = [...expenses];
            reset[index].uploading = false;
            setExpenses(reset);
        }
    };

    const fetchPayments = async () => {
        setLoadingPayments(true);
        const { customerPayments: cp, supplierPayments: sp } = await getJobPayments(id);
        setCustomerPayments(cp);
        setSupplierPayments(sp);
        setLoadingPayments(false);
    };

    const handleSavePayment = async (type, paymentData) => {
        const saver = type === 'customer' ? saveCustomerPayment : saveSupplierPayment;
        const { data, error } = await saver({ ...paymentData, company_id: profile?.company_id, job_id: id });
        if (error) {
            alert('Error saving payment: ' + error.message);
        } else {
            fetchPayments();
            setPaymentModal({ isOpen: false, type: null, data: null });
        }
    };

    const handleDeletePayment = async (type, paymentId) => {
        if (!window.confirm('Delete this payment record?')) return;
        const { error } = await deletePayment(type, paymentId);
        if (error) alert('Error deleting: ' + error.message);
        else fetchPayments();
    };

    const handlePaymentProofUpload = async (type, paymentId, file) => {
        if (!file) return;
        try {
            const token = getStoredToken();
            const rootId = await ensureJobFolder();
            const targetFolder = rootId;
            const result = await uploadFileToDrive(token, file, { folderId: targetFolder });
            const proofUrl = `https://drive.google.com/file/d/${result.id}/view`;
            
            const saver = type === 'customer' ? saveCustomerPayment : saveSupplierPayment;
            await saver({ id: paymentId, proof_url: proofUrl });
            fetchPayments();
        } catch (err) {
            console.error('Proof upload failed:', err);
            alert('Proof upload failed: ' + err.message);
        }
    };

    const handleExplorerNavigate = (folder) => {
        setExplorerPath(prev => [...prev, { id: folder.id, name: folder.name }]);
        setExplorerFolderId(folder.id);
        fetchExplorerFiles(folder.id, false); // Not root anymore
    };

    const handleExplorerBack = (index) => {
        const newPath = explorerPath.slice(0, index + 1);
        const target = newPath[newPath.length - 1];
            setExplorerPath(newPath);
        setExplorerFolderId(target.id);
        fetchExplorerFiles(target.id, newPath.length === 1); // Only root if path length is 1
    };

    const handleExplorerDelete = async (fileId, fileName) => {
        if (!window.confirm(`Are you sure you want to delete "${fileName}" from Google Drive?`)) return;
        setLoadingExplorer(true);
        try {
            const token = getStoredToken();
            await deleteFile(token, fileId);
            fetchExplorerFiles();
        } catch (err) {
            console.error('Delete error:', err);
            alert('Failed to delete file.');
            setLoadingExplorer(false);
        }
    };

    const handleOpenPartnerVault = async () => {
        if (!formData.partner_id) {
            alert("Please select a partner first.");
            return;
        }
        setLoadingExplorer(true);
        try {
            const token = getStoredToken();
            const partner = partners.find(p => p.id === formData.partner_id);
            const partnerFolderId = await provisionPartnerStructure(token, settings?.gdrive_partners_root_id, partner.name);
            window.open(`https://drive.google.com/drive/folders/${partnerFolderId}`, '_blank');
        } catch (err) {
            console.error('Partner Vault error:', err);
            alert('Failed to open partner vault.');
        } finally {
            setLoadingExplorer(false);
        }
    };

    const handleExplorerUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

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
    };

    const autoUploadPDF = async (docData) => {
        try {
            const token = getStoredToken();
            const pdfBlob = await generateSleekPDF({
                ...docData,
                items: lineItems,
                partners: partners.find(p => p.id === docData.partner_id),
                vessels: vessels.find(v => v.id === docData.vessel_id),
                work_locations: workLocations.find(wl => wl.id === docData.work_location_id)
            }, settings, 'blob');
            
            // Provision folder
            const year = new Date(docData.issue_date).getFullYear().toString();
            const projName = getProjectFolderName();
            const rootId = await provisionFullProjectStructure(token, settings?.gdrive_celron_root_id, year, projName);
            
            // Route auto-generated PDFs to the 'Worksuite' subfolder
            const targetFolderId = await getOrCreateFolder(token, 'Worksuite', rootId);
            
            const filename = `${getDocumentDisplayName(docData)}.pdf`;
            await uploadFileToDrive(token, new File([pdfBlob], filename, { type: 'application/pdf' }), { folderId: targetFolderId });
        } catch (err) {
            console.warn('Auto-upload PDF background task failed:', err);
        }
    };

    const fetchDocument = async () => {
        setLoading(true);
        console.log('Fetching document with ID:', id);
        try {
            const { data, error } = await getWorkflowDocumentById(id);
            if (error) {
                console.error('Fetch error:', error);
                alert('Error loading document: ' + error.message);
            } else if (data) {
                console.log('Document loaded:', data);
                setFormData(prev => ({ ...prev, ...data }));
                
                // Deduplicate items on load to fix any existing database repeats
                // We use a more robust key to handle null/undefined and whitespace
                const rawItems = data.items || [];
                const uniqueItems = [];
                const seen = new Set();
                
                rawItems.forEach(item => {
                    const desc = (item.description || '').trim();
                    const details = (item.details || '').trim();
                    const qty = parseFloat(item.quantity) || 0;
                    const price = parseFloat(item.unit_price) || 0;
                    const isSec = !!item.is_section;
                    const isNote = !!item.is_note;

                    const key = `${desc}|${details}|${qty}|${price}|${isSec}|${isNote}`;
                    
                    if (!seen.has(key)) {
                        uniqueItems.push(item);
                        seen.add(key);
                    }
                });
                
                setLineItems(uniqueItems);

                // Fetch other docs in the same job suite
                if (data.assigned_job_no) {
                    setOriginalJobNo(data.assigned_job_no);
                    const { data: suiteData } = await supabase
                        .from('workflow_documents')
                        .select('id, document_no, document_type, status, total_amount, currency, issue_date')
                        .eq('assigned_job_no', data.assigned_job_no)
                        .eq('company_id', profile.company_id)
                        .order('issue_date', { ascending: true });
                    
                    if (suiteData) {
                        setWorkflowDocs(suiteData);
                    }
                }
            } else {
                console.warn('No data returned for ID:', id);
                alert('Document not found.');
            }
        } catch (err) {
            console.error('Unexpected fetch error:', err);
            alert('An unexpected error occurred while loading the document.');
        }
        setLoading(false);
        // Set discount type based on existing data
        if (formData.discount_percent > 0) setDiscountType('percent');
        else if (formData.discount_amount > 0) setDiscountType('lumpsum');
    };

    const initNewDocument = async () => {
        const newNo = await generateDocNumber(profile.company_id, formData.document_type);

        let initialPartnerId = '';
        let initialContactId = '';

        const docType = formData.document_type?.toUpperCase();
        
        const defaultNotes = '';

        const sourceEnquiryId = searchParams.get('sourceEnquiryId');
        if (sourceEnquiryId) {
            const { data: enq } = await supabase.from('customer_enquiries').select('*').eq('id', sourceEnquiryId).single();
            if (enq) {
                setFormData(prev => ({
                    ...prev,
                    document_no: newNo,
                    partner_id: enq.customer_id || '',
                    contact_id: enq.contact_id || '',
                    vessel_id: enq.vessel_id || '',
                    work_location_id: enq.work_location_id || '',
                    subject: enq.subject || `Ref: ${enq.enquiry_no}`,
                    customer_ref: enq.customer_ref || '',
                    currency: 'SGD',
                    enquiry_id: enq.id,
                    notes: enq.notes || defaultNotes,
                    terms_conditions: TC_PRESETS[docType === 'QUOTATION' ? 'Quotation' : ''] || ''
                }));

                if (enq.catalog_items && enq.catalog_items.length > 0) {
                    const inheritedItems = enq.catalog_items.map((item, idx) => ({
                        id: 'src-' + idx + '-' + Date.now(),
                        item_id: item.id,
                        description: item.name,
                        details: item.specification || '',
                        quantity: 1,
                        unit_price: item.selling_price || 0,
                        amount: item.selling_price || 0,
                        tax_enabled: true,
                        tax_rate: 9,
                        uom: 'UNIT(S)'
                    }));
                    setLineItems(inheritedItems);
                }
                return;
            }
        }

        if (sourceId) {
            const { data: sourceDoc } = await getWorkflowDocumentById(sourceId);
            if (sourceDoc) {
                setFormData(prev => ({
                    ...prev,
                    document_no: newNo,
                    partner_id: sourceDoc.partner_id || '',
                    contact_id: sourceDoc.contact_id || '',
                    vessel_id: sourceDoc.vessel_id || '',
                    work_location_id: sourceDoc.work_location_id || '',
                    subject: sourceDoc.subject || `Derived from ${sourceDoc.document_no}`,
                    customer_ref: sourceDoc.customer_ref || '',
                    currency: sourceDoc.currency || 'SGD',
                    enquiry_id: sourceDoc.enquiry_id || '',
                    job_id: sourceDoc.job_id || '',
                    assigned_job_no: sourceDoc.assigned_job_no || (sourceDoc.document_type === 'Job' ? sourceDoc.document_no : ''),
                    notes: sourceDoc.notes || defaultNotes,
                    terms_conditions: sourceDoc.terms_conditions || (TC_PRESETS[docType === 'QUOTATION' ? 'Quotation' : ''] || '')
                }));

                if (sourceDoc.items && sourceDoc.items.length > 0) {
                    const inheritedItems = sourceDoc.items.map((item, idx) => ({
                        ...item,
                        id: 'src-' + idx + '-' + Date.now(),
                        document_id: undefined // Will be set on save
                    }));
                    setLineItems(inheritedItems);
                }
                return; // Skip other inheritance if sourceId is used
            }
        }

        if (linkedJobId) {
            const { getJobById } = await import('../../lib/workflowService');
            const jobRes = await getJobById(profile.company_id, linkedJobId);
            if (jobRes.data) {
                const job = jobRes.data;
                const enq = job.enquiries || {};
                
                initialPartnerId = enq.customer_id || '';
                initialContactId = job.contact_id || '';
                
                setFormData(prev => ({
                    ...prev,
                    document_no: newNo,
                    job_id: linkedJobId,
                    partner_id: initialPartnerId,
                    contact_id: initialContactId,
                    vessel_id: job.vessel_id || enq.vessel_id || '',
                    work_location_id: job.work_location_id || enq.work_location_id || '',
                    subject: prev.subject || job.subject || enq.subject || `Ref: ${job.job_no}`,
                    customer_ref: prev.customer_ref || job.customer_ref || enq.customer_ref || '',
                    assigned_job_no: job.job_no || '',
                    notes: prev.notes || defaultNotes,
                    terms_conditions: prev.terms_conditions || (TC_PRESETS[docType === 'QUOTATION' ? 'Quotation' : ''] || '')
                }));

                // Inherit line items if available
                const sourceItems = enq.catalog_items || [];
                if (sourceItems.length > 0) {
                    const inheritedItems = sourceItems.map((item, idx) => ({
                        id: 'inherited-' + idx + '-' + Date.now(),
                        item_id: item.id,
                        description: item.name,
                        details: item.specification || '',
                        quantity: 1,
                        unit_price: item.selling_price || 0,
                        amount: item.selling_price || 0,
                        tax_enabled: true,
                        tax_rate: 9,
                        uom: 'UNIT(S)'
                    }));
                    setLineItems(inheritedItems);
                    return; // skip adding empty line
                }
            }
        }

        let defaultNotesVal = formData.notes || '';
        const docTypeUpper = formData.document_type?.toUpperCase();
        
        const packageDetailsTemplate = `
            <p><strong>Package Details</strong></p>
            <ul>
                <li>Size of the Package : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; mm (L) x &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; mm (B) x &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; mm (H)</li>
                <li>Weight of the Package : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Kgs</li>
                <li>Origin of spares : Singapore</li>
                <li>Total No. of Packages: </li>
                <li>Package Type (Carton / Wooden Crate / Pallet / Drum): </li>
                <li>Package Qty: </li>
                <li>Description of Contents: </li>
            </ul>
        `;

        if ((docTypeUpper === 'DELIVERY ORDER' || docTypeUpper === 'PACKING LIST') && !defaultNotesVal) {
            defaultNotesVal = packageDetailsTemplate;
        }

        setFormData(prev => ({
            ...prev,
            salesperson_name: prev.salesperson_name || profile?.full_name || '',
            salesperson_phone: prev.salesperson_phone || profile?.phone || '',
            salesperson_email: prev.salesperson_email || profile?.professional_email || '',
            document_no: newNo,
            job_id: linkedJobId || '',
            partner_id: initialPartnerId || prev.partner_id,
            contact_id: initialContactId || prev.contact_id,
            notes: defaultNotesVal,
            terms_conditions: prev.terms_conditions || (TC_PRESETS[docTypeUpper === 'QUOTATION' ? 'Quotation' : ''] || '')
        }));

        // Add one empty line
        setLineItems([{
            id: 'temp-' + Date.now(),
            description: '',
            quantity: 1,
            unit_price: 0,
            tax_rate: 9,
            amount: 0,
            uom: 'UNIT(S)'
        }]);
    };

    // Auto-calculate totals with 2-decimal precision
    useEffect(() => {
        const sub = lineItems.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
        const roundedSub = Math.round(sub * 100) / 100;
        
        // Calculate Discount
        let discAmt = 0;
        if (discountType === 'percent') {
            const dPct = parseFloat(formData.discount_percent) || 0;
            discAmt = roundedSub * (dPct / 100);
        } else {
            discAmt = parseFloat(formData.discount_amount) || 0;
        }
        const roundedDiscAmt = Math.round(discAmt * 100) / 100;
        
        const discountedSub = roundedSub - roundedDiscAmt;

        const tax = lineItems.reduce((acc, curr) => {
            if (curr.is_section || curr.is_note) return acc;
            if (curr.tax_enabled === false) return acc;
            const tRate = parseFloat(curr.tax_rate ?? 9) || 0;
            // Apply tax on discounted proportional amount
            const itemAmount = parseFloat(curr.amount) || 0;
            const itemWeight = roundedSub > 0 ? itemAmount / roundedSub : 0;
            const itemDiscountedAmount = itemAmount - (roundedDiscAmt * itemWeight);
            return acc + (itemDiscountedAmount * (tRate / 100));
        }, 0);
        
        const roundedTax = Math.round(tax * 100) / 100;
        const total = discountedSub + roundedTax;
        const roundedTotal = Math.round(total * 100) / 100;

        setFormData(prev => ({
            ...prev,
            subtotal: roundedSub,
            tax_amount: roundedTax,
            total_amount: roundedTotal,
            discount_amount: roundedDiscAmt
        }));
    }, [lineItems, formData.discount_percent, formData.discount_amount, discountType]);

    const handleHeaderChange = (e) => {
        const { name, value } = e.target;

        if (value === 'ADD_NEW') {
            setModal({ isOpen: true, type: name });
            return;
        }

        if (name.startsWith('delivery_verification.')) {
            const field = name.split('.')[1];
            const val = field === 'po_value' ? (parseFloat(value) || 0) : value;
            setFormData(prev => ({
                ...prev,
                delivery_verification: {
                    ...(prev.delivery_verification || {}),
                    [field]: val
                }
            }));
            return;
        }

        setFormData(prev => {
            const next = { ...prev, [name]: value };
            if (name === 'issue_date') {
                const newExpiry = new Date(value);
                // Check if date is valid
                if (!isNaN(newExpiry.getTime())) {
                    newExpiry.setDate(newExpiry.getDate() + 30);
                    next.expiry_date = newExpiry.toISOString().split('T')[0];
                }
            }
            return next;
        });

        if (name === 'currency') {
            if (value === 'SGD') {
                setFormData(prev => ({ ...prev, exchange_rate: 1.0 }));
            } else {
                (async () => {
                    setIsFetchingRate(true);
                    try {
                        const data = await getExchangeRateWithGemini(value, 'SGD');
                        if (data.rate) {
                            setFormData(prev => ({ ...prev, exchange_rate: data.rate }));
                        }
                    } catch (err) {
                        console.error('Failed to auto-fetch exchange rate:', err);
                    } finally {
                        setIsFetchingRate(false);
                    }
                })();
            }
        }
    };

    const handleEditorChange = (name, content) => {
        setFormData(prev => ({ ...prev, [name]: content }));
    };

    const handleAiFetchExchangeRate = async () => {
        if (formData.currency === 'SGD') return;
        setIsFetchingRate(true);
        try {
            const data = await getExchangeRateWithGemini(formData.currency, 'SGD');
            if (data.rate) {
                setFormData(prev => ({ ...prev, exchange_rate: data.rate }));
                alert(`AI found current rate: 1 ${formData.currency} = ${data.rate} SGD (Source: ${data.source || 'AI Search'})`);
            }
        } catch (err) {
            console.error(err);
            alert('Failed to fetch rate via AI. Please enter manually.');
        } finally {
            setIsFetchingRate(false);
        }
    };

    const handleEditMaster = (type) => {
        let initialData = null;
        if (type === 'partner_id') initialData = partners.find(p => p.id === formData.partner_id);
        else if (type === 'contact_id') initialData = contacts.find(c => c.id === formData.contact_id);
        else if (type === 'vessel_id') initialData = vessels.find(v => v.id === formData.vessel_id);
        else if (type === 'work_location_id') initialData = workLocations.find(l => l.id === formData.work_location_id);

        if (!initialData) return alert('Please select a record to edit first.');
        setModal({ isOpen: true, type, initialData });
    };

    const handleQuickAddSuccess = (data) => {
        const typeAdded = modal.type;
        setModal({ isOpen: false, type: null });

        // Refresh master data to include the new item(s)
        fetchMasterData();

        // Handle dual data from QuickPartnerContactDualAdd
        if (data && data.partner) {
            setFormData(prev => ({ 
                ...prev, 
                partner_id: data.partner.id, 
                contact_id: data.contact?.id || '' 
            }));
            return;
        }

        // Select the new item for single-add cases
        const newItem = data;
        if (typeAdded === 'partner_id') {
            setFormData(prev => ({ ...prev, partner_id: newItem.id, contact_id: '' }));
        } else if (typeAdded === 'contact_id') {
            setFormData(prev => ({ ...prev, contact_id: newItem.id }));
        } else if (typeAdded === 'vessel_id') {
            setFormData(prev => ({ ...prev, vessel_id: newItem.id }));
        } else if (typeAdded === 'work_location_id') {
            setFormData(prev => ({ ...prev, work_location_id: newItem.id }));
        } else if (typeAdded === 'job_major') {
            setFormData(prev => ({
                ...prev,
                delivery_verification: {
                    ...(prev.delivery_verification || {}),
                    job_major: newItem.name
                }
            }));
            setJobMajorCategories(prev => {
                if (prev.some(c => c.name.toLowerCase() === newItem.name.toLowerCase())) return prev;
                return [...prev, newItem];
            });
        }
    };

    const updateLineItem = (index, field, value) => {
        const updated = [...lineItems];
        updated[index][field] = value;

        if (field === 'quantity' || field === 'unit_price') {
            const qty = parseFloat(updated[index].quantity) || 0;
            const price = parseFloat(updated[index].unit_price) || 0;
            updated[index].amount = Math.round(qty * price * 100) / 100;
        }

        setLineItems(updated);
    };

    const addLineItem = (type = 'item', imageUrl = '') => {
        const newItem = {
            id: 'temp-' + Date.now(),
            description: type === 'image' ? 'Attached Image Document' : '',
            quantity: type === 'item' ? 1 : 0,
            unit_price: 0,
            amount: 0,
            tax_enabled: true,
            tax_rate: 9,
            uom: 'UNIT(S)',
            is_section: type === 'section',
            is_note: type === 'note',
            is_image: type === 'image',
            image_url: imageUrl
        };
        setLineItems([...lineItems, newItem]);
    };

    const handleQuickImageAttach = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setSaving(true);
        try {
            const token = getStoredToken();
            const folderId = await ensureJobFolder();
            if (!folderId) throw new Error("Could not ensure Google Drive folder for document.");
            
            // Option B: upload directly to project root folder
            const attachmentsFolder = folderId;
            
            const result = await uploadFileToDrive(token, file, { folderId: attachmentsFolder });
            const fileUrl = `https://drive.google.com/file/d/${result.id}/view`;
            
            addLineItem('image', fileUrl);
        } catch (err) {
            console.error('Failed to attach quick image:', err);
            alert('Failed to attach image: ' + err.message);
        } finally {
            setSaving(false);
            e.target.value = ''; // Reset input
        }
    };

    const removeLineItem = (index) => {
        setLineItems(lineItems.filter((_, i) => i !== index));
    };

    const handleAddItemFromCatalog = (catalogItem) => {
        const newItem = {
            id: 'temp-' + Date.now(),
            item_id: catalogItem.id,
            description: catalogItem.name,
            details: catalogItem.specification || '',
            quantity: 1,
            unit_price: catalogItem.selling_price || 0,
            amount: catalogItem.selling_price || 0,
            tax_enabled: true,
            tax_rate: 9,
            uom: 'UNIT(S)'
        };
        // Add or replace the last empty line if it's empty
        if (lineItems.length > 0 && !lineItems[lineItems.length - 1].description) {
            const updated = [...lineItems];
            updated[updated.length - 1] = newItem;
            setLineItems(updated);
        } else {
            setLineItems([...lineItems, newItem]);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Deduplicate items proactively before saving
            const uniqueItems = [];
            const seen = new Set();
            lineItems.forEach(item => {
                const desc = (item.description || '').trim();
                const details = (item.details || '').trim();
                const qty = parseFloat(item.quantity) || 0;
                const price = parseFloat(item.unit_price) || 0;
                const isSec = !!item.is_section;
                const isNote = !!item.is_note;
                const key = `${desc}|${details}|${qty}|${price}|${isSec}|${isNote}`;
                if (!seen.has(key)) {
                    uniqueItems.push(item);
                    seen.add(key);
                }
            });
            setLineItems(uniqueItems);

            if (originalJobNo && formData.assigned_job_no && formData.assigned_job_no !== originalJobNo) {
                const confirmRename = confirm(`You are changing the Assigned Job Number from "${originalJobNo}" to "${formData.assigned_job_no}".\n\nThis will update all associated documents in this Job suite to remain linked and renamed under the new job number.\n\nDo you want to proceed?`);
                if (!confirmRename) {
                    setSaving(false);
                    return;
                }

                const oldSuffix = originalJobNo.includes('-') ? originalJobNo.substring(originalJobNo.indexOf('-') + 1) : originalJobNo;
                const newSuffix = formData.assigned_job_no.includes('-') ? formData.assigned_job_no.substring(formData.assigned_job_no.indexOf('-') + 1) : formData.assigned_job_no;

                // 1. Fetch all associated documents in the suite
                const { data: suiteDocs, error: fetchErr } = await supabase
                    .from('workflow_documents')
                    .select('id, document_no, document_type')
                    .eq('assigned_job_no', originalJobNo)
                    .eq('company_id', profile.company_id);
                
                if (fetchErr) {
                    throw new Error('Failed to fetch suite documents: ' + fetchErr.message);
                }

                // 2. Update all documents in the suite (renaming document_no and assigned_job_no)
                if (suiteDocs && suiteDocs.length > 0) {
                    for (const doc of suiteDocs) {
                        const newDocNo = doc.document_no.replace(oldSuffix, newSuffix);
                        const { error: renameError } = await supabase
                            .from('workflow_documents')
                            .update({ 
                                document_no: newDocNo,
                                assigned_job_no: formData.assigned_job_no 
                            })
                            .eq('id', doc.id);
                        if (renameError) {
                            console.error(`Failed to rename document ${doc.document_no}:`, renameError);
                        }
                    }
                }

                // 3. ALSO update the Job document itself (if not already handled in suiteDocs loop)
                const jobDocInSuite = suiteDocs?.some(d => d.document_no === originalJobNo && d.document_type === 'Job');
                if (!jobDocInSuite) {
                    const { error: jobRenameError } = await supabase
                        .from('workflow_documents')
                        .update({ 
                            document_no: formData.assigned_job_no,
                            assigned_job_no: formData.assigned_job_no
                        })
                        .eq('document_no', originalJobNo)
                        .eq('document_type', 'Job')
                        .eq('company_id', profile.company_id);

                    if (jobRenameError) {
                        console.error('Failed to rename Job document number:', jobRenameError);
                    }
                }

                // 4. Update the legacy jobs table job_no
                const { error: jobTableError } = await supabase
                    .from('jobs')
                    .update({ job_no: formData.assigned_job_no })
                    .eq('job_no', originalJobNo)
                    .eq('company_id', profile.company_id);
                if (jobTableError) {
                    console.error('Failed to update jobs table job_no:', jobTableError);
                }

                // 5. Rename Google Drive folder if linked, preserving customer/vessel names
                if (formData.drive_folder_id) {
                    const token = await getStoredToken();
                    if (token) {
                        try {
                            const driveGetRes = await fetch(`https://www.googleapis.com/drive/v3/files/${formData.drive_folder_id}?fields=name`, {
                                headers: { 'Authorization': 'Bearer ' + token }
                            });
                            let newFolderName = formData.assigned_job_no;
                            if (driveGetRes.ok) {
                                const folderData = await driveGetRes.json();
                                const currentName = folderData.name;
                                if (currentName.includes(originalJobNo)) {
                                    newFolderName = currentName.replace(originalJobNo, formData.assigned_job_no);
                                } else {
                                    newFolderName = currentName.replace(/(CEL|ARKIS|AIS)-\d{4}-\d{4}/, formData.assigned_job_no);
                                }
                            }
                            
                            const driveRenameRes = await fetch(`https://www.googleapis.com/drive/v3/files/${formData.drive_folder_id}`, {
                                method: 'PATCH',
                                headers: {
                                    'Authorization': 'Bearer ' + token,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    name: newFolderName
                                })
                            });
                            if (driveRenameRes.ok) {
                                console.log('Successfully renamed Google Drive folder to', newFolderName);
                            } else {
                                console.warn('Google Drive folder rename failed:', await driveRenameRes.text());
                            }
                        } catch (driveErr) {
                            console.error('Error renaming Google Drive folder:', driveErr);
                        }
                    }
                }

                // 6. Sync current editor state document_no if it was part of the suite rename
                if (formData.id) {
                    const currentDoc = suiteDocs?.find(d => d.id === formData.id);
                    if (currentDoc) {
                        const newCurrentDocNo = currentDoc.document_no.replace(oldSuffix, newSuffix);
                        setFormData(prev => ({ ...prev, document_no: newCurrentDocNo, assigned_job_no: formData.assigned_job_no }));
                        formData.document_no = newCurrentDocNo;
                    }
                } else if (formData.document_type === 'Job') {
                    setFormData(prev => ({ ...prev, document_no: formData.assigned_job_no }));
                    formData.document_no = formData.assigned_job_no;
                }
                
                setOriginalJobNo(formData.assigned_job_no);
            }

            const dataToSave = { ...formData, company_id: profile.company_id };
            
            const { data, error } = await saveWorkflowDocument(dataToSave, uniqueItems);
            if (error) throw error;
            
            if (isNew) {
                currentIdRef.current = data.id; // Update ref immediately for sequential async calls
                navigate(`/workflows/editor/${type}/${data.id}`, { replace: true });
            } else {
                toast.success('Saved successfully');
                fetchDocument();
            }
            return data;
        } catch (err) {
            console.error(err);
            toast.error('Failed to save: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleRevision = async () => {
        if (isNew) return;
        if (!confirm('This will create a new draft revision of this document. Continue?')) return;
        setSaving(true);
        try {
            const { data } = await createDocumentRevision(id);
            navigate(`/workflows/editor/${type}/${data.id}`);
        } catch (err) {
            console.error(err);
            alert('Failed to create revision');
        } finally {
            setSaving(false);
        }
    };

    const handleConvertToJob = async () => {
        // Save first to ensure all current edits are captured
        setSaving(true);
        try {
            const saved = await handleSave();
            const activeId = saved?.id || currentIdRef.current;
            setPoModal({ isOpen: true, activeSourceId: activeId });
        } catch (err) {
            console.error('Failed to save before conversion:', err);
            alert('Please save the document successfully before converting to job.');
        } finally {
            setSaving(false);
        }
    };

    const confirmJobConversion = async (poData, options) => {
        setSaving(true);
        try {
            const sourceId = poModal.activeSourceId || currentIdRef.current;
            let result;
            if (poModal.isFromInvoice) {
                result = await convertInvoiceToJob(sourceId, poData);
            } else {
                result = await convertQuotationToJob(sourceId, poData, options);
            }
            const { jobNo } = result;
            
            // Handle PO File Upload if present
            if (poFile) {
                if (!isTokenValid()) {
                    if (window.confirm('Your Google connection has expired or is not connected. Connect now to upload PO?')) {
                        sessionStorage.setItem('google_auth_return_url', window.location.pathname + window.location.search);
                        connectGoogleAPI();
                        setSaving(false);
                        return;
                    }
                }
                try {
                    const accessToken = localStorage.getItem('google_access_token');
                    if (accessToken) {
                        const currentYear = new Date(formData.issue_date).getFullYear().toString();
                        const rootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
                        
                        const projName = getProjectFolderName();
                        const projectFolderId = await provisionFullProjectStructure(accessToken, rootId, currentYear, projName);
                        const targetFolderId = projectFolderId;
                        
                        const uploadResult = await uploadFileToDrive(accessToken, poFile, { folderId: targetFolderId });
                        const poUrl = `https://drive.google.com/file/d/${uploadResult.id}/view`;

                        // Update all documents associated with this job with the attachment URL
                        await supabase.from('workflow_documents').update({ 
                            customer_po_attachment_url: poUrl,
                            attachment_urls: [poUrl]
                        }).eq('assigned_job_no', jobNo);
                    }
                } catch (uploadErr) {
                    console.error("PO Upload to Drive failed:", uploadErr);
                    // Non-blocking error for main conversion
                }
            }

            toast.success(`Job ${jobNo} created successfully with all associated documents!`);
            setPoModal({ isOpen: false });
            setPoFile(null);
            fetchDocument(); // Refresh to show job info
        } catch (err) {
            console.error(err);
            toast.error('Failed to convert to job: ' + (err.message || 'Unknown error'));
        } finally {
            setSaving(false);
        }
    };

    const handleConvertToTaxInvoice = async () => {
        if (isNew) return;
        if (!window.confirm('Convert this Proforma Invoice to a Tax Invoice?')) return;
        
        setSaving(true);
        try {
            const activeId = currentIdRef.current;
            const savedInv = await convertProformaToTaxInvoice(activeId);
            toast.success(`Tax Invoice ${savedInv.document_no} created successfully!`);
            navigate(`/workflows/editor/tax-invoice/${savedInv.id}`);
        } catch (err) {
            console.error(err);
            toast.error('Failed to convert to Tax Invoice: ' + (err.message || 'Unknown error'));
        } finally {
            setSaving(false);
        }
    };

    const handleGenerateAssociatedDoc = async (targetType) => {
        if (isNew || !formData.assigned_job_no) return;
        
        setSaving(true);
        try {
            const activeId = currentIdRef.current;
            // 1. Generate Next Number for Target Type based on Job Number
            const parts = formData.assigned_job_no.split('-');
            const jobPrefix = parts[0];
            const jobNoPart = parts.slice(1).join('-');
            const prefixMap = {
                'Order Acknowledgment': 'ORA',
                'Delivery Order': 'DO',
                'Packing List': 'PKL',
                'Proforma Invoice': 'PRO',
                'Tax Invoice': 'INV',
                'Certificate': 'CERT',
                'Service Report': 'SR'
            };
            const basePrefix = prefixMap[targetType] || 'DOC';
            const docPrefix = (jobPrefix !== 'CEL') ? `${jobPrefix}-` : '';
            const prefix = `${docPrefix}${basePrefix}`;
            const nextNo = `${prefix}-${jobNoPart}`;

            // 2. Check if already exists
            const { supabase } = await import('../../lib/supabase');
            const { data: existingDoc } = await supabase
                .from('workflow_documents')
                .select('id')
                .eq('document_no', nextNo)
                .maybeSingle();

            if (existingDoc) {
                if (window.confirm(`${targetType} (${nextNo}) already exists! Do you want to open it instead?`)) {
                    const slug = targetType.toLowerCase().replace(/ /g, '-');
                    navigate(`/workflows/editor/${slug}/${existingDoc.id}`);
                }
                setSaving(false);
                return;
            }

            // 3. Prepare Header
            const newDocData = {
                ...formData,
                id: undefined,
                document_type: targetType,
                document_no: nextNo,
                status: 'Draft',
                issue_date: new Date().toISOString().split('T')[0],
                is_job: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // 4. Save Document
            const { data: savedDoc, error } = await saveWorkflowDocument(newDocData, lineItems);
            if (error) throw error;

            toast.success(`${targetType} ${savedDoc.document_no} generated successfully!`);

            // 4. Automatic Archive to Drive (as requested)
            try {
                const token = getStoredToken();
                if (token) {
                    console.log('Archiving generated document to Drive...');
                    const pdfBlob = await generateSleekPDF({
                        ...savedDoc,
                        items: lineItems,
                        partners: partners.find(p => p.id === savedDoc.partner_id),
                        vessels: vessels.find(v => v.id === savedDoc.vessel_id),
                        work_locations: workLocations.find(wl => wl.id === savedDoc.work_location_id)
                    }, settings, 'blob');

                    const rootId = await ensureJobFolder();
                    const stageFolder = await getOrCreateFolder(token, 'Worksuite', rootId);
                    
                    const filename = `${getDocumentDisplayName(savedDoc)}.pdf`;
                    await uploadFileToDrive(token, new File([pdfBlob], filename, { type: 'application/pdf' }), { folderId: stageFolder });
                }
            } catch (archiveErr) {
                console.warn('Auto-archive failed, but document record was created:', archiveErr);
            }

            // 5. Navigate to the new document
            const slug = targetType.toLowerCase().replace(/ /g, '-');
            navigate(`/workflows/editor/${slug}/${savedDoc.id}`);

        } catch (err) {
            console.error(err);
            toast.error('Failed to generate document: ' + err.message);
        } finally {
            setSaving(false);
        }
    };
    
    const handleRevertJobToQuotation = async () => {
        if (isNew || !formData.assigned_job_no) return;
        if (!window.confirm(`Are you sure you want to revert this Job Suite back to a Quotation? \n\nThis will DELETE all associated suite documents (CEL, ORA, DO, etc.) and restore the original Quotation to Draft status.`)) return;

        setSaving(true);
        try {
            await revertJobToQuotation(formData.assigned_job_no);
            alert('Job reverted successfully. Navigating to Quotation...');
            navigate('/workflows?type=Quotation');
        } catch (err) {
            console.error(err);
            alert('Failed to revert job: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleRevertQuotationToEnquiry = async () => {
        if (isNew) return;
        if (!window.confirm('Are you sure you want to revert this Quotation back to an Enquiry? \n\nThis will DELETE the current Quotation and create a new draft Enquiry.')) return;

        setSaving(true);
        try {
            const savedEnq = await revertQuotationToEnquiry(id);
            alert(`Quotation reverted successfully. New Enquiry: ${savedEnq.document_no}`);
            navigate(`/workflows/editor/enquiry/${savedEnq.id}`);
        } catch (err) {
            console.error(err);
            alert('Failed to revert quotation: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleReversePayment = async () => {
        if (isNew) return;
        if (!window.confirm('Are you sure you want to reverse/void this payment? \n\nThis will DELETE this payment document record and restore the outstanding balance of any associated invoice(s).')) return;

        setSaving(true);
        try {
            const { error } = await deleteWorkflowDocument(id);
            if (error) throw error;
            alert('Payment reversed successfully.');
            navigate('/workflows?type=Payment Received');
        } catch (err) {
            console.error(err);
            alert('Failed to reverse payment: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleConvertInvoiceToJob = async () => {
        if (isNew) return;
        setSaving(true);
        try {
            const saved = await handleSave();
            const activeId = saved?.id || currentIdRef.current;
            setPoModal({ isOpen: true, activeSourceId: activeId, isFromInvoice: true });
        } catch (err) {
            console.error(err);
            alert('Failed to save before conversion.');
        } finally {
            setSaving(false);
        }
    };

    const handleConvertJobToJobSuite = async () => {
        if (isNew) return;
        setSaving(true);
        try {
            const saved = await handleSave();
            const activeId = saved?.id || currentIdRef.current;
            
            const updatedDoc = {
                ...formData,
                is_job: true,
                assigned_job_no: formData.document_no,
                status: 'Confirmed'
            };

            const { data, error } = await saveWorkflowDocument(updatedDoc, lineItems);
            if (error) throw error;

            toast.success('Successfully converted to Job Suite!');
            
            const token = getStoredToken();
            if (token) {
                try {
                    console.log('Archiving Job Suite to Drive...');
                    const pdfBlob = await generateSleekPDF({
                        ...data,
                        items: lineItems,
                        partners: partners.find(p => p.id === data.partner_id),
                        vessels: vessels.find(v => v.id === data.vessel_id),
                        work_locations: workLocations.find(wl => wl.id === data.work_location_id)
                    }, settings, 'blob');

                    const rootId = await ensureJobFolder();
                    const stageFolder = await getOrCreateFolder(token, 'Worksuite', rootId);
                    
                    const filename = `${getDocumentDisplayName(data)}.pdf`;
                    await uploadFileToDrive(token, new File([pdfBlob], filename, { type: 'application/pdf' }), { folderId: stageFolder });
                } catch (archiveErr) {
                    console.warn('Auto-archive failed:', archiveErr);
                }
            }

            fetchDocument();
        } catch (err) {
            console.error(err);
            toast.error('Failed to convert to Job Suite: ' + err.message);
        } finally {
            setSaving(false);
        }
    };


    const handlePrint = async () => {
        if (isNew) {
            alert('Please Save the document first to preview and print.');
            return;
        }
        window.open(`/workflows/print/${id}?showSignature=${showSignature}`, '_blank');
    };

    const handleAnnotate = async () => {
        if (isNew) {
            alert('Please Save the document first to sign and annotate.');
            return;
        }
        setSaving(true);
        try {
            console.log('Generating PDF for annotation...');
            const pdfBlob = await generateSleekPDF({
                ...formData,
                items: lineItems,
                partners: partners.find(p => p.id === formData.partner_id),
                vessels: vessels.find(v => v.id === formData.vessel_id),
                work_locations: workLocations.find(wl => wl.id === formData.work_location_id)
            }, settings, 'blob');
            
            // Convert Blob to File so it can be passed via state
            const pdfFile = new File([pdfBlob], `${formData.document_no || 'Document'}.pdf`, { type: 'application/pdf' });
            
            // Navigate to the converter/editor tool with the PDF file
            navigate('/tools/converter', { state: { pdfFile } });
        } catch (err) {
            console.error('Annotation PDF generation failed:', err);
            alert('Failed to generate PDF for annotation. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleEmail = async () => {
        const partner = partners.find(p => p.id === formData.partner_id);
        const contact = contacts.find(c => c.id === formData.contact_id);

        const recipient = contact?.email || partner?.email1 || '';
        const subjectLine = getDocumentDisplayName();

        // Build items list for email body
        let itemsContent = "";
        if (lineItems.length > 0) {
            itemsContent = "\n\nQUOTATION DETAILS:\n" +
                "--------------------------------------------------\n" +
                "Description".padEnd(30) + "Qty".padStart(8) + "Total".padStart(12) + "\n" +
                "--------------------------------------------------\n";

            lineItems.forEach(item => {
                if (item.is_section) {
                    itemsContent += `\n[ ${item.description.toUpperCase()} ]\n`;
                } else if (item.is_note) {
                    itemsContent += `Note: ${item.description}\n`;
                } else {
                    const desc = (item.description || "").substring(0, 28).padEnd(30);
                    const qty = (item.quantity?.toString() || "0").padStart(8);
                    const amount = (parseFloat(item.amount || 0).toFixed(2)).padStart(12);
                    itemsContent += `${desc}${qty}${amount}\n`;
                }
            });

            itemsContent += "--------------------------------------------------\n";
            itemsContent += `TOTAL: ${formData.currency} ${(formData.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }).padStart(10)}\n`;
            itemsContent += "--------------------------------------------------\n";
        }

        const effectiveSalesperson = (isAnithaType && (formData.salesperson_name === 'N.R.KUMAR' || formData.salesperson_name === 'KUMAR' || !formData.salesperson_name)) ? 'ANITHA (Ms)' : (formData.salesperson_name || 'CEL-RON Team');
        const effectiveEmail = (isAnithaType && (formData.salesperson_email === 'sales@celron.net' || formData.salesperson_email === 'kumar@celron.net' || !formData.salesperson_email)) ? 'accounts@celron.net' : (formData.salesperson_email || 'sales@celron.net');
        const effectivePhone = (isAnithaType && (formData.salesperson_phone === '+65 97686891' || formData.salesperson_phone === '+65 81962270' || !formData.salesperson_phone)) ? '+6581962270' : (formData.salesperson_phone || '+6581962270');

        const defaultAddress = '10, Jln, Besar, "Sim Lim Tower", #03-05, Singapore 208787';
        const webInfo = isAnithaType ? '\nweb: www.celron.net / www.celron.shop' : '';
        let footer = `\n\nBest Regards,\n\n${effectiveSalesperson}\n${settings?.company_name || 'CELRON ENTERPRISES PTE LTD'}\n${settings?.address || defaultAddress}\nEmail: ${effectiveEmail} | Tel: ${effectivePhone}${webInfo}`;
        if (effectiveSalesperson.toUpperCase().includes('ANITHA')) {
            footer = `\n\nBest Regards,\n\nANITHA HP:+65 81962270\nCELRON ENTERPRISES PTE LTD\n10, Jln, Besar, " Sim Lim Tower" #03-05, Singapore 208787\nEmail: accounts@celron.net | Tel: +6591090347\nweb: www.celron.net / www.celron.shop`;
        }

        const effectiveType = (formData.document_type === 'Quotation' && (formData.document_no || '').startsWith('ORA')) ? 'Order Acknowledgment' : formData.document_type;
        const body = `Dear ${contact?.name || 'Customer'},\n\nPlease find attached the ${effectiveType} (${formData.document_no}) for your review.${itemsContent}${footer}`;

        // ---- Smart CC Logic ----------------------------------------------------
        let suggestedCc = [];
        const selectedPartnerForCc = partners.find(p => p.id === formData.partner_id);
        const selectedPartnerNameForCc = selectedPartnerForCc?.name;
        const partnerContacts = contacts.filter(c => {
            if (c.partnerId === formData.partner_id) return true;
            if (selectedPartnerNameForCc) {
                const contactPartner = partners.find(p => p.id === c.partnerId);
                return contactPartner && contactPartner.name && contactPartner.name.trim().toLowerCase() === selectedPartnerNameForCc.trim().toLowerCase();
            }
            return false;
        });
        
        // Match department to document type
        const docTypeLower = (formData.document_type || '').toLowerCase();
        let targetDepts = [];
        if (docTypeLower.includes('invoice') || docTypeLower.includes('statement')) targetDepts = ['account', 'finance', 'ap', 'payment'];
        if (docTypeLower.includes('order') && docTypeLower.includes('purchase')) targetDepts = ['purchas', 'procur'];
        if (docTypeLower.includes('delivery') || docTypeLower.includes('packing')) targetDepts = ['logist', 'operat', 'warehouse'];

        if (targetDepts.length > 0) {
            const matches = partnerContacts.filter(c => 
                targetDepts.some(dept => (c.department || '').toLowerCase().includes(dept))
            );
            suggestedCc = matches.map(c => c.email).filter(e => e && e !== recipient);
        }

        // Also add partner's secondary email if not already recipient
        if (partner?.email2 && partner.email2 !== recipient && !suggestedCc.includes(partner.email2)) {
            suggestedCc.push(partner.email2);
        }

        setCustomVisibleContacts([]);
        setCustomOfficeContacts([]);
        setCompanySearch('');
        setOfficeSearch('');
        setShowCompanyDropdown(false);
        setShowOfficeDropdown(false);

        setEmailPreview({ 
            to: '', 
            cc: 'accounts@celron.net; acct.celron.sg@gmail.com', 
            bcc: 'celron.simlim0305@gmail.com', 
            subject: subjectLine, 
            body, 
            attachments: [] 
        });
    };

    const attachDocumentFromSuite = async (doc) => {
        if (saving) return;
        setSaving(true);
        try {
            const filename = `${doc.document_type}_${doc.document_no}.pdf`;
            
            // If already attached, skip
            if (emailPreview.attachments?.find(a => a.name === filename)) {
                alert('Already attached.');
                return;
            }

            console.log(`Attaching ${doc.document_no} to email...`);
            
            // Always generate suite document PDFs on-the-fly to guarantee high-fidelity,
            // non-blank, and 100% up-to-date rendering (applying offscreen coordinates and page-break fixes).
            let fileBlob = null;
            
            console.log(`Generating high-fidelity PDF for ${doc.document_no} on-the-fly...`);
            const { data: fullDoc, error } = await getWorkflowDocumentById(doc.id);
            if (error) throw error;
            if (!fullDoc) throw new Error("Document data not found in database.");
            
            fileBlob = await generateSleekPDF({
                ...fullDoc,
                items: fullDoc.items || [],
                partners: fullDoc.partners || partners.find(p => p.id === fullDoc.partner_id),
                vessels: fullDoc.vessels || vessels.find(v => v.id === fullDoc.vessel_id),
                work_locations: fullDoc.work_locations || workLocations.find(wl => wl.id === fullDoc.work_location_id)
            }, settings, 'blob');

            const file = new File([fileBlob], filename, { type: 'application/pdf' });
            setEmailPreview(prev => ({
                ...prev,
                attachments: [...(prev.attachments || []), file]
            }));
            
        } catch (err) {
            console.error('Failed to attach document:', err);
            alert('Failed to attach: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const attachGalleryFile = async (fileInfo) => {
        if (saving) return;
        setSaving(true);
        try {
            const token = getStoredToken();
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileInfo.id}?alt=media`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const blob = await response.blob();
            const file = new File([blob], fileInfo.name, { type: fileInfo.mimeType });
            
            setEmailPreview(prev => ({
                ...prev,
                attachments: [...(prev.attachments || []), file]
            }));
        } catch (err) {
            console.error('Failed to attach gallery photo:', err);
            alert('Failed to attach photo');
        } finally {
            setSaving(false);
        }
    };

    const handleWhatsApp = async () => {
        if (isNew) {
            alert('Please Save the document first to share.');
            return;
        }
        setWhatsappShareModal({ isOpen: true });
    };

    const handleNextFloat = async (index, suppliersList = null, sourceDocId = null) => {
        const list = suppliersList || floatingProcess.suppliers;
        const activeSourceId = sourceDocId || currentIdRef.current;
        const suppId = list[index];
        if (!suppId) return;

        setSaving(true);
        try {
            // 1. Create the RFQ document (Duplicate current enquiry)
            // We pass the supplier ID to override the partner
            const { data: newDoc, error } = await duplicateWorkflowDocument(activeSourceId, { 
                partner_id: suppId, 
                status: 'Draft',
                document_type: 'Enquiry' 
            });
            
            if (error) throw error;

            // 2. Prepare the email preview for THIS supplier
            const supplier = partners.find(p => p.id === suppId);
            const recipient = supplier?.email1 || supplier?.email || '';
            const subject = `RFQ: ${newDoc.document_no} | ${newDoc.subject || ''}`;
            
            const effectiveSalesperson = (formData.salesperson_name === 'N.R.KUMAR' || formData.salesperson_name === 'KUMAR' || !formData.salesperson_name) ? 'ANITHA' : (formData.salesperson_name || 'CEL-RON Team');
            const effectiveEmail = (formData.salesperson_email === 'sales@celron.net' || formData.salesperson_email === 'kumar@celron.net' || !formData.salesperson_email) ? 'accounts@celron.net' : (formData.salesperson_email || 'sales@celron.net');
            const effectivePhone = (formData.salesperson_phone === '+65 97686891' || formData.salesperson_phone === '+65 81962270' || !formData.salesperson_phone) ? '+65 91090347' : (formData.salesperson_phone || '+65 81962270');

            const defaultAddress = '10, Jln, Besar, "Sim Lim Tower", #03-05, Singapore 208787';
            let footer = `\n\nBest Regards,\n\n${effectiveSalesperson}\n${settings?.company_name || 'CELRON ENTERPRISES PTE LTD'}\n${settings?.address || defaultAddress}\nEmail: ${effectiveEmail} | Tel: ${effectivePhone}`;
            if (effectiveSalesperson.toUpperCase().includes('ANITHA')) {
                footer = `\n\nBest Regards,\n\nANITHA HP:+65 81962270\nCELRON ENTERPRISES PTE LTD\n10, Jln, Besar, " Sim Lim Tower" #03-05, Singapore 208787\nEmail: accounts@celron.net | Tel: +6591090347\nweb: www.celron.net / www.celron.shop`;
            }
            const body = `Dear ${supplier?.name || 'Supplier'},\n\nPlease find attached our Request for Quotation (${newDoc.document_no}) for your review.\n\nPlease provide your best pricing and lead time.\n\n${footer}`;

            // We need to set the current document context for the PDF generator in sendEmail
            // Since we are not navigating, we just pass the info to the email preview
            setCustomVisibleContacts([]);
            setCustomOfficeContacts([]);
            setCompanySearch('');
            setOfficeSearch('');
            setShowCompanyDropdown(false);
            setShowOfficeDropdown(false);

            setEmailPreview({ 
                to: recipient, 
                cc: 'accounts@celron.net; acct.celron.sg@gmail.com', 
                bcc: 'celron.simlim0305@gmail.com', 
                subject, 
                body, 
                attachments: [],
                isFloat: true,
                floatDocId: newDoc.id,
                floatDocNo: newDoc.document_no
            });

            setFloatingProcess({
                isActive: true,
                suppliers: list,
                currentIndex: index
            });
            
            setShowFloatModal(false);
        } catch (err) {
            console.error('Float error:', err);
            alert('Failed to process float for supplier: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const performWhatsAppShare = async (customMessage, phone = null) => {
        setSaving(true);
        try {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            let popup = null;
            // On desktop, we MUST open the popup immediately before any async await to avoid popup blockers
            if (!isMobile && phone) {
                const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(customMessage || '')}`;
                popup = window.open(waUrl, '_blank');
            }

            // High Fidelity PDF Generation from the unified layout
            console.log('Generating high-fidelity PDF from layout...');
            const element = printRef.current;
            const opt = {
                margin: 0,
                filename: `${getDocumentDisplayName()}.pdf`,
                image: { type: 'jpeg', quality: 0.92 },
                html2canvas: { 
                    scale: 2, 
                    useCORS: true, 
                    allowTaint: false,
                    scrollX: 0,
                    scrollY: 0,
                    logging: false,
                    windowWidth: 1000 
                },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            };

            if (isMobile && navigator.share && navigator.canShare && !phone) {
                // Use native share on mobile when no specific phone is targeted
                const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');
                const file = new File([pdfBlob], opt.filename, { type: 'application/pdf' });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: opt.filename, text: customMessage || '' });
                } else {
                    await html2pdf().set(opt).from(element).save();
                    alert("PDF downloaded! Please attach it manually to your WhatsApp chat.");
                }
            } else {
                // On Desktop, or when targeting a specific phone: Download PDF directly using html2pdf's built-in save
                await html2pdf().set(opt).from(element).save();

                if (!phone) {
                    alert("PDF downloaded! Please attach it manually to your WhatsApp chat.");
                }
            }
        } catch (err) {
            console.error('[WhatsApp Share] Direct file share failed:', err);
            alert(`Failed to share or download PDF. Error: ${err.message || err}`);
        } finally {
            setSaving(false);
        }
    };

    const sendEmail = async () => {
        setSaving(true);
        try {
            // Determine if we are in a floating process
            const isFloat = emailPreview?.isFloat;
            const targetDocId = isFloat ? emailPreview.floatDocId : id;
            const targetDocNo = isFloat ? emailPreview.floatDocNo : formData.document_no;
            const targetDocType = isFloat ? 'Enquiry' : formData.document_type;

            if (!isFloat) {
                const newStatus = formData.status === 'Draft' ? 'Sent' : formData.status;
                const updatedData = { ...formData, status: newStatus };
                setFormData(updatedData);

                if (!isNew) {
                    const dataToSave = { ...updatedData, company_id: profile.company_id };
                    await saveWorkflowDocument(dataToSave, lineItems);
                }
            } else {
                // Update status of the floated document to Sent
                await supabase.from('workflow_documents').update({ status: 'Sent' }).eq('id', targetDocId);
            }

            // High Fidelity PDF Generation
            let pdfBlob;
            if (isFloat) {
                console.log('Generating PDF for floated RFQ...');
                const { data: floatDoc } = await getWorkflowDocumentById(targetDocId);
                pdfBlob = await generateSleekPDF({
                    ...floatDoc,
                    partners: floatDoc.partners || partners.find(p => p.id === floatDoc.partner_id),
                    vessels: floatDoc.vessels || vessels.find(v => v.id === floatDoc.vessel_id),
                    work_locations: floatDoc.work_locations || workLocations.find(wl => wl.id === floatDoc.work_location_id)
                }, settings, 'blob');
            } else {
                console.log('Generating high-fidelity PDF from layout...');
                const element = printRef.current;
                const opt = {
                    margin: 0,
                    filename: `${getDocumentDisplayName(isFloat ? { ...formData, document_type: targetDocType, document_no: targetDocNo } : null)}.pdf`,
                    image: { type: 'jpeg', quality: 0.92 },
                    html2canvas: { scale: 2, useCORS: true, allowTaint: false, scrollX: 0, scrollY: 0, logging: false, windowWidth: 1000 },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
                    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
                };
                pdfBlob = await html2pdf().set(opt).from(element).output('blob');
            }

            const reader = new FileReader();
            const b64Pdf = await new Promise((resolve) => {
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(pdfBlob);
            });

            // Determine sender
            const isAccountDoc = ['Invoice', 'Receipt', 'Credit Note'].includes(targetDocType);
            const fallbackSalesEmail = settings?.sales_email || 'sales@celron.net';
            const fallbackAccountsEmail = settings?.accounts_email || 'accounts@celron.net';
            const fromEmail = isAccountDoc ? fallbackAccountsEmail : fallbackSalesEmail;

            const systemPdf = {
                name: `${targetDocType}_${targetDocNo || 'Draft'}.pdf`,
                content: `base64,${b64Pdf}`,
                type: 'application/pdf'
            };

            const customAttachments = await Promise.all((emailPreview.attachments || []).map(async (file) => {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve({ name: file.name, type: file.type, content: e.target.result });
                    reader.readAsDataURL(file);
                });
            }));

            const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_id: profile.company_id,
                    from_email: fromEmail,
                    to: emailPreview.to,
                    cc: emailPreview.cc,
                    bcc: emailPreview.bcc,
                    subject: emailPreview.subject,
                    body: emailPreview.body,
                    attachments: [systemPdf, ...customAttachments]
                })
            });

            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Server error');
                
                alert(`Email dispatched successfully!`);
                setEmailPreview(null);

                // Handle sequential floating
                if (isFloat && floatingProcess.isActive) {
                    const nextIndex = floatingProcess.currentIndex + 1;
                    if (nextIndex < floatingProcess.suppliers.length) {
                        handleNextFloat(nextIndex);
                    } else {
                        alert(`Finished floating enquiry to ${floatingProcess.suppliers.length} suppliers.`);
                        setFloatingProcess({ isActive: false, suppliers: [], currentIndex: 0 });
                        navigate('/workflows');
                    }
                }
            } else {
                const text = await response.text();
                throw new Error('Email server error: ' + text.substring(0, 100));
            }
        } catch (err) {
            console.error('Failed to send email:', err);
            alert(`Failed to send email: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="text-center py-20">Loading Document...</div>;

    const renderModalContent = () => {
        const initialData = modal.initialData;
        switch (modal.type) {
            case 'partner_id':
            case 'contact_id': {
                // For either partner or contact, we now show both side-by-side
                const partner = partners.find(p => p.id === formData.partner_id) || (modal.type === 'partner_id' ? initialData : null);
                const contact = contacts.find(c => c.id === formData.contact_id) || (modal.type === 'contact_id' ? initialData : null);
                
                return (
                    <QuickPartnerContactDualAdd 
                        company_id={profile.company_id} 
                        initialPartner={partner || (['Enquiry', 'Purchase Order', 'RFQ'].includes(formData.document_type) ? { types: ['Supplier'] } : { types: ['Customer'] })}
                        initialContact={contact}
                        partners={partners}
                        onSuccess={handleQuickAddSuccess} 
                        onCancel={() => setModal({ isOpen: false, type: null })} 
                    />
                );
            }
            case 'vessel_id':
                return <QuickVesselAdd company_id={profile.company_id} initialData={initialData} onSuccess={handleQuickAddSuccess} onCancel={() => setModal({ isOpen: false, type: null })} />;
            case 'work_location_id':
                return <QuickWorkLocationAdd company_id={profile.company_id} initialData={initialData} onSuccess={handleQuickAddSuccess} onCancel={() => setModal({ isOpen: false, type: null })} />;
            case 'job_major':
                return <QuickJobMajorAdd company_id={profile.company_id} onSuccess={handleQuickAddSuccess} onCancel={() => setModal({ isOpen: false, type: null })} />;
            default:
                return null;
        }
    };

    const getModalTitle = () => {
        switch (modal.type) {
            case 'partner_id': 
            case 'contact_id': return 'Customer & Contact Management';
            case 'vessel_id': return 'Add New Vessel';
            case 'work_location_id': return 'Add New Location';
            case 'job_major': return 'Add New Job Category';
            default: return '';
        }
    };

    const getModalIcon = () => {
        switch (modal.type) {
            case 'partner_id': return User;
            case 'contact_id': return Users;
            case 'vessel_id': return Ship;
            case 'work_location_id': return MapPin;
            case 'job_major': return Plus;
            default: return Settings;
        }
    };

    const handleGoBack = () => {
        if (window.history.state && window.history.state.idx > 0) {
            navigate(-1);
        } else {
            const docType = (formData?.document_type || type || '').toLowerCase();
            if (docType.includes('job')) {
                navigate('/workflows/jobs-dashboard');
            } else if (docType.includes('enquiry')) {
                navigate('/enquiries');
            } else if (docType.includes('quotation')) {
                navigate('/quotations');
            } else if (docType.includes('purchase')) {
                navigate('/purchase-orders');
            } else if (docType.includes('delivery')) {
                navigate('/delivery-orders');
            } else if (docType.includes('service')) {
                navigate('/service-reports');
            } else if (docType.includes('proforma')) {
                navigate('/proforma-invoices');
            } else if (docType.includes('packing')) {
                navigate('/packing-lists');
            } else if (docType.includes('invoice') || docType.includes('tax')) {
                navigate('/invoices');
            } else if (docType.includes('certificate')) {
                navigate('/workflows?type=Certificate');
            } else if (docType.includes('payment received')) {
                navigate('/workflows?type=Payment Received');
            } else if (docType.includes('order acknowledgment')) {
                navigate('/workflows?type=Order Acknowledgment');
            } else if (docType.includes('statement') || docType.includes('soa')) {
                navigate('/soa');
            } else {
                navigate('/workflows');
            }
        }
    };

    return (
        <div className="workflow-editor-theme" style={{ overflow: 'visible' }}>
            {/* Header / Actions */}
            <header className="editor-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className="icon-btn" onClick={handleGoBack} title="Go Back">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                            {formData.document_type}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <input 
                                    type="text" 
                                    value={formData.document_no || ''} 
                                    onChange={(e) => {
                                        const nextVal = e.target.value.toUpperCase();
                                        setFormData(prev => {
                                            const updated = { ...prev, document_no: nextVal };
                                            if (prev.document_type === 'Job') {
                                                updated.assigned_job_no = nextVal;
                                            }
                                            return updated;
                                        });
                                    }}
                                    className="doc-no-input"
                                    style={{
                                        fontSize: '1.25rem',
                                        fontWeight: 800,
                                        color: 'var(--text-primary)',
                                        background: 'transparent',
                                        border: 'none',
                                        padding: '0 4px',
                                        margin: 0,
                                        width: 'auto',
                                        minWidth: '150px',
                                        outline: 'none',
                                        fontFamily: 'inherit',
                                        cursor: 'text'
                                    }}
                                    placeholder="Draft"
                                    title="Click to edit document number"
                                />
                                <Pencil size={12} style={{ color: '#94a3b8', pointerEvents: 'none', opacity: 0.5 }} />
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* Primary Actions */}
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', gap: '4px' }}>
                        <button className="btn-vibrant" onClick={handleSave} disabled={saving} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                            <Save size={16} /> {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button 
                            className={`btn-vibrant-secondary ${!showSignature ? 'off' : ''}`} 
                            onClick={() => setShowSignature(!showSignature)}
                            style={{ 
                                background: showSignature ? '#fff' : 'transparent', 
                                border: showSignature ? '1px solid #e2e8f0' : 'none',
                                padding: '8px 12px',
                                fontSize: '0.85rem'
                            }}
                            title={showSignature ? "Signature Visible" : "Signature Hidden"}
                        >
                            {showSignature ? <Eye size={16} /> : <EyeOff size={16} color="#94a3b8" />}
                        </button>
                        <button className="btn-vibrant-secondary" onClick={handlePrint} style={{ border: 'none', background: 'transparent', padding: '8px 12px', fontSize: '0.85rem' }} title="Print PDF">
                            <Printer size={16} /> <span className="hide-sm">Print</span>
                        </button>
                        <button className="btn-vibrant-secondary" onClick={handleAnnotate} disabled={saving} style={{ border: 'none', background: 'transparent', padding: '8px 12px', fontSize: '0.85rem' }} title="Sign & Annotate">
                            <Pencil size={16} /> <span className="hide-sm">Sign</span>
                        </button>
                    </div>

                    {/* Communication */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn-vibrant-secondary" onClick={handleEmail} style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
                            <Send size={16} /> <span className="hide-sm">Email</span>
                        </button>
                        <button className="btn-vibrant-secondary" style={{ background: '#25D366', color: '#fff', border: 'none', padding: '8px 12px', fontSize: '0.85rem' }} onClick={handleWhatsApp}>
                            <MessageSquare size={16} /> <span className="hide-sm">WhatsApp</span>
                        </button>
                    </div>

                    {/* Financial / Ops */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {(formData.document_type === 'Tax Invoice' || formData.document_type === 'Proforma Invoice') && !isNew && (
                            <button 
                                className="btn-vibrant" 
                                style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 12px', fontSize: '0.85rem' }} 
                                onClick={() => {
                                    setPaymentPrefill(formData);
                                    setShowPaymentModal(true);
                                }}
                            >
                                <CreditCard size={16} /> <span className="hide-sm">Payment</span>
                            </button>
                        )}
                        {!isNew && (
                            <button className="btn-vibrant-secondary" onClick={handleRevision} style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
                                <FileText size={16} /> <span className="hide-sm">Revision</span>
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '4px' }}>
                        {!isNew && canAdmin && (
                            formData.document_type === 'Quotation' ||
                            ((formData.document_type === 'Tax Invoice' || formData.document_type === 'Proforma Invoice') && !formData.is_job) ||
                            (formData.is_job || formData.document_type === 'Job') ||
                            formData.document_type === 'Payment Received'
                        ) && (
                            <div className="dropdown" style={{ position: 'relative' }}>
                                <button className="btn-vibrant-secondary" style={{ background: '#64748b', color: '#fff', border: 'none', padding: '8px 12px', fontSize: '0.85rem' }}>
                                    <RefreshCw size={16} /> <span className="hide-sm">Reverse</span> <ChevronDown size={14} />
                                </button>
                                <div className="dropdown-content">
                                    {formData.document_type === 'Quotation' && (
                                        <button onClick={handleRevertQuotationToEnquiry}>Revert Quotation to Enquiry</button>
                                    )}
                                    {(formData.document_type === 'Tax Invoice' || formData.document_type === 'Proforma Invoice') && !formData.is_job && (
                                        <button onClick={handleConvertInvoiceToJob}>Convert to Job Suite</button>
                                    )}
                                    {(formData.is_job || formData.document_type === 'Job') && (
                                        <>
                                            <button onClick={handleRevertJobToQuotation}>Revert Job to Quotation</button>
                                            {!formData.is_job && (
                                                <button onClick={handleConvertJobToJobSuite}>Convert to Job Suite</button>
                                            )}
                                        </>
                                    )}
                                    {formData.document_type === 'Payment Received' && (
                                        <button onClick={handleReversePayment}>Reverse / Void Payment</button>
                                    )}
                                </div>
                            </div>
                        )}

                        {!isNew && (formData.document_type?.toUpperCase() === 'QUOTATION' || formData.document_type?.toUpperCase() === 'ENQUIRY') && (
                            <button 
                                className="btn-vibrant" 
                                onClick={handleConvertToJob} 
                                disabled={saving || formData.is_job} 
                                style={{ 
                                    background: formData.is_job ? '#94a3b8' : '#10b981', 
                                    padding: '8px 12px',
                                    fontSize: '0.85rem',
                                    opacity: (saving || formData.is_job) ? 0.7 : 1,
                                    cursor: formData.is_job ? 'default' : 'pointer'
                                }}
                            >
                                {formData.is_job ? <FileCheck size={16} /> : <Package size={16} />} 
                                <span className="hide-sm">{formData.is_job ? 'Already Job' : 'To Job'}</span>
                            </button>
                        )}

                        {!isNew && formData.is_job && (
                            <div className="dropdown" style={{ position: 'relative' }}>
                                <button className="btn-vibrant" style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '8px 12px', fontSize: '0.85rem' }}>
                                    <Plus size={16} /> <span className="hide-sm">Suite</span> <ChevronDown size={14} />
                                </button>
                                <div className="dropdown-content">
                                    <button onClick={() => handleGenerateAssociatedDoc('Order Acknowledgment')}>Order Acknowledgment (ORA)</button>
                                    <button onClick={() => handleGenerateAssociatedDoc('Delivery Order')}>Delivery Order (DO)</button>
                                    <button onClick={() => handleGenerateAssociatedDoc('Packing List')}>Packing List (PKL)</button>
                                    <button onClick={() => handleGenerateAssociatedDoc('Proforma Invoice')}>Proforma Invoice (PRO)</button>
                                    <button onClick={() => handleGenerateAssociatedDoc('Tax Invoice')}>Tax Invoice (INV)</button>
                                    <button onClick={() => handleGenerateAssociatedDoc('Certificate')}>Certificate (CERT)</button>
                                    <button onClick={() => handleGenerateAssociatedDoc('Service Report')}>Service Report (SR)</button>
                                </div>
                            </div>
                        )}

                        {!isNew && formData.document_type === 'Proforma Invoice' && (
                            <button 
                                className="btn-vibrant" 
                                onClick={handleConvertToTaxInvoice} 
                                disabled={saving} 
                                style={{ background: '#ef4444', padding: '8px 12px', fontSize: '0.85rem' }}
                            >
                                <FileText size={16} /> <span className="hide-sm">To Invoice</span>
                            </button>
                        )}
                    </div>

                    <button className="icon-btn" onClick={handleGoBack} style={{ background: '#fee2e2', color: '#ef4444', border: 'none' }} title="Close Editor">
                        <X size={20} />
                    </button>
                </div>
            </header>

            {/* Breadcrumb Status */}
            <div className="status-container">
                {['Draft', 'Sent', 'Confirmed', 'Cancelled'].map((s) => (
                    <div 
                        key={s}
                        className={`status-step ${formData.status === s ? (s === 'Confirmed' ? 'confirmed' : s === 'Cancelled' ? 'cancelled' : 'active') : ''}`}
                        onClick={async () => {
                            if (!canAdmin) return;
                            if (formData.status === s) return;
                            const confirmed = window.confirm(`Change status to ${s}?`);
                            if (confirmed) {
                                try {
                                    const updatePayload = { status: s };
                                    if (formData.document_type === 'Job' && s === 'Confirmed') {
                                        updatePayload.is_job = true;
                                        updatePayload.assigned_job_no = formData.document_no;
                                    }
                                    const { error } = await supabase.from('workflow_documents').update(updatePayload).eq('id', id);
                                    if (error) throw error;
                                    
                                    const updatedDoc = { 
                                        ...formData, 
                                        status: s,
                                        ...(formData.document_type === 'Job' && s === 'Confirmed' ? { is_job: true, assigned_job_no: formData.document_no } : {})
                                    };
                                    setFormData(updatedDoc);
                                    toast.success(`Status updated to ${s}`);

                                    if (formData.document_type === 'Job' && s === 'Confirmed') {
                                        autoUploadPDF(updatedDoc);
                                    }
                                } catch (err) {
                                    toast.error('Failed to update status');
                                }
                            }
                        }}
                        style={{ cursor: canAdmin ? 'pointer' : 'default', position: 'relative' }}
                        title={
                            s === 'Draft' ? 'Working copy, not yet finalized' :
                            s === 'Sent' ? 'Document shared with customer/supplier' :
                            s === 'Confirmed' ? 'Officially accepted/Job started' :
                            'Document voided'
                        }
                    >
                        {s}
                        {formData.status === s && <Info size={10} style={{ position: 'absolute', top: 2, right: 2 }} />}
                    </div>
                ))}
            </div>

            <div className="editor-content">
                {/* Google Drive Integration card */}
                <div className="glass-panel animate-fade-in" style={{ padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)', marginBottom: '24px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.04) 0%, rgba(16, 185, 129, 0.04) 100%)', backdropFilter: 'blur(8px)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FolderOpen size={28} color="#f59e0b" fill="#f59e0b" fillOpacity={0.1} />
                            </div>
                            <div>
                                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Google Drive Workspace Folder</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '2px', margin: 0 }}>Access the centralized repository containing all job files and related documentation.</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button 
                                onClick={() => navigate('/workflows?type=Job')}
                                className="btn btn-secondary" 
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, padding: '10px 16px', borderRadius: '8px' }}
                            >
                                <List size={16} /> View Job List Table
                            </button>
                            <button 
                                onClick={handleOpenJobDrive} 
                                className="btn btn-secondary" 
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', borderColor: '#3b82f6', color: '#1d4ed8', background: '#eff6ff', fontWeight: 700, padding: '10px 16px', transition: 'all 0.2s', borderRadius: '8px' }}
                            >
                                <Folder size={16} fill="#3b82f6" fillOpacity={0.15} /> Open Job Folder
                            </button>
                            <button 
                                onClick={handleOpenRootDrive} 
                                className="btn btn-secondary" 
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', borderColor: '#f59e0b', color: '#b45309', background: '#fffbeb', fontWeight: 700, padding: '10px 16px', transition: 'all 0.2s', borderRadius: '8px' }}
                            >
                                <ExternalLink size={16} /> Open Drive Root
                            </button>
                        </div>
                    </div>
                </div>

                {/* Header Info Panel */}
                <div className="glass-panel header-panel">
                    <div className="input-grid">
                        <div className="col-left">
                            <div className="form-item">
                                <label><User size={14} /> {formData.document_type === 'Purchase Order' ? 'Supplier' : 'Customer'}</label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <SearchableSelect 
                                            options={(() => {
                                                const filtered = partners.filter(p => formData.document_type !== 'Purchase Order' || (p.types && p.types.includes('Supplier')) || p.category === 'Supplier');
                                                const unique = [];
                                                const seen = new Set();
                                                filtered.forEach(p => {
                                                    const key = (p.name || '').trim().toLowerCase();
                                                    if (key && !seen.has(key)) {
                                                        seen.add(key);
                                                        unique.push(p);
                                                    }
                                                });
                                                return unique;
                                            })()}
                                            value={formData.partner_id}
                                            onChange={handleHeaderChange}
                                            name="partner_id"
                                            placeholder={`Choose ${formData.document_type === 'Purchase Order' ? 'supplier' : 'partner'}...`}
                                            className="flex-1"
                                            onAddNew={() => setModal({ isOpen: true, type: 'partner_id' })}
                                            addNewText={formData.document_type === 'Purchase Order' ? "Add New Supplier" : "Add New Customer"}
                                        />
                                        {formData.partner_id && (
                                            <button 
                                                className="icon-btn" 
                                                onClick={() => handleEditMaster('partner_id')} 
                                                style={{ padding: '8px', background: '#f8fafc' }}
                                                title="Edit Customer"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                        )}
                                        <button 
                                            className="icon-btn" 
                                            onClick={() => setModal({ isOpen: true, type: 'partner_id' })}
                                            style={{ padding: '8px', background: '#f8fafc' }}
                                            title="Add New Partner"
                                        >
                                            <Plus size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="form-item">
                                <label><MoreHorizontal size={14} /> Contact Person</label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <select className="form-select" name="contact_id" value={formData.contact_id} onChange={handleHeaderChange} style={{ flex: 1 }}>
                                            <option value="">Choose contact...</option>
                                            <option value="ADD_NEW" style={{ fontWeight: 700, color: 'var(--accent)' }}>+ Add New Contact</option>
                                            {(() => {
                                                const selectedPartner = partners.find(p => p.id === formData.partner_id);
                                                const selectedPartnerName = selectedPartner?.name;
                                                return contacts
                                                    .filter(c => {
                                                        if (!formData.partner_id) return false;
                                                        if (c.partnerId === formData.partner_id) return true;
                                                        if (selectedPartnerName) {
                                                            const contactPartner = partners.find(p => p.id === c.partnerId);
                                                            return contactPartner && contactPartner.name && contactPartner.name.trim().toLowerCase() === selectedPartnerName.trim().toLowerCase();
                                                        }
                                                        return false;
                                                    })
                                                    .map(c => {
                                                        const pName = partners.find(p => p.id === c.partnerId)?.name;
                                                        return <option key={c.id} value={c.id}>{c.name} {pName ? `(${pName})` : ''}</option>;
                                                    });
                                            })()}
                                        </select>
                                        {formData.contact_id && (
                                            <button 
                                                className="icon-btn" 
                                                onClick={() => handleEditMaster('contact_id')} 
                                                style={{ padding: '8px', background: '#f8fafc' }}
                                                title="Edit Contact"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                        )}
                                        <button 
                                            className="icon-btn" 
                                            onClick={() => setModal({ isOpen: true, type: 'contact_id' })}
                                            style={{ padding: '8px', background: '#f8fafc' }}
                                            title="Add New Contact"
                                        >
                                            <Plus size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="form-item">
                                <label><FileText size={14} /> Customer Reference</label>
                                <input type="text" className="form-input" name="customer_ref" value={formData.customer_ref} onChange={handleHeaderChange} placeholder="Customer's PO or Ref No." />
                            </div>
                            <div className="form-item">
                                <label><FileText size={14} /> Subject / Project Name</label>
                                <input type="text" className="form-input" name="subject" value={formData.subject} onChange={handleHeaderChange} placeholder="What is this for?" />
                            </div>
                            <div className="form-item">
                                <label><User size={14} /> Salesperson (Assigned)</label>
                                <select 
                                    className="form-select" 
                                    name="salesperson_name" 
                                    value={formData.salesperson_name} 
                                    onChange={(e) => {
                                        const selected = staff.find(s => s.full_name === e.target.value);
                                        if (selected) {
                                            setFormData(prev => ({
                                                ...prev,
                                                salesperson_name: selected.full_name,
                                                salesperson_phone: selected.phone || '',
                                                salesperson_email: selected.professional_email || selected.email || ''
                                            }));
                                        } else {
                                            handleHeaderChange(e);
                                        }
                                    }}
                                >
                                    <option value="">-- Choose Salesperson --</option>
                                    {staff.map(s => (
                                        <option key={s.id} value={s.full_name}>{s.full_name} ({s.designation || 'Staff'})</option>
                                    ))}
                                </select>
                            </div>

                            {(formData.document_type === 'Job' || formData.is_job) && (
                                <>
                                    <div className="form-item" style={{ marginTop: '16px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                            Job Major Category
                                        </label>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <select 
                                                className="form-select" 
                                                value={formData.delivery_verification?.job_major || ''} 
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        delivery_verification: {
                                                            ...(prev.delivery_verification || {}),
                                                            job_major: val
                                                        }
                                                    }));
                                                }}
                                                style={{ flex: 1 }}
                                            >
                                                <option value="">-- Choose Job Major --</option>
                                                {getJobMajorOptions().map(opt => (
                                                    <option key={opt} value={opt}>{opt}</option>
                                                ))}
                                                <option value="Other">Other / Custom...</option>
                                            </select>
                                            <button 
                                                type="button"
                                                className="icon-btn" 
                                                onClick={() => setModal({ isOpen: true, type: 'job_major' })}
                                                style={{ padding: '8px', background: '#f8fafc' }}
                                                title="Add New Job Major Category"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {formData.delivery_verification?.job_major === 'Other' && (
                                        <div className="form-item" style={{ marginTop: '12px' }}>
                                            <label style={{ fontWeight: 600 }}>Custom Job Major</label>
                                            <input 
                                                type="text" 
                                                className="form-input" 
                                                value={formData.delivery_verification?.job_major_custom || ''} 
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        delivery_verification: {
                                                            ...(prev.delivery_verification || {}),
                                                            job_major_custom: val
                                                        }
                                                    }));
                                                }}
                                                placeholder="Enter custom job major category"
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="col-right">
                            {(formData.is_job || ['Job', 'Order Acknowledgment', 'Delivery Order', 'Packing List', 'Proforma Invoice', 'Tax Invoice', 'Certificate', 'Service Report'].includes(formData.document_type) || formData.assigned_job_no) && (
                                <div className="form-item" style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0', marginBottom: '16px' }}>
                                    <label style={{ color: '#166534', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                        <Package size={14} /> Assigned Job Number
                                    </label>
                                    <input 
                                        type="text" 
                                        className="form-input" 
                                        style={{ 
                                            fontSize: '1.2rem', 
                                            fontWeight: 800, 
                                            color: '#15803d', 
                                            background: '#ffffff', 
                                            border: '1px solid #86efac',
                                            borderRadius: '6px',
                                            padding: '4px 8px',
                                            marginTop: '6px',
                                            width: '100%',
                                            boxSizing: 'border-box'
                                        }} 
                                        value={formData.assigned_job_no || ''} 
                                        onChange={(e) => setFormData(prev => ({ ...prev, assigned_job_no: e.target.value }))}
                                        placeholder="e.g. CEL-2605-6059"
                                    />
                                    { (formData.drive_folder_id || formData.gdrive_folder_id) ? (
                                        <div style={{ marginTop: '8px' }}>
                                            <a 
                                                href={`https://drive.google.com/drive/folders/${formData.drive_folder_id || formData.gdrive_folder_id}`} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 600,
                                                    color: '#fff',
                                                    background: '#16a34a',
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    textDecoration: 'none',
                                                    transition: 'background 0.2s',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                }}
                                                onMouseOver={(e) => e.currentTarget.style.background = '#15803d'}
                                                onMouseOut={(e) => e.currentTarget.style.background = '#16a34a'}
                                            >
                                                <Folder size={14} /> Open Project Folder (Google Drive)
                                            </a>
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: '0.7rem', color: '#166534', marginTop: '6px', fontStyle: 'italic' }}>
                                            Folder will be provisioned on save.
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="form-item">
                                <label>Date</label>
                                <input type="date" className="form-input" name="issue_date" value={formData.issue_date} onChange={handleHeaderChange} />
                            </div>
                            <div className="form-item">
                                <label>Expiration / Due Date</label>
                                <input type="date" className="form-input" name="expiry_date" value={formData.expiry_date} onChange={handleHeaderChange} />
                            </div>
                            <div className="form-item">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label><Ship size={14} /> Vessel / Service Location</label>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <select 
                                            className="form-select" 
                                            name="vessel_id" 
                                            value={formData.vessel_id} 
                                            onChange={(e) => {
                                                if (e.target.value === 'ADD_NEW') {
                                                    setModal({ isOpen: true, type: 'vessel_id' });
                                                } else {
                                                    handleHeaderChange(e);
                                                }
                                            }} 
                                            style={{ width: '100%' }}
                                        >
                                            <option value="">[Vessel]</option>
                                            <option value="ADD_NEW" style={{ fontWeight: 700, color: 'var(--accent)' }}>+ Add New Vessel</option>
                                            {vessels.map(v => <option key={v.id} value={v.id}>{v.vessel_name}</option>)}
                                        </select>
                                        {formData.vessel_id && (
                                            <button 
                                                className="icon-btn"
                                                onClick={() => handleEditMaster('vessel_id')}
                                                style={{ padding: '8px', background: '#f8fafc' }}
                                                title="Edit Vessel"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                        )}
                                        {formData.vessel_id && (
                                            <a 
                                                href={`https://www.google.com/search?q=${encodeURIComponent((vessels.find(v => v.id === formData.vessel_id)?.vessel_name || '') + ' vessel')}`} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="btn btn-sm btn-secondary"
                                                style={{ padding: '8px', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                title="Search Vessel on Google"
                                            >
                                                <Search size={16} />
                                            </a>
                                        )}
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <select 
                                            className="form-select" 
                                            name="work_location_id" 
                                            value={formData.work_location_id} 
                                            onChange={(e) => {
                                                if (e.target.value === 'ADD_NEW') {
                                                    setModal({ isOpen: true, type: 'work_location_id' });
                                                } else {
                                                    handleHeaderChange(e);
                                                }
                                            }} 
                                            style={{ width: '100%' }}
                                        >
                                            <option value="">[Workplace]</option>
                                            <option value="ADD_NEW" style={{ fontWeight: 700, color: 'var(--accent)' }}>+ Add New Workplace</option>
                                            {workLocations.map(l => <option key={l.id} value={l.id}>{l.location_name}</option>)}
                                        </select>
                                        {formData.work_location_id && (
                                            <button 
                                                className="icon-btn"
                                                onClick={() => handleEditMaster('work_location_id')}
                                                style={{ padding: '8px', background: '#f8fafc' }}
                                                title="Edit Workplace"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            {formData.document_type === 'Delivery Order' && (
                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '16px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', marginBottom: '8px' }}>Delivery Details</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <input 
                                            type="text" 
                                            className="form-input" 
                                            name="delivery_verification.delivery_address" 
                                            value={formData.delivery_verification?.delivery_address || ''} 
                                            onChange={handleHeaderChange} 
                                            placeholder="Delivery Address" 
                                            style={{ fontSize: '12px', padding: '6px 10px' }}
                                        />
                                        <input 
                                            type="text" 
                                            className="form-input" 
                                            name="delivery_verification.delivery_pic" 
                                            value={formData.delivery_verification?.delivery_pic || ''} 
                                            onChange={handleHeaderChange} 
                                            placeholder="Person in Charge (PIC)" 
                                            style={{ fontSize: '12px', padding: '6px 10px' }}
                                        />
                                    </div>
                                </div>
                            )}

                             <div className="form-item">
                                <label>Currency</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <select className="form-select" name="currency" value={formData.currency} onChange={handleHeaderChange} style={{ flex: 1 }}>
                                        <option value="SGD">SGD - Singapore Dollar</option>
                                        <option value="USD">USD - US Dollar</option>
                                        <option value="EUR">EUR - Euro</option>
                                        <option value="GBP">GBP - British Pound</option>
                                        <option value="INR">INR - Indian Rupee</option>
                                        <option value="MYR">MYR - Malaysian Ringgit</option>
                                        <option value="JPY">JPY - Japanese Yen</option>
                                        <option value="CHF">CHF - Swiss Franc</option>
                                        <option value="CAD">CAD - Canadian Dollar</option>
                                        <option value="AUD">AUD - Australian Dollar</option>
                                        <option value="CNY">CNY - Chinese Yuan</option>
                                        <option value="HKD">HKD - Hong Kong Dollar</option>
                                        <option value="NZD">NZD - New Zealand Dollar</option>
                                        <option value="KRW">KRW - South Korean Won</option>
                                        <option value="AED">AED - UAE Dirham</option>
                                        <option value="SAR">SAR - Saudi Riyal</option>
                                        <option value="THB">THB - Thai Baht</option>
                                        <option value="IDR">IDR - Indonesian Rupiah</option>
                                        <option value="PHP">PHP - Philippine Peso</option>
                                        <option value="VND">VND - Vietnamese Dong</option>
                                    </select>
                                    {formData.currency !== 'SGD' && (
                                        <div style={{ position: 'relative', width: '120px' }}>
                                            <input 
                                                type="number" 
                                                className="form-input" 
                                                name="exchange_rate" 
                                                value={formData.exchange_rate} 
                                                onChange={handleHeaderChange} 
                                                placeholder="Rate" 
                                                step="0.0001"
                                                title="Exchange rate to SGD"
                                            />
                                            <button 
                                                onClick={handleAiFetchExchangeRate} 
                                                disabled={isFetchingRate}
                                                style={{ 
                                                    position: 'absolute', 
                                                    right: '4px', 
                                                    top: '50%', 
                                                    transform: 'translateY(-50%)',
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'var(--accent)',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    padding: '4px'
                                                }}
                                            >
                                                {isFetchingRate ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {formData.currency !== 'SGD' && (
                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600 }}>
                                        1 {formData.currency} = {formData.exchange_rate} SGD
                                    </div>
                                )}
                            </div>

                            <div className="form-item">
                                <label>Payment Terms</label>
                                <select 
                                    className="form-select" 
                                    name="payment_terms_select" 
                                    value={formData.payment_terms && !['COD', 'Immediate', '7 Days', '14 Days', '30 Days', '60 Days', '90 Days', 'Advance Payment', '50% on Order and 50% on COD'].includes(formData.payment_terms) ? "CUSTOM" : (formData.payment_terms || "")} 
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === "CUSTOM") {
                                            setFormData(prev => ({ ...prev, payment_terms: "50% Advance, Balance COD" }));
                                        } else {
                                            setFormData(prev => ({ ...prev, payment_terms: val }));
                                        }
                                    }}
                                >
                                    <option value="">-- Select Payment Terms --</option>
                                    <option value="COD">COD - Cash on Delivery</option>
                                    <option value="Immediate">Immediate / Cash</option>
                                    <option value="7 Days">7 Days</option>
                                    <option value="14 Days">14 Days</option>
                                    <option value="30 Days">30 Days</option>
                                    <option value="60 Days">60 Days</option>
                                    <option value="90 Days">90 Days</option>
                                    <option value="Advance Payment">Advance Payment</option>
                                    <option value="50% on Order and 50% on COD">50% on Order and 50% on COD</option>
                                    <option value="CUSTOM">Custom...</option>
                                </select>
                                
                                {formData.payment_terms && !['COD', 'Immediate', '7 Days', '14 Days', '30 Days', '60 Days', '90 Days', 'Advance Payment', '50% on Order and 50% on COD'].includes(formData.payment_terms) && (
                                    <input 
                                        type="text" 
                                        className="form-input" 
                                        name="payment_terms" 
                                        value={formData.payment_terms} 
                                        onChange={(e) => setFormData(prev => ({ ...prev, payment_terms: e.target.value }))}
                                        placeholder="e.g. 50% Advance, Balance COD"
                                        style={{ marginTop: '8px', fontSize: '12px' }}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Job Description spans both columns */}
                        {(formData.document_type === 'Job' || formData.is_job) && (
                            <div className="form-item" style={{ gridColumn: 'span 2', marginTop: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                    Job Description (for search)
                                </label>
                                <div style={{ background: '#fff', borderRadius: '12px', padding: '8px', border: '1px solid #e2e8f0' }}>
                                    <RichTextEditor 
                                        value={formData.delivery_verification?.job_description || ''} 
                                        onChange={(val) => {
                                            setFormData(prev => ({
                                                ...prev,
                                                delivery_verification: {
                                                    ...(prev.delivery_verification || {}),
                                                    job_description: val
                                                }
                                            }));
                                        }}
                                        placeholder="Detailed description of the job for future search"
                                        height="120px"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Action Tabs */}
                <div className="tab-container">
                    <button className={`tab tab-items ${activeTab === 'items' ? 'active' : ''}`} onClick={() => setActiveTab('items')}>
                        <Package size={16} /> Order Lines
                    </button>
                    <button className={`tab tab-other ${activeTab === 'other' ? 'active' : ''}`} onClick={() => setActiveTab('other')}>
                        <CreditCard size={16} /> PO & Reference Info
                    </button>
                    {(formData.assigned_job_no || formData.is_job || formData.document_type === 'Job') && (
                        <button className={`tab tab-workflow ${activeTab === 'workflow' ? 'active' : ''}`} onClick={() => setActiveTab('workflow')}>
                            <FileText size={16} /> Workflow Suite
                        </button>
                    )}
                    {(formData.assigned_job_no || formData.is_job || formData.document_type === 'Job') && (
                        <button className={`tab tab-costing ${activeTab === 'costing' ? 'active' : ''}`} onClick={() => setActiveTab('costing')}>
                            <Calculator size={16} /> Project Costing
                        </button>
                    )}
                    {(formData.assigned_job_no || formData.is_job || formData.document_type === 'Job') && (
                        <button className={`tab tab-payments ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>
                            <DollarSign size={16} /> Payments & GST
                        </button>
                    )}
                    <button className={`tab tab-gallery ${activeTab === 'gallery' ? 'active' : ''}`} onClick={() => setActiveTab('gallery')}>
                        <Image size={16} /> Photos & Media
                    </button>
                    <button className={`tab tab-explorer ${activeTab === 'explorer' ? 'active' : ''}`} onClick={() => setActiveTab('explorer')}>
                        <FolderOpen size={16} /> Explorer
                    </button>
                </div>

                {activeTab === 'gallery' && (
                    <div className="glass-panel job-gallery animate-fade-in">
                        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Ship size={20} className="text-accent" />
                                <h3 style={{ margin: 0 }}>Project Photos & Media</h3>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                {loadingGallery && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '120px', height: '6px', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                            <div style={{ width: `${galleryUploadProgress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s ease' }} />
                                        </div>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)' }}>{galleryUploadProgress}%</span>
                                    </div>
                                )}
                                {galleryUploadSuccess && (
                                    <div className="animate-bounce" style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 600 }}>
                                        <FileCheck size={18} /> Upload Success!
                                    </div>
                                )}
                                {(formData.drive_folder_id || formData.gdrive_folder_id) && (
                                    <a 
                                        href={`https://drive.google.com/drive/folders/${formData.drive_folder_id || formData.gdrive_folder_id}`} 
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
                                    onClick={() => setShowOCRModal(true)}
                                    style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)', border: '1px solid #ddd6fe', color: '#7c3aed' }}
                                >
                                    <Sparkles size={16} /> Smart OCR
                                </button>
                                <label className="btn btn-primary" style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
                                    <Upload size={16} /> Upload Photo
                                    {loadingGallery && <div className="btn-loading-overlay" />}
                                    <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => {
                                        const files = Array.from(e.target.files);
                                        // For simplicity, we handle one by one or we could implement a queue
                                        // Here we'll just process them sequentially to show progress for each
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
                            isOpen={showOCRModal}
                            onClose={() => setShowOCRModal(false)}
                            title="Job Gallery OCR Assistant"
                            onApply={(res) => {
                                if (res.rawText) {
                                    setFormData(prev => ({
                                        ...prev,
                                        notes: (prev.notes || '') + '\n\n[OCR DATA FROM GALLERY]:\n' + res.rawText
                                    }));
                                    alert('Extracted text has been appended to the Document Notes.');
                                }
                            }}
                        />

                        {loadingGallery && galleryFiles.length === 0 ? (
                            <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                <div className="upload-animation-ring">
                                    <div />
                                    <div />
                                    <div />
                                    <div />
                                </div>
                                <p style={{ marginTop: '24px', fontWeight: 600 }}>Uploading to Drive...</p>
                                <style>{`
                                    .upload-animation-ring { display: inline-block; position: relative; width: 80px; height: 80px; }
                                    .upload-animation-ring div { box-sizing: border-box; display: block; position: absolute; width: 64px; height: 64px; margin: 8px; border: 8px solid var(--accent); border-radius: 50%; animation: upload-ring 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite; border-color: var(--accent) transparent transparent transparent; }
                                    .upload-animation-ring div:nth-child(1) { animation-delay: -0.45s; }
                                    .upload-animation-ring div:nth-child(2) { animation-delay: -0.3s; }
                                    .upload-animation-ring div:nth-child(3) { animation-delay: -0.15s; }
                                    @keyframes upload-ring { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                                `}</style>
                            </div>
                        ) : galleryFiles.length === 0 ? (
                            <div style={{ padding: '80px', textAlign: 'center', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #cbd5e1' }}>
                                <Ship size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
                                <p style={{ color: '#64748b', fontSize: '1.1rem' }}>No photos uploaded yet for this job.</p>
                                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '4px' }}>Capture and upload job progress photos directly here.</p>
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
                            .btn-loading-overlay { position: absolute; inset: 0; background: rgba(255,255,255,0.3); animation: pulse 1.5s infinite; }
                            @keyframes pulse { 0% { opacity: 0.2; } 50% { opacity: 0.5; } 100% { opacity: 0.2; } }
                        `}</style>
                    </div>
                )}

                {activeTab === 'costing' && (
                    <div className="glass-panel project-costing">
                        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Calculator size={20} className="text-accent" />
                                <h3 style={{ margin: 0 }}>Project Costing & Profit Summary</h3>
                            </div>
                            <button className="btn btn-primary" onClick={addExpenseRow}>
                                <Plus size={16} /> Add Expense
                            </button>
                        </div>

                        {/* Summary Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
                            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>Total Revenue</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>
                                    {formData.currency} {formData.total_amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div style={{ background: '#fff1f2', padding: '20px', borderRadius: '16px', border: '1px solid #fecdd3' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#be123c', textTransform: 'uppercase', marginBottom: '8px' }}>Total Expenses</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#9f1239' }}>
                                    {formData.currency} {expenses.reduce((acc, curr) => acc + (parseFloat(curr.grand_total) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            {(() => {
                                const totalRevenue = parseFloat(formData.total_amount) || 0;
                                const totalExpenses = expenses.reduce((acc, curr) => acc + (parseFloat(curr.grand_total) || 0), 0);
                                const profit = totalRevenue - totalExpenses;
                                const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
                                return (
                                    <>
                                        <div style={{ background: profit >= 0 ? '#f0fdf4' : '#fff1f2', padding: '20px', borderRadius: '16px', border: `1px solid ${profit >= 0 ? '#bbf7d0' : '#fecdd3'}` }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: profit >= 0 ? '#15803d' : '#be123c', textTransform: 'uppercase', marginBottom: '8px' }}>Gross Profit</div>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: profit >= 0 ? '#166534' : '#9f1239' }}>
                                                {formData.currency} {profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </div>
                                        </div>
                                        <div style={{ background: profit >= 0 ? '#ecfdf5' : '#fff7ed', padding: '20px', borderRadius: '16px', border: `1px solid ${profit >= 0 ? '#d1fae5' : '#ffedd5'}` }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: profit >= 0 ? '#047857' : '#c2410c', textTransform: 'uppercase', marginBottom: '8px' }}>Profit Margin</div>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: profit >= 0 ? '#065f46' : '#9a3412' }}>
                                                {margin.toFixed(1)}%
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>

                        {/* Expense Table */}
                        <div className="table-container" style={{ overflowX: 'auto' }}>
                            <table className="data-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '200px' }}>Supplier</th>
                                        <th style={{ width: '120px' }}>Inv No</th>
                                        <th style={{ width: '130px' }}>Date</th>
                                        <th>Description</th>
                                        <th style={{ width: '100px', textAlign: 'right' }}>Grand Total</th>
                                        <th style={{ width: '80px', textAlign: 'center' }}>Bill</th>
                                        <th style={{ width: '120px', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingExpenses ? (
                                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>Loading expenses...</td></tr>
                                    ) : expenses.length === 0 ? (
                                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>No expenses recorded yet. Click "Add Expense" to start.</td></tr>
                                    ) : (
                                        expenses.map((exp, idx) => (
                                            <tr key={exp.id}>
                                                <td style={{ fontWeight: 600 }}>{partners.find(p => p.id === exp.supplier_id)?.name || 'Unknown Supplier'}</td>
                                                <td>{exp.invoice_no || '-'}</td>
                                                <td>{exp.invoice_date ? new Date(exp.invoice_date).toLocaleDateString() : '-'}</td>
                                                <td>{exp.description}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)' }}>
                                                    {formData.currency} {(parseFloat(exp.grand_total) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    {exp.bill_url ? (
                                                        <a href={exp.bill_url} target="_blank" rel="noreferrer" title="View Bill" style={{ color: '#10b981' }}><FileCheck size={18} /></a>
                                                    ) : <span style={{ color: '#cbd5e1' }}><Paperclip size={18} /></span>}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                        <button className="btn-icon" onClick={() => setExpenseModal({ isOpen: true, data: exp })} title="Edit Expense" style={{ color: 'var(--accent)' }}>
                                                            <FileText size={16} />
                                                        </button>
                                                        <button className="btn-icon" onClick={() => handleDeleteExpense(idx)} title="Delete Record" style={{ color: '#ef4444' }}>
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'items' && (
                    <div className="items-editor">
                        <table className="editor-table">
                            <thead>
                                <tr>
                                    <th style={{ width: formData.document_type === 'Enquiry' ? '70%' : '40%' }}>Product / Description</th>
                                    <th style={{ width: '8%' }}>Quantity</th>
                                    <th style={{ width: '12%' }}>Unit</th>
                                    {formData.document_type !== 'Enquiry' && (
                                        <>
                                            <th style={{ width: '12%' }}>Unit Price</th>
                                            <th style={{ width: '10%' }}>Taxes</th>
                                            <th style={{ width: '10%' }}>Amount</th>
                                        </>
                                    )}
                                    <th style={{ width: '8%' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lineItems.map((item, index) => (
                                    <tr key={item.id} className={item.is_section ? 'row-section' : item.is_note ? 'row-note' : ''}>
                                        <td>
                                            {item.is_note ? (
                                                <textarea
                                                    className="table-input"
                                                    style={{ resize: 'vertical', minHeight: '40px' }}
                                                    value={item.description}
                                                    onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                                                    placeholder="Note: e.g. Lead time 1 week"
                                                    rows={2}
                                                />
                                            ) : (
                                                <textarea
                                                    className="table-input"
                                                    style={{ 
                                                        resize: 'none', 
                                                        height: '42px', 
                                                        minHeight: '42px',
                                                        overflow: 'hidden',
                                                        whiteSpace: 'nowrap',
                                                        transition: 'height 0.2s ease, white-space 0.2s'
                                                    }}
                                                    value={item.description}
                                                    onChange={(e) => {
                                                        updateLineItem(index, 'description', e.target.value);
                                                        if (document.activeElement === e.target) {
                                                            e.target.style.height = 'auto';
                                                            e.target.style.height = `${e.target.scrollHeight}px`;
                                                        }
                                                    }}
                                                    onFocus={(e) => {
                                                        e.target.style.whiteSpace = 'normal';
                                                        e.target.style.height = 'auto';
                                                        e.target.style.height = `${e.target.scrollHeight}px`;
                                                    }}
                                                    onBlur={(e) => {
                                                        e.target.style.whiteSpace = 'nowrap';
                                                        e.target.style.height = '42px';
                                                        e.target.scrollTop = 0;
                                                    }}
                                                    placeholder={item.is_section ? "SECTION: e.g. Spare Parts" : "Select product or enter description..."}
                                                />
                                            )}
                                            {!item.is_section && !item.is_note && (
                                                <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', width: '100%', marginTop: '4px' }}>
                                                    <textarea
                                                        className="table-textarea"
                                                        style={{ 
                                                            minHeight: '48px', 
                                                            height: 'auto',
                                                            resize: 'vertical',
                                                            borderBottom: '1px dashed #cbd5e1', 
                                                            paddingRight: '28px',
                                                            borderRadius: '4px',
                                                            padding: '4px'
                                                        }}
                                                        value={item.details || ''}
                                                        onChange={(e) => updateLineItem(index, 'details', e.target.value)}
                                                        placeholder="Add technical details, specifications..."
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setModalItemIndex(index);
                                                            setModalItemDetails(item.details || '');
                                                            setShowDetailsModal(true);
                                                        }}
                                                        style={{
                                                            position: 'absolute',
                                                            right: '4px',
                                                            top: '4px',
                                                            border: 'none',
                                                            background: 'rgba(255,255,255,0.8)',
                                                            cursor: 'pointer',
                                                            color: 'var(--accent)',
                                                            padding: '4px',
                                                            borderRadius: '4px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                        }}
                                                        title="Edit in full screen modal"
                                                    >
                                                        <ExternalLink size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            {!item.is_section && !item.is_note && (
                                                <input
                                                    type="number"
                                                    className="table-input center"
                                                    value={item.quantity}
                                                    onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                                                />
                                            )}
                                        </td>
                                        <td>
                                            {!item.is_section && !item.is_note && (
                                                <select
                                                    className="table-input"
                                                    value={item.uom || 'UNIT(S)'}
                                                    onChange={(e) => updateLineItem(index, 'uom', e.target.value)}
                                                >
                                                    {ITEM_UNITS.map(unit => (
                                                        <option key={unit} value={unit}>{unit}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </td>
                                        {formData.document_type !== 'Enquiry' && (
                                            <>
                                                <td>
                                                    {!item.is_section && !item.is_note && (
                                                        <input
                                                            type="number"
                                                            className="table-input right"
                                                            value={item.unit_price}
                                                            onChange={(e) => updateLineItem(index, 'unit_price', e.target.value)}
                                                        />
                                                    )}
                                                </td>
                                                <td className="center">
                                                    {!item.is_section && !item.is_note && (
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={item.tax_enabled !== false}
                                                                onChange={(e) => updateLineItem(index, 'tax_enabled', e.target.checked)}
                                                                title="Enable/Disable Tax"
                                                            />
                                                            <input
                                                                type="number"
                                                                className="table-input center"
                                                                style={{ width: '45px', padding: '4px' }}
                                                                value={item.tax_rate ?? 9}
                                                                onChange={(e) => updateLineItem(index, 'tax_rate', e.target.value)}
                                                                min="1" max="100"
                                                                disabled={item.tax_enabled === false}
                                                            /> %
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="right font-bold">
                                                    {formData.currency} {(parseFloat(item.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                            </>
                                        )}
                                        <td className="center">
                                            <button className="del-btn" onClick={() => removeLineItem(index)}><Trash2 size={14} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="table-actions">
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button className="add-btn" onClick={() => addLineItem('item')}><Plus size={14} /> Add a product</button>
                                <button className="add-btn" onClick={() => addLineItem('section')}>Add a section</button>
                                <button className="add-btn" onClick={() => addLineItem('note')}>Add a note</button>
                                <button className="add-btn" onClick={() => setShowDocumentParserModal(true)} style={{ color: '#8b5cf6', fontWeight: 700 }}>
                                    <Sparkles size={14} /> Image to Items
                                </button>

                                <input 
                                    type="file" 
                                    id="quick-image-attach" 
                                    accept="image/*,application/pdf" 
                                    style={{ display: 'none' }} 
                                    onChange={handleQuickImageAttach} 
                                />
                                <button 
                                    className="add-btn" 
                                    onClick={() => document.getElementById('quick-image-attach').click()} 
                                    style={{ color: '#0ea5e9', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
                                    disabled={saving}
                                >
                                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />} 
                                    {saving ? 'Uploading...' : 'Quick Attach'}
                                </button>

                                <div style={{ position: 'relative' }}>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="add-btn catalog-btn" onClick={() => setShowCatalogDropdown(!showCatalogDropdown)}>
                                            <Package size={14} /> From Catalog
                                        </button>
                                        <button
                                            className="add-btn"
                                            onClick={() => navigate('/catalog/new')}
                                            title="Add new item to catalog"
                                            style={{ padding: '4px', opacity: 0.7 }}
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                    {showCatalogDropdown && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, zIndex: 50,
                                            minWidth: '380px', maxHeight: '380px', marginTop: '4px',
                                            background: '#fff', border: '1px solid #e2e8f0',
                                            borderRadius: '12px', boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                                            overflow: 'hidden', display: 'flex', flexDirection: 'column'
                                        }}>
                                            {/* Header with search and close */}
                                            <div style={{
                                                padding: '10px 12px', borderBottom: '1px solid #e2e8f0',
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                background: '#f8fafc'
                                            }}>
                                                <input
                                                    type="text"
                                                    placeholder="Search catalog items..."
                                                    value={catalogSearch}
                                                    onChange={(e) => setCatalogSearch(e.target.value)}
                                                    autoFocus
                                                    style={{
                                                        flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0',
                                                        borderRadius: '8px', fontSize: '0.85rem', outline: 'none',
                                                        background: '#fff'
                                                    }}
                                                />
                                                <button
                                                    onClick={() => { setShowCatalogDropdown(false); setCatalogSearch(''); }}
                                                    style={{
                                                        background: '#f1f5f9', border: 'none', borderRadius: '50%',
                                                        width: '30px', height: '30px', display: 'flex',
                                                        alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer', color: '#64748b', flexShrink: 0
                                                    }}
                                                    title="Close"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                            {/* Items list */}
                                            <div style={{ overflowY: 'auto', flex: 1 }}>
                                                {catalog
                                                    .filter(cat =>
                                                        cat.name?.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                                                        cat.specification?.toLowerCase().includes(catalogSearch.toLowerCase())
                                                    )
                                                    .map(cat => (
                                                        <button
                                                            key={cat.id}
                                                            onClick={() => { handleAddItemFromCatalog(cat); setCatalogSearch(''); setShowCatalogDropdown(false); }}
                                                            style={{
                                                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                                                                gap: '2px', padding: '10px 14px', width: '100%', textAlign: 'left',
                                                                background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9',
                                                                cursor: 'pointer', transition: 'background 0.15s'
                                                            }}
                                                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                                        >
                                                            <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{cat.name}</span>
                                                            {cat.specification && (
                                                                <span style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '340px' }}>
                                                                    {cat.specification}
                                                                </span>
                                                            )}
                                                        </button>
                                                    ))
                                                }
                                                {catalog.filter(cat =>
                                                    cat.name?.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                                                    cat.specification?.toLowerCase().includes(catalogSearch.toLowerCase())
                                                ).length === 0 && (
                                                        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                                            No items found
                                                        </div>
                                                    )}
                                            </div>
                                            {/* Footer */}
                                            <button
                                                onClick={() => { setShowCatalogDropdown(false); navigate('/catalog'); }}
                                                style={{
                                                    color: 'var(--accent)', fontWeight: 600, borderTop: '1px solid #e2e8f0',
                                                    padding: '10px 14px', background: '#fff', border: 'none',
                                                    cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                            >
                                                View All Catalog (Manage CRUD)
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {formData.document_type !== 'Enquiry' && (
                                <div className="summary-box">
                                    <div className="summary-row">
                                        <span>Untaxed Amount:</span>
                                        <span>{formData.currency} {(formData.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="summary-row" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span>Discount:</span>
                                            <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: '8px', padding: '2px 6px', border: '1px solid #e2e8f0' }}>
                                                <input 
                                                    type="number" 
                                                    className="table-input" 
                                                    style={{ width: discountType === 'percent' ? '50px' : '80px', padding: '2px', border: 'none', background: 'transparent', textAlign: 'right', fontWeight: 700 }}
                                                    value={discountType === 'percent' ? formData.discount_percent : (discountType === 'lumpsum' ? formData.discount_amount : 0)}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (discountType === 'percent') {
                                                            setFormData(prev => ({ ...prev, discount_percent: val, discount_amount: 0 }));
                                                        } else {
                                                            setFormData(prev => ({ ...prev, discount_amount: val, discount_percent: 0 }));
                                                        }
                                                    }}
                                                    placeholder="0"
                                                />
                                                <select 
                                                    value={discountType}
                                                    onChange={(e) => {
                                                        const newType = e.target.value;
                                                        setDiscountType(newType);
                                                        // Reset values on toggle to avoid confusion
                                                        setFormData(prev => ({ ...prev, discount_percent: 0, discount_amount: 0 }));
                                                    }}
                                                    style={{ border: 'none', background: 'transparent', fontSize: '0.75rem', fontWeight: 800, color: '#475569', cursor: 'pointer', outline: 'none' }}
                                                >
                                                    <option value="percent">%</option>
                                                    <option value="lumpsum">{formData.currency}</option>
                                                </select>
                                            </div>
                                        </div>
                                        <span>- {formData.currency} {(formData.discount_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="summary-row">
                                        <span>Taxes:</span>
                                        <span>{formData.currency} {formData.tax_amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="summary-total">
                                        <span>Total:</span>
                                        <span>{formData.currency} {(formData.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Terms & Conditions */}
                        <div className="glass-panel" style={{ marginTop: '24px', padding: '16px', border: '1px solid #cbd5e1', borderRadius: '16px', background: '#f8fafc' }}>
                            <div className="form-item" style={{ margin: 0 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                                    <div style={{ width: '36px', height: '36px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                        <FileText size={18} color="#2563eb" />
                                    </div>
                                    <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#1e3a8a', letterSpacing: '-0.01em' }}>Terms & Conditions</span>
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                                        <select 
                                            className="form-select-sm"
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    handleEditorChange('terms_conditions', TC_PRESETS[e.target.value]);
                                                }
                                            }}
                                            style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '8px' }}
                                        >
                                            <option value="">Load Preset...</option>
                                            <option value="Enquiry">Enquiry Terms</option>
                                            <option value="Quotation">Quotation Terms</option>
                                            <option value="Purchase Order">P.O. Terms</option>
                                        </select>
                                    </div>
                                </label>
                                <div style={{ background: '#fff', borderRadius: '12px', padding: '8px', border: '1px solid #e2e8f0' }}>
                                    <RichTextEditor
                                        value={formData.terms_conditions}
                                        onChange={(val) => handleEditorChange('terms_conditions', val)}
                                        placeholder="Payment terms, delivery details..."
                                        height="160px"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Notes & Comments */}
                        <div className="glass-panel" style={{ marginTop: '24px', padding: '16px', border: '1px solid #cbd5e1', borderRadius: '16px', background: '#f8fafc' }}>
                            <div className="form-item" style={{ margin: 0 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                                    <div style={{ width: '36px', height: '36px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                        <FileText size={18} color="#2563eb" />
                                    </div>
                                    <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#1e3a8a', letterSpacing: '-0.01em' }}>Notes & Comments</span>
                                    
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                                        <select 
                                            className="form-select-sm"
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    const currentVal = formData.notes || '';
                                                    const templateVal = NOTES_PRESETS[e.target.value];
                                                    handleEditorChange('notes', currentVal + (currentVal ? '<br/><br/>' : '') + templateVal);
                                                    e.target.value = ''; // Reset select
                                                }
                                            }}
                                            style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '8px' }}
                                            defaultValue=""
                                        >
                                            <option value="" disabled>Load Standard Note...</option>
                                            <option value="General">General Note</option>
                                            <option value="Delivery">Delivery Details</option>
                                            <option value="Payment">Payment Info</option>
                                        </select>
                                    </div>
                                </label>
                                <div style={{ background: '#fff', borderRadius: '12px', padding: '8px', border: '1px solid #e2e8f0' }}>
                                    <RichTextEditor
                                        value={formData.notes}
                                        onChange={(val) => handleEditorChange('notes', val)}
                                        placeholder="Add additional notes, technical details, or comments for this document (Included in PDF)..."
                                        height="210px"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'other' && (
                    <div className="glass-panel other-info animate-fade-in">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px', marginBottom: '24px' }}>
                            {/* Column 1: Customer PO Details */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: '#f8fafc', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                                <h4 style={{ margin: '0 0 8px 0', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 700 }}>
                                    <Package size={18} color="var(--accent)" /> Customer PO Details
                                </h4>
                                
                                <div className="form-item" style={{ margin: 0 }}>
                                    <label style={{ fontWeight: 600 }}><Package size={14} /> Customer PO No</label>
                                    <input type="text" className="form-input" name="customer_po_no" value={formData.customer_po_no || ''} onChange={handleHeaderChange} placeholder="PO-12345 (Bridge to Job)" />
                                </div>

                                <div className="form-item" style={{ margin: 0 }}>
                                    <label style={{ fontWeight: 600 }}>Customer PO Date</label>
                                    <input type="date" className="form-input" name="customer_po_date" value={formData.customer_po_date || ''} onChange={handleHeaderChange} />
                                </div>

                                <div className="form-item" style={{ margin: 0 }}>
                                    <label style={{ fontWeight: 600 }}>PO Value ({formData.currency})</label>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        className="form-input" 
                                        name="delivery_verification.po_value" 
                                        value={formData.delivery_verification?.po_value || ''} 
                                        onChange={handleHeaderChange} 
                                        placeholder={formData.total_amount ? `Default: ${formData.total_amount}` : "PO Value amount..."} 
                                    />
                                </div>

                                <div className="form-item" style={{ margin: 0 }}>
                                    <label style={{ fontWeight: 600 }}>Issued By (Customer Contact)</label>
                                    <select 
                                        className="form-input" 
                                        name="customer_po_by_id" 
                                        value={formData.customer_po_by_id || ''} 
                                        onChange={handleHeaderChange}
                                    >
                                        <option value="">-- Select Customer Contact --</option>
                                        {getCustomerContacts().map(c => (
                                            <option key={c.id} value={c.id}>{c.name} ({c.email || 'No email'})</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-item" style={{ margin: 0 }}>
                                    <label style={{ fontWeight: 600 }}>Description / Project Scope</label>
                                    <textarea 
                                        className="form-input" 
                                        name="delivery_verification.po_description" 
                                        value={formData.delivery_verification?.po_description || ''} 
                                        onChange={handleHeaderChange} 
                                        rows={3} 
                                        placeholder="Briefly describe the PO scope..." 
                                        style={{ resize: 'none', padding: '10px' }}
                                    />
                                </div>
                            </div>

                            {/* Column 2: Reference & Salesperson Details */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: '#f8fafc', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                                <h4 style={{ margin: '0 0 8px 0', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 700 }}>
                                    <Info size={18} color="var(--accent)" /> Salesperson & References
                                </h4>

                                <div className="form-item" style={{ margin: 0 }}>
                                    <label style={{ fontWeight: 600 }}>Internal Company Reference</label>
                                    <input type="text" className="form-input" name="customer_ref" value={formData.customer_ref || ''} onChange={handleHeaderChange} placeholder="Your internal tracking reference..." />
                                </div>

                                <div className="form-item" style={{ margin: 0 }}>
                                    <label style={{ fontWeight: 600 }}>Salesperson Name</label>
                                    <input type="text" className="form-input" name="salesperson_name" value={formData.salesperson_name || ''} onChange={handleHeaderChange} placeholder="Your name" />
                                </div>

                                <div className="form-item" style={{ margin: 0 }}>
                                    <label style={{ fontWeight: 600 }}>Salesperson Phone</label>
                                    <input type="text" className="form-input" name="salesperson_phone" value={formData.salesperson_phone || ''} onChange={handleHeaderChange} placeholder="+65 ..." />
                                </div>

                                <div className="form-item" style={{ margin: 0 }}>
                                    <label style={{ fontWeight: 600 }}>Salesperson Email</label>
                                    <input type="text" className="form-input" name="salesperson_email" value={formData.salesperson_email || ''} onChange={handleHeaderChange} placeholder="your@email.com" />
                                </div>
                            </div>
                        </div>

                        {formData.document_type === 'Payment Received' && (
                            <div className="form-item" style={{ marginBottom: '24px', padding: '20px', background: '#f0f9ff', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                                <h4 style={{ margin: '0 0 16px 0', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <CreditCard size={18} /> Payment Details
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div className="form-item" style={{ margin: 0 }}>
                                        <label>Payment Mode</label>
                                        <select className="form-input" name="payment_method" value={formData.payment_method} onChange={handleHeaderChange}>
                                            <option value="Bank Transfer">Bank Transfer</option>
                                            <option value="PayNow">PayNow</option>
                                            <option value="Cheque">Cheque</option>
                                            <option value="Cash">Cash</option>
                                            <option value="Credit Card">Credit Card</option>
                                        </select>
                                    </div>
                                    <div className="form-item" style={{ margin: 0 }}>
                                        <label>Transaction / Cheque Ref</label>
                                        <input type="text" className="form-input" name="payment_ref" value={formData.payment_ref} onChange={handleHeaderChange} placeholder="e.g. TXN-123456" />
                                    </div>
                                    <div className="form-item" style={{ gridColumn: 'span 2', margin: 0 }}>
                                        <label>Link to Specific Invoice (1:1)</label>
                                        <select 
                                            className="form-input" 
                                            name="related_document_id" 
                                            value={formData.related_document_id || ''} 
                                            onChange={handleHeaderChange}
                                            style={{ border: formData.related_document_id ? '2px solid var(--accent)' : '1px solid var(--border-color)' }}
                                        >
                                            <option value="">-- Unallocated / General Payment --</option>
                                            {partnerInvoices.map(inv => (
                                                <option key={inv.id} value={inv.id}>
                                                    {inv.document_no} - {inv.subject} (SGD {inv.total_amount?.toLocaleString()})
                                                </option>
                                            ))}
                                        </select>
                                        {formData.related_document_id && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: '4px', fontWeight: 600 }}>
                                                ✓ This payment will be precisely matched to {partnerInvoices.find(i => i.id === formData.related_document_id)?.document_no}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Section 3: File Repository & PO Document Attachments */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px', borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                            {/* PO Direct Upload & View */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                                    Customer Purchase Order Document
                                </label>
                                {formData.customer_po_attachment_url ? (
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <a 
                                            href={formData.customer_po_attachment_url} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="btn btn-secondary"
                                            style={{ 
                                                display: 'inline-flex', 
                                                alignItems: 'center', 
                                                gap: '8px', 
                                                padding: '10px 20px', 
                                                borderRadius: '10px', 
                                                textDecoration: 'none',
                                                fontWeight: 600,
                                                fontSize: '0.9rem',
                                                transition: 'all 0.2s',
                                                flex: 1,
                                                justifyContent: 'center'
                                            }}
                                        >
                                            <FileText size={18} /> View PO File
                                        </a>
                                        
                                        <button 
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => document.getElementById('po-direct-upload').click()}
                                            style={{ borderRadius: '10px', padding: '10px 20px', fontSize: '0.9rem', flex: 1 }}
                                        >
                                            <RefreshCw size={18} style={{ marginRight: '8px' }} /> Update PO
                                        </button>
                                    </div>
                                ) : (
                                    <div 
                                        onClick={() => document.getElementById('po-direct-upload').click()}
                                        style={{ 
                                            border: '2px dashed #cbd5e1', 
                                            borderRadius: '12px', 
                                            padding: '24px', 
                                            textAlign: 'center', 
                                            cursor: 'pointer',
                                            background: '#f8fafc',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.borderColor = '#6366f1'}
                                        onMouseOut={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
                                    >
                                        <Upload size={32} color="#64748b" style={{ marginBottom: '12px', margin: '0 auto 12px' }} />
                                        <div style={{ fontWeight: 700, color: '#1e293b' }}>Upload Customer Purchase Order</div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>Syncs to GDrive Project Folder</div>
                                    </div>
                                )}
                                <input id="po-direct-upload" type="file" hidden onChange={(e) => handleUploadPODirect(e.target.files[0])} />
                            </div>

                            {/* General GDrive Attachments List */}
                            <div className="form-item" style={{ margin: 0 }}>
                                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Paperclip size={16} className="text-accent" />
                                        <span>GDrive Folder Attachments</span>
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        {formData.drive_folder_id && (
                                            <a 
                                                href={`https://drive.google.com/drive/folders/${formData.drive_folder_id}`} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                style={{ color: '#16a34a', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontWeight: 600 }}
                                                className="hover:underline"
                                            >
                                                <Folder size={14} /> Open Folder
                                            </a>
                                        )}
                                        <label style={{ cursor: 'pointer', color: 'var(--accent)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', margin: 0 }}>
                                            <Plus size={14} /> Upload File
                                            <input type="file" multiple style={{ display: 'none' }} onChange={async (e) => {
                                                const files = Array.from(e.target.files);
                                                if (files.length === 0) return;
                                                
                                                try {
                                                    const token = await getStoredToken();
                                                    if (!token) {
                                                        alert('Please make sure you are logged into Google Drive via the Google Drive panel on the left side of the screen.');
                                                        return;
                                                    }
                                                    
                                                    let parentFolderId = formData.drive_folder_id;
                                                    if (!parentFolderId && formData.assigned_job_no) {
                                                        const { data: suiteDocs } = await supabase
                                                            .from('workflow_documents')
                                                            .select('drive_folder_id, gdrive_folder_id')
                                                            .eq('assigned_job_no', formData.assigned_job_no)
                                                            .not('drive_folder_id', 'is', null);
                                                        
                                                        const found = suiteDocs?.find(d => d.drive_folder_id || d.gdrive_folder_id);
                                                        if (found) {
                                                            parentFolderId = found.drive_folder_id || found.gdrive_folder_id;
                                                        }
                                                    }
                                                    
                                                    if (!parentFolderId) {
                                                        const confirmProvision = confirm("No Google Drive folder structure exists for this Job yet.\n\nWould you like to provision the folder structure now?");
                                                        if (!confirmProvision) return;
                                                        
                                                        const { getDocumentSettings } = await import('../../lib/store');
                                                        const settings = await getDocumentSettings(profile.company_id);
                                                        let celronRootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
                                                        if (!celronRootId) {
                                                            alert('Google Drive Root Folder ID not configured in Settings.');
                                                            return;
                                                        }
                                                        
                                                        if (celronRootId.includes('drive.google.com')) {
                                                            const match = celronRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || celronRootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                                                            if (match) celronRootId = match[1];
                                                        }
                                                        
                                                        setAttachmentUploadProgress({ fileName: 'Creating Google Drive Project folders...', percent: 20 });
                                                        
                                                        const year = new Date(formData.issue_date || new Date()).getFullYear().toString();
                                                        const projName = getProjectFolderName();
                                                        
                                                        const newFolderId = await provisionFullProjectStructure(token, celronRootId, year, projName);
                                                        parentFolderId = newFolderId;
                                                        
                                                        setFormData(prev => ({ ...prev, drive_folder_id: newFolderId }));
                                                        await supabase
                                                            .from('workflow_documents')
                                                            .update({ drive_folder_id: newFolderId })
                                                            .eq('id', formData.id);
                                                    }
                                                    
                                                    const subfolderId = parentFolderId;
                                                    const newUrls = [...(formData.attachment_urls || [])];
                                                    
                                                    for (let i = 0; i < files.length; i++) {
                                                        const file = files[i];
                                                        setAttachmentUploadProgress({ fileName: file.name, percent: 0 });
                                                        
                                                        const response = await uploadFileToDrive(token, file, {
                                                            folderId: subfolderId,
                                                            title: file.name,
                                                            onProgress: (percent) => {
                                                                setAttachmentUploadProgress({ fileName: file.name, percent });
                                                            }
                                                        });
                                                        
                                                        if (response && response.id) {
                                                            const { makeFilePublic } = await import('../../lib/driveService');
                                                            await makeFilePublic(token, response.id);
                                                            
                                                            const webViewLink = `https://drive.google.com/file/d/${response.id}/view?usp=drivesdk&filename=${encodeURIComponent(file.name)}`;
                                                            newUrls.push(webViewLink);
                                                        }
                                                    }
                                                    
                                                    setAttachmentUploadProgress(null);
                                                    setFormData(prev => ({ ...prev, attachment_urls: newUrls }));
                                                    
                                                    const { error: saveErr } = await supabase
                                                        .from('workflow_documents')
                                                        .update({ attachment_urls: newUrls })
                                                        .eq('id', formData.id);
                                                        
                                                    if (saveErr) throw saveErr;
                                                    toast.success('Successfully uploaded all files to Google Drive!');
                                                } catch (err) {
                                                    console.error(err);
                                                    setAttachmentUploadProgress(null);
                                                    alert('Upload failed: ' + err.message);
                                                }
                                            }} />
                                        </label>
                                    </div>
                                </label>
                                
                                {attachmentUploadProgress && (
                                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '8px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>
                                            <span>Uploading: {attachmentUploadProgress.fileName}</span>
                                            <span>{attachmentUploadProgress.percent}%</span>
                                        </div>
                                        <div style={{ background: '#cbd5e1', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div style={{ background: '#22c55e', height: '100%', width: `${attachmentUploadProgress.percent}%`, transition: 'width 0.15s ease-in-out' }}></div>
                                        </div>
                                    </div>
                                )}

                                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px dashed #cbd5e1', minHeight: '120px', maxHeight: '200px', overflowY: 'auto' }}>
                                    {formData.attachment_urls?.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {formData.attachment_urls.map((url, idx) => {
                                                let fileName = 'Attachment';
                                                try {
                                                    const u = new URL(url);
                                                    const fn = u.searchParams.get('filename');
                                                    if (fn) fileName = decodeURIComponent(fn);
                                                    else fileName = url.split('/').pop();
                                                } catch (e) {
                                                    fileName = url.split('/').pop() || 'Attachment';
                                                }
                                                
                                                return (
                                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                        <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }} title={fileName}>{fileName}</span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <a href={url} target="_blank" rel="noreferrer" className="text-accent hover:underline" style={{ fontSize: '0.8rem', fontWeight: 600 }}>View</a>
                                                            <button 
                                                                type="button" 
                                                                style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}
                                                                onClick={async () => {
                                                                    if (!confirm(`Are you sure you want to remove the attachment "${fileName}"?`)) return;
                                                                    const updatedUrls = formData.attachment_urls.filter((_, i) => i !== idx);
                                                                    setFormData(prev => ({ ...prev, attachment_urls: updatedUrls }));
                                                                    await supabase
                                                                        .from('workflow_documents')
                                                                        .update({ attachment_urls: updatedUrls })
                                                                        .eq('id', formData.id);
                                                                    toast.success('Attachment removed');
                                                                }}
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', padding: '24px 0' }}>No attachments yet. Click 'Upload File' to add.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {activeTab === 'workflow' && (
                    <div className="glass-panel workflow-suite">
                        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <FileCheck size={20} className="text-accent" />
                            <h3 style={{ margin: 0 }}>Documents Linked to Job: <span style={{ color: 'var(--accent)' }}>{formData.assigned_job_no}</span></h3>
                        </div>
                        
                        <div className="table-container">
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ background: '#f8fafc' }}>
                                    <tr>
                                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Type</th>
                                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Document No</th>
                                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Issue Date</th>
                                        <th style={{ padding: '12px', textAlign: 'right', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Amount</th>
                                        <th style={{ padding: '12px', textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Status</th>
                                        <th style={{ padding: '12px', textAlign: 'right', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {workflowDocs.map(doc => (
                                        <tr key={doc.id} style={{ borderBottom: '1px solid #f1f5f9', background: doc.id === id ? '#f0f9ff' : 'transparent' }}>
                                            <td style={{ padding: '12px', fontSize: '0.85rem', fontWeight: 600 }}>{doc.document_type}</td>
                                            <td style={{ padding: '12px', fontSize: '0.85rem', color: 'var(--accent)' }}>{doc.document_no}</td>
                                            <td style={{ padding: '12px', fontSize: '0.85rem' }}>{new Date(doc.issue_date).toLocaleDateString('en-GB')}</td>
                                            <td style={{ padding: '12px', textAlign: 'right', fontSize: '0.85rem' }}>{doc.currency} {doc.total_amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            <td style={{ padding: '12px', textAlign: 'center' }}>
                                                <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: doc.status === 'Draft' ? '#f1f5f9' : '#dcfce7', color: doc.status === 'Draft' ? '#64748b' : '#15803d' }}>
                                                    {doc.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'right' }}>
                                                {doc.id !== id ? (
                                                    <button 
                                                        className="btn btn-sm btn-secondary" 
                                                        onClick={() => {
                                                            const targetType = doc.document_type.toLowerCase().replace(/\s+/g, '-');
                                                            navigate(`/workflows/editor/${targetType}/${doc.id}`);
                                                        }}
                                                    >
                                                        Open
                                                    </button>
                                                ) : (
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>Current</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}



                {activeTab === 'explorer' && (
                    <div className="glass-panel animate-fade-in" style={{ padding: '32px' }}>
                        {/* Signed Proofs Section */}
                        <div style={{ marginBottom: '32px', background: '#f8fafc', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                                    <FileCheck size={22} color="#059669" /> Signed Proofs of Delivery / Service
                                </h3>
                                <button 
                                    className="btn btn-sm btn-primary" 
                                    style={{ background: '#059669', borderColor: '#059669', display: 'flex', alignItems: 'center', gap: '8px' }}
                                    onClick={() => document.getElementById('signed-proof-upload').click()}
                                >
                                    <Upload size={14} /> Upload Signed Copy
                                </button>
                                <input id="signed-proof-upload" type="file" hidden onChange={(e) => handleUploadSignedProofDirect(e.target.files[0])} />
                            </div>

                            {loadingSignedProofs ? (
                                <div style={{ textAlign: 'center', padding: '20px' }}><Loader2 size={24} className="animate-spin" /></div>
                            ) : signedProofs.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '0.9rem' }}>
                                    No signed proofs found in Folder 6. Use the Scanner App or upload here.
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                                    {signedProofs.map(proof => (
                                        <div key={proof.id} style={{ background: '#fff', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <FileCheck size={18} color="#059669" />
                                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{proof.name}</div>
                                            </div>
                                            <a href={proof.webViewLink} target="_blank" rel="noreferrer" style={{ color: '#64748b' }}><ExternalLink size={14} /></a>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {formData.document_type === 'Tax Invoice' && (
                                <div style={{ marginTop: '24px', padding: '16px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                        <AlertCircle size={18} color="#d97706" />
                                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#92400e' }}>Invoice Compliance Check</span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#b45309' }}>
                                        {signedProofs.length > 0 
                                            ? `Found ${signedProofs.length} signed proof(s) in Folder 6. Ensure they are attached when emailing the customer.`
                                            : "Warning: No signed Proof of Delivery found in Folder 6. It is highly recommended to upload a signed copy before sending the invoice."}
                                    </p>
                                </div>
                            )}
                        </div>

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
                                    Google Drive: {authStatus === 'connected' ? 'Connected' : authStatus === 'expired' ? 'Session Expired' : 'Disconnected'}
                                </span>
                            </div>
                            {authStatus !== 'connected' && (
                                <button onClick={handleExplorerReconnect} className="btn btn-sm btn-primary" style={{ fontSize: '0.8rem', padding: '6px 16px' }}>
                                    <RefreshCw size={14} style={{ marginRight: '6px' }} /> Reconnect Now
                                </button>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <button 
                                    onClick={() => handleExplorerBack(explorerPath.length - 2)} 
                                    disabled={explorerPath.length <= 1}
                                    style={{ background: 'none', border: 'none', cursor: explorerPath.length > 1 ? 'pointer' : 'default', color: explorerPath.length > 1 ? 'var(--accent)' : '#cbd5e1' }}
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
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => fetchExplorerFiles()} className="btn btn-secondary" title="Refresh list">
                                    <RefreshCw size={18} className={loadingExplorer ? 'animate-spin' : ''} />
                                </button>
                                <button className="btn btn-primary" onClick={() => document.getElementById('explorer-upload').click()}>
                                    <Upload size={18} /> Upload Files
                                </button>
                                <input id="explorer-upload" type="file" multiple hidden onChange={handleExplorerUpload} />
                            </div>
                        </div>

                        {explorerError && (
                            <div style={{ color: '#ef4444', background: '#fef2f2', padding: '12px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <AlertCircle size={18} /> {explorerError}
                            </div>
                        )}

                        {loadingExplorer && explorerFiles.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                                <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 16px' }} />
                                <p>Syncing with Google Drive...</p>
                            </div>
                        ) : explorerFiles.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #e2e8f0' }}>
                                <Folder size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                                <p style={{ fontSize: '1.1rem' }}>This folder is empty.</p>
                                <p style={{ fontSize: '0.9rem', marginTop: '4px' }}>Upload drawings, photos, or documents to keep them with this job.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
                                {explorerFiles.map(file => (
                                    <div key={file.id} className="glass-panel" style={{ padding: '16px', borderRadius: '12px', background: '#fff', border: '1px solid #e2e8f0', transition: 'transform 0.2s' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                            <div 
                                                style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: file.mimeType.includes('folder') ? 'pointer' : 'default', flex: 1, overflow: 'hidden' }}
                                                onClick={() => file.mimeType.includes('folder') && handleExplorerNavigate(file)}
                                            >
                                                {file.mimeType.includes('folder') ? <Folder size={24} color="#6366f1" /> : <FileIcon size={24} color="#64748b" />}
                                                <div style={{ overflow: 'hidden' }}>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={file.name}>
                                                        {file.name}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'Folder'}</div>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleExplorerDelete(file.id, file.name)}
                                                style={{ background: 'none', border: 'none', color: '#cbd5e1', padding: '4px', cursor: 'pointer' }}
                                                onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                                                onMouseOut={(e) => e.currentTarget.style.color = '#cbd5e1'}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <a href={file.webViewLink} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ flex: 1, padding: '6px', fontSize: '0.75rem', gap: '4px' }}>
                                                <ExternalLink size={12} /> View
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Partner Vault Shortcut */}
                        <div style={{ marginTop: '32px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', background: '#e0e7ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Users size={20} color="#4338ca" />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>Partner Vault Bridge</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Quick access to {formData.partners?.name || 'Customer'}'s master documents</div>
                                </div>
                            </div>
                            <button 
                                className="btn btn-secondary" 
                                style={{ fontSize: '0.8rem', gap: '8px' }}
                                onClick={handleOpenPartnerVault}
                            >
                                <ExternalLink size={14} /> Open Partner Folder
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'payments' && (
                    <div className="glass-panel job-payments">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>Payments & GST Dashboard</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>Reporting Period:</label>
                                <select 
                                    className="form-select" 
                                    value={paymentQuarter} 
                                    onChange={(e) => setPaymentQuarter(e.target.value)}
                                    style={{ width: '150px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                >
                                    <option value="All">Full Project</option>
                                    <option value="Q1">Q1 (Jan - Mar)</option>
                                    <option value="Q2">Q2 (Apr - Jun)</option>
                                    <option value="Q3">Q3 (Jul - Sep)</option>
                                    <option value="Q4">Q4 (Oct - Dec)</option>
                                </select>
                            </div>
                        </div>

                        {/* GST & Financial Summary */}
                        {(() => {
                            const getQuarter = (dateStr) => {
                                const month = new Date(dateStr).getMonth();
                                if (month <= 2) return 'Q1';
                                if (month <= 5) return 'Q2';
                                if (month <= 8) return 'Q3';
                                return 'Q4';
                            };

                            const fCust = paymentQuarter === 'All' ? customerPayments : customerPayments.filter(p => getQuarter(p.payment_date) === paymentQuarter);
                            const fSupp = paymentQuarter === 'All' ? supplierPayments : supplierPayments.filter(p => getQuarter(p.payment_date) === paymentQuarter);
                            
                            const outGst = fCust.reduce((acc, p) => acc + (parseFloat(p.gst_amount) || 0), 0);
                            const inGst = fSupp.reduce((acc, p) => acc + (parseFloat(p.gst_amount) || 0), 0);
                            const netGst = outGst - inGst;

                            return (
                                <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '32px' }}>
                                    <div className="summary-card" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', padding: '20px', borderRadius: '16px', border: '1px solid #bfdbfe' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', marginBottom: '8px' }}>Output GST (Collected)</div>
                                        <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#1e3a8a' }}>
                                            {formData.currency} {outGst.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#60a5fa', marginTop: '4px' }}>From {fCust.length} receipts</div>
                                    </div>
                                    <div className="summary-card" style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', padding: '20px', borderRadius: '16px', border: '1px solid #fed7aa' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#9a3412', textTransform: 'uppercase', marginBottom: '8px' }}>Input GST (Paid)</div>
                                        <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#7c2d12' }}>
                                            {formData.currency} {inGst.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#fb923c', marginTop: '4px' }}>From {fSupp.length} invoices</div>
                                    </div>
                                    <div className="summary-card" style={{ background: `linear-gradient(135deg, ${netGst >= 0 ? '#f0fdf4 0%, #dcfce7 100%' : '#fef2f2 0%, #fee2e2 100%'})`, padding: '20px', borderRadius: '16px', border: `1px solid ${netGst >= 0 ? '#bbf7d0' : '#fecaca'}` }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: netGst >= 0 ? '#166534' : '#991b1b', textTransform: 'uppercase', marginBottom: '8px' }}>Net GST Position</div>
                                        <div style={{ fontSize: '1.75rem', fontWeight: 900, color: netGst >= 0 ? '#14532d' : '#7f1d1d' }}>
                                            {formData.currency} {netGst.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: netGst >= 0 ? '#4ade80' : '#f87171', marginTop: '4px' }}>{netGst >= 0 ? 'Payable to Govt' : 'Claimable Refund'}</div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px' }}>
                                    {/* Customer Payments (Incoming) */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><CreditCard size={20} className="text-accent" /> Customer Ledger</h3>
                                            <button className="btn btn-sm btn-primary" onClick={() => setPaymentModal({ isOpen: true, type: 'customer', data: null })}>+ Add Payment</button>
                                        </div>
                                        <div className="table-container" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                <thead style={{ background: '#f8fafc' }}>
                                                    <tr>
                                                        <th style={{ padding: '12px', textAlign: 'left' }}>Inv No</th>
                                                        <th style={{ padding: '12px', textAlign: 'left' }}>Date</th>
                                                        <th style={{ padding: '12px', textAlign: 'right' }}>GST</th>
                                                        <th style={{ padding: '12px', textAlign: 'right' }}>Total</th>
                                                        <th style={{ padding: '12px', textAlign: 'center' }}>Proof</th>
                                                        <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {fCust.length === 0 ? (
                                                        <tr><td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>No {paymentQuarter === 'All' ? '' : paymentQuarter} payments recorded.</td></tr>
                                                    ) : (
                                                        fCust.map(p => (
                                                            <tr key={p.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '12px' }}>{p.invoice_no}</td>
                                                                <td style={{ padding: '12px' }}>{new Date(p.payment_date).toLocaleDateString()}</td>
                                                                <td style={{ padding: '12px', textAlign: 'right', color: '#64748b' }}>{p.gst_amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>{p.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                                <td style={{ padding: '12px', textAlign: 'center' }}>
                                                                    {p.proof_url ? (
                                                                        <a href={p.proof_url} target="_blank" rel="noreferrer" style={{ color: '#10b981' }}><FileCheck size={16} /></a>
                                                                    ) : (
                                                                        <label style={{ cursor: 'pointer', color: '#94a3b8' }}>
                                                                            <Upload size={16} />
                                                                            <input type="file" hidden onChange={(e) => handlePaymentProofUpload('customer', p.id, e.target.files[0])} />
                                                                        </label>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '12px', textAlign: 'right' }}>
                                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                                        <button onClick={() => setPaymentModal({ isOpen: true, type: 'customer', data: p })} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}><FileText size={14} /></button>
                                                                        <button onClick={() => handleDeletePayment('customer', p.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Supplier Payments (Outgoing) */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Users size={20} className="text-accent" /> Supplier Ledger</h3>
                                            <button className="btn btn-sm btn-primary" onClick={() => setPaymentModal({ isOpen: true, type: 'supplier', data: null })}>+ Add Record</button>
                                        </div>
                                        <div className="table-container" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                <thead style={{ background: '#f8fafc' }}>
                                                    <tr>
                                                        <th style={{ padding: '12px', textAlign: 'left' }}>Supplier / Inv No</th>
                                                        <th style={{ padding: '12px', textAlign: 'left' }}>Date</th>
                                                        <th style={{ padding: '12px', textAlign: 'right' }}>GST</th>
                                                        <th style={{ padding: '12px', textAlign: 'right' }}>Total</th>
                                                        <th style={{ padding: '12px', textAlign: 'center' }}>Proof</th>
                                                        <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {fSupp.length === 0 ? (
                                                        <tr><td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>No {paymentQuarter === 'All' ? '' : paymentQuarter} records found.</td></tr>
                                                    ) : (
                                                        fSupp.map(p => (
                                                            <tr key={p.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '12px' }}>
                                                                    <div style={{ fontWeight: 600 }}>{partners.find(part => part.id === p.supplier_id)?.name || 'Unknown'}</div>
                                                                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{p.invoice_no}</div>
                                                                </td>
                                                                <td style={{ padding: '12px' }}>{new Date(p.payment_date).toLocaleDateString()}</td>
                                                                <td style={{ padding: '12px', textAlign: 'right', color: '#64748b' }}>{p.gst_amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>{p.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                                <td style={{ padding: '12px', textAlign: 'center' }}>
                                                                    {p.proof_url ? (
                                                                        <a href={p.proof_url} target="_blank" rel="noreferrer" style={{ color: '#10b981' }}><FileCheck size={16} /></a>
                                                                    ) : (
                                                                        <label style={{ cursor: 'pointer', color: '#94a3b8' }}>
                                                                            <Upload size={16} />
                                                                            <input type="file" hidden onChange={(e) => handlePaymentProofUpload('supplier', p.id, e.target.files[0])} />
                                                                        </label>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '12px', textAlign: 'right' }}>
                                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                                        <button onClick={() => setPaymentModal({ isOpen: true, type: 'supplier', data: p })} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}><FileText size={14} /></button>
                                                                        <button onClick={() => handleDeletePayment('supplier', p.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                                </>
                            );
                        })()}
                    </div>
                )}
            </div>

            {/* Quick Add Modal */}
            <Modal
                isOpen={modal.isOpen}
                onClose={() => setModal({ isOpen: false, type: null })}
                title={getModalTitle()}
                icon={getModalIcon()}
                size={(modal.type === 'partner_id' || modal.type === 'contact_id') ? 'xl' : 'md'}
            >
                {renderModalContent()}
            </Modal>

            {/* Job Conversion PO Modal */}
            {poModal.isOpen && (
                <div className="modal-backdrop" style={{ zIndex: 10000 }}>
                    <div className="modal-content" style={{ 
                        maxWidth: '560px', 
                        width: '95%', 
                        background: '#ffffff', 
                        borderRadius: '12px', 
                        padding: '24px', 
                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                        border: '1px solid #e5e7eb'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: '#1e3a8a', fontSize: '1.25rem', fontWeight: 700 }}>
                                <Package size={22} color="#1e3a8a" /> Convert Quotation to Job
                            </h3>
                            <button onClick={() => setPoModal({ isOpen: false })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.target);
                                const poData = {
                                    po_no: formData.get('po_no'),
                                    po_date: formData.get('po_date'),
                                    po_value: formData.get('po_value'),
                                    po_description: formData.get('po_description'),
                                    contact_id: formData.get('contact_id')
                                };
                            const options = {
                                includeCertificates: formData.get('includeCertificates') === 'on',
                                includeServiceReport: formData.get('includeServiceReport') === 'on'
                            };
                            confirmJobConversion(poData, options);
                        }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                                <div className="form-item">
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: '#374151', marginBottom: '6px', fontWeight: 500 }}>Customer PO No.</label>
                                    <input type="text" required className="form-input" name="po_no" defaultValue={formData.customer_po_no} placeholder="PO-12345" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.95rem' }} />
                                </div>
                                <div className="form-item">
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: '#374151', marginBottom: '6px', fontWeight: 500 }}>PO Date</label>
                                    <input type="date" required className="form-input" name="po_date" defaultValue={formData.customer_po_date || new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.95rem' }} />
                                </div>
                                <div className="form-item">
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: '#374151', marginBottom: '6px', fontWeight: 500 }}>PO Value ({formData.currency})</label>
                                    <input type="number" step="0.01" required className="form-input" name="po_value" defaultValue={formData.total_amount} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.95rem' }} />
                                </div>
                                <div className="form-item">
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: '#374151', marginBottom: '6px', fontWeight: 500 }}>PO Issued By</label>
                                    <select required className="form-input" name="contact_id" defaultValue={formData.contact_id} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.95rem' }}>
                                        <option value="">-- Select Contact --</option>
                                        {(() => {
                                            const selectedPartner = partners.find(p => p.id === formData.partner_id);
                                            const selectedPartnerName = selectedPartner?.name;
                                            return contacts.filter(c => {
                                                if (c.partnerId === formData.partner_id) return true;
                                                if (selectedPartnerName) {
                                                    const contactPartner = partners.find(p => p.id === c.partnerId);
                                                    return contactPartner && contactPartner.name && contactPartner.name.trim().toLowerCase() === selectedPartnerName.trim().toLowerCase();
                                                }
                                                return false;
                                            }).map(c => (
                                                <option key={c.id} value={c.id}>{c.name} {c.designation ? `(${c.designation})` : ''}</option>
                                            ));
                                        })()}
                                    </select>
                                </div>
                            </div>

                            <div className="form-item" style={{ marginBottom: '24px' }}>
                                <label style={{ display: 'block', fontSize: '0.9rem', color: '#374151', marginBottom: '6px', fontWeight: 500 }}>PO Description / Project Scope</label>
                                <textarea className="form-input" name="po_description" rows="2" placeholder="Briefly describe the PO scope..." style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.95rem', resize: 'none' }}></textarea>
                            </div>

                            <div className="form-item" style={{ marginBottom: '24px' }}>
                                <label style={{ display: 'block', fontSize: '0.9rem', color: '#374151', marginBottom: '6px', fontWeight: 500 }}>Upload Customer PO (File Repository)</label>
                                <div style={{ 
                                    border: '2px dashed #e5e7eb', 
                                    borderRadius: '12px', 
                                    padding: '16px', 
                                    textAlign: 'center',
                                    background: poFile ? '#f0fdf4' : '#fafafa',
                                    borderColor: poFile ? '#22c55e' : '#e5e7eb',
                                    transition: 'all 0.2s'
                                }}>
                                    <input 
                                        type="file" 
                                        id="po-upload-editor" 
                                        hidden 
                                        onChange={(e) => setPoFile(e.target.files[0])} 
                                    />
                                    <label htmlFor="po-upload-editor" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                        {poFile ? (
                                            <>
                                                <FileCheck size={24} color="#22c55e" />
                                                <span style={{ fontSize: '0.85rem', color: '#15803d', fontWeight: 600 }}>{poFile.name} selected</span>
                                                <button type="button" onClick={(e) => { e.preventDefault(); setPoFile(null); }} style={{ fontSize: '0.75rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Remove</button>
                                            </>
                                        ) : (
                                            <>
                                                <Upload size={24} color="#6366f1" />
                                                <span style={{ fontSize: '0.85rem', color: '#4b5563' }}>Click to upload or drag and drop PO file</span>
                                                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>PDF, DOCX or Images (Max 10MB)</span>
                                            </>
                                        )}
                                    </label>
                                </div>
                            </div>



                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '32px' }}>
                                <button type="button" onClick={() => setPoModal({ isOpen: false })} style={{ 
                                    padding: '10px 24px', 
                                    borderRadius: '8px', 
                                    border: '1px solid #d1d5db', 
                                    background: '#ffffff', 
                                    color: '#374151', 
                                    fontSize: '0.95rem', 
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}>Cancel</button>
                                <button type="submit" disabled={saving} style={{ 
                                    padding: '10px 24px', 
                                    borderRadius: '8px', 
                                    border: 'none', 
                                    background: '#5865f2', 
                                    color: '#ffffff', 
                                    fontSize: '0.95rem', 
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    minWidth: '200px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    boxShadow: '0 4px 6px -1px rgba(88, 101, 242, 0.2)'
                                }}>
                                    {saving ? (
                                        <>
                                            <div className="animate-spin" style={{ width: '18px', height: '18px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%' }}></div> Generating...
                                        </>
                                    ) : 'Confirm & Generate Job'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Float to Suppliers Modal */}
            {showFloatModal && (
                <div className="modal-backdrop" style={{ zIndex: 10000 }}>
                    <div className="modal-content" style={{ maxWidth: '600px', width: '95%', background: '#fff', borderRadius: '16px', padding: '32px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>Float Enquiry to Suppliers</h3>
                            <button onClick={() => setShowFloatModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={24} />
                            </button>
                        </div>
                        <p style={{ color: '#64748b', marginBottom: '24px' }}>Select multiple suppliers to receive this enquiry. A separate RFQ document will be created for each.</p>
                        
                        <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '24px', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                            {partners.filter(p => p.types?.includes('Supplier') || p.category === 'Supplier').map(supplier => (
                                <label key={supplier.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s' }} className="hover:bg-slate-50">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedSuppliers.includes(supplier.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) setSelectedSuppliers([...selectedSuppliers, supplier.id]);
                                            else setSelectedSuppliers(selectedSuppliers.filter(id => id !== supplier.id));
                                        }}
                                        style={{ width: '18px', height: '18px' }}
                                    />
                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{supplier.name}</span>
                                </label>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="btn btn-secondary flex-1" onClick={() => setShowFloatModal(false)}>Cancel</button>
                            <button 
                                className="btn btn-primary flex-2" 
                                disabled={selectedSuppliers.length === 0 || saving}
                                onClick={async () => {
                                    // Save current doc first
                                    const saved = await handleSave();
                                    const activeId = saved?.id || currentIdRef.current;
                                    // Start floating process one-by-one
                                    handleNextFloat(0, selectedSuppliers, activeId);
                                }}
                            >
                                {saving ? 'Initializing...' : `Float to ${selectedSuppliers.length} Suppliers`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Email Preview Modal */}
            {emailPreview && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', width: '100%', maxWidth: '850px', display: 'flex', flexDirection: 'column', maxHeight: '95vh', overflow: 'hidden' }}>

                        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Send size={20} color="#3b82f6" /> Email Preview
                            </h2>
                            <button onClick={() => setEmailPreview(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</label>
                                    <div style={{ position: 'relative', display: 'flex', gap: '8px' }}>
                                        <input
                                            type="email"
                                            style={{ flex: 1, padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                            value={emailPreview.to}
                                            onChange={(e) => setEmailPreview(prev => ({ ...prev, to: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cc (Separate with semicolon)</label>
                                        <textarea
                                            rows="2"
                                            style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box', resize: 'none' }}
                                            value={emailPreview.cc}
                                            onChange={(e) => setEmailPreview(prev => ({ ...prev, cc: e.target.value }))}
                                            placeholder="email1@example.com; email2@example.com"
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bcc</label>
                                        <textarea
                                            rows="2"
                                            style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box', resize: 'none' }}
                                            value={emailPreview.bcc}
                                            onChange={(e) => setEmailPreview(prev => ({ ...prev, bcc: e.target.value }))}
                                            placeholder="bcc1@example.com; bcc2@example.com"
                                        />
                                    </div>
                                </div>
                            </div>
                            {/* SEARCHABLE DUAL-COLUMN CONTACT SELECTOR */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '4px' }}>
                                    
                                    {/* Left Side: Customer Contacts */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Company Contacts
                                            </label>
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    setModalContactType('customer');
                                                    setModalEditingContact(null);
                                                    setModalName('');
                                                    setModalEmail('');
                                                    setIsAddModalOpen(true);
                                                }}
                                                style={{ background: 'transparent', border: 'none', color: '#2563eb', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                            >
                                                <Plus size={12} /> Add Contact
                                            </button>
                                        </div>

                                        <SearchableDropdown 
                                            placeholder="Search other company contacts..."
                                            searchVal={companySearch}
                                            setSearchVal={setCompanySearch}
                                            isOpen={showCompanyDropdown}
                                            setIsOpen={setShowCompanyDropdown}
                                            options={getCompanyDropdownOptions()}
                                            onSelect={(selected) => {
                                                setCustomVisibleContacts(prev => {
                                                    if (prev.find(x => x.email.toLowerCase() === selected.email.toLowerCase())) return prev;
                                                    return [...prev, selected];
                                                });
                                                toggleEmailInField('to', selected.email);
                                            }}
                                        />

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
                                            {getCustomerContacts().length === 0 ? (
                                                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#fff' }}>
                                                    No company contacts selected. Click dropdown or "+ Add Contact" to append.
                                                </div>
                                            ) : (
                                                getCustomerContacts().map((contact, idx) => (
                                                    <ContactCard 
                                                        key={idx}
                                                        contact={contact}
                                                        emailPreview={emailPreview}
                                                        toggleEmailInField={toggleEmailInField}
                                                        onEdit={(c) => {
                                                            setModalContactType('customer');
                                                            setModalEditingContact(c);
                                                            setModalName(c.name);
                                                            setModalEmail(c.email);
                                                            setIsAddModalOpen(true);
                                                        }}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    {/* Right Side: Our Office (Celron Contacts) */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderLeft: '1px solid #e2e8f0', paddingLeft: '20px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Our Office Contacts
                                            </label>
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    setModalContactType('office');
                                                    setModalEditingContact(null);
                                                    setModalName('');
                                                    setModalEmail('');
                                                    setIsAddModalOpen(true);
                                                }}
                                                style={{ background: 'transparent', border: 'none', color: '#2563eb', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                            >
                                                <Plus size={12} /> Add Contact
                                            </button>
                                        </div>

                                        <SearchableDropdown 
                                            placeholder="Search office contacts..."
                                            searchVal={officeSearch}
                                            setSearchVal={setOfficeSearch}
                                            isOpen={showOfficeDropdown}
                                            setIsOpen={setShowOfficeDropdown}
                                            options={getOfficeDropdownOptions()}
                                            onSelect={(selected) => {
                                                setCustomOfficeContacts(prev => {
                                                    if (prev.find(x => x.email.toLowerCase() === selected.email.toLowerCase())) return prev;
                                                    return [...prev, selected];
                                                });
                                                toggleEmailInField('cc', selected.email);
                                            }}
                                        />

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
                                            {getOfficeContacts().map((contact, idx) => (
                                                <ContactCard 
                                                    key={idx}
                                                    contact={contact}
                                                    emailPreview={emailPreview}
                                                    toggleEmailInField={toggleEmailInField}
                                                    onEdit={(c) => {
                                                        setModalContactType('office');
                                                        setModalEditingContact(c);
                                                        setModalName(c.name);
                                                        setModalEmail(c.email);
                                                        setIsAddModalOpen(true);
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                </div>     

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subject</label>
                                <input
                                    type="text"
                                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                    value={emailPreview.subject}
                                    onChange={(e) => setEmailPreview(prev => ({ ...prev, subject: e.target.value }))}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Message Body</label>
                                <textarea
                                    style={{ width: '100%', minHeight: '200px', padding: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', resize: 'vertical', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.5', boxSizing: 'border-box' }}
                                    value={emailPreview.body}
                                    onChange={(e) => setEmailPreview(prev => ({ ...prev, body: e.target.value }))}
                                />
                                <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <FileText size={24} color="#16a34a" />
                                    <div>
                                        <p style={{ fontSize: '12px', color: '#166534', margin: 0, fontWeight: 700 }}>📄 PDF Automatically Attached</p>
                                        <p style={{ fontSize: '11px', color: '#166534', margin: '2px 0 0 0', opacity: 0.9 }}>The {formData.document_type || 'Document'} PDF has been generated and is attached to this email.</p>
                                    </div>
                                </div>

                                {/* SUGGESTED ATTACHMENTS (Linked Documents) */}
                                {workflowDocs.length > 0 && (
                                    <div style={{ marginTop: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '12px' }}>
                                            Quick Attach Linked Documents (Job Suite)
                                        </label>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {/* Root Job Reference Button (If not current) */}
                                            {formData.assigned_job_no && formData.document_type !== 'Job' && !workflowDocs.some(d => d.document_type === 'Job') && (
                                                <div
                                                    style={{
                                                        padding: '6px 12px',
                                                        borderRadius: '6px',
                                                        background: '#f8fafc',
                                                        border: '1px solid #e2e8f0',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        color: '#64748b',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                >
                                                    <Package size={12} /> Job: {formData.assigned_job_no}
                                                </div>
                                            )}

                                            {workflowDocs.filter(d => d.id !== id).map(doc => {
                                                const isAttached = emailPreview.attachments?.some(a => a.name.includes(doc.document_no));
                                                return (
                                                    <button
                                                        key={doc.id}
                                                        type="button"
                                                        onClick={() => attachDocumentFromSuite(doc)}
                                                        disabled={saving || isAttached}
                                                        style={{
                                                            padding: '6px 12px',
                                                            borderRadius: '6px',
                                                            background: isAttached ? '#f1f5f9' : '#eff6ff',
                                                            border: `1px solid ${isAttached ? '#e2e8f0' : '#bfdbfe'}`,
                                                            fontSize: '0.75rem',
                                                            fontWeight: 600,
                                                            color: isAttached ? '#94a3b8' : '#2563eb',
                                                            cursor: isAttached ? 'default' : 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        {isAttached ? <FileCheck size={12} /> : <Plus size={12} />} 
                                                        {doc.document_type}: {doc.document_no}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* QUICK ATTACH GALLERY PHOTOS */}
                                {galleryFiles.length > 0 && (
                                    <div style={{ marginTop: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '12px' }}>
                                            Quick Attach Job Photos
                                        </label>
                                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
                                            {galleryFiles.map(file => {
                                                const isAttached = emailPreview.attachments?.some(a => a.name === file.name);
                                                return (
                                                    <div 
                                                        key={file.id} 
                                                        onClick={() => !isAttached && attachGalleryFile(file)}
                                                        style={{ 
                                                            minWidth: '80px', 
                                                            height: '60px', 
                                                            borderRadius: '6px', 
                                                            overflow: 'hidden', 
                                                            position: 'relative', 
                                                            cursor: isAttached ? 'default' : 'pointer',
                                                            border: isAttached ? '2px solid #10b981' : '1px solid #e2e8f0',
                                                            opacity: isAttached ? 0.6 : 1
                                                        }}
                                                    >
                                                        <img src={file.thumbnailLink} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        {isAttached && (
                                                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <FileCheck size={16} color="#fff" />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Custom Attachments Section */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Additional Attachments</span>
                                        <label style={{ cursor: 'pointer', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'none', letterSpacing: 'normal' }}>
                                            <Paperclip size={14} /> Add File
                                            <input
                                                type="file"
                                                multiple
                                                onChange={(e) => {
                                                    const files = Array.from(e.target.files);
                                                    if (files.length > 0) {
                                                        setEmailPreview(prev => ({
                                                            ...prev,
                                                            attachments: [...(prev.attachments || []), ...files]
                                                        }));
                                                    }
                                                    e.target.value = null; // Reset input so same file can be selected again if needed
                                                }}
                                                style={{ display: 'none' }}
                                            />
                                        </label>
                                    </label>

                                    {emailPreview.attachments?.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {emailPreview.attachments.map((file, idx) => (
                                                <div key={idx} style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                        <Paperclip size={16} color="#64748b" />
                                                        <span style={{ fontSize: '12px', color: '#334155', whiteWhiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                                                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>({Math.round(file.size / 1024)} KB)</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setEmailPreview(prev => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== idx) }))}
                                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                        title="Remove attachment"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc' }}>
                            <button
                                onClick={() => setEmailPreview(null)}
                                disabled={saving}
                                style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={sendEmail}
                                disabled={saving}
                                style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600, color: '#fff', background: '#3b82f6', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: saving ? 0.7 : 1 }}
                            >
                                <Send size={16} /> {saving ? 'Sending...' : 'Send Email Now'}
                            </button>
                        </div>
                    </div>

                    {/* LIGHTWEIGHT CONTACT ADD/EDIT OVERLAY MODAL */}
                    {isAddModalOpen && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10005, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' }}>
                            <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '400px', padding: '20px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
                                        {modalEditingContact ? '✏️ Edit Contact' : `➕ Add ${modalContactType === 'office' ? 'Office' : 'Customer'} Contact`}
                                    </h3>
                                    <button type="button" onClick={() => { setIsAddModalOpen(false); setModalEditingContact(null); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
                                        <X size={18} />
                                    </button>
                                </div>
                                <form onSubmit={handleSaveModalContact} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Full Name</label>
                                        <input 
                                            type="text" 
                                            required
                                            placeholder="e.g. Sunil Salian"
                                            value={modalName}
                                            onChange={e => setModalName(e.target.value)}
                                            style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Email Address</label>
                                        <input 
                                            type="email" 
                                            required
                                            placeholder="e.g. sunil@greatship.com"
                                            value={modalEmail}
                                            onChange={e => setModalEmail(e.target.value)}
                                            style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                                        <button 
                                            type="button"
                                            onClick={() => { setIsAddModalOpen(false); setModalEditingContact(null); }}
                                            style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', color: '#475569', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            type="submit"
                                            disabled={isSavingContactModal}
                                            style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', background: '#3b82f6', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            {isSavingContactModal ? 'Saving...' : 'Save Contact'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Premium AI Enquiry Document Parser Modal */}
            <SmartEnquiryParserModal 
                isOpen={showDocumentParserModal}
                onClose={() => setShowDocumentParserModal(false)}
                partners={partners}
                onApply={({ header, items: scannedItems, file: uploadedFile }) => {
                    // 1. Map header fields
                    const headerUpdates = {};
                    if (header.customer_id) headerUpdates.partner_id = header.customer_id;
                    if (header.customer_ref) headerUpdates.customer_ref = header.customer_ref;
                    if (header.due_date) headerUpdates.due_date = header.due_date;
                    if (header.subject) headerUpdates.subject = header.subject;
                    setFormData(prev => ({ ...prev, ...headerUpdates }));

                    // 2. Append parsed products (Zero data loss)
                    const newItems = [...lineItems];
                    scannedItems.forEach(item => {
                        if (!newItems.some(i => (i.description || '').toLowerCase() === (item.name || '').toLowerCase())) {
                            newItems.push({
                                id: Date.now() + Math.random(),
                                description: item.name,
                                details: item.specification,
                                quantity: item.quantity || 1,
                                uom: item.uom || 'UNIT(S)',
                                unit_price: 0,
                                amount: 0,
                                tax_enabled: true,
                                tax_rate: 9
                            });
                        }
                    });
                    setLineItems(newItems);

                    // 3. Queue file for Google Drive upload (if GDrive linked)
                    const token = localStorage.getItem('google_access_token');
                    if (token && uploadedFile) {
                        if (!isTokenValid()) {
                            toast.error("Google session expired. Parsed document copy could not be uploaded to Google Drive.");
                        } else {
                            try {
                            let folderId = formData.drive_folder_id;
                            if (!folderId) {
                                // Provision structure if not yet done
                                const rootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
                                if (rootId) {
                                    const currentYear = new Date().getFullYear().toString();
                                    const partnerName = partners.find(p => p.id === header.customer_id)?.name || 'Unknown Partner';
                                    const vesselName = vessels.find(v => v.id === header.vessel_id)?.vessel_name || '';
                                    const locationName = workLocations.find(l => l.id === header.work_location_id)?.location_name || '';
                                    const suffix = vesselName || locationName || '';
                                    const folderTitle = suffix ? `${formData.document_no || 'Draft'} - ${partnerName} - ${suffix}` : `${formData.document_no || 'Draft'} - ${partnerName}`;
                                    const cleanTitle = folderTitle.replace(/[/\\?%*:|"<>]/g, '-');
                                    provisionFullProjectStructure(token, rootId, currentYear, cleanTitle).then(fid => {
                                        setFormData(prev => ({ ...prev, drive_folder_id: fid }));
                                        // Option B: upload directly to root folder
                                        const attFolder = fid;
                                        uploadFileToDrive(token, uploadedFile, { folderId: attFolder }).then(result => {
                                            if (result?.webViewLink) {
                                                const newUrls = [...(formData.attachment_urls || []), result.webViewLink];
                                                setFormData(prev => ({ ...prev, attachment_urls: newUrls }));
                                                toast.success("Enquiry document successfully archived in Google Drive!");
                                            }
                                        });
                                    });
                                }
                            } else {
                                // Option B: upload directly to root folder
                                const attFolder = folderId;
                                uploadFileToDrive(token, uploadedFile, { folderId: attFolder }).then(result => {
                                    if (result?.webViewLink) {
                                        const newUrls = [...(formData.attachment_urls || []), result.webViewLink];
                                        setFormData(prev => ({ ...prev, attachment_urls: newUrls }));
                                        toast.success("Enquiry document successfully archived in Google Drive!");
                                    }
                                });
                            }
                        } catch (e) {
                            console.error("Google Drive auto-archival failed:", e);
                        }
                    }
                }

                    toast.success(`Successfully loaded ${scannedItems.length} items and header fields! Click "Save" to persist changes.`);
                }}
            />

            {showDetailsModal && modalItemIndex !== null && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.45)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    animation: 'fadeIn 0.2s ease-out'
                }}>
                    <div style={{
                        background: '#ffffff',
                        width: '90%',
                        maxWidth: '700px',
                        borderRadius: '24px',
                        padding: '32px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '20px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Sparkles size={18} className="text-accent" />
                                    Technical Specifications
                                </h3>
                                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
                                    Line Item: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{lineItems[modalItemIndex]?.description || 'Selected Line Item'}</span>
                                </p>
                            </div>
                            <button 
                                onClick={() => setShowDetailsModal(false)}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                className="hover:bg-slate-100"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <textarea
                                value={modalItemDetails}
                                onChange={(e) => setModalItemDetails(e.target.value)}
                                rows={10}
                                style={{
                                    width: '100%',
                                    padding: '16px',
                                    borderRadius: '12px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '0.95rem',
                                    fontFamily: 'inherit',
                                    resize: 'vertical',
                                    background: '#f8fafc',
                                    color: '#1e293b',
                                    outline: 'none',
                                    transition: 'border-color 0.2s',
                                    lineHeight: '1.5'
                                }}
                                onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                                onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                                placeholder="Enter full specifications, model numbers, dimensions, scope of work, and other technical details..."
                                autoFocus
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b' }}>
                                <span>💡 Pro-tip: Press Enter to add bullet points or start new lines.</span>
                                <span>{modalItemDetails.length} characters</span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                            <button 
                                onClick={() => setShowDetailsModal(false)} 
                                className="btn btn-outline"
                                style={{ padding: '10px 20px', borderRadius: '10px' }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => {
                                    updateLineItem(modalItemIndex, 'details', modalItemDetails);
                                    setShowDetailsModal(false);
                                    toast.success('Specifications updated successfully!');
                                }} 
                                className="btn btn-primary"
                                style={{ padding: '10px 20px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <CheckCircle size={16} /> Save Specifications
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                .workflow-editor-theme {
                    background: var(--bg-primary);
                    min-height: 100vh;
                    margin: -32px -40px;
                    padding: 0;
                    color: var(--text-primary);
                    font-family: 'Inter', sans-serif;
                }
            .editor-header {
                background: var(--bg-secondary);
            padding: 16px 40px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border-color);
            position: sticky;
            top: 0;
            z-index: 100;
                }
            .icon-btn {
                background: transparent;
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
            padding: 8px;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
                }
            .icon-btn:hover {
                background: #f1f5f9;
            color: var(--accent);
                }
            .hide-sm {
  display: inline-block;
}

@media (max-width: 1400px) {
  .hide-sm {
    display: none;
  }
}

.btn-vibrant {
                background: var(--accent);
            color: #fff;
            border: none;
            padding: 10px 24px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
                }
            .btn-vibrant-secondary {
                background: #fff;
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            padding: 10px 20px;
            border-radius: 8px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
                }
            .btn-vibrant-secondary:hover {background: #f8fafc; }
            .status-container {
                background: var(--bg-secondary);
            margin: 20px 40px;
            border-radius: 12px;
            display: flex;
            padding: 4px;
            border: 1px solid var(--border-color);
                }
            .status-step {
                flex: 1;
            text-align: center;
            padding: 8px;
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--text-secondary);
            position: relative;
                }
            .status-step.active {
                background: #f1f5f9;
            color: var(--accent);
            border-radius: 8px;
                }
            .status-step.confirmed {color: #10b981; }
            .editor-content {
                padding: 0 40px 100px 40px;
                }
            .header-panel {
                margin - bottom: 24px;
                }
            .input-grid {
                display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
                }
            .form-item {
                margin - bottom: 16px;
                }
            .form-item label {
                display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.8rem;
            color: var(--text-secondary);
            margin-bottom: 8px;
            font-weight: 600;
                }
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
            
            /* Order Lines - Indigo */
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
            
            /* PO & Ref Info - Amber */
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
            
            /* Workflow Suite - Violet */
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
            
            /* Project Costing - Blue */
            .tab.tab-costing:hover {
                background: rgba(37, 99, 235, 0.05);
                color: #2563eb;
                border-color: rgba(37, 99, 235, 0.25);
            }
            .tab.tab-costing.active {
                background: #2563eb;
                color: #ffffff;
                border-color: #2563eb;
                box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
            }
            
            /* Payments & GST - Emerald */
            .tab.tab-payments:hover {
                background: rgba(5, 150, 105, 0.05);
                color: #059669;
                border-color: rgba(5, 150, 105, 0.25);
            }
            .tab.tab-payments.active {
                background: #059669;
                color: #ffffff;
                border-color: #059669;
                box-shadow: 0 4px 12px rgba(5, 150, 105, 0.25);
            }
            
            /* Photos & Media - Rose */
            .tab.tab-gallery:hover {
                background: rgba(225, 29, 72, 0.05);
                color: #e11d48;
                border-color: rgba(225, 29, 72, 0.25);
            }
            .tab.tab-gallery.active {
                background: #e11d48;
                color: #ffffff;
                border-color: #e11d48;
                box-shadow: 0 4px 12px rgba(225, 29, 72, 0.25);
            }
            
            /* Explorer - Cyan */
            .tab.tab-explorer:hover {
                background: rgba(8, 145, 178, 0.05);
                color: #0891b2;
                border-color: rgba(8, 145, 178, 0.25);
            }
            .tab.tab-explorer.active {
                background: #0891b2;
                color: #ffffff;
                border-color: #0891b2;
                box-shadow: 0 4px 12px rgba(8, 145, 178, 0.25);
            }
            .editor-table {
                width: 100%;
            border-collapse: collapse;
            background: #fff;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid var(--border-color);
                }
            .editor-table th {
                background: #f8fafc;
            padding: 12px;
            text-align: left;
            font-size: 0.75rem;
            color: var(--text-secondary);
            text-transform: uppercase;
            border-bottom: 1px solid var(--border-color);
                }
            .editor-table td {
                padding: 12px;
            border-bottom: 1px solid var(--border-color);
            vertical-align: top;
                }
            .table-input {
                width: 100%;
            background: transparent;
            border: none;
            border-bottom: 1px solid transparent;
            color: var(--text-primary);
            padding: 8px 4px;
            font-family: inherit;
            font-size: 0.95rem;
                }
            .table-input:focus {
                border - bottom - color: var(--accent);
            outline: none;
                }
            .table-textarea {
                width: 100%;
            background: transparent;
            border: none;
            color: var(--text-secondary);
            font-size: 0.85rem;
            resize: none;
            height: 20px;
            font-family: inherit;
                }
            .center {text - align: center; }
            .right {text - align: right; }
            .row-section {background: rgba(99, 102, 241, 0.05); }
            .row-section .table-input {font - weight: 700; color: var(--accent); }
            .row-note .table-input {font - style: italic; color: #64748b; }

            .table-actions {
                display: flex;
            justify-content: space-between;
            margin-top: 24px;
                }
            .add-btn {
                background: transparent;
            border: none;
            color: var(--accent);
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.9rem;
            padding: 8px 12px;
            border-radius: 6px;
                }
            .add-btn:hover {background: rgba(99, 102, 241, 0.05); }

            .summary-box {
                width: 350px;
            background: #fff;
            border-radius: 12px;
            padding: 20px;
            border: 1px solid var(--border-color);
                }
            .summary-row {
                display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 0.95rem;
            color: var(--text-secondary);
                }
            .summary-total {
                display: flex;
            justify-content: space-between;
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid var(--border-color);
            font-size: 1.25rem;
            font-weight: 700;
            color: var(--text-primary);
                }
            .del-btn {
                background: transparent;
            border: none;
            color: #ef4444;
            cursor: pointer;
            padding: 8px;
            opacity: 0.5;
                }
            .del-btn:hover {opacity: 1; }

            .dropdown {position: relative; }
            .dropdown-content {
                display: none;
            position: absolute;
            background: #fff;
            min-width: 200px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            border-radius: 8px;
            z-index: 100;
            max-height: 200px;
            overflow-y: auto;
            border: 1px solid var(--border-color);
                }
            .dropdown:hover .dropdown-content {display: block; }
            .dropdown-content button {
                width: 100%;
            padding: 10px;
            text-align: left;
            background: transparent;
            border: none;
            color: var(--text-primary);
            cursor: pointer;
            font-size: 0.85rem;
                }
            .dropdown-content button:hover {background: #f8fafc; color: var(--accent); }
            `}} />
            {/* Hidden Print Content for PDF Generation */}
            <div style={{ position: 'fixed', left: 0, top: 0, zIndex: -9999, pointerEvents: 'none' }}>
                <div ref={printRef}>
                    <WorkflowDocumentLayout 
                        doc={{ ...formData, items: lineItems, partners: partners.find(p => p.id === formData.partner_id) }} 
                        settings={settings}
                        logoBase64={logoBase64}
                        signatureBase64={signatureBase64}
                        paynowBase64={paynowBase64}
                    />
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .workflow-editor-theme {
                    --bg-primary: #f8fafc;
                    --text-primary: #0f172a;
                    --text-secondary: #64748b;
                    --accent: #3b82f6;
                    --glass: rgba(255, 255, 255, 0.7);
                    font-family: 'Inter', sans-serif;
                    padding: 24px;
                    max-width: 1400px;
                    margin: 0 auto;
                }
                .modal-backdrop {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 2000;
                    backdrop-filter: blur(4px);
                }
                .modal-content {
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                    position: relative;
                }
                .btn-edit-inline {
                    position: absolute;
                    right: 32px;
                    top: 50%;
                    transform: translateY(-50%);
                    background: none;
                    border: none;
                    color: #6366f1;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    padding: 4px;
                    opacity: 0.7;
                    transition: all 0.2s;
                    z-index: 10;
                }
                .btn-edit-inline:hover {
                    opacity: 1;
                    transform: translateY(-50%) scale(1.1);
                }
                `
            }} />
            {/* Quick Action Floating Hub */}
            {!isNew && <FloatingControlHub jobId={id} />}

            {expenseModal.isOpen && (
                <Modal 
                    isOpen={expenseModal.isOpen} 
                    onClose={() => setExpenseModal({ isOpen: false, data: null })}
                    title={expenseModal.data ? 'Edit Project Expense' : 'Add Project Expense'}
                    icon={Calculator}
                    size="xl"
                >
                    <QuickExpenseAdd 
                        company_id={profile?.company_id}
                        job_id={id}
                        partners={partners}
                        expense={expenseModal.data}
                        onSuccess={(data) => {
                            if (expenseModal.data) {
                                setExpenses(prev => prev.map(e => e.id === data.id ? data : e));
                            } else {
                                setExpenses(prev => [...prev, data]);
                            }
                            setExpenseModal({ isOpen: false, data: null });
                        }}
                        onCancel={() => setExpenseModal({ isOpen: false, data: null })}
                        onUploadBill={async (file) => {
                            const token = getStoredToken();
                            const folderId = await ensureJobFolder();
                            // Option B: upload directly to root folder
                            const financeFolder = folderId;
                            const result = await uploadFileToDrive(token, file, { folderId: financeFolder });
                            return `https://drive.google.com/file/d/${result.id}/view`;
                        }}
                    />
                </Modal>
            )}

            {paymentModal.isOpen && (
                <div className="modal-backdrop">
                    <div className="modal-content" style={{ maxWidth: '500px', width: '90%', padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0 }}>{paymentModal.data ? 'Edit' : 'Add'} {paymentModal.type === 'customer' ? 'Customer Payment' : 'Supplier Payment'}</h3>
                            <button onClick={() => setPaymentModal({ isOpen: false, type: null, data: null })} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.target);
                            handleSavePayment(paymentModal.type, {
                                id: paymentModal.data?.id,
                                invoice_no: f.get('invoice_no'),
                                payment_date: f.get('payment_date'),
                                amount: f.get('amount'),
                                gst_amount: f.get('gst_amount'),
                                supplier_id: f.get('supplier_id'),
                                payment_term: f.get('payment_term'),
                                status: f.get('status')
                            });
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {paymentModal.type === 'supplier' && (
                                    <div className="form-item">
                                        <label>Supplier</label>
                                        <select name="supplier_id" defaultValue={paymentModal.data?.supplier_id} className="form-select" required>
                                            <option value="">-- Select Supplier --</option>
                                            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                )}
                                <div className="form-item">
                                    <label>Invoice No</label>
                                    <input type="text" name="invoice_no" defaultValue={paymentModal.data?.invoice_no} className="form-input" required />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div className="form-item">
                                        <label>Date</label>
                                        <input type="date" name="payment_date" defaultValue={paymentModal.data?.payment_date || new Date().toISOString().split('T')[0]} className="form-input" required />
                                    </div>
                                    <div className="form-item">
                                        <label>Status</label>
                                        <select name="status" defaultValue={paymentModal.data?.status || 'Open'} className="form-select">
                                            <option value="Open">Open</option>
                                            <option value="Closed">Closed</option>
                                        </select>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div className="form-item">
                                        <label>Amount ({formData.currency})</label>
                                        <input type="number" step="0.01" name="amount" defaultValue={paymentModal.data?.amount} className="form-input" required />
                                    </div>
                                    <div className="form-item">
                                        <label>GST Amount</label>
                                        <input type="number" step="0.01" name="gst_amount" defaultValue={paymentModal.data?.gst_amount} className="form-input" required />
                                    </div>
                                </div>
                                {paymentModal.type === 'supplier' && (
                                    <div className="form-item">
                                        <label>Payment Terms</label>
                                        <input type="text" name="payment_term" defaultValue={paymentModal.data?.payment_term} className="form-input" placeholder="e.g. 30 Days" />
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                                <button type="button" onClick={() => setPaymentModal({ isOpen: false, type: null, data: null })} className="btn btn-secondary">Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Payment</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <WhatsAppShareModal 
                isOpen={whatsappShareModal.isOpen}
                onClose={() => setWhatsappShareModal({ isOpen: false })}
                contacts={(() => {
                    const selectedPartner = partners.find(p => p.id === formData.partner_id);
                    const selectedPartnerName = selectedPartner?.name;
                    return contacts.filter(c => {
                        if (c.partnerId === formData.partner_id) return true;
                        if (selectedPartnerName) {
                            const contactPartner = partners.find(p => p.id === c.partnerId);
                            return contactPartner && contactPartner.name && contactPartner.name.trim().toLowerCase() === selectedPartnerName.trim().toLowerCase();
                        }
                        return false;
                    });
                })()}
                partner={partners.find(p => p.id === formData.partner_id)}
                documentData={formData}
                onShareFile={performWhatsAppShare}
            />
            {showPaymentModal && (
                <ReceivePaymentModal 
                    isOpen={showPaymentModal}
                    onClose={() => {
                        setShowPaymentModal(false);
                        setPaymentPrefill(null);
                        fetchPayments();
                    }}
                    prefillData={paymentPrefill}
                    companyId={profile.company_id}
                />
            )}
        </div>
    );
}

// Helper Component: SearchableDropdown for contacts
function SearchableDropdown({ placeholder, searchVal, setSearchVal, isOpen, setIsOpen, options, onSelect }) {
    return (
        <div style={{ position: 'relative', width: '100%', zIndex: isOpen ? 9999 : 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <input 
                    type="text"
                    placeholder={placeholder}
                    value={searchVal}
                    onChange={(e) => { setSearchVal(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                    style={{ 
                        width: '100%', 
                        padding: '8px 12px 8px 32px', 
                        border: '1px solid #cbd5e1', 
                        borderRadius: '8px', 
                        fontSize: '12px', 
                        outline: 'none', 
                        boxSizing: 'border-box',
                        transition: 'border-color 0.2s',
                        background: '#fff',
                        height: '34px'
                    }}
                />
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px' }} />
                {searchVal && (
                    <button 
                        type="button" 
                        onClick={() => setSearchVal('')}
                        style={{ position: 'absolute', right: '10px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
                    >
                        <X size={14} />
                    </button>
                )}
            </div>
            {isOpen && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }} onClick={() => setIsOpen(false)} />
                    <div style={{ 
                        position: 'absolute', 
                        top: 'calc(100% + 4px)', 
                        left: 0, 
                        right: 0, 
                        background: '#fff', 
                        border: '1px solid #cbd5e1', 
                        borderRadius: '8px', 
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', 
                        maxHeight: '160px', 
                        overflowY: 'auto', 
                        zIndex: 9500,
                        padding: '4px'
                    }}>
                        {options.length === 0 ? (
                            <div style={{ padding: '8px 12px', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
                                No matching contacts found
                            </div>
                        ) : (
                            options.map((opt, i) => (
                                <DropdownItem 
                                    key={i} 
                                    opt={opt} 
                                    onClick={() => { onSelect(opt); setIsOpen(false); setSearchVal(''); }}
                                />
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

// Helper Component: SearchableDropdown Item
function DropdownItem({ opt, onClick }) {
    const [hover, setHover] = useState(false);
    return (
        <div 
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{ 
                padding: '6px 10px', 
                fontSize: '11px', 
                borderRadius: '6px', 
                cursor: 'pointer',
                background: hover ? '#f1f5f9' : 'transparent',
                transition: 'background 0.2s',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
            }}
        >
            <div style={{ fontWeight: 600, color: '#1e293b' }}>{opt.name}</div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>{opt.email}</div>
        </div>
    );
}

// Helper Component: Contact card representation
function ContactCard({ contact, emailPreview, toggleEmailInField, onEdit }) {
    const contactEmail = (contact.email || '').trim().toLowerCase();
    const isToActive = contactEmail ? emailPreview.to.split(';').map(e => e.trim().toLowerCase()).includes(contactEmail) : false;
    const isCcActive = contactEmail ? emailPreview.cc.split(';').map(e => e.trim().toLowerCase()).includes(contactEmail) : false;

    return (
        <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            minWidth: '220px'
        }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={contact.name}>
                    {contact.name}
                </span>
                <span style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={contact.email || 'No email registered'}>
                    {contact.email || 'No email registered'}
                </span>
            </div>
            
            <div style={{ display: 'flex', gap: '5px', borderLeft: '1px solid #f1f5f9', paddingLeft: '8px', alignItems: 'center' }}>
                {contact.id && (
                    <button 
                        type="button"
                        onClick={() => onEdit(contact)}
                        title="Edit Contact"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '3px', color: '#94a3b8', transition: 'color 0.2s' }}
                    >
                        <Edit2 size={12} />
                    </button>
                )}
                
                {contact.email && (
                    <>
                        <button 
                            type="button"
                            onClick={() => toggleEmailInField('to', contact.email)}
                            style={{ 
                                background: isToActive ? '#eef2ff' : '#f8fafc', 
                                color: isToActive ? '#4f46e5' : '#64748b', 
                                border: `1px solid ${isToActive ? '#c7d2fe' : '#e2e8f0'}`, 
                                borderRadius: '4px', 
                                padding: '2px 8px', 
                                fontSize: '10px', 
                                fontWeight: 800, 
                                cursor: 'pointer',
                                transition: 'all 0.15s ease-in-out'
                            }}
                        >
                            To
                        </button>
                        
                        <button 
                            type="button"
                            onClick={() => toggleEmailInField('cc', contact.email)}
                            style={{ 
                                background: isCcActive ? '#f0fdf4' : '#f8fafc', 
                                color: isCcActive ? '#16a34a' : '#64748b', 
                                border: `1px solid ${isCcActive ? '#bbf7d0' : '#e2e8f0'}`, 
                                borderRadius: '4px', 
                                padding: '2px 8px', 
                                fontSize: '10px', 
                                fontWeight: 800, 
                                cursor: 'pointer',
                                transition: 'all 0.15s ease-in-out'
                            }}
                        >
                            Cc
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
