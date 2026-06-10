import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getPartners, savePartner, getContactsByPartner, saveContact, saveVessel, saveWorkLocation } from '../lib/store';
import { useVesselsStore } from '../lib/vesselsStore';
import { useWorkLocationsStore } from '../lib/workLocationsStore';
import { connectGoogleAPI } from '../lib/googleAuthService';
import { createEnquiry, generateEnquiryNo, updateEnquiry } from '../lib/workflowService';
import { uploadFileToDrive, checkFileExists } from '../lib/driveService';
import { X, Upload, Save, FileText, ImageIcon, Crop as CropIcon, Copy, Loader2, Sparkles, ExternalLink, AlertCircle, Ship, ChevronDown } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import Tesseract from 'tesseract.js';
import { COUNTRIES } from '../lib/constants';
import { isTokenValid, validateToken } from '../lib/googleAuthService';
import { getCatalogItems, createCatalogItem, updateCatalogItem } from '../lib/catalogService';
import GDriveConnectionModal from './common/GDriveConnectionModal';
import { Search, Plus, Trash, Database, Edit, Pencil } from 'lucide-react';
import { Modal, QuickPartnerAdd, QuickContactAdd, QuickVesselAdd, QuickWorkLocationAdd } from './workflow/QuickAddForms';
import { supabase } from '../lib/supabase';

const ENQUIRY_SOURCES = [
    'Email',
    'Phone',
    'WhatsApp',
    'Verbal',
    'Sample Collected',
    'Others'
];

