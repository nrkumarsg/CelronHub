import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { 
    X, Plus, Search, Filter, ArrowLeft, Save, Trash2, FileText, 
    MoreHorizontal, ChevronDown, Package, Database, Edit, Ship, 
    Link, ArrowRight, Cloud, ImageIcon, Pencil, Globe, QrCode, 
    Camera, ExternalLink, Loader, UploadCloud, CheckCircle2, AlertCircle
} from 'lucide-react';
import { Modal, QuickPartnerContactDualAdd } from '../components/workflow/QuickAddForms';
import { supabase } from '../lib/supabase';
import ScannerModal from '../components/ScannerModal';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { useAuth } from '../contexts/AuthContext';
import {
    getCatalogItemById,
    createCatalogItem,
    updateCatalogItem,
    deleteCatalogItem
} from '../lib/catalogService';
import {
    getPurchaseHistoryByItemId,
    createPurchaseHistory,
    updatePurchaseHistory,
    deletePurchaseHistory
} from '../lib/purchaseHistoryService';
import { getDocumentSettings } from '../lib/store';

import { uploadFile } from '../lib/store';
import { uploadFileToDrive, getOrCreateFolder, makeFilePublic, getDirectImageUrl } from '../lib/driveService';
import { validateToken } from '../lib/googleAuthService';
import GDriveConnectionModal from '../components/common/GDriveConnectionModal';