export default function CustomerEnquiryForm({ onClose, onSave, editingEnquiry = null, inline = false }) {
    const { profile } = useAuth();
    if (!profile) return null; // Defensive check to prevent crashes

    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Inline form state variables removed to match open tab logic
    const [contacts, setContacts] = useState([]);

    // Stores
    const { vessels, fetchVessels } = useVesselsStore();
    const { workLocations, fetchWorkLocations } = useWorkLocationsStore();

    // Form State
    const [formData, setFormData] = useState({
        vessel_id: editingEnquiry?.vessel_id || '',
        work_location_id: editingEnquiry?.work_location_id || '',
        customer_id: editingEnquiry?.customer_id || '',
        contact_id: editingEnquiry?.contact_id || '',
        customer_ref: editingEnquiry?.customer_ref || '',
        enquiry_date: editingEnquiry?.enquiry_date || new Date().toISOString().split('T')[0],
        due_date: editingEnquiry?.due_date || new Date(new Date().getTime() + 86400000).toISOString().split('T')[0],
        source_type: editingEnquiry?.source_type || 'Others',
        description: editingEnquiry?.description || '',
        catalog_items: editingEnquiry?.catalog_items || []
    });

    // 1. Attachment State (Final document for Vault)
    const [attachment, setAttachment] = useState(null);
    const [attachmentUrl, setAttachmentUrl] = useState(null);
    const [isAttachmentImg, setIsAttachmentImg] = useState(false);

    // 2. OCR Tool State (Temp scratch image for text extraction)
    const [ocrFile, setOcrFile] = useState(null);
    const [ocrPreviewUrl, setOcrPreviewUrl] = useState(null);
    const [isOcrImg, setIsOcrImg] = useState(false);

    // Crop State
    const imgRef = useRef(null);
    const [crop, setCrop] = useState();
    const [completedCrop, setCompletedCrop] = useState(null);

    // Extracted text
    const [extractedText, setExtractedText] = useState('');
    const [isExtracting, setIsExtracting] = useState(false);
    const [copied, setCopied] = useState(false);

    // Catalog State
    const [catalog, setCatalog] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCatalogList, setShowCatalogList] = useState(false);
    const [isSavingNewItem, setIsSavingNewItem] = useState(false);
    const [editingItemIdx, setEditingItemIdx] = useState(null);
    const [existingFileExists, setExistingFileExists] = useState(true);
    const [showNewVesselModal, setShowNewVesselModal] = useState(false);
    const [showNewLocationModal, setShowNewLocationModal] = useState(false);
    const [editingCatalogItem, setEditingCatalogItem] = useState(null);

    useEffect(() => {
        loadCustomers();
        fetchVessels();
        fetchWorkLocations();
        fetchCatalog();
        if (editingEnquiry?.gdrive_file_id) {
            checkExistingFile();
        }
    }, []);

    const checkExistingFile = async () => {
        const accessToken = localStorage.getItem('google_access_token');
        if (!accessToken) return;
        const exists = await checkFileExists(accessToken, editingEnquiry.gdrive_file_id);
        setExistingFileExists(exists);
    };

    const fetchCatalog = async () => {
        try {
            const res = await getCatalogItems(1, 100, {}, '');
            if (res.data) setCatalog(res.data);
        } catch (err) {
            console.error("Failed to load catalog", err);
        }
    };

    const loadCustomers = async () => {
        try {
            const data = await getPartners(profile);
            setCustomers(data.filter(p => Array.isArray(p.types) && p.types.includes('Customer')));
        } catch (err) {
            console.error(err);
        }
    };

    const loadContacts = async (partnerId) => {
        try {
            const data = await getContactsByPartner(partnerId);
            setContacts(data);
        } catch (err) {
            console.error("Failed to load contacts for customer", err);
        }
    };

    // Load contacts when customer changes
    useEffect(() => {
        if (formData.customer_id && formData.customer_id !== 'new_customer' && formData.customer_id !== '') {
            loadContacts(formData.customer_id);
        } else {
            setContacts([]);
        }
    }, [formData.customer_id]);

    const [editModal, setEditModal] = useState({ isOpen: false, type: null, initialData: null });
    const handleEditMaster = (type) => {
        let initialData = null;
        if (type === 'customer_id') initialData = customers.find(c => c.id === formData.customer_id);
        else if (type === 'contact_id') initialData = contacts.find(c => c.id === formData.contact_id);
        else if (type === 'vessel_id') initialData = vessels.find(v => v.id === formData.vessel_id);
        else if (type === 'work_location_id') initialData = workLocations.find(l => l.id === formData.work_location_id);

        if (!initialData) return alert('Please select a record to edit first.');
        setEditModal({ isOpen: true, type, initialData });
    };

    const handleEditMasterSuccess = () => {
        setEditModal({ isOpen: false, type: null, initialData: null });
        loadCustomers();
        fetchVessels();
        fetchWorkLocations();
        if (formData.customer_id) loadContacts(formData.customer_id);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'customer_id') {
            if (value === 'new_customer') {
                window.open('/partners/new', '_blank');
                setFormData(prev => ({ ...prev, customer_id: '', contact_id: '' }));
                return;
            }
            // Clear contact when changing customer
            setFormData(prev => ({ ...prev, customer_id: value, contact_id: '' }));
            return;
        }

        if (name === 'contact_id' && value === 'new_contact') {
            window.open(`/contacts/new?partner_id=${formData.customer_id || ''}`, '_blank');
            setFormData(prev => ({ ...prev, contact_id: '' }));
            return;
        }

        if (name === 'vessel_id' && value === 'new_vessel') {
            setShowNewVesselModal(true);
            setFormData(prev => ({ ...prev, vessel_id: '' }));
            return;
        }

        if (name === 'work_location_id' && value === 'new_location') {
            setShowNewLocationModal(true);
            setFormData(prev => ({ ...prev, work_location_id: '' }));
            return;
        }

        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Inline handler functions removed for brevity
    const handleAttachmentChange = (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;

        setAttachment(selectedFile);

        // Revoke old URL if exists
        if (attachmentUrl) URL.revokeObjectURL(attachmentUrl);

        const isImg = selectedFile.type.startsWith('image/');
        setIsAttachmentImg(isImg);

        if (isImg) {
            const reader = new FileReader();
            reader.addEventListener('load', () => setAttachmentUrl(reader.result));
            reader.readAsDataURL(selectedFile);
        } else if (selectedFile.type === 'application/pdf') {
            setAttachmentUrl(URL.createObjectURL(selectedFile));
        } else {
            setAttachmentUrl(null);
        }
    };

    const handleOcrFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;

        setOcrFile(selectedFile);

        if (ocrPreviewUrl) {
            if (ocrPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(ocrPreviewUrl);
        }

        const isImg = selectedFile.type.startsWith('image/');
        setIsOcrImg(isImg);

        if (isImg) {
            const reader = new FileReader();
            reader.addEventListener('load', () => setOcrPreviewUrl(reader.result));
            reader.readAsDataURL(selectedFile);
        } else {
            setOcrPreviewUrl(null);
            alert("OCR tool only supports Image files (JPG/PNG).");
        }

        // Reset crop and OCR when new file is picked
        setCrop(undefined);
        setCompletedCrop(null);
        setExtractedText('');
    };

    const onImageLoad = (e) => {
        const { width, height } = e.currentTarget;
        imgRef.current = e.currentTarget;
        // Auto create a small crop in center
        const initialCrop = centerCrop(
            makeAspectCrop({ unit: '%', width: 50 }, 1, width, height),
            width,
            height
        );
        setCrop(initialCrop);
    };

    // Extract text using Tesseract
    const extractText = async () => {
        if (!completedCrop || !imgRef.current) return;

        setIsExtracting(true);
        setError(null);
        setExtractedText('');

        try {
            // Create a canvas to draw the cropped area
            const canvas = document.createElement('canvas');
            const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
            const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
            const ctx = canvas.getContext('2d');

            const pixelRatio = window.devicePixelRatio;

            canvas.width = Math.floor(completedCrop.width * scaleX * pixelRatio);
            canvas.height = Math.floor(completedCrop.height * scaleY * pixelRatio);

            ctx.scale(pixelRatio, pixelRatio);
            ctx.imageSmoothingQuality = 'high';

            const cropX = completedCrop.x * scaleX;
            const cropY = completedCrop.y * scaleY;
            const cropWidth = completedCrop.width * scaleX;
            const cropHeight = completedCrop.height * scaleY;

            ctx.drawImage(
                imgRef.current,
                cropX, cropY, cropWidth, cropHeight,
                0, 0, cropWidth, cropHeight
            );

            // Convert canvas to base64
            const base64Image = canvas.toDataURL('image/jpeg');

            // Run Tesseract
            const result = await Tesseract.recognize(base64Image, 'eng', {
                logger: m => console.log(m) // Optional progress logger
            });

            setExtractedText(result.data.text);

        } catch (err) {
            console.error('OCR Error:', err);
            setError('Failed to extract text. Please try selecting a clearer area.');
        } finally {
            setIsExtracting(false);
        }
    };

    const handleCopy = () => {
        if (extractedText) {
            navigator.clipboard.writeText(extractedText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);

            // Auto append to description for convenience
            const appendText = formData.description ? formData.description + '<br><br>' + extractedText.replace(/\n/g, '<br>') : extractedText.replace(/\n/g, '<br>');
            setFormData(prev => ({ ...prev, description: appendText }));
        }
    };

    // Catalog Handlers
    const handleAddItem = async (item, autoSaveToCatalog = false) => {
        if (formData.catalog_items.some(i => (item.id && i.catalog_id === item.id) || i.name.toLowerCase() === item.name.toLowerCase())) {
            alert(`"${item.name}" is already in the list.`);
            return;
        }

        let finalItem = {
            id: Date.now().toString(),
            catalog_id: item.id || null,
            name: item.name,
            specification: item.specification || '',
            qty: 1,
            unit: item.unit || 'pcs'
        };

        if (autoSaveToCatalog && !item.id) {
            setIsSavingNewItem(true);
            try {
                const { data, error } = await createCatalogItem({
                    name: item.name,
                    specification: item.specification || '',
                    type: 'Supply',
                    company_id: profile.company_id
                });
                if (!error && data) {
                    finalItem.catalog_id = data.id;
                    fetchCatalog();
                }
            } catch (err) {
                console.error("Auto-catalog save failed:", err);
            } finally {
                setIsSavingNewItem(false);
            }
        }

        const updated = [...formData.catalog_items, finalItem];
        setFormData(prev => ({ ...prev, catalog_items: updated }));
        setSearchQuery('');
        setShowCatalogList(false);
    };

    const handleUpdateItem = (idx, updates) => {
        const updated = [...formData.catalog_items];
        updated[idx] = { ...updated[idx], ...updates };
        setFormData(prev => ({ ...prev, catalog_items: updated }));
    };

    const handleRemoveItem = (idx) => {
        const updated = formData.catalog_items.filter((_, i) => i !== idx);
        setFormData(prev => ({ ...prev, catalog_items: updated }));
    };

    const [isAuthError, setIsAuthError] = useState(false);
    const [isGDriveModalOpen, setIsGDriveModalOpen] = useState(false);

    const handleSaveVessel = async (vesselName) => {
        if (!vesselName) return;
        const res = await saveVessel({ vessel_name: vesselName, company_id: profile.company_id });
        if (res.success || res.id) {
            setFormData(prev => ({ ...prev, vessel_id: res.id }));
            setShowNewVesselModal(false);
        } else {
            alert("Failed to save vessel: " + res.error);
        }
    };

    const handleSaveWorkLocation = async (locationName) => {
        if (!locationName) return;
        const res = await saveWorkLocation({ location_name: locationName, company_id: profile.company_id });
        if (res.success || res.id) {
            setFormData(prev => ({ ...prev, work_location_id: res.id }));
            setShowNewLocationModal(false);
        } else {
            alert("Failed to save location: " + res.error);
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
            
            fetchCatalog();
            setEditingCatalogItem(null);
        } catch (err) {
            alert("Failed to save catalog item: " + (err.message || err));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            let gdriveFileId = editingEnquiry?.gdrive_file_id || null;
            let gdriveFileLink = editingEnquiry?.gdrive_file_link || null;
            let projectFolderId = editingEnquiry?.gdrive_folder_id || null;

            const accessToken = localStorage.getItem('google_access_token');
            const isValid = await validateToken(accessToken);
            const enquiry_no = editingEnquiry?.enquiry_no || await generateEnquiryNo(profile.company_id);

            // Proactive Connection Check if attachment exists or if we need to provision folders
            if ((attachment || !projectFolderId) && (!accessToken || !isValid)) {
                setIsGDriveModalOpen(true);
                setLoading(false);
                return;
            }

            // 1. Provision Folder Structure if Google is connected
            if (accessToken && !projectFolderId) {
                try {
                    const { getDocumentSettings } = await import('../lib/store');
                    const { provisionFullProjectStructure } = await import('../lib/driveService');

                    const settings = await getDocumentSettings();
                    const topRootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
                    if (topRootId) {
                        const year = `YEAR${new Date().getFullYear()}`;
                        const partner = customers.find(c => c.id === formData.customer_id)?.name || 'Unknown Partner';
                        const vesselName = vessels.find(v => v.id === formData.vessel_id)?.vessel_name;
                        const locationName = workLocations.find(l => l.id === formData.work_location_id)?.location_name;

                        let projectFolderName = `${enquiry_no} - ${partner}`;
                        if (vesselName) projectFolderName += ` - ${vesselName}`;
                        if (locationName) projectFolderName += ` - ${locationName}`;
                        if (formData.customer_ref) projectFolderName += ` - ${formData.customer_ref}`;

                        const cleanFolderName = projectFolderName.replace(/[/\\?%*:|"<>]/g, '-');

                        projectFolderId = await provisionFullProjectStructure(
                            accessToken,
                            topRootId,
                            year,
                            cleanFolderName
                        );
                    }
                } catch (folderErr) {
                    console.error("Folder Provisioning Failed:", folderErr);
                    // Non-blocking but log it
                }
            }

            // 2. Handle Drive Upload if attachment exists (Option B - Upload directly to root folder)
            if (attachment && accessToken && projectFolderId) {
                const uploadResult = await uploadFileToDrive(accessToken, attachment, {
                    folderId: projectFolderId,
                    title: attachment.name,
                    company_id: profile.company_id
                });

                gdriveFileId = uploadResult.id;
                gdriveFileLink = uploadResult.webViewLink;
            }

            // 3. Prepare Payload
            const payload = {
                ...formData,
                company_id: profile.company_id,
                user_id: profile.id,
                gdrive_file_id: gdriveFileId,
                gdrive_file_link: gdriveFileLink,
                gdrive_folder_id: projectFolderId,
                catalog_items: formData.catalog_items
            };

            // Delete UI-only specific fields to prevent DB insert errors
            delete payload.vessel_id;
            delete payload.work_location_id;

            let saved;
            if (editingEnquiry) {
                const { data, error: updateErr } = await updateEnquiry(editingEnquiry.id, payload);
                if (updateErr) throw updateErr;
                saved = data;
            } else {
                payload.enquiry_no = enquiry_no;
                const { data, error: createErr } = await createEnquiry(payload);
                if (createErr) throw createErr;
                saved = data;
            }

            onSave(saved);

        } catch (err) {
            console.error(err);
            const msg = err.message || "";
            if (msg.toLowerCase().includes('authentication') || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('auth_expired')) {
                setIsAuthError(true);
                setError("Your Google session has expired. Please Re-connect to save with your attachment.");
            } else {
                setError(msg || "Failed to save enquiry.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={inline ? { display: 'block', width: '100%', marginBottom: '24px' } : {
            position: 'fixed', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(12px)',
            padding: '40px 20px'
        }}>
            <div style={inline ? {
                display: 'flex', flexDirection: 'column', width: '100%', minHeight: '600px',
                backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0',
                overflow: 'hidden', position: 'relative'
            } : {
                display: 'flex', flexDirection: 'column', 
                width: '92vw', maxWidth: '1400px',
                height: 'calc(100vh - 80px)', maxHeight: '850px',
                backgroundColor: '#ffffff', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.1)',
                overflow: 'hidden', animation: 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)', position: 'relative',
                border: '1px solid rgba(0,0,0,0.1)'
            }}>

                {/* Header */}
                {!inline && (
                    <div style={{ 
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                        padding: '28px 32px', borderBottom: '1px solid var(--border-color)',
                        background: 'linear-gradient(to bottom, #ffffff, #f8fafc)'
                    }}>
                        <div>
                            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>New Customer Enquiry</h2>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Create a new enquiry log with optional document processing.</p>
                        </div>
                        <button 
                            onClick={onClose} 
                            style={{ 
                                background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', 
                                padding: '10px', borderRadius: '12px', display: 'flex', transition: 'all 0.2s',
                                hover: { background: '#e2e8f0', color: '#0f172a' }
                            }}
                            onMouseOver={(e) => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
                        >
                            <X size={20} />
                        </button>
                    </div>
                )}

                {/* Content */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                    {/* Left side: Form Data */}
                    <div style={{ flex: '1.3', overflowY: 'auto', padding: '32px', borderRight: '1px solid var(--border-color)', backgroundColor: '#f8fafc' }} className="enquiry-form-scroll">
                        <form id="enquiry-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                            {error && (
                                <div style={{ padding: '16px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#dc2626', borderRadius: '8px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <X size={18} />
                                        <span>{error}</span>
                                    </div>
                                    {isAuthError && (
                                        <button
                                            type="button"
                                            onClick={() => connectGoogleAPI('enquiry_form')}
                                            style={{
                                                background: '#dc2626', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap'
                                            }}
                                        >
                                            <Sparkles size={14} /> Reconnect Google
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className="glass-panel" style={{ padding: '24px', background: '#ffffff', overflow: 'visible' }}>
                                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px', padding: '10px 16px', background: '#f8fafc', borderRadius: '8px', borderLeft: '4px solid #6366f1' }}>
                                    1. Customer Information
                                </h3>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Customer *</span>
                                        {formData.customer_id && <Pencil size={14} style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => handleEditMaster('customer_id')} />}
                                    </label>
                                    <select
                                        name="customer_id"
                                        value={formData.customer_id}
                                        onChange={handleChange}
                                        required
                                        className="form-select"
                                    >
                                        <option value="" disabled>Select a customer...</option>
                                        <option value="new_customer" style={{ fontWeight: 'bold', color: 'var(--accent)' }}>+ New Customer ↗</option>
                                        {customers.length === 0 ? (
                                            <option disabled>No customers found</option>
                                        ) : (
                                            customers.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))
                                        )}
                                    </select>
                                </div>

                                {/* Contact Dropdown - Always visible, disabled if no customer selected */}
                                <div className="form-group" style={{ marginBottom: 0, marginTop: '20px' }}>
                                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Contact</span>
                                        {formData.contact_id && <Pencil size={14} style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => handleEditMaster('contact_id')} />}
                                    </label>
                                    <select
                                        name="contact_id"
                                        value={formData.contact_id || ''}
                                        onChange={handleChange}
                                        className="form-select"
                                        disabled={!formData.customer_id || formData.customer_id === 'new_customer'}
                                    >
                                        {!formData.customer_id ? (
                                            <option value="" disabled>Select a customer first...</option>
                                        ) : (
                                            <>
                                                <option value="" disabled>Select a contact (optional)...</option>
                                                <option value="new_contact" style={{ fontWeight: 'bold', color: 'var(--accent)' }}>+ New Contact ↗</option>
                                                {contacts.map(c => (
                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                            </>
                                        )}
                                    </select>
                                </div>
                            </div>

                            <div className="glass-panel" style={{ padding: '24px', background: '#ffffff', overflow: 'visible' }}>
                                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px', padding: '10px 16px', background: '#f8fafc', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                                    2. Enquiry Details
                                </h3>
                                <div className="grid-2" style={{ marginBottom: '20px' }}>
                                    <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
                                        <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Vessel</span>
                                            {formData.vessel_id && <Pencil size={14} style={{ cursor: 'pointer', color: '#10b981' }} onClick={() => handleEditMaster('vessel_id')} />}
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <select
                                                name="vessel_id"
                                                value={formData.vessel_id || ''}
                                                onChange={(e) => {
                                                    if (e.target.value === 'ADD_NEW') {
                                                        setShowNewVesselModal(true);
                                                    } else {
                                                        handleChange(e);
                                                    }
                                                }}
                                                className="form-select"
                                                style={{ width: '100%', borderRadius: '8px', padding: '10px 12px 10px 36px', appearance: 'none', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#10b981', fontWeight: 600 }}
                                            >
                                                <option value="">No Vessel</option>
                                                {vessels.map(v => (
                                                    <option key={v.id} value={v.id}>{v.vessel_name}</option>
                                                ))}
                                                <option value="ADD_NEW" style={{ fontWeight: 700, color: '#10b981' }}>+ Add New Vessel</option>
                                            </select>
                                            <Ship size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#10b981' }} />
                                            <ChevronDown size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                                        </div>
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
                                        <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Work Location</span>
                                            {formData.work_location_id && <Pencil size={14} style={{ cursor: 'pointer', color: '#64748b' }} onClick={() => handleEditMaster('work_location_id')} />}
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <select
                                                name="work_location_id"
                                                value={formData.work_location_id || ''}
                                                onChange={(e) => {
                                                    if (e.target.value === 'ADD_NEW') {
                                                        setShowNewLocationModal(true);
                                                    } else {
                                                        handleChange(e);
                                                    }
                                                }}
                                                className="form-select"
                                                style={{ width: '100%', borderRadius: '8px', padding: '10px 12px 10px 32px', appearance: 'none', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}
                                            >
                                                <option value="">General / Local</option>
                                                {workLocations.map(l => (
                                                    <option key={l.id} value={l.id}>{l.location_name}</option>
                                                ))}
                                                <option value="ADD_NEW" style={{ fontWeight: 700, color: '#64748b' }}>+ Add New Location</option>
                                            </select>
                                            <Database size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                            <ChevronDown size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                                        </div>
                                    </div>
                                </div>
                                <div className="form-group" style={{ marginBottom: '20px' }}>
                                    <label className="form-label">Customer Reference (for enquiry / quotation ref)</label>
                                    <input
                                        type="text"
                                        name="customer_ref"
                                        value={formData.customer_ref}
                                        onChange={handleChange}
                                        className="form-input"
                                        placeholder="e.g. PO-12345 or Quote ref..."
                                    />
                                </div>
                                <div className="grid-2" style={{ marginBottom: '20px' }}>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">Enquiry Date *</label>
                                        <input
                                            type="date"
                                            name="enquiry_date"
                                            value={formData.enquiry_date}
                                            onChange={handleChange}
                                            required
                                            className="form-input"
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">Due Date</label>
                                        <input
                                            type="date"
                                            name="due_date"
                                            value={formData.due_date}
                                            onChange={handleChange}
                                            className="form-input"
                                        />
                                    </div>
                                </div>

                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Source Type</label>
                                    <select
                                        name="source_type"
                                        value={formData.source_type}
                                        onChange={handleChange}
                                        className="form-select"
                                    >
                                        {ENQUIRY_SOURCES.map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="glass-panel" style={{ padding: '24px', background: '#ffffff', overflow: 'visible' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                                        3. Required Items (Optional)
                                    </h3>
                                    <a href="/catalog" target="_blank" style={{ fontSize: '0.75rem', color: '#6366f1', textDecoration: 'none', fontWeight: 500 }}>Search or add manual items</a>
                                </div>

                                <div style={{ position: 'relative', marginBottom: '24px' }}>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <div style={{ position: 'relative', flex: 1 }}>
                                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                            <input 
                                                type="text"
                                                placeholder="Type item name to search"
                                                value={searchQuery}
                                                onChange={(e) => {
                                                    setSearchQuery(e.target.value);
                                                    setShowCatalogList(true);
                                                }}
                                                onFocus={() => setShowCatalogList(true)}
                                                className="form-input"
                                                style={{ paddingLeft: '40px', borderRadius: '10px' }}
                                            />
                                        </div>
                                        <button 
                                            type="button"
                                            onClick={() => handleAddItem({ name: searchQuery }, true)}
                                            disabled={!searchQuery || isSavingNewItem}
                                            className="btn btn-primary"
                                            style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 20px', borderRadius: '10px', backgroundColor: '#6366f1' }}
                                        >
                                            {isSavingNewItem ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} Add New
                                        </button>
                                    </div>

                                    {showCatalogList && searchQuery && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', marginTop: '8px', maxHeight: '350px', overflowY: 'auto' }}>
                                            {catalog.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                                                <div style={{ padding: '20px', color: '#64748b', fontSize: '0.85rem', textAlign: 'center' }}>
                                                    <Database size={32} style={{ opacity: 0.1, marginBottom: '12px', display: 'block', margin: '0 auto' }} />
                                                    No matches found. Click "Add New" to save to catalog.
                                                </div>
                                            ) : (
                                                <>
                                                    {catalog.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).map(c => (
                                                        <div 
                                                            key={c.id}
                                                            style={{ width: '100%', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }}
                                                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                        >
                                                            <button 
                                                                type="button"
                                                                onClick={() => handleAddItem(c)}
                                                                style={{ flex: 1, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                                                            >
                                                                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem', marginBottom: '2px' }}>{c.name}</div>
                                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: '1.4' }}>{c.specification || 'No additional specifications provided.'}</div>
                                                            </button>
                                                            <button 
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); setEditingCatalogItem(c); }}
                                                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                                                            >
                                                                <Edit size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <div style={{ padding: '12px', borderTop: '2px solid #f1f5f9', backgroundColor: '#fff', position: 'sticky', bottom: 0, zIndex: 1 }}>
                                                        <button 
                                                            type="button"
                                                            onClick={() => setEditingCatalogItem({ name: searchQuery, specification: '', type: 'Supply' })}
                                                            style={{ width: '100%', color: '#6366f1', border: 'none', background: 'none', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                                        >
                                                            <Plus size={14} /> Add New Catalog Item
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {formData.catalog_items.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#94a3b8' }}>
                                            <Database size={24} style={{ opacity: 0.3, marginBottom: '8px' }} />
                                            <p style={{ margin: 0, fontSize: '0.85rem' }}>No items added yet</p>
                                        </div>
                                    ) : (
                                        formData.catalog_items.map((item, idx) => (
                                            <div key={item.id} style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{item.name}</div>
                                                    <textarea 
                                                        placeholder="Enter specifications (e.g. Model, Size, Power etc.)"
                                                        value={item.specification}
                                                        onChange={(e) => handleUpdateItem(idx, { specification: e.target.value })}
                                                        style={{ 
                                                            width: '100%', 
                                                            minHeight: '50px', 
                                                            fontSize: '0.8rem', 
                                                            padding: '8px 12px', 
                                                            borderRadius: '8px', 
                                                            border: '1px solid #e2e8f0',
                                                            background: '#ffffff',
                                                            resize: 'vertical',
                                                            color: '#475569',
                                                            lineHeight: '1.4'
                                                        }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '12px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>QTY</span>
                                                        <input 
                                                            type="number"
                                                            value={item.qty}
                                                            onChange={(e) => handleUpdateItem(idx, { qty: e.target.value })}
                                                            style={{ width: '50px', padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem', textAlign: 'center' }}
                                                        />
                                                    </div>
                                                    <button 
                                                        type="button"
                                                        onClick={() => handleRemoveItem(idx)}
                                                        style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                                                    >
                                                        <Trash size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="glass-panel" style={{ padding: '24px', background: '#ffffff', display: 'flex', flexDirection: 'column', flex: 1, minHeight: '350px' }}>
                                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px', padding: '10px 16px', background: '#f8fafc', borderRadius: '8px', borderLeft: '4px solid #8b5cf6' }}>
                                    4. Description / Notes
                                </h3>
                                <div className="quill-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <ReactQuill
                                        theme="snow"
                                        value={formData.description}
                                        onChange={(val) => setFormData(prev => ({ ...prev, description: val }))}
                                        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                                    />
                                </div>
                            </div>

                        </form>
                    </div>

                    {/* Right side: Attachment & OCR */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px', padding: '32px', backgroundColor: '#f8fafc', overflowY: 'auto' }}>

                        {/* Section A: Official Attachment */}
                        <div className="glass-panel" style={{ padding: '24px', background: '#ffffff', border: '1px solid var(--border-color)' }}>
                            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Upload size={16} color="var(--accent)" /> 1. Project Attachment (Vault)
                            </h3>
                            <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '16px' }}>
                                This file will be saved systematically into <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 4px', borderRadius: '4px' }}>Vault → Enquiry Received/2026/</span>
                            </p>

                            <label style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '20px',
                                background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '12px',
                                cursor: 'pointer', color: '#475569', fontWeight: 500, transition: 'all 0.2s', textAlign: 'center'
                            }} className="upload-dropzone">
                                <FileText size={20} style={{ marginRight: '12px', color: 'var(--accent)' }} />
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontSize: '0.9rem' }}>{attachment ? attachment.name : 'Click to Upload Final Document...'}</div>
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 400 }}>Supports PDF or Images</div>
                                </div>
                                <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleAttachmentChange} />
                            </label>

                            {/* Existing Attachment Display (Embedded Preview) */}
                            {!attachment && editingEnquiry?.gdrive_file_link && (
                                <div style={{ marginTop: '16px' }}>
                                    <div style={{ 
                                        padding: '8px 12px', 
                                        background: existingFileExists ? '#f0f9ff' : '#fff1f2', 
                                        border: existingFileExists ? '1px solid #bae6fd' : '1px solid #fecaca', 
                                        borderBottom: 'none', 
                                        borderRadius: '12px 12px 0 0', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'space-between' 
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ background: existingFileExists ? '#0ea5e9' : '#ef4444', color: '#fff', padding: '4px', borderRadius: '4px' }}>
                                                {existingFileExists ? <FileText size={12} /> : <AlertCircle size={12} />}
                                            </div>
                                            <span style={{ fontSize: '0.7rem', color: existingFileExists ? '#0369a1' : '#991b1b', fontWeight: 700, textTransform: 'uppercase' }}>
                                                {existingFileExists ? 'Current Document' : 'File Missing on Drive'}
                                            </span>
                                        </div>
                                        {existingFileExists && (
                                            <a
                                                href={editingEnquiry.gdrive_file_link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ color: '#0284c7', fontSize: '0.7rem', textDecoration: 'underline', fontWeight: 600 }}
                                            >
                                                Open in New Tab
                                            </a>
                                        )}
                                    </div>
                                    <div style={{
                                        width: '100%',
                                        height: '400px',
                                        border: existingFileExists ? '1px solid #bae6fd' : '1px solid #fecaca',
                                        borderRadius: '0 0 12px 12px',
                                        overflow: 'hidden',
                                        background: '#f8fafc',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        {existingFileExists ? (
                                            <iframe
                                                src={editingEnquiry.gdrive_file_link.replace('/view', '/preview')}
                                                style={{ width: '100%', height: '100%', border: 'none' }}
                                                title="Existing Attachment Preview"
                                            />
                                        ) : (
                                            <div style={{ textAlign: 'center', color: '#64748b' }}>
                                                <AlertCircle size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                                                <p style={{ fontSize: '0.9rem' }}>This document is no longer available on Google Drive.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {attachment && (
                                <div style={{ marginTop: '16px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', height: isAttachmentImg ? 'auto' : '300px' }}>
                                    {isAttachmentImg ? (
                                        <img src={attachmentUrl} alt="Attachment Preview" style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', background: '#000' }} />
                                    ) : (
                                        <iframe src={`${attachmentUrl}#toolbar=0`} style={{ width: '100%', height: '100%', border: 'none' }} title="Attachment Preview" />
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Section B: Smart OCR Tool */}
                        <div className="glass-panel" style={{ padding: '24px', background: '#ffffff', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', flex: 1 }}>
                            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Sparkles size={16} color="#8b5cf6" /> 2. Smart OCR Assistant (Optional)
                                </span>
                                {ocrFile && (
                                    <button onClick={() => { setOcrFile(null); setOcrPreviewUrl(null); }} style={{ fontSize: '0.7rem', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}>
                                        Clear Tool
                                    </button>
                                )}
                            </h3>

                            {!ocrFile ? (
                                <label style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', flex: 1, padding: '32px',
                                    background: '#f5f3ff', border: '1px dashed #c0b0ff', borderRadius: '12px',
                                    cursor: 'pointer', color: '#6d28d9', fontWeight: 500, transition: 'all 0.2s', textAlign: 'center'
                                }} className="ocr-dropzone">
                                    <ImageIcon size={32} style={{ marginBottom: '12px', opacity: 0.6 }} />
                                    <div style={{ fontSize: '0.9rem' }}>Upload Scratch Image for OCR</div>
                                    <div style={{ fontSize: '0.7rem', color: '#7c3aed', opacity: 0.8, fontWeight: 400, marginTop: '4px' }}>Crop and extract text into description below</div>
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleOcrFileChange} />
                                </label>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4b5563' }}>DRAG BOX TO SELECT TEXT:</div>
                                        <button
                                            onClick={extractText}
                                            disabled={!completedCrop || isExtracting}
                                            className="btn btn-primary"
                                            style={{ padding: '6px 12px', fontSize: '0.75rem', background: '#8b5cf6' }}
                                        >
                                            {isExtracting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                            {isExtracting ? 'Reading...' : 'Extract Selection'}
                                        </button>
                                    </div>
                                    {/* Cropper Container */}
                                    <div style={{ flex: 1, background: '#1e293b', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'start', justifyContent: 'center', maxHeight: '400px', overflowY: 'auto' }}>
                                        <ReactCrop
                                            crop={crop}
                                            onChange={c => setCrop(c)}
                                            onComplete={c => setCompletedCrop(c)}
                                        >
                                            <img
                                                src={ocrPreviewUrl}
                                                onLoad={onImageLoad}
                                                alt="OCR Tool"
                                                style={{ width: '100%', height: 'auto' }}
                                            />
                                        </ReactCrop>
                                    </div>

                                    {/* OCR Result */}
                                    {extractedText && (
                                        <div style={{ marginTop: '16px', padding: '12px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase' }}>Extraction Result:</span>
                                                <button onClick={handleCopy} style={{ background: 'none', border: 'none', color: '#8b5cf6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                                                    <Copy size={12} /> {copied ? 'Appended!' : 'Appended to Description'}
                                                </button>
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#1f2937', fontFamily: 'monospace', maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                                                {extractedText}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ 
                    display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '24px 32px', 
                    backgroundColor: '#ffffff', borderTop: '2px solid #f1f5f9',
                    boxShadow: '0 -10px 20px -5px rgba(0,0,0,0.05)'
                }}>
                    {!inline && (
                        <button type="button" onClick={onClose} className="btn btn-secondary">
                            Cancel
                        </button>
                    )}
                    <button
                        form="enquiry-form"
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary"
                        style={{ opacity: loading ? 0.7 : 1 }}
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        {inline ? 'Save Changes' : 'Save Enquiry & Upload Document'}
                    </button>
                </div>
            </div>

            <GDriveConnectionModal 
                isOpen={isGDriveModalOpen} 
                onClose={() => setIsGDriveModalOpen(false)} 
                state="enquiry_form_upload"
            />
            <style>{`
                .quill-wrapper {
                    display: flex;
                    flex-direction: column;
                    background: #ffffff;
                }
                .quill-wrapper .ql-editor {
                    flex: 1;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
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
                            id="newVesselNameForm"
                        />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setShowNewVesselModal(false)} className="btn btn-outline">Cancel</button>
                            <button type="button" onClick={() => handleSaveVessel(document.getElementById('newVesselNameForm').value)} className="btn btn-primary">Save Vessel</button>
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
                            id="newLocationNameForm"
                        />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setShowNewLocationModal(false)} className="btn btn-outline">Cancel</button>
                            <button type="button" onClick={() => handleSaveWorkLocation(document.getElementById('newLocationNameForm').value)} className="btn btn-primary">Save Location</button>
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
            {editModal.isOpen && (
                <Modal 
                    isOpen={editModal.isOpen} 
                    onClose={() => setEditModal({ isOpen: false, type: null, initialData: null })}
                    title={`Edit ${editModal.type === 'customer_id' ? 'Customer' : editModal.type === 'contact_id' ? 'Contact' : editModal.type === 'vessel_id' ? 'Vessel' : 'Location'}`}
                >
                    {editModal.type === 'customer_id' && (
                        <QuickPartnerAdd 
                            company_id={profile.company_id}
                            initialData={editModal.initialData}
                            onSuccess={handleEditMasterSuccess}
                            onCancel={() => setEditModal({ isOpen: false, type: null, initialData: null })}
                            defaultType="Customer"
                        />
                    )}
                    {editModal.type === 'contact_id' && (
                        <QuickContactAdd 
                            partner_id={formData.customer_id}
                            initialData={editModal.initialData}
                            onSuccess={handleEditMasterSuccess}
                            onCancel={() => setEditModal({ isOpen: false, type: null, initialData: null })}
                        />
                    )}
                    {editModal.type === 'vessel_id' && (
                        <QuickVesselAdd 
                            company_id={profile.company_id}
                            initialData={editModal.initialData}
                            onSuccess={handleEditMasterSuccess}
                            onCancel={() => setEditModal({ isOpen: false, type: null, initialData: null })}
                        />
                    )}
                    {editModal.type === 'work_location_id' && (
                        <QuickWorkLocationAdd 
                            company_id={profile.company_id}
                            initialData={editModal.initialData}
                            onSuccess={handleEditMasterSuccess}
                            onCancel={() => setEditModal({ isOpen: false, type: null, initialData: null })}
                        />
                    )}
                </Modal>
            )}
        </div>
    );
}