const CatalogForm = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { profile } = useAuth();
    const isNewItem = id === 'new';
    const quillRef = useRef(null);
    const purchaseQuillRef = useRef(null);

    const [loading, setLoading] = useState(!isNewItem);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('details'); // 'details', 'purchaseHistory', or 'photos'
    const [uploadingPhotos, setUploadingPhotos] = useState(false);
    const [editModal, setEditModal] = useState({ isOpen: false, type: null, initialData: null });
    const [showScanner, setShowScanner] = useState(false);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [driveFolderId, setDriveFolderId] = useState(null);
    const [photosFolderId, setPhotosFolderId] = useState(null);
    const [datasheetsFolderId, setDatasheetsFolderId] = useState(null);
    const photoInputRef = useRef(null);
    const datasheetInputRef = useRef(null);
    const [uploadingDatasheet, setUploadingDatasheet] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        type: 'Supply Part',
        name: '',
        specification: '',
        quantity: '',
        selling_price: '',
        stored_location: '',
        details: '',
        photos: [],
        datasheet_url: '',
        barcode: ''
    });

    // Purchase History State
    const [purchaseHistory, setPurchaseHistory] = useState([]);
    const [partners, setPartners] = useState([]);
    const [showPurchaseModal, setShowPurchaseModal] = useState(false);
    const [editingPurchaseId, setEditingPurchaseId] = useState(null);    // State to track if we need to show the purchase modal
    const [purchaseFormData, setPurchaseFormData] = useState({
        supplier_id: '',
        purchase_date: new Date().toISOString().split('T')[0],
        last_purchase_price: '',
        details: '',
        pic: '',
        quantity: '',
        bill_url: '',
        remarks: ''
    });
    const [uploadingBill, setUploadingBill] = useState(false);

    useEffect(() => {
        const runMigration = async () => {
            const hasRun = localStorage.getItem('purchase_history_migration_v5');
            if (!hasRun) {
                console.log('Running purchase history schema migration via query RPC...');
                const sql = `
                    -- 1. Add columns to purchase_history
                    ALTER TABLE public.purchase_history 
                    ADD COLUMN IF NOT EXISTS pic text,
                    ADD COLUMN IF NOT EXISTS quantity numeric,
                    ADD COLUMN IF NOT EXISTS bill_url text,
                    ADD COLUMN IF NOT EXISTS remarks text;

                    -- 2. Trigger function for workflow_line_items stock adjust
                    CREATE OR REPLACE FUNCTION public.handle_workflow_line_item_stock_adjust()
                    RETURNS TRIGGER AS $$
                    DECLARE
                        v_doc_type text;
                        v_job_id uuid;
                        v_assigned_job_no text;
                        v_item_id uuid;
                        v_qty numeric;
                        v_old_qty numeric;
                        v_is_stock_reducing boolean;
                    BEGIN
                        IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
                            SELECT document_type, job_id, assigned_job_no
                            INTO v_doc_type, v_job_id, v_assigned_job_no
                            FROM public.workflow_documents
                            WHERE id = NEW.document_id;
                            
                            v_item_id := NEW.item_id;
                            v_qty := COALESCE(NEW.quantity, 0);
                        ELSE
                            SELECT document_type, job_id, assigned_job_no
                            INTO v_doc_type, v_job_id, v_assigned_job_no
                            FROM public.workflow_documents
                            WHERE id = OLD.document_id;
                            
                            v_item_id := OLD.item_id;
                            v_qty := 0;
                        END IF;

                        IF v_item_id IS NULL THEN
                            RETURN COALESCE(NEW, OLD);
                        END IF;

                        v_is_stock_reducing := FALSE;
                        IF v_doc_type = 'Job' THEN
                            v_is_stock_reducing := TRUE;
                        ELSIF v_doc_type = 'Tax Invoice' AND v_job_id IS NULL AND v_assigned_job_no IS NULL THEN
                            v_is_stock_reducing := TRUE;
                        END IF;

                        IF NOT v_is_stock_reducing THEN
                            RETURN COALESCE(NEW, OLD);
                        END IF;

                        IF TG_OP = 'UPDATE' THEN
                            v_old_qty := COALESCE(OLD.quantity, 0);
                        ELSIF TG_OP = 'DELETE' THEN
                            v_old_qty := COALESCE(OLD.quantity, 0);
                        ELSE
                            v_old_qty := 0;
                        END IF;

                        IF (v_qty - v_old_qty) <> 0 THEN
                            UPDATE public.catalog_items
                            SET quantity = COALESCE(quantity, 0) - (v_qty - v_old_qty)
                            WHERE id = v_item_id;
                        END IF;

                        RETURN COALESCE(NEW, OLD);
                    END;
                    $$ LANGUAGE plpgsql SECURITY DEFINER;

                    -- 3. Trigger for workflow_line_items
                    DROP TRIGGER IF EXISTS trigger_workflow_line_item_stock_adjust ON public.workflow_line_items;
                    CREATE TRIGGER trigger_workflow_line_item_stock_adjust
                    AFTER INSERT OR UPDATE OR DELETE ON public.workflow_line_items
                    FOR EACH ROW EXECUTE FUNCTION public.handle_workflow_line_item_stock_adjust();

                    -- 4. Trigger function for purchase_history stock adjust
                    CREATE OR REPLACE FUNCTION public.handle_purchase_history_stock_adjust()
                    RETURNS TRIGGER AS $$
                    DECLARE
                        v_item_id uuid;
                        v_qty numeric;
                        v_old_qty numeric;
                    BEGIN
                        IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
                            v_item_id := NEW.item_id;
                            v_qty := COALESCE(NEW.quantity, 0);
                        ELSE
                            v_item_id := OLD.item_id;
                            v_qty := 0;
                        END IF;

                        IF v_item_id IS NULL THEN
                            RETURN COALESCE(NEW, OLD);
                        END IF;

                        IF TG_OP = 'UPDATE' THEN
                            v_old_qty := COALESCE(OLD.quantity, 0);
                        ELSIF TG_OP = 'DELETE' THEN
                            v_old_qty := COALESCE(OLD.quantity, 0);
                        ELSE
                            v_old_qty := 0;
                        END IF;

                        IF (v_qty - v_old_qty) <> 0 THEN
                            UPDATE public.catalog_items
                            SET quantity = COALESCE(quantity, 0) + (v_qty - v_old_qty)
                            WHERE id = v_item_id;
                        END IF;

                        RETURN COALESCE(NEW, OLD);
                    END;
                    $$ LANGUAGE plpgsql SECURITY DEFINER;

                    -- 5. Trigger for purchase_history
                    DROP TRIGGER IF EXISTS trigger_purchase_history_stock_adjust ON public.purchase_history;
                    CREATE TRIGGER trigger_purchase_history_stock_adjust
                    AFTER INSERT OR UPDATE OR DELETE ON public.purchase_history
                    FOR EACH ROW EXECUTE FUNCTION public.handle_purchase_history_stock_adjust();
                `;

                const { data, error } = await supabase.rpc('query', { query_text: sql });
                if (error) {
                    console.error('Migration failed:', error);
                } else {
                    console.log('Migration successful:', data);
                    localStorage.setItem('purchase_history_migration_v5', 'done');
                }
            }
        };
        runMigration();
    }, []);


    useEffect(() => {
        // Restore pending data from before Google redirect
        const pendingData = sessionStorage.getItem('pending_catalog_data');
        if (pendingData) {
            try {
                const parsed = JSON.parse(pendingData);
                setFormData(parsed);
                setActiveTab('photos'); // Jump back to photos tab
                sessionStorage.removeItem('pending_catalog_data');
            } catch (e) {
                console.error('Failed to parse pending catalog data:', e);
            }
        }

        if (!isNewItem && profile) {
            fetchItemData();
            fetchPurchaseHistory();
            checkDriveConnectivity();
        }
        fetchPartners();
    }, [id, profile?.id]);

    const checkDriveConnectivity = async () => {
        const token = sessionStorage.getItem('google_contacts_token');
        const isValid = await validateToken(token);
        if (token && isValid) {
            try {
                const settings = await getDocumentSettings(profile?.company_id);
                if (settings?.gdrive_inventory_photos_id) {
                    setPhotosFolderId(settings.gdrive_inventory_photos_id);
                }
                if (settings?.gdrive_inventory_datasheets_id) {
                    setDatasheetsFolderId(settings.gdrive_inventory_datasheets_id);
                }
                // Fallback / Legacy root
                const folderId = await getOrCreateFolder(token, 'Catalog Photos');
                setDriveFolderId(folderId);
            } catch (err) {
                console.error('Failed to get Drive folder:', err);
            }
        }
    };

    const fetchItemData = async () => {
        setLoading(true);
        const { data, error } = await getCatalogItemById(id);
        if (!error && data) {
            setFormData({
                type: data.type || 'Supply Part',
                name: data.name || '',
                specification: data.specification || '',
                quantity: data.quantity !== null ? data.quantity : '',
                selling_price: data.selling_price !== null ? data.selling_price : '',
                stored_location: data.stored_location || '',
                details: data.details || '',
                photos: data.photos || [],
                datasheet_url: data.datasheet_url || '',
                barcode: data.barcode || ''
            });
        } else {
            console.error('Failed to fetch item', error);
            // alert('Item not found or error loading data.');
            // navigate('/catalog');
        }
        setLoading(false);
    };

    const fetchPurchaseHistory = async () => {
        const { data, error } = await getPurchaseHistoryByItemId(id);
        if (!error && data) {
            setPurchaseHistory(data);
        }
    };

    const fetchPartners = async () => {
        // Assuming a generic partners table fetch here
        const { data } = await supabase.from('partners').select('id, name').order('name');
        if (data) setPartners(data);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleScanSuccess = (decodedText) => {
        setFormData(prev => ({ ...prev, barcode: decodedText }));
        setShowScanner(false);
    };

    const handleDetailsChange = (content) => {
        setFormData(prev => ({ ...prev, details: content }));
    };

    const generateAutoBarcode = async () => {
        try {
            // Find the highest numeric barcode
            const { data } = await supabase
                .from('catalog_items')
                .select('barcode')
                .not('barcode', 'is', null)
                .order('barcode', { ascending: false });

            // Find the highest value that is actually a number
            let maxNum = 100000;
            if (data && data.length > 0) {
                for (const item of data) {
                    const num = parseInt(item.barcode, 10);
                    if (!isNaN(num) && item.barcode.match(/^\d+$/)) {
                        maxNum = Math.max(maxNum, num);
                        break; // Since we ordered descending, the first one we find should be the max
                    }
                }
            }
            return (maxNum + 1).toString();
        } catch (err) {
            console.error('Error auto-generating barcode:', err);
            return (100000 + Math.floor(Math.random() * 1000)).toString();
        }
    };

    const handleBarcodeFocus = async () => {
        if (isNewItem && !formData.barcode) {
            const newBarcode = await generateAutoBarcode();
            setFormData(prev => ({ ...prev, barcode: newBarcode }));
        }
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        setSaving(true);

        const dataToSave = {
            ...formData,
            quantity: formData.quantity === '' ? null : parseInt(formData.quantity, 10),
            selling_price: formData.selling_price === '' ? null : parseFloat(formData.selling_price)
        };

        // Auto-generate barcode if empty for new item
        if (isNewItem && !dataToSave.barcode) {
            dataToSave.barcode = await generateAutoBarcode();
        }

        if (isNewItem && profile?.company_id) {
            dataToSave.company_id = profile.company_id;
        }

        let result;
        if (isNewItem) {
            result = await createCatalogItem(dataToSave);
            if (!result.error && result.data) {
                navigate(`/catalog/${result.data.id}`);
            } else {
                console.error('Create item error:', result.error);
                alert('Failed to create item: ' + (result.error?.message || 'Unknown error'));
            }
        } else {
            result = await updateCatalogItem(id, dataToSave);
            if (!result.error) {
                alert('Item updated successfully');
            } else {
                alert('Failed to update item');
            }
        }
        setSaving(false);
    };

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
            setSaving(true);
            const { error } = await deleteCatalogItem(id);
            if (!error) {
                navigate('/catalog');
            } else {
                alert('Failed to delete item');
                setSaving(false);
            }
        }
    };

    const handleWebSearch = () => {
        if (!formData.name) {
            alert("Please enter a name first.");
            return;
        }
        const query = `${formData.name} ${formData.specification || ''}`.trim();
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        window.open(searchUrl, '_blank', 'noopener,noreferrer');
    };

    // ----- Purchase History Handlers -----

    const handlePurchaseInputChange = (e) => {
        const { name, value } = e.target;
        setPurchaseFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleEditMaster = (type) => {
        let initialData = null;
        if (type === 'supplier_id') initialData = partners.find(p => p.id === purchaseFormData.supplier_id);

        if (!initialData) return alert('Please select a supplier to edit first.');
        setEditModal({ isOpen: true, type, initialData });
    };

    const handleEditMasterSuccess = () => {
        setEditModal({ isOpen: false, type: null, initialData: null });
        fetchPartners(); // This should reload partners
    };

    const handlePurchaseDetailsChange = (content) => {
        setPurchaseFormData(prev => ({ ...prev, details: content }));
    };

    const handleBillUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploadingBill(true);
        try {
            const url = await uploadFile('company_assets', `catalog/purchases/${id || 'temp'}`, file);
            setPurchaseFormData(prev => ({ ...prev, bill_url: url }));
            toast.success('Bill uploaded successfully!');
        } catch (error) {
            console.error('Bill upload failed:', error);
            toast.error('Upload failed: ' + error.message);
        } finally {
            setUploadingBill(false);
            if (e.target) e.target.value = '';
        }
    };

    const openNewPurchaseModal = () => {
        setPurchaseFormData({
            supplier_id: '',
            last_purchase_price: '',
            purchase_date: new Date().toISOString().split('T')[0],
            details: '',
            pic: '',
            quantity: '',
            bill_url: '',
            remarks: ''
        });
        setEditingPurchaseId(null);
        setShowPurchaseModal(true);
    };

    const getPurchaseValue = (purchase, fieldName) => {
        if (purchase[fieldName] !== undefined && purchase[fieldName] !== null && purchase[fieldName] !== '') {
            return purchase[fieldName];
        }
        try {
            if (purchase.details) {
                const parsed = typeof purchase.details === 'string' ? JSON.parse(purchase.details) : purchase.details;
                return parsed[fieldName] || '';
            }
        } catch (e) {
            // Ignore JSON parse error if details is plain text
        }
        return '';
    };

    const adjustCatalogStockForPurchase = async (oldQty, newQty) => {
        // Skip client-side stock adjustment if database trigger is active (migration v5 succeeded)
        const isMigrationSuccessful = localStorage.getItem('purchase_history_migration_v5') === 'done';
        if (isMigrationSuccessful) {
            console.log('Skipping client-side stock adjustment because DB trigger is active.');
            return;
        }

        const netChange = newQty - oldQty;
        if (netChange !== 0) {
            const currentCatalogQty = parseFloat(formData.quantity || 0);
            const targetQty = currentCatalogQty + netChange;
            const { error } = await updateCatalogItem(id, { quantity: targetQty });
            if (error) {
                console.error('Failed to adjust catalog stock:', error);
            } else {
                setFormData(prev => ({ ...prev, quantity: targetQty }));
            }
        }
    };

    const openEditPurchaseModal = (purchase) => {
        setPurchaseFormData({
            supplier_id: purchase.supplier_id || '',
            last_purchase_price: purchase.last_purchase_price || '',
            purchase_date: purchase.purchase_date ? new Date(purchase.purchase_date).toISOString().split('T')[0] : '',
            details: purchase.details || '',
            pic: getPurchaseValue(purchase, 'pic'),
            quantity: getPurchaseValue(purchase, 'quantity'),
            bill_url: getPurchaseValue(purchase, 'bill_url'),
            remarks: getPurchaseValue(purchase, 'remarks')
        });
        setEditingPurchaseId(purchase.id);
        setShowPurchaseModal(true);
    };

    const handleSavePurchase = async (e) => {
        e.preventDefault();

        const qtyValue = purchaseFormData.quantity === '' ? null : parseFloat(purchaseFormData.quantity);
        const priceValue = purchaseFormData.last_purchase_price === '' ? null : parseFloat(purchaseFormData.last_purchase_price);

        const dataToSave = {
            ...purchaseFormData,
            item_id: id,
            last_purchase_price: priceValue,
            quantity: qtyValue
        };

        if (!editingPurchaseId && profile?.company_id) {
            dataToSave.company_id = profile.company_id;
        }

        // We also duplicate the custom fields in details JSON for fallback compatibility
        const detailsObj = {
            pic: purchaseFormData.pic,
            remarks: purchaseFormData.remarks,
            bill_url: purchaseFormData.bill_url,
            quantity: qtyValue
        };
        dataToSave.details = JSON.stringify(detailsObj);

        let savedRecord = null;
        let saveError = null;

        if (editingPurchaseId) {
            // Try saving with columns first
            const { data, error } = await updatePurchaseHistory(editingPurchaseId, dataToSave);
            if (error) {
                console.warn('Failed to update with columns, trying fallback:', error.message);
                const fallbackPayload = {
                    supplier_id: dataToSave.supplier_id,
                    purchase_date: dataToSave.purchase_date,
                    last_purchase_price: dataToSave.last_purchase_price,
                    details: dataToSave.details,
                    item_id: id
                };
                const fallbackRes = await updatePurchaseHistory(editingPurchaseId, fallbackPayload);
                savedRecord = fallbackRes.data;
                saveError = fallbackRes.error;
            } else {
                savedRecord = data;
                saveError = error;
            }

            if (!saveError) {
                // Adjust stock on success
                const oldRecord = purchaseHistory.find(p => p.id === editingPurchaseId);
                const oldQty = oldRecord ? parseFloat(getPurchaseValue(oldRecord, 'quantity') || 0) : 0;
                const newQty = qtyValue || 0;
                await adjustCatalogStockForPurchase(oldQty, newQty);

                setShowPurchaseModal(false);
                fetchPurchaseHistory();
                fetchItemData();
                toast.success('Purchase record updated successfully');
            } else {
                toast.error('Failed to update purchase history');
            }
        } else {
            // Try creating with columns first
            const { data, error } = await createPurchaseHistory(dataToSave);
            if (error) {
                console.warn('Failed to create with columns, trying fallback:', error.message);
                const fallbackPayload = {
                    supplier_id: dataToSave.supplier_id,
                    purchase_date: dataToSave.purchase_date,
                    last_purchase_price: dataToSave.last_purchase_price,
                    details: dataToSave.details,
                    item_id: id
                };
                if (dataToSave.company_id) {
                    fallbackPayload.company_id = dataToSave.company_id;
                }
                const fallbackRes = await createPurchaseHistory(fallbackPayload);
                savedRecord = fallbackRes.data;
                saveError = fallbackRes.error;
            } else {
                savedRecord = data;
                saveError = error;
            }

            if (!saveError) {
                // Adjust stock on success
                const newQty = qtyValue || 0;
                await adjustCatalogStockForPurchase(0, newQty);

                setShowPurchaseModal(false);
                fetchPurchaseHistory();
                fetchItemData();
                toast.success('Purchase record added successfully');
            } else {
                toast.error('Failed to add purchase history');
            }
        }
    };

    const handleDeletePurchase = async (purchaseId) => {
        if (window.confirm('Delete this purchase record?')) {
            const recordToDelete = purchaseHistory.find(p => p.id === purchaseId);
            const oldQty = recordToDelete ? parseFloat(getPurchaseValue(recordToDelete, 'quantity') || 0) : 0;

            const { error } = await deletePurchaseHistory(purchaseId);
            if (!error) {
                // Adjust stock (deducting the deleted quantity)
                await adjustCatalogStockForPurchase(oldQty, 0);

                fetchPurchaseHistory();
                fetchItemData();
                toast.success('Purchase record deleted');
            } else {
                toast.error('Failed to delete purchase record');
            }
        }
    };

    const handleInitiateUpload = async () => {
        const token = sessionStorage.getItem('google_contacts_token');
        const isValid = await validateToken(token);
        
        if (!token || !isValid) {
            setIsAuthModalOpen(true);
            return;
        }
        photoInputRef.current.click();
    };

    const handlePhotoUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const token = sessionStorage.getItem('google_contacts_token');

        if (!token) {
            setIsAuthModalOpen(true);
            return;
        }

        setUploadingPhotos(true);
        const newPhotos = [...(formData.photos || [])];

        try {
            // Get or create a specific folder named 'Catalog Photos' in the user's root
            const folderId = photosFolderId || await getOrCreateFolder(token, 'Catalog Photos');

            for (const file of files) {
                // Upload with folder context
                const driveFile = await uploadFileToDrive(token, file, {
                    title: `Item_${id || 'new'}_${Date.now()}_${file.name}`,
                    folderId: folderId
                });

                // Make file publicly viewable so thumbnails work
                await makeFilePublic(token, driveFile.id);

                // Store the webViewLink (accessible via browser)
                newPhotos.push(driveFile.webViewLink);
            }
            setFormData(prev => ({ ...prev, photos: newPhotos }));
            // Re-check folder
            if (!photosFolderId) {
                setPhotosFolderId(folderId);
            }
        } catch (err) {
            console.error('Photo upload to GDrive failed:', err);
            alert('Error: ' + err.message);
        } finally {
            setUploadingPhotos(false);
            if (e.target) e.target.value = '';
        }
    };
    
    const handleInitiateDatasheetUpload = async () => {
        const token = sessionStorage.getItem('google_contacts_token');
        const isValid = await validateToken(token);
        
        if (!token || !isValid) {
            setIsAuthModalOpen(true);
            return;
        }
        datasheetInputRef.current.click();
    };

    const handleDatasheetUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const token = sessionStorage.getItem('google_contacts_token');
        if (!token) {
            setIsAuthModalOpen(true);
            return;
        }

        setUploadingDatasheet(true);

        try {
            // Use Tier 05 Datasheets folder or fallback
            const folderId = datasheetsFolderId || await getOrCreateFolder(token, 'Catalog Datasheets');

            const driveFile = await uploadFileToDrive(token, file, {
                title: `Datasheet_${id || 'new'}_${Date.now()}_${file.name}`,
                folderId: folderId
            });

            await makeFilePublic(token, driveFile.id);

            setFormData(prev => ({ ...prev, datasheet_url: driveFile.webViewLink }));
            
            if (!datasheetsFolderId) setDatasheetsFolderId(folderId);
            
            alert('Datasheet uploaded successfully!');
        } catch (err) {
            console.error('Datasheet upload failed:', err);
            alert('Error: ' + err.message);
        } finally {
            setUploadingDatasheet(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleDeletePhoto = (indexToDelete) => {
        if (window.confirm('Are you sure you want to remove this photo?')) {
            setFormData(prev => ({
                ...prev,
                photos: prev.photos.filter((_, index) => index !== indexToDelete)
            }));
        }
    };

    const getThumbnailUrl = (photoUrl) => {
        if (!photoUrl) return '';
        // If it's a Supabase URL (fallback for old items)
        if (photoUrl.includes('supabase.co')) return photoUrl;
        // Use the direct GDrive image URL helper
        return getDirectImageUrl(photoUrl);
    };

    // -------------------------------------

    if (loading) {
        return <div className="text-center py-12">Loading item data...</div>;
    }

    const imageHandler = (ref) => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();
        input.onchange = async () => {
            const file = input.files[0];
            if (file) {
                try {
                    const url = await uploadFile('company_assets', `catalog/content/${id || 'temp'}`, file, { maxWidth: 1024 });
                    const quill = ref.current.getEditor();
                    const range = quill.getSelection();
                    quill.insertEmbed(range.index, 'image', url);
                } catch (error) {
                    console.error('Image upload failed:', error);
                }
            }
        };
    };

    // Quill Modules with image support
    const quillModules = {
        toolbar: {
            container: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
                ['link', 'image'],
                ['clean']
            ],
            handlers: {
                image: () => imageHandler(quillRef)
            }
        }
    };

    const purchaseQuillModules = {
        toolbar: {
            container: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
                ['link', 'image'],
                ['clean']
            ],
            handlers: {
                image: () => imageHandler(purchaseQuillRef)
            }
        }
    };

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                        className="btn btn-secondary"
                        style={{ padding: '8px', borderRadius: '50%' }}
                        onClick={() => navigate('/catalog')}
                        title="Back to Directory"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="page-title">
                            {isNewItem ? 'New Item' : `Editing: ${formData.name}`}
                        </h1>
                        <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                            {isNewItem ? 'Add a new product or service to the catalog' : 'Update details and view purchase history'}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    {!isNewItem && (
                        <button
                            className="btn btn-danger"
                            onClick={handleDelete}
                            disabled={saving}
                        >
                            <Trash2 size={18} /> Delete Form
                        </button>
                    )}
                    <button
                        className="btn btn-secondary"
                        onClick={() => navigate('/catalog')}
                        disabled={saving}
                    >
                        <X size={18} /> Cancel
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        <Save size={18} /> {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            <div style={{ borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '2px' }}>
                    <button
                        style={{
                            padding: '12px 24px',
                            background: activeTab === 'details' ? '#ffffff' : 'transparent',
                            border: '1px solid',
                            borderColor: activeTab === 'details' ? 'var(--border-color) var(--border-color) transparent' : 'transparent',
                            borderRadius: '8px 8px 0 0',
                            fontWeight: activeTab === 'details' ? 600 : 500,
                            color: activeTab === 'details' ? 'var(--accent)' : 'var(--text-secondary)',
                            marginBottom: '-1px',
                            cursor: 'pointer'
                        }}
                        onClick={() => setActiveTab('details')}
                    >
                        Item Details
                    </button>
                    {!isNewItem && (
                        <button
                            style={{
                                padding: '12px 24px',
                                background: activeTab === 'purchaseHistory' ? '#ffffff' : 'transparent',
                                border: '1px solid',
                                borderColor: activeTab === 'purchaseHistory' ? 'var(--border-color) var(--border-color) transparent' : 'transparent',
                                borderRadius: '8px 8px 0 0',
                                fontWeight: activeTab === 'purchaseHistory' ? 600 : 500,
                                color: activeTab === 'purchaseHistory' ? 'var(--accent)' : 'var(--text-secondary)',
                                marginBottom: '-1px',
                                cursor: 'pointer'
                            }}
                            onClick={() => setActiveTab('purchaseHistory')}
                        >
                            Purchase History ({purchaseHistory.length})
                        </button>
                    )}
                    <button
                        style={{
                            padding: '12px 24px',
                            background: activeTab === 'photos' ? '#ffffff' : 'transparent',
                            border: '1px solid',
                            borderColor: activeTab === 'photos' ? 'var(--border-color) var(--border-color) transparent' : 'transparent',
                            borderRadius: '8px 8px 0 0',
                            fontWeight: activeTab === 'photos' ? 600 : 500,
                            color: activeTab === 'photos' ? 'var(--accent)' : 'var(--text-secondary)',
                            marginBottom: '-1px',
                            cursor: 'pointer'
                        }}
                        onClick={() => setActiveTab('photos')}
                    >
                        Media & Photos ({(formData.photos || []).length})
                    </button>

                </div>
            </div>

            {
                activeTab === 'details' && (
                    <div className="glass-panel">
                        <form onSubmit={handleSave}>

                            <div className="grid-2">
                                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-label">Type</label>
                                    <select
                                        className="form-select"
                                        name="type"
                                        value={formData.type}
                                        onChange={handleInputChange}
                                    >
                                        <option value="Supply Part">Supply Part</option>
                                        <option value="Service">Service</option>
                                    </select>
                                </div>

                                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <label className="form-label" style={{ marginBottom: 0 }}>Item Name *</label>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            style={{ padding: '4px 12px', fontSize: '0.85rem' }}
                                            onClick={handleWebSearch}
                                            title="Search Web for this item"
                                        >
                                            <Globe size={14} /> Search Web
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        className="form-input"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleInputChange}
                                        required
                                        placeholder="e.g. Cummins KTA50 Fuel Injector"
                                    />
                                </div>

                                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-label">Specification</label>
                                    <textarea
                                        className="form-textarea"
                                        name="specification"
                                        value={formData.specification}
                                        onChange={handleInputChange}
                                        rows="3"
                                        placeholder="Make, Model, Serial, Technical Specs..."
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Selling Price</label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}>$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="form-input"
                                            style={{ paddingLeft: '32px' }}
                                            name="selling_price"
                                            value={formData.selling_price}
                                            onChange={handleInputChange}
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Quantity Available</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        name="quantity"
                                        value={formData.quantity}
                                        onChange={handleInputChange}
                                        placeholder="e.g. 5"
                                    />
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>Leave empty for services.</span>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Stored Location</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        name="stored_location"
                                        value={formData.stored_location}
                                        onChange={handleInputChange}
                                        placeholder="e.g. Warehouse A, Shelf 3"
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Barcode / QR Code</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <div style={{ position: 'relative', flex: 1 }}>
                                            <QrCode size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                            <input
                                                type="text"
                                                className="form-input"
                                                style={{ paddingLeft: '40px' }}
                                                name="barcode"
                                                value={formData.barcode}
                                                onChange={handleInputChange}
                                                onFocus={handleBarcodeFocus}
                                                placeholder="Scan or enter barcode"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => setShowScanner(true)}
                                            style={{ padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            title="Scan with Camera"
                                        >
                                            <Camera size={20} />
                                        </button>
                                    </div>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>Unique ID for mobile auto-scanning</span>
                                </div>

                                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-label">Additional Details & Photos</label>
                                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                                        <ReactQuill
                                            ref={quillRef}
                                            theme="snow"
                                            value={formData.details}
                                            onChange={handleDetailsChange}
                                            modules={quillModules}
                                            style={{ height: '300px', borderBottom: 'none' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <button type="submit" style={{ display: 'none' }}>Submit</button>
                        </form>
                    </div>
                )
            }

            <ScannerModal
                isOpen={showScanner}
                onClose={() => setShowScanner(false)}
                onScanSuccess={handleScanSuccess}
            />

            {
                activeTab === 'purchaseHistory' && !isNewItem && (
                    <div className="glass-panel animate-fade-in">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Past Purchases</h3>
                            <button
                                className="btn btn-primary"
                                style={{ padding: '6px 16px', fontSize: '0.9rem' }}
                                onClick={openNewPurchaseModal}
                            >
                                <Plus size={16} /> Record Purchase
                            </button>
                        </div>

                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Supplier</th>
                                        <th>PIC</th>
                                        <th>Unit Price</th>
                                        <th>Qty</th>
                                        <th>Total</th>
                                        <th>Bill</th>
                                        <th>Remarks</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {purchaseHistory.length === 0 ? (
                                        <tr>
                                            <td colSpan="9" style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>
                                                No purchase history recorded yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        purchaseHistory.map(purchase => {
                                            const unitPrice = parseFloat(purchase.last_purchase_price) || 0;
                                            const qty = parseFloat(getPurchaseValue(purchase, 'quantity')) || 0;
                                            const total = unitPrice * qty;
                                            const pic = getPurchaseValue(purchase, 'pic');
                                            const billUrl = getPurchaseValue(purchase, 'bill_url');
                                            const remarks = getPurchaseValue(purchase, 'remarks');
                                            return (
                                                <tr key={purchase.id}>
                                                    <td>{purchase.purchase_date ? new Date(purchase.purchase_date).toLocaleDateString() : '-'}</td>
                                                    <td>{purchase.supplier?.name || 'Unknown Supplier'}</td>
                                                    <td>{pic || '-'}</td>
                                                    <td>{purchase.last_purchase_price ? `$${unitPrice.toFixed(2)}` : '-'}</td>
                                                    <td>{qty || '-'}</td>
                                                    <td>{total > 0 ? `$${total.toFixed(2)}` : '-'}</td>
                                                    <td>
                                                        {billUrl ? (
                                                            <a href={billUrl} target="_blank" rel="noreferrer" title="View Bill" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                                                                <FileText size={16} />
                                                            </a>
                                                        ) : (
                                                            '-'
                                                        )}
                                                    </td>
                                                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={remarks}>
                                                        {remarks || '-'}
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', gap: '16px' }}>
                                                            <button
                                                                style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                                                                onClick={() => openEditPurchaseModal(purchase)}
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                                                                onClick={() => handleDeletePurchase(purchase.id)}
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            }

            {activeTab === 'photos' && isNewItem && (
                <div className="glass-panel animate-fade-in" style={{ padding: '48px', textAlign: 'center' }}>
                    <div style={{
                        width: '64px', height: '64px', background: '#f1f5f9', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 16px', color: '#94a3b8'
                    }}>
                        <ImageIcon size={32} />
                    </div>
                    <h4 style={{ color: '#475569', fontSize: '1.1rem', fontWeight: 600 }}>Save the item first</h4>
                    <p style={{ color: '#94a3b8', marginTop: '8px', marginBottom: '24px' }}>
                        Please fill in the item details and click <strong>Save Changes</strong> before uploading photos.
                    </p>
                    <button
                        className="btn btn-primary"
                        onClick={() => setActiveTab('details')}
                    >
                        Go to Item Details
                    </button>
                </div>
            )}

            {activeTab === 'photos' && !isNewItem && (
                <div className="glass-panel animate-fade-in" style={{ padding: '32px' }}>
                    {/* Datasheet Section */}
                    <div style={{ 
                        background: '#f8fafc', 
                        borderRadius: '16px', 
                        padding: '24px', 
                        marginBottom: '32px',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                            <div style={{ 
                                width: '48px', 
                                height: '48px', 
                                background: '#fff', 
                                borderRadius: '12px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                color: formData.datasheet_url ? 'var(--accent)' : '#94a3b8',
                                border: '1px solid #e2e8f0'
                            }}>
                                <ImageIcon size={24} />
                            </div>
                            <div>
                                <h4 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Product Datasheet</h4>
                                <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '2px' }}>
                                    {formData.datasheet_url ? 'Technical PDF/Doc linked successfully' : 'Not uploaded yet'}
                                </p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            {formData.datasheet_url && (
                                <a 
                                    href={formData.datasheet_url} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="btn btn-secondary"
                                    style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                                >
                                    <ExternalLink size={16} /> View Current
                                </a>
                            )}
                            <button 
                                className="btn btn-primary" 
                                onClick={handleInitiateDatasheetUpload}
                                disabled={uploadingDatasheet}
                                style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                            >
                                {uploadingDatasheet ? <Loader size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                                {uploadingDatasheet ? 'Uploading...' : (formData.datasheet_url ? 'Update Datasheet' : 'Upload Datasheet')}
                            </button>
                            <input
                                ref={datasheetInputRef}
                                type="file"
                                accept=".pdf,.doc,.docx,.xls,.xlsx"
                                onChange={handleDatasheetUpload}
                                hidden
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                        <div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>Product Gallery</h3>
                            <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>Upload and manage high-quality photos for this item</p>
                        </div>
                        <button 
                            className={`btn ${uploadingPhotos ? 'btn-secondary' : 'btn-primary'}`} 
                            onClick={handleInitiateUpload}
                            disabled={uploadingPhotos}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            {uploadingPhotos ? <Loader size={18} className="animate-spin" /> : <UploadCloud size={18} />}
                            {uploadingPhotos ? 'Uploading...' : 'Upload Photos'}
                        </button>
                        <input
                            ref={photoInputRef}
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={handlePhotoUpload}
                            hidden
                        />
                    </div>

                    {(formData.photos || []).length === 0 ? (
                        <div style={{
                            border: '2px dashed var(--border-color)',
                            borderRadius: '16px',
                            padding: '64px',
                            textAlign: 'center',
                            background: 'rgba(248, 250, 252, 0.5)'
                        }}>
                            <div style={{
                                width: '64px',
                                height: '64px',
                                background: '#f1f5f9',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 16px',
                                color: '#94a3b8'
                            }}>
                                <ImageIcon size={32} />
                            </div>
                            <h4 style={{ color: '#475569', fontSize: '1.1rem', fontWeight: 600 }}>No photos yet</h4>
                            <p style={{ color: '#94a3b8', marginTop: '8px', marginBottom: '24px' }}>Add photos to help identify this item in the catalog</p>
                            <button className="btn btn-secondary" onClick={handleInitiateUpload}>
                                Browse Files
                            </button>
                        </div>
                    ) : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                            gap: '24px'
                        }}>
                            {(formData.photos || []).map((photo, index) => (
                                <div key={index} className="glass-panel" style={{ padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0', background: '#fff' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <div style={{ width: '60px', height: '60px', background: '#f8fafc', borderRadius: '12px', overflow: 'hidden', border: '1px solid #f1f5f9' }}>
                                                <img 
                                                    src={getThumbnailUrl(photo)} 
                                                    alt={`Photo ${index + 1}`} 
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    onClick={() => window.open(photo, '_blank')}
                                                />
                                            </div>
                                            <div>
                                                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Item Photo #{index + 1}</h3>
                                                <code style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ID: {photo.split('/d/')[1]?.split('/')[0] || 'GDRIVE_FILE'}</code>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleDeletePhoto(index)}
                                            style={{ background: '#fef2f2', border: 'none', color: '#ef4444', padding: '8px', borderRadius: '10px', cursor: 'pointer' }}
                                            title="Delete Photo"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {driveFolderId ? <CheckCircle2 size={14} color="#22c55e" /> : <AlertCircle size={14} color="#f59e0b" />}
                                            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Drive Folder Ready</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <CheckCircle2 size={14} color="#22c55e" />
                                            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Photo Linked</span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <a 
                                            href={photo} 
                                            target="_blank" 
                                            rel="noreferrer" 
                                            className="btn btn-secondary"
                                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.9rem', padding: '8px' }}
                                        >
                                            <ExternalLink size={16} /> View
                                        </a>
                                        <a 
                                            href={photo}
                                            target="_blank" 
                                            rel="noreferrer" 
                                            className="btn btn-secondary"
                                            style={{ padding: '8px', borderRadius: '10px' }}
                                            title="Open Folder"
                                        >
                                            <Link size={16} />
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <style>{`
                        .photo-card:hover { transform: scale(1.02); }
                        .photo-card:hover .photo-overlay { opacity: 1; }
                    `}</style>
                </div>
            )}

            {/* Purchase Modal */}
            {
                showPurchaseModal && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: '24px' }}>
                        <div className="glass-panel" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
                            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                                    {editingPurchaseId ? 'Edit Purchase Record' : 'Add Purchase Record'}
                                </h3>
                                <button
                                    onClick={() => setShowPurchaseModal(false)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                                <form id="purchaseForm" onSubmit={handleSavePurchase}>
                                    <div className="grid-2">
                                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>Supplier *</span>
                                                {purchaseFormData.supplier_id && <Pencil size={14} style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => handleEditMaster('supplier_id')} />}
                                            </label>
                                            <select
                                                className="form-select"
                                                name="supplier_id"
                                                value={purchaseFormData.supplier_id}
                                                onChange={handlePurchaseInputChange}
                                                required
                                            >
                                                <option value="">Select a supplier...</option>
                                                {partners.map(p => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">Purchase Date</label>
                                            <input
                                                type="date"
                                                className="form-input"
                                                name="purchase_date"
                                                value={purchaseFormData.purchase_date}
                                                onChange={handlePurchaseInputChange}
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">Price per pc / Unit Price</label>
                                            <div style={{ position: 'relative' }}>
                                                <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}>$</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="form-input"
                                                    style={{ paddingLeft: '32px' }}
                                                    name="last_purchase_price"
                                                    value={purchaseFormData.last_purchase_price}
                                                    onChange={handlePurchaseInputChange}
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">Quantity Purchased *</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                name="quantity"
                                                value={purchaseFormData.quantity}
                                                onChange={handlePurchaseInputChange}
                                                required
                                                placeholder="e.g. 10"
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">Person in Charge (PIC)</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                name="pic"
                                                value={purchaseFormData.pic}
                                                onChange={handlePurchaseInputChange}
                                                placeholder="e.g. John Doe"
                                            />
                                        </div>

                                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                            <label className="form-label">Remarks for Future Use</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                name="remarks"
                                                value={purchaseFormData.remarks}
                                                onChange={handlePurchaseInputChange}
                                                placeholder="e.g. Batch #45, special discount applied"
                                            />
                                        </div>

                                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                            <label className="form-label">Bill Image or PDF</label>
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                <input
                                                    type="file"
                                                    accept="image/*,application/pdf"
                                                    onChange={handleBillUpload}
                                                    style={{ display: 'none' }}
                                                    id="bill-file-upload"
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                                    onClick={() => document.getElementById('bill-file-upload').click()}
                                                    disabled={uploadingBill}
                                                >
                                                    {uploadingBill ? <Loader size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                                                    {uploadingBill ? 'Uploading...' : 'Choose File'}
                                                </button>
                                                
                                                {purchaseFormData.bill_url && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f1f5f9', padding: '6px 12px', borderRadius: '8px' }}>
                                                        <FileText size={16} color="var(--accent)" />
                                                        <a href={purchaseFormData.bill_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 500, textDecoration: 'underline' }}>
                                                            View Bill Attachment
                                                        </a>
                                                        <button
                                                            type="button"
                                                            style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', marginLeft: '8px' }}
                                                            onClick={() => setPurchaseFormData(prev => ({ ...prev, bill_url: '' }))}
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                            <label className="form-label">Purchase Details / Invoice Snippets</label>
                                            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                                                <ReactQuill
                                                    ref={purchaseQuillRef}
                                                    theme="snow"
                                                    value={purchaseFormData.details}
                                                    onChange={handlePurchaseDetailsChange}
                                                    modules={purchaseQuillModules}
                                                    style={{ height: '200px' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </form>
                            </div>

                            <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: 'var(--bg-primary)' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowPurchaseModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    form="purchaseForm"
                                    className="btn btn-primary"
                                >
                                    Save Record
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            <GDriveConnectionModal 
                isOpen={isAuthModalOpen} 
                onClose={() => setIsAuthModalOpen(false)} 
                state="catalog_photo_upload"
            />

            {editModal.isOpen && (
                <Modal 
                    isOpen={editModal.isOpen} 
                    onClose={() => setEditModal({ isOpen: false, type: null, initialData: null })}
                    title={`Edit ${editModal.type === 'supplier_id' ? 'Supplier' : 'Master'}`}
                >
                    {editModal.type === 'supplier_id' && (
                        <QuickPartnerContactDualAdd 
                            company_id={profile?.company_id}
                            initialPartner={editModal.initialData}
                            partners={partners}
                            onSuccess={handleEditMasterSuccess}
                            onCancel={() => setEditModal({ isOpen: false, type: null, initialData: null })}
                        />
                    )}
                </Modal>
            )}
        </div >
    );
};

export default CatalogForm;
