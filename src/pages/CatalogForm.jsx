import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { 
    X, Plus, Search, Filter, ArrowLeft, Save, Trash2, FileText, 
    MoreHorizontal, ChevronDown, Package, Database, Edit, Ship, 
    Link, ArrowRight, Cloud, ImageIcon, Pencil, Globe, QrCode, 
    Camera, ExternalLink, Loader, UploadCloud, CheckCircle2, AlertCircle,
    ShoppingBag, History, Wrench, RefreshCw, FileCheck, Info, Tag, FolderOpen, Folder, Smartphone
} from 'lucide-react';
import { provisionSparepartFolderStructure, uploadFileToDrive } from '../lib/driveService';
import { connectGoogleAPI, getStoredToken } from '../lib/googleAuthService';
import { Modal } from '../components/workflow/QuickAddForms';
import { supabase } from '../lib/supabase';
import ScannerModal from '../components/ScannerModal';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { useAuth } from '../contexts/AuthContext';
import Barcode from 'react-barcode';
import { QRCodeSVG } from 'qrcode.react';

import {
    getCatalogItemById,
    createCatalogItem,
    updateCatalogItem,
    deleteCatalogItem
} from '../lib/catalogService';
import {
    getDepartments, getMakers, getModels, getAssemblies, getWarehouses, getUnits, getSystems,
    createMaker, createModel, createAssembly, createSystem, createWarehouse, createUnit,
    getMarineDocuments, createMarineDocument, deleteMarineDocument,
    getMarinePhotos, createMarinePhoto, deleteMarinePhoto,
    getMarineNotes, createMarineNote, deleteMarineNote,
    getSparePartCompatibility, createCompatibilityMapping, deleteCompatibilityMapping,
    getMarineAuditLogs, logMarineAction
} from '../lib/marineCatalogService';
import {
    getPurchaseHistoryByItemId,
    createPurchaseHistory,
    updatePurchaseHistory,
    deletePurchaseHistory
} from '../lib/purchaseHistoryService';

const CatalogForm = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { profile } = useAuth();
    const isNewItem = id === 'new';
    const quillRef = useRef(null);

    // General States
    const [loading, setLoading] = useState(!isNewItem);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    const [showScanner, setShowScanner] = useState(false);

    // Master list data
    const [departments, setDepartments] = useState([]);
    const [makers, setMakers] = useState([]);
    const [models, setModels] = useState([]);
    const [assemblies, setAssemblies] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [units, setUnits] = useState([]);
    const [systems, setSystems] = useState([]);
    const [partners, setPartners] = useState([]);

    // Form data
    const [formData, setFormData] = useState({
        type: 'Supply Part',
        name: '',
        specification: '',
        quantity: 0,
        min_stock: 0,
        max_stock: 100,
        selling_price: 0,
        purchase_price: 0,
        currency: 'USD',
        stored_location: '',
        details: '',
        barcode: '',
        system_id: '',
        maker_id: '',
        model_id: '',
        assembly_id: '',
        warehouse_id: '',
        uom: 'Pc(s).',
        oem_part_no: '',
        manufacturer_part_no: '',
        alternative_part_numbers: '',
        lead_time: '',
        warranty: '',
        weight: '',
        dimensions: '',
        status: 'Active',
        brand: ''
    });

    // Sub-data states
    const [documents, setDocuments] = useState([]);
    const [photos, setPhotos] = useState([]);
    const [notes, setNotes] = useState([]);
    const [compatibility, setCompatibility] = useState([]);
    const [purchaseHistory, setPurchaseHistory] = useState([]);
    const [salesHistory, setSalesHistory] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);

    // Document/Photo upload states
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [docInput, setDocInput] = useState({ name: '', type: 'Datasheet', url: '' });
    const [photoUrlInput, setPhotoUrlInput] = useState('');
    const [noteInput, setNoteInput] = useState('');

    // Mobile Upload Gateway State
    const [qrModal, setQrModal] = useState({ isOpen: false, folderId: null, folderName: '' });

    // Google Drive folder state
    const [driveFolder, setDriveFolder] = useState(null); // { folderId, photosFolderId, datasheetsFolderId, webViewLink, ... }
    const [driveFiles, setDriveFiles] = useState({ photos: [], docs: [] });
    const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);
    const [provisioningDrive, setProvisioningDrive] = useState(false);

    const fetchDriveFiles = async () => {
        if (!driveFolder?.folderId) return;
        const accessToken = localStorage.getItem('google_access_token');
        if (!accessToken) return;

        setLoadingDriveFiles(true);
        try {
            const { listFolderContent } = await import('../lib/driveService');
            let fetchedPhotos = [];
            let fetchedDocs = [];

            if (driveFolder.photosFolderId) {
                const files = await listFolderContent(accessToken, driveFolder.photosFolderId);
                fetchedPhotos = files.map(f => ({
                    id: f.id,
                    name: f.name,
                    url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
                    thumbnail: `https://lh3.googleusercontent.com/d/${f.id}=w400`,
                    createdTime: f.createdTime
                }));
            }

            if (driveFolder.datasheetsFolderId) {
                const files = await listFolderContent(accessToken, driveFolder.datasheetsFolderId);
                fetchedDocs = files.map(f => ({
                    id: f.id,
                    name: f.name,
                    url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
                    createdTime: f.createdTime
                }));
            }

            setDriveFiles({ photos: fetchedPhotos, docs: fetchedDocs });
        } catch (e) {
            console.error("Failed to load files from Drive:", e);
        } finally {
            setLoadingDriveFiles(false);
        }
    };

    useEffect(() => {
        if (driveFolder?.folderId) {
            fetchDriveFiles();
        }
    }, [driveFolder]);
    const [uploadingDriveDoc, setUploadingDriveDoc] = useState(false);
    const [uploadingDrivePhoto, setUploadingDrivePhoto] = useState(false);
    const docFileInputRef = useRef(null);
    const photoFileInputRef = useRef(null);

    // Drive connect modal (shown when Drive is not connected on new spare save)
    const [showDriveModal, setShowDriveModal] = useState(false);
    const [pendingSaveId, setPendingSaveId] = useState(null); // spare part id waiting for Drive folders
    
    // Compatibility addition state
    const [compatInput, setCompatInput] = useState({ system_id: '', model_id: '' });

    // Purchase Modal state
    const [showPurchaseModal, setShowPurchaseModal] = useState(false);
    const [editingPurchaseId, setEditingPurchaseId] = useState(null);
    const [purchaseFormData, setPurchaseFormData] = useState({
        supplier_id: '',
        purchase_date: new Date().toISOString().split('T')[0],
        last_purchase_price: '',
        quantity: '',
        pic: '',
        remarks: '',
        bill_url: ''
    });

    // Fetch lists
    const fetchMasterLists = async () => {
        const cid = profile?.company_id;
        const [depsRes, makersRes, modelsRes, assembliesRes, whRes, unitsRes, sysRes, partRes] = await Promise.all([
            getDepartments(cid),
            getMakers(cid),
            getModels(cid),
            getAssemblies(cid),
            getWarehouses(cid),
            getUnits(cid),
            getSystems(1, 1000, '', {}, cid),
            supabase.from('partners').select('id, name').order('name')
        ]);

        setDepartments(depsRes.data || []);
        setMakers(makersRes.data || []);
        setModels(modelsRes.data || []);
        setAssemblies(assembliesRes.data || []);
        setWarehouses(whRes.data || []);
        setUnits(unitsRes.data || []);
        setSystems(sysRes.data || []);
        setPartners(partRes.data || []);
    };

    // Fetch detail data
    const fetchItemData = async () => {
        setLoading(true);
        const { data, error } = await getCatalogItemById(id);
        if (!error && data) {
            setFormData({
                type: data.type || 'Supply Part',
                name: data.name || '',
                specification: data.specification || '',
                quantity: data.quantity !== null && data.quantity !== undefined ? data.quantity : 0,
                min_stock: data.min_stock !== null && data.min_stock !== undefined ? data.min_stock : 0,
                max_stock: data.max_stock !== null && data.max_stock !== undefined ? data.max_stock : 100,
                selling_price: data.selling_price || 0,
                purchase_price: data.purchase_price || 0,
                currency: data.currency || 'USD',
                stored_location: data.stored_location || '',
                details: data.details || '',
                barcode: data.barcode || '',
                system_id: data.system_id || '',
                maker_id: data.maker_id || '',
                model_id: data.model_id || '',
                assembly_id: data.assembly_id || '',
                warehouse_id: data.warehouse_id || '',
                uom: data.uom || 'Pc(s).',
                oem_part_no: data.oem_part_no || '',
                manufacturer_part_no: data.manufacturer_part_no || '',
                alternative_part_numbers: data.alternative_part_numbers || '',
                lead_time: data.lead_time || '',
                warranty: data.warranty || '',
                weight: data.weight || '',
                dimensions: data.dimensions || '',
                status: data.status || 'Active',
                brand: data.brand || '',
                spare_number: data.spare_number
            });

            // Restore Drive folder state if already provisioned
            if (data.gdrive_folder_id) {
                setDriveFolder({
                    folderId:            data.gdrive_folder_id,
                    photosFolderId:      data.gdrive_photos_folder_id,
                    datasheetsFolderId:  data.gdrive_datasheets_folder_id,
                    webViewLink:         `https://drive.google.com/drive/folders/${data.gdrive_folder_id}`,
                    photosWebViewLink:   data.gdrive_photos_folder_id ? `https://drive.google.com/drive/folders/${data.gdrive_photos_folder_id}` : null,
                    datasheetsWebViewLink: data.gdrive_datasheets_folder_id ? `https://drive.google.com/drive/folders/${data.gdrive_datasheets_folder_id}` : null
                });
            }

            // Fetch related child structures
            const [docsRes, photosRes, notesRes, compatRes, purchaseRes, auditRes] = await Promise.all([
                getMarineDocuments('spare_part', id),
                getMarinePhotos('spare_part', id),
                getMarineNotes('spare_part', id),
                getSparePartCompatibility(id),
                getPurchaseHistoryByItemId(id),
                getMarineAuditLogs('spare_part', id)
            ]);

            setDocuments(docsRes.data || []);
            setPhotos(photosRes.data || []);
            setNotes(notesRes.data || []);
            setCompatibility(compatRes.data || []);
            setPurchaseHistory(purchaseRes.data || []);
            setAuditLogs(auditRes.data || []);

            // Fetch Sales Transactions (real jobs or invoices)
            const { data: sales, error: salesErr } = await supabase
                .from('workflow_line_items')
                .select(`
                    id,
                    quantity,
                    price,
                    workflow_documents:document_id (
                        id,
                        document_no,
                        document_type,
                        created_at,
                        partner:partner_id (name)
                    )
                `)
                .eq('item_id', id);

            if (!salesErr) {
                setSalesHistory(sales || []);
            }
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchMasterLists();
        if (!isNewItem) {
            fetchItemData();
        } else if (location.state) {
            setFormData(prev => ({
                ...prev,
                system_id: location.state.system_id || '',
                maker_id: location.state.maker_id || '',
                model_id: location.state.model_id || '',
            }));
        }
    }, [id, location.state]);

    // After Drive OAuth redirect back to this spare part — auto-provision if no folder yet
    useEffect(() => {
        if (isNewItem) return;
        const pendingId = sessionStorage.getItem('catalog_spare_drive_pending_id');
        if (!pendingId || pendingId !== id) return;
        const accessToken = getStoredToken();
        if (!accessToken) return;

        // Clear the pending marker so it only runs once
        sessionStorage.removeItem('catalog_spare_drive_pending_id');

        // Wait until item data is loaded then provision
        const tryProvision = async () => {
            const { data } = await import('../lib/catalogService').then(m => m.getCatalogItemById(id));
            if (!data) return;
            if (data.gdrive_folder_id) {
                // Already provisioned (shouldn't happen, but safe)
                return;
            }
            if (!data.spare_number || !data.name) return;
            setProvisioningDrive(true);
            try {
                const result = await provisionSparepartFolderStructure(accessToken, String(data.spare_number), data.name);
                await supabase.from('catalog_items').update({
                    gdrive_folder_id:            result.folderId,
                    gdrive_photos_folder_id:     result.photosFolderId,
                    gdrive_datasheets_folder_id: result.datasheetsFolderId
                }).eq('id', id);
                setDriveFolder(result);
                toast.success('\uD83D\uDCC2 Drive folders created for ' + data.name + '!');
            } catch (err) {
                toast.error('Drive folder creation failed: ' + err.message);
            } finally {
                setProvisioningDrive(false);
            }
        };
        tryProvision();
    }, [id, isNewItem]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleDropdownChange = async (e) => {
        const { name, value } = e.target;

        if (value === 'add_new') {
            const cid = profile?.company_id;

            if (name === 'maker_id') {
                const newName = window.prompt("Enter new Maker Name:");
                if (newName && newName.trim()) {
                    const { data, error } = await createMaker(newName.trim(), cid);
                    if (!error && data) {
                        setMakers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
                        setFormData(prev => ({ ...prev, maker_id: data.id, model_id: '', assembly_id: '' }));
                    } else {
                        alert(error?.message || "Failed to create Maker");
                    }
                }
            } else if (name === 'model_id') {
                if (!formData.maker_id) {
                    alert("Please select a Maker before adding a new Model.");
                    return;
                }
                const newName = window.prompt("Enter new Model Name:");
                if (newName && newName.trim()) {
                    const { data, error } = await createModel(newName.trim(), formData.maker_id, cid);
                    if (!error && data) {
                        setModels(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
                        setFormData(prev => ({ ...prev, model_id: data.id, assembly_id: '' }));
                    } else {
                        alert(error?.message || "Failed to create Model");
                    }
                }
            } else if (name === 'assembly_id') {
                if (!formData.model_id) {
                    alert("Please select a Model before adding a new Assembly.");
                    return;
                }
                const newName = window.prompt("Enter new Assembly Name:");
                if (newName && newName.trim()) {
                    const { data, error } = await createAssembly(newName.trim(), formData.model_id, cid);
                    if (!error && data) {
                        setAssemblies(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
                        setFormData(prev => ({ ...prev, assembly_id: data.id }));
                    } else {
                        alert(error?.message || "Failed to create Assembly");
                    }
                }
            } else if (name === 'system_id') {
                const newName = window.prompt("Enter new Machinery System Name:");
                if (newName && newName.trim()) {
                    const sysNo = window.prompt("Enter Machinery System Number / Code:") || `SYS-${Date.now().toString().slice(-6)}`;
                    const { data, error } = await createSystem({
                        name: newName.trim(),
                        system_no: sysNo.trim(),
                        company_id: cid
                    });
                    if (!error && data) {
                        setSystems(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
                        setFormData(prev => ({ ...prev, system_id: data.id }));
                    } else {
                        alert(error?.message || "Failed to create Machinery System");
                    }
                }
            } else if (name === 'warehouse_id') {
                const newName = window.prompt("Enter new Warehouse Name:");
                if (newName && newName.trim()) {
                    const location = window.prompt("Enter Warehouse Location (e.g. Rack B, Section 4):") || "";
                    const { data, error } = await createWarehouse(newName.trim(), location.trim(), cid);
                    if (!error && data) {
                        setWarehouses(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
                        setFormData(prev => ({ ...prev, warehouse_id: data.id }));
                    } else {
                        alert(error?.message || "Failed to create Warehouse");
                    }
                }
            } else if (name === 'uom') {
                const newName = window.prompt("Enter Unit of Measure Name (e.g. Liters):");
                if (newName && newName.trim()) {
                    const symbol = window.prompt("Enter Symbol (e.g. L):") || newName.slice(0, 3);
                    const { data, error } = await createUnit(newName.trim(), symbol.trim(), cid);
                    if (!error && data) {
                        setUnits(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
                        setFormData(prev => ({ ...prev, uom: data.symbol }));
                    } else {
                        alert(error?.message || "Failed to create Unit of Measure");
                    }
                }
            }
        } else {
            // When user changes dropdown, reset downstream linked dropdowns (e.g. Maker resets Model & Assembly)
            if (name === 'maker_id') {
                setFormData(prev => ({ ...prev, maker_id: value, model_id: '', assembly_id: '' }));
            } else if (name === 'model_id') {
                setFormData(prev => ({ ...prev, model_id: value, assembly_id: '' }));
            } else {
                setFormData(prev => ({ ...prev, [name]: value }));
            }
        }
    };

    const handleQuillChange = (content) => {
        setFormData(prev => ({ ...prev, details: content }));
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (!formData.name) return toast.error('Item name is required');

        setSaving(true);

        // Helper: converts a value to a safe number or null (never empty string "")
        const safeNum = (v, fallback = null) => {
            const n = parseFloat(v);
            return isNaN(n) ? fallback : n;
        };
        const safeInt = (v, fallback = null) => {
            const n = parseInt(v);
            return isNaN(n) ? fallback : n;
        };

        const payload = {
            ...formData,
            quantity:       safeInt(formData.quantity,  0),
            min_stock:      safeInt(formData.min_stock, 0),
            max_stock:      safeInt(formData.max_stock, 100),
            selling_price:  safeNum(formData.selling_price, 0),
            purchase_price: safeNum(formData.purchase_price, 0),
            // weight is a numeric column — must be null not ""
            weight:         formData.weight !== '' && formData.weight !== undefined ? safeNum(formData.weight) : null,
            company_id: profile?.company_id || 'd0000000-0000-0000-0000-000000000001'
        };

        // Clean up all empty strings to null to prevent Postgres type mismatch errors for uuid/numeric/int columns.
        const cleanedPayload = {};
        Object.keys(payload).forEach(key => {
            const val = payload[key];
            if (val === '' && key !== 'name' && key !== 'type') {
                cleanedPayload[key] = null;
            } else {
                cleanedPayload[key] = val;
            }
        });


        let res;
        if (isNewItem) {
            // Check if we need to auto-generate barcode / spare_number
            res = await createCatalogItem(cleanedPayload);
            if (!res.error && res.data) {
                toast.success('Spare Part created successfully!');
                await logMarineAction('spare_part', res.data.id, 'CREATE', { name: cleanedPayload.name }, profile?.id, profile?.company_id);

                // Auto-provision Google Drive folder structure right after creation
                const accessToken = getStoredToken();
                if (accessToken && res.data.spare_number) {
                    try {
                        const driveResult = await provisionSparepartFolderStructure(
                            accessToken,
                            String(res.data.spare_number),
                            cleanedPayload.name
                        );
                        await supabase.from('catalog_items').update({
                            gdrive_folder_id:            driveResult.folderId,
                            gdrive_photos_folder_id:     driveResult.photosFolderId,
                            gdrive_datasheets_folder_id: driveResult.datasheetsFolderId
                        }).eq('id', res.data.id);
                        toast.success('\uD83D\uDCC2 Drive folders created automatically!');
                        navigate(`/catalog/${res.data.id}`);
                    } catch (driveErr) {
                        console.error('Auto Drive provision failed:', driveErr.message);
                        toast.error('Spare saved but Drive folders failed — please connect Drive.');
                        navigate(`/catalog/${res.data.id}`);
                    }
                } else {
                    // Drive not connected — save spare, then show the connect modal
                    setSaving(false);
                    setPendingSaveId(res.data.id);
                    setShowDriveModal(true);
                    return; // Don't navigate yet — wait for Drive connection
                }
            } else {
                toast.error('Failed to create part: ' + (res.error?.message || 'Unknown error'));
            }
        } else {
            res = await updateCatalogItem(id, cleanedPayload);
            if (!res.error) {
                toast.success('Spare Part updated successfully!');
                await logMarineAction('spare_part', id, 'UPDATE', { name: cleanedPayload.name }, profile?.id, profile?.company_id);
                fetchItemData();
            } else {
                toast.error('Failed to update part');
            }
        }
        setSaving(false);
    };

    // ==== Google Drive Folder Provisioning ====
    const getDriveRootId = async () => {
        try {
            const { data: settings } = await supabase.from('document_settings').select('*').maybeSingle();
            return settings?.gdrive_celron_root_id || settings?.google_drive_folder_id || null;
        } catch (e) {
            console.error("Failed to load document settings:", e);
            return null;
        }
    };

    const handleProvisionDriveFolder = async () => {
        if (!formData.spare_number || !formData.name) {
            return toast.error('Save the spare part first to generate a spare number.');
        }
        const accessToken = localStorage.getItem('google_access_token');
        if (!accessToken) return toast.error('Connect Google Drive first (top-right Google button).');

        setProvisioningDrive(true);
        try {
            const rootId = await getDriveRootId();
            const result = await provisionSparepartFolderStructure(
                accessToken,
                String(formData.spare_number),
                formData.name,
                rootId
            );
            // Persist folder IDs into catalog_items
            await supabase.from('catalog_items').update({
                gdrive_folder_id:           result.folderId,
                gdrive_photos_folder_id:    result.photosFolderId,
                gdrive_datasheets_folder_id: result.datasheetsFolderId
            }).eq('id', id);

            setDriveFolder(result);
            toast.success('Google Drive folders created successfully!');
        } catch (err) {
            console.error('Drive provision error:', err);
            toast.error('Failed to create Drive folders: ' + err.message);
        } finally {
            setProvisioningDrive(false);
        }
    };

    const ensurePhotosFolder = async () => {
        if (driveFolder?.photosFolderId) return driveFolder.photosFolderId;
        
        const accessToken = localStorage.getItem('google_access_token');
        if (!accessToken) {
            toast.error('Please connect Google Drive first (using the top-right Google icon).');
            return null;
        }

        if (!formData.spare_number || !formData.name) {
            toast.error('Please fill in Name and save the spare part first.');
            return null;
        }

        setProvisioningDrive(true);
        const loadToast = toast.loading('Provisioning Google Drive project folder structure...');
        try {
            const rootId = await getDriveRootId();
            const result = await provisionSparepartFolderStructure(
                accessToken,
                String(formData.spare_number),
                formData.name,
                rootId
            );
            await supabase.from('catalog_items').update({
                gdrive_folder_id:           result.folderId,
                gdrive_photos_folder_id:    result.photosFolderId,
                gdrive_datasheets_folder_id: result.datasheetsFolderId
            }).eq('id', id);

            setDriveFolder(result);
            toast.dismiss(loadToast);
            toast.success('Google Drive folders provisioned!');
            return result.photosFolderId;
        } catch (err) {
            toast.dismiss(loadToast);
            console.error('Drive provision error:', err);
            toast.error('Failed to create Drive folders: ' + err.message);
            return null;
        } finally {
            setProvisioningDrive(false);
        }
    };

    const ensureDocumentsFolder = async () => {
        if (driveFolder?.datasheetsFolderId) return driveFolder.datasheetsFolderId;
        
        const accessToken = localStorage.getItem('google_access_token');
        if (!accessToken) {
            toast.error('Please connect Google Drive first (using the top-right Google icon).');
            return null;
        }

        if (!formData.spare_number || !formData.name) {
            toast.error('Please fill in Name and save the spare part first.');
            return null;
        }

        setProvisioningDrive(true);
        const loadToast = toast.loading('Provisioning Google Drive project folder structure...');
        try {
            const rootId = await getDriveRootId();
            const result = await provisionSparepartFolderStructure(
                accessToken,
                String(formData.spare_number),
                formData.name,
                rootId
            );
            await supabase.from('catalog_items').update({
                gdrive_folder_id:           result.folderId,
                gdrive_photos_folder_id:    result.photosFolderId,
                gdrive_datasheets_folder_id: result.datasheetsFolderId
            }).eq('id', id);

            setDriveFolder(result);
            toast.dismiss(loadToast);
            toast.success('Google Drive folders provisioned!');
            return result.datasheetsFolderId;
        } catch (err) {
            toast.dismiss(loadToast);
            console.error('Drive provision error:', err);
            toast.error('Failed to create Drive folders: ' + err.message);
            return null;
        } finally {
            setProvisioningDrive(false);
        }
    };

    const handleConnectGoogle = () => {
        sessionStorage.setItem('google_auth_return_url', window.location.pathname + window.location.search);
        connectGoogleAPI('catalog_spare_edit');
    };

    // Upload file directly to Drive Datasheets_Manuals subfolder
    const handleDriveDocUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !driveFolder?.datasheetsFolderId) return;
        const accessToken = localStorage.getItem('google_access_token');
        if (!accessToken) return toast.error('Connect Google Drive first.');

        setUploadingDriveDoc(true);
        try {
            const uploaded = await uploadFileToDrive(accessToken, file, { folderId: driveFolder.datasheetsFolderId });
            // Also record in marine_documents table
            const payload = {
                entity_type: 'spare_part',
                entity_id: id,
                name: file.name,
                file_url: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
                document_type: 'Datasheet',
                company_id: profile?.company_id
            };
            await createMarineDocument(payload);
            toast.success(`"${file.name}" uploaded to Drive & linked!`);
            fetchItemData();
            fetchDriveFiles();
        } catch (err) {
            toast.error('Upload failed: ' + err.message);
        } finally {
            setUploadingDriveDoc(false);
            if (docFileInputRef.current) docFileInputRef.current.value = '';
        }
    };

    // Upload photo directly to Drive Photos_Media subfolder
    const handleDrivePhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !driveFolder?.photosFolderId) return;
        const accessToken = localStorage.getItem('google_access_token');
        if (!accessToken) return toast.error('Connect Google Drive first.');

        setUploadingDrivePhoto(true);
        try {
            const uploaded = await uploadFileToDrive(accessToken, file, { folderId: driveFolder.photosFolderId });
            const webViewLink = uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`;
            // Record in marine_photos table
            const payload = {
                entity_type: 'spare_part',
                entity_id: id,
                url: `https://lh3.googleusercontent.com/d/${uploaded.id}=w800`,
                company_id: profile?.company_id
            };
            await createMarinePhoto(payload);
            toast.success(`"${file.name}" uploaded to Drive & linked!`);
            fetchItemData();
            fetchDriveFiles();
        } catch (err) {
            toast.error('Upload failed: ' + err.message);
        } finally {
            setUploadingDrivePhoto(false);
            if (photoFileInputRef.current) photoFileInputRef.current.value = '';
        }
    };

    // Sub-modules actions
    // Add Document
    const handleAddDocument = async (e) => {
        e.preventDefault();
        if (!docInput.name || !docInput.url) return toast.error('Name and URL are required');
        setUploadingDoc(true);

        const payload = {
            entity_type: 'spare_part',
            entity_id: id,
            name: docInput.name,
            file_url: docInput.url,
            document_type: docInput.type,
            company_id: profile?.company_id
        };

        const { error } = await createMarineDocument(payload);
        if (!error) {
            toast.success('Document linked successfully');
            setDocInput({ name: '', type: 'Datasheet', url: '' });
            fetchItemData();
        } else {
            toast.error('Failed to link document');
        }
        setUploadingDoc(false);
    };

    const handleDeleteDocument = async (docId) => {
        if (window.confirm('Delete this document link?')) {
            const { error } = await deleteMarineDocument(docId);
            if (!error) {
                toast.success('Document deleted');
                fetchItemData();
            }
        }
    };

    // Add Photo
    const handleAddPhoto = async (e) => {
        e.preventDefault();
        if (!photoUrlInput) return;

        const payload = {
            entity_type: 'spare_part',
            entity_id: id,
            url: photoUrlInput,
            company_id: profile?.company_id
        };

        const { error } = await createMarinePhoto(payload);
        if (!error) {
            toast.success('Photo added to gallery');
            setPhotoUrlInput('');
            fetchItemData();
        }
    };

    const handleDeletePhoto = async (photoId) => {
        if (window.confirm('Delete this photo?')) {
            const { error } = await deleteMarinePhoto(photoId);
            if (!error) {
                toast.success('Photo removed');
                fetchItemData();
            }
        }
    };

    // Add Compatibility
    const handleAddCompatibility = async (e) => {
        e.preventDefault();
        if (!compatInput.system_id && !compatInput.model_id) {
            return toast.error('Select at least one System or Model');
        }

        const payload = {
            spare_part_id: id,
            compatible_system_id: compatInput.system_id || null,
            compatible_model_id: compatInput.model_id || null,
            company_id: profile?.company_id
        };

        const { error } = await createCompatibilityMapping(payload);
        if (!error) {
            toast.success('Compatibility added');
            setCompatInput({ system_id: '', model_id: '' });
            fetchItemData();
        } else {
            toast.error('Mapping failed');
        }
    };

    const handleDeleteCompat = async (compatId) => {
        if (window.confirm('Delete this compatibility link?')) {
            const { error } = await deleteCompatibilityMapping(compatId);
            if (!error) {
                toast.success('Compatibility deleted');
                fetchItemData();
            }
        }
    };

    // Add Notes
    const handleAddNote = async (e) => {
        e.preventDefault();
        if (!noteInput) return;

        const payload = {
            entity_type: 'spare_part',
            entity_id: id,
            content: noteInput,
            author: profile?.name || 'User',
            company_id: profile?.company_id
        };

        const { error } = await createMarineNote(payload);
        if (!error) {
            toast.success('Note added');
            setNoteInput('');
            fetchItemData();
        }
    };

    // Purchase Handlers
    const openNewPurchaseModal = () => {
        setPurchaseFormData({
            supplier_id: '',
            purchase_date: new Date().toISOString().split('T')[0],
            last_purchase_price: '',
            quantity: '',
            pic: profile?.name || '',
            remarks: '',
            bill_url: ''
        });
        setEditingPurchaseId(null);
        setShowPurchaseModal(true);
    };

    const openEditPurchaseModal = (purchase) => {
        setPurchaseFormData({
            supplier_id: purchase.supplier_id || '',
            purchase_date: purchase.purchase_date || '',
            last_purchase_price: purchase.last_purchase_price || '',
            quantity: purchase.quantity || '',
            pic: purchase.pic || '',
            remarks: purchase.remarks || '',
            bill_url: purchase.bill_url || ''
        });
        setEditingPurchaseId(purchase.id);
        setShowPurchaseModal(true);
    };

    const handleSavePurchase = async (e) => {
        e.preventDefault();
        const payload = {
            supplier_id: purchaseFormData.supplier_id,
            purchase_date: purchaseFormData.purchase_date,
            last_purchase_price: parseFloat(purchaseFormData.last_purchase_price) || 0,
            quantity: parseInt(purchaseFormData.quantity) || 0,
            pic: purchaseFormData.pic,
            remarks: purchaseFormData.remarks,
            bill_url: purchaseFormData.bill_url,
            item_id: id,
            company_id: profile?.company_id
        };

        let err;
        if (editingPurchaseId) {
            const res = await updatePurchaseHistory(editingPurchaseId, payload);
            err = res.error;
        } else {
            const res = await createPurchaseHistory(payload);
            err = res.error;
        }

        if (!err) {
            toast.success('Purchase history updated');
            setShowPurchaseModal(false);
            fetchItemData();
        } else {
            toast.error('Failed to save purchase history');
        }
    };

    const handleDeletePurchaseRecord = async (pId) => {
        if (window.confirm('Delete this purchase record?')) {
            const { error } = await deletePurchaseHistory(pId);
            if (!error) {
                toast.success('Purchase record deleted');
                fetchItemData();
            }
        }
    };

    if (loading) {
        return <div style={{ padding: '60px', textAlign: 'center' }}><RefreshCw className="animate-spin" size={32} style={{ margin: '0 auto' }} /></div>;
    }

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
            {/* Header */}
            <div className="page-header" style={{
                background: 'linear-gradient(135deg, rgba(26, 60, 99, 0.08) 0%, rgba(59, 130, 246, 0.04) 100%)',
                padding: '24px 32px',
                borderRadius: '20px',
                border: '1px solid rgba(226, 232, 240, 0.8)',
                marginBottom: '32px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className="btn btn-secondary" style={{ padding: '8px', borderRadius: '50%', minWidth: 'auto', width: '42px', height: '42px' }} onClick={() => navigate('/catalog')}>
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="page-title" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>
                            {isNewItem ? 'Create Spare Part / Service' : `Spare Part: ${formData.name}`}
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '0.88rem', marginTop: '4px' }}>
                            {!isNewItem ? `Spare Number: #${formData.spare_number || 'N/A'}` : 'Configure and register a new spare part'}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-secondary" onClick={() => navigate('/catalog')}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave} style={{ background: '#1a3c63', borderColor: '#1a3c63' }}>
                        <Save size={16} /> Save Changes
                    </button>
                </div>
            </div>

            {/* 10 Tab buttons */}
            <div style={{ borderBottom: '1px solid #cbd5e1', marginBottom: '24px', overflowX: 'auto', whiteSpace: 'nowrap' }} className="hide-on-print">
                <div style={{ display: 'flex', gap: '2px' }}>
                    {[
                        { id: 'overview', label: 'Overview', icon: <Info size={16} /> },
                        { id: 'inventory', label: 'Inventory & Warehousing', icon: <Database size={16} /> },
                        { id: 'documents', label: 'Documents & Certificates', icon: <FileText size={16} /> },
                        { id: 'photos', label: 'Photos', icon: <ImageIcon size={16} /> },
                        { id: 'compatibility', label: 'Compatible Models', icon: <Ship size={16} /> },
                        { id: 'purchase_history', label: 'Purchase History', icon: <History size={16} /> },
                        { id: 'sales_history', label: 'Sales Transactions', icon: <ShoppingBag size={16} /> },
                        { id: 'maintenance', label: 'Maintenance Tasks', icon: <Wrench size={16} /> },
                        { id: 'audit_logs', label: 'Audit Trail', icon: <FileCheck size={16} /> }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            style={{
                                padding: '12px 20px',
                                background: activeTab === tab.id ? '#ffffff' : 'transparent',
                                border: '1px solid',
                                borderColor: activeTab === tab.id ? '#cbd5e1 #cbd5e1 transparent' : 'transparent',
                                borderRadius: '8px 8px 0 0',
                                fontWeight: 700,
                                fontSize: '0.88rem',
                                color: activeTab === tab.id ? '#1a3c63' : '#64748b',
                                marginBottom: '-1px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab content */}
            {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px' }}>
                    {/* General info form */}
                    <div className="glass-panel" style={{ padding: '32px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ margin: '0 0 24px', fontSize: '1.15rem', fontWeight: 800, color: '#1a3c63' }}>General Specifications</h3>
                        <div className="grid-2">
                            <div className="form-group">
                                <label className="form-label">Part Name *</label>
                                <input type="text" className="form-input" name="name" value={formData.name} onChange={handleInputChange} required />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Type</label>
                                <select className="form-select" name="type" value={formData.type} onChange={handleInputChange}>
                                    <option value="Supply Part">Supply Part</option>
                                    <option value="Service">Service</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Commercial Brand</label>
                                <input type="text" className="form-input" name="brand" value={formData.brand} onChange={handleInputChange} placeholder="e.g. Bosch, Genuine Wärtsilä" />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Original Maker (Make)</label>
                                <select className="form-select" name="maker_id" value={formData.maker_id} onChange={handleDropdownChange}>
                                    <option value="">Select Maker...</option>
                                    <option value="add_new" style={{ fontWeight: 'bold', color: 'var(--accent)' }}>+ New Maker...</option>
                                    {makers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Model</label>
                                <select className="form-select" name="model_id" value={formData.model_id} onChange={handleDropdownChange}>
                                    <option value="">Select Model...</option>
                                    <option value="add_new" style={{ fontWeight: 'bold', color: 'var(--accent)' }}>+ New Model...</option>
                                    {models.filter(m => !formData.maker_id || m.maker_id === formData.maker_id).map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Assembly</label>
                                <select className="form-select" name="assembly_id" value={formData.assembly_id} onChange={handleDropdownChange}>
                                    <option value="">Select Assembly...</option>
                                    <option value="add_new" style={{ fontWeight: 'bold', color: 'var(--accent)' }}>+ New Assembly...</option>
                                    {assemblies.filter(a => !formData.model_id || a.model_id === formData.model_id).map(a => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                <label className="form-label">Machinery System Association</label>
                                <select className="form-select" name="system_id" value={formData.system_id} onChange={handleDropdownChange}>
                                    <option value="">Select Machinery System...</option>
                                    <option value="add_new" style={{ fontWeight: 'bold', color: 'var(--accent)' }}>+ New Machinery System...</option>
                                    {systems.map(s => <option key={s.id} value={s.id}>{s.name} ({s.system_no})</option>)}
                                </select>
                            </div>

                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                <label className="form-label">Specification Description</label>
                                <textarea className="form-textarea" name="specification" value={formData.specification} onChange={handleInputChange} rows="3" placeholder="Technical specifications..." />
                            </div>

                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                <label className="form-label">Detailed Notes / Manual Context</label>
                                <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                                    <ReactQuill theme="snow" value={formData.details} onChange={handleQuillChange} style={{ height: '220px' }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Barcode & Status Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {/* Barcode Display (QR code and Barcode) */}
                        <div className="glass-panel" style={{ padding: '24px', borderRadius: '18px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                            <h4 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 800 }}>Auto-Generated Identifiers</h4>
                            {formData.barcode ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                                    <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                                        <Barcode value={formData.barcode} width={1.5} height={50} fontSize={12} />
                                    </div>
                                    <div style={{ borderTop: '1px solid #f1f5f9', width: '100%', paddingTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <QRCodeSVG value={formData.barcode} size={90} />
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '8px', fontWeight: 600 }}>Value: {formData.barcode}</div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ padding: '20px', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>Auto-generated upon save</div>
                            )}
                        </div>

                        {/* Status Card */}
                        <div className="glass-panel" style={{ padding: '24px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                            <h4 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 800 }}>Product Lifecycle</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div>
                                    <label className="form-label" style={{ fontSize: '0.78rem' }}>Lifecycle Status</label>
                                    <select className="form-select" name="status" value={formData.status} onChange={handleInputChange}>
                                        <option value="Active">Active / In Service</option>
                                        <option value="Critical">Critical Spares</option>
                                        <option value="Obsolete">Obsolete Part</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="form-label" style={{ fontSize: '0.78rem' }}>UOM (Unit of Measure)</label>
                                    <select className="form-select" name="uom" value={formData.uom} onChange={handleDropdownChange}>
                                        <option value="add_new" style={{ fontWeight: 'bold', color: 'var(--accent)' }}>+ New UOM...</option>
                                        {units.map(u => <option key={u.id} value={u.symbol}>{u.name} ({u.symbol})</option>)}
                                        <option value="Pc(s).">Pieces (Pcs)</option>
                                        <option value="Set(s)">Sets (Set)</option>
                                        <option value="Box(es)">Boxes (Box)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Photos_Media Quick Gallery */}
                        {!isNewItem && (
                            <div className="glass-panel" style={{ padding: '24px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Photos & Media</h4>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        {driveFolder?.photosWebViewLink && (
                                            <a
                                                href={driveFolder.photosWebViewLink}
                                                target="_blank" rel="noopener noreferrer"
                                                title="Open Photos_Media in Google Drive"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '5px 10px', borderRadius: '8px', fontWeight: 700, fontSize: '0.75rem', textDecoration: 'none' }}
                                            >
                                                <FolderOpen size={13} /> Drive
                                            </a>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('photos')}
                                            style={{ background: 'none', border: 'none', color: '#1a3c63', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', padding: '5px 8px' }}
                                        >
                                            View All →
                                        </button>
                                    </div>
                                </div>

                                {photos.length > 0 ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                                        {photos.slice(0, 4).map(p => (
                                            <div key={p.id} style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #e2e8f0', aspectRatio: '1', background: '#f8fafc' }}>
                                                <img
                                                    src={p.url}
                                                    alt="Part photo"
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                                    onError={e => { e.target.style.display = 'none'; }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                        <div style={{ marginBottom: '10px' }}>
                                            <input
                                                ref={photoFileInputRef}
                                                type="file"
                                                style={{ display: 'none' }}
                                                onChange={handleDrivePhotoUpload}
                                                accept="image/*"
                                            />
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    const folderId = await ensurePhotosFolder();
                                                    if (folderId) photoFileInputRef.current?.click();
                                                }}
                                                disabled={uploadingDrivePhoto}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#7c3aed', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '0.8rem', cursor: uploadingDrivePhoto ? 'not-allowed' : 'pointer' }}
                                            >
                                                {uploadingDrivePhoto ? <Loader size={14} className="animate-spin" /> : <Camera size={14} />}
                                                {uploadingDrivePhoto ? 'Uploading…' : 'Upload Photo'}
                                            </button>
                                        </div>
                                        <p style={{ color: '#94a3b8', fontSize: '0.78rem', margin: 0 }}>No photos yet</p>
                                    </div>
                                )}

                                {photos.length > 4 && (
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('photos')}
                                        style={{ width: '100%', marginTop: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', fontWeight: 700, fontSize: '0.78rem', color: '#64748b', cursor: 'pointer' }}
                                    >
                                        +{photos.length - 4} more photos
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'inventory' && (
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: '0 0 24px', fontSize: '1.15rem', fontWeight: 800, color: '#1a3c63' }}>Inventory & Logistics Specifications</h3>
                    <div className="grid-2">
                        <div className="form-group">
                            <label className="form-label">Current Stock Quantity</label>
                            <input type="number" className="form-input" name="quantity" value={formData.quantity} onChange={handleInputChange} />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Minimum Stock Alert Threshold</label>
                            <input type="number" className="form-input" name="min_stock" value={formData.min_stock} onChange={handleInputChange} />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Maximum Stock Capacity</label>
                            <input type="number" className="form-input" name="max_stock" value={formData.max_stock} onChange={handleInputChange} />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Warehouse Facility</label>
                            <select className="form-select" name="warehouse_id" value={formData.warehouse_id} onChange={handleDropdownChange}>
                                <option value="">Select Warehouse...</option>
                                <option value="add_new" style={{ fontWeight: 'bold', color: 'var(--accent)' }}>+ New Warehouse...</option>
                                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} ({w.location})</option>)}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Shelf / Bin Location</label>
                            <input type="text" className="form-input" name="stored_location" value={formData.stored_location} onChange={handleInputChange} placeholder="e.g. Shelf A3, Row 2" />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Lead Time from Supplier</label>
                            <input type="text" className="form-input" name="lead_time" value={formData.lead_time} onChange={handleInputChange} placeholder="e.g. 14 Days, 4 Weeks" />
                        </div>

                        <div className="form-group">
                            <label className="form-label">OEM Part Number</label>
                            <input type="text" className="form-input" name="oem_part_no" value={formData.oem_part_no} onChange={handleInputChange} placeholder="e.g. OEM-998877" />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Manufacturer Part Number</label>
                            <input type="text" className="form-input" name="manufacturer_part_no" value={formData.manufacturer_part_no} onChange={handleInputChange} placeholder="e.g. MFR-223344" />
                        </div>

                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="form-label">Alternative / Cross-Reference Part Numbers</label>
                            <input type="text" className="form-input" name="alternative_part_numbers" value={formData.alternative_part_numbers} onChange={handleInputChange} placeholder="e.g. ALT-554433, ALT-990088" />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Purchase Price</label>
                            <input type="number" step="0.01" className="form-input" name="purchase_price" value={formData.purchase_price} onChange={handleInputChange} />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Selling Price</label>
                            <input type="number" step="0.01" className="form-input" name="selling_price" value={formData.selling_price} onChange={handleInputChange} />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Weight (kg)</label>
                            <input type="number" step="0.01" className="form-input" name="weight" value={formData.weight} onChange={handleInputChange} />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Dimensions (L x W x H mm)</label>
                            <input type="text" className="form-input" name="dimensions" value={formData.dimensions} onChange={handleInputChange} placeholder="e.g. 200x150x80" />
                        </div>

                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="form-label">Warranty Context</label>
                            <input type="text" className="form-input" name="warranty" value={formData.warranty} onChange={handleInputChange} placeholder="e.g. 12 Months original maker warranty" />
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'documents' && (
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#1a3c63' }}>Datasheets & Manuals</h3>
                            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Upload files to Google Drive or link machinery manuals, certificates, and wiring diagrams</p>
                        </div>
                        {!isNewItem && (
                            driveFolder?.datasheetsFolderId ? (
                                <a
                                    href={driveFolder.datasheetsWebViewLink}
                                    target="_blank" rel="noopener noreferrer"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '8px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none' }}
                                >
                                    <FolderOpen size={16} /> Open Datasheets_Manuals in Drive
                                </a>
                            ) : (
                                <button
                                    onClick={handleProvisionDriveFolder}
                                    disabled={provisioningDrive}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#1a3c63', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: provisioningDrive ? 'not-allowed' : 'pointer', opacity: provisioningDrive ? 0.7 : 1 }}
                                >
                                    {provisioningDrive ? <Loader size={16} className="animate-spin" /> : <Cloud size={16} />}
                                    {provisioningDrive ? 'Creating Drive Folders…' : 'Create Drive Folder'}
                                </button>
                            )
                        )}
                    </div>

                    {/* Drive upload panel */}
                    <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)', border: '1px solid #bfdbfe', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: '#1a3c63', borderRadius: '10px', padding: '10px', display: 'flex' }}>
                                    <UploadCloud size={20} color="#fff" />
                                </div>
                                <div>
                                    <p style={{ margin: 0, fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>Upload to Google Drive</p>
                                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.78rem' }}>Files go to <strong>Datasheets_Manuals</strong> folder</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                {!getStoredToken() && (
                                    <button
                                        type="button"
                                        onClick={handleConnectGoogle}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#fee2e2', border: '1px solid #ef4444', color: '#ef4444', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                                    >
                                        <Globe size={16} /> Reconnect Drive
                                    </button>
                                )}
                                <input
                                    ref={docFileInputRef}
                                    type="file"
                                    style={{ display: 'none' }}
                                    onChange={handleDriveDocUpload}
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg"
                                />
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const folderId = await ensureDocumentsFolder();
                                        if (folderId) docFileInputRef.current?.click();
                                    }}
                                    disabled={uploadingDriveDoc}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#1a3c63', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: uploadingDriveDoc ? 'not-allowed' : 'pointer', opacity: uploadingDriveDoc ? 0.7 : 1 }}
                                >
                                    {uploadingDriveDoc ? <Loader size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                                    {uploadingDriveDoc ? 'Uploading…' : 'Upload File'}
                                </button>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        setQrModal({ isOpen: true, folderId: null, folderName: 'Datasheets & Manuals' });
                                        const folderId = await ensureDocumentsFolder();
                                        if (folderId) {
                                            setQrModal({ isOpen: true, folderId, folderName: 'Datasheets & Manuals' });
                                        } else {
                                            setQrModal({ isOpen: false, folderId: null, folderName: '' });
                                        }
                                    }}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #1a3c63', color: '#1a3c63', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                                >
                                    <QrCode size={16} /> Scan with Mobile
                                </button>
                            </div>
                        </div>

                        {/* Direct File Drop Holder */}
                        <div 
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.currentTarget.style.borderColor = '#1a3c63';
                                e.currentTarget.style.background = '#eff6ff';
                            }}
                            onDragLeave={(e) => {
                                e.preventDefault();
                                e.currentTarget.style.borderColor = '#cbd5e1';
                                e.currentTarget.style.background = '#fff';
                            }}
                            onDrop={async (e) => {
                                e.preventDefault();
                                e.currentTarget.style.borderColor = '#cbd5e1';
                                e.currentTarget.style.background = '#fff';
                                
                                const file = e.dataTransfer.files?.[0];
                                if (!file) return;
                                
                                const folderId = await ensureDocumentsFolder();
                                if (folderId) {
                                    setUploadingDriveDoc(true);
                                    try {
                                        const accessToken = localStorage.getItem('google_access_token');
                                        const uploaded = await uploadFileToDrive(accessToken, file, { folderId });
                                        const payload = {
                                            entity_type: 'spare_part',
                                            entity_id: id,
                                            name: file.name,
                                            file_url: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
                                            document_type: 'Datasheet',
                                            company_id: profile?.company_id
                                        };
                                        await createMarineDocument(payload);
                                        toast.success(`"${file.name}" uploaded to Drive & linked!`);
                                        fetchItemData();
                                        fetchDriveFiles();
                                    } catch (err) {
                                        toast.error('Upload failed: ' + err.message);
                                    } finally {
                                        setUploadingDriveDoc(false);
                                    }
                                }
                            }}
                            style={{ border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '32px', textAlign: 'center', background: '#fff', transition: 'all 0.2s', cursor: 'pointer' }}
                        >
                            <UploadCloud size={36} color="#94a3b8" style={{ marginBottom: '12px', display: 'inline-block' }} />
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#334155' }}>Drag & Drop Files Here</div>
                            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px' }}>Or click/drop here to select from your computer</div>
                        </div>
                    </div>

                    <form onSubmit={handleAddDocument} style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                        <p style={{ margin: '0 0 12px', fontSize: '0.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Or link by URL</p>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div className="form-group" style={{ flex: 2, minWidth: '200px', marginBottom: 0 }}>
                                <label className="form-label" style={{ fontSize: '0.78rem' }}>Document Name / Label *</label>
                                <input type="text" className="form-input" value={docInput.name} onChange={e => setDocInput(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. Wärtsilä Injector Test Certificate" required />
                            </div>

                            <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                                <label className="form-label" style={{ fontSize: '0.78rem' }}>Category</label>
                                <select className="form-select" value={docInput.type} onChange={e => setDocInput(prev => ({ ...prev, type: e.target.value }))}>
                                    <option value="Datasheet">Datasheet</option>
                                    <option value="Manual">Manual</option>
                                    <option value="Wiring Diagram">Wiring Diagram</option>
                                    <option value="Certificate">Certificate</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>

                            <div className="form-group" style={{ flex: 2, minWidth: '250px', marginBottom: 0 }}>
                                <label className="form-label" style={{ fontSize: '0.78rem' }}>URL / File Link *</label>
                                <input type="url" className="form-input" value={docInput.url} onChange={e => setDocInput(prev => ({ ...prev, url: e.target.value }))} placeholder="e.g. https://google-drive-link-here.com" required />
                            </div>

                            <button type="submit" className="btn btn-primary" style={{ padding: '10px 24px', background: '#1a3c63', borderColor: '#1a3c63' }} disabled={uploadingDoc}>
                                Add Document
                            </button>
                        </div>
                    </form>

                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Category</th>
                                    <th>Document Label</th>
                                    <th>URL / Target Link</th>
                                    <th>Linked Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documents.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontStyle: 'italic' }}>No documents linked to this item yet.</td>
                                    </tr>
                                ) : (
                                    documents.map(doc => (
                                        <tr key={doc.id}>
                                            <td>
                                                <span style={{ fontSize: '0.75rem', background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                                    {doc.document_type}
                                                </span>
                                            </td>
                                            <td style={{ fontWeight: 600 }}>{doc.name}</td>
                                            <td>
                                                <a href={doc.file_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)', fontWeight: 600 }}>
                                                    <ExternalLink size={14} /> Open Document
                                                </a>
                                            </td>
                                            <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                                            <td>
                                                <button className="btn btn-danger btn-sm" style={{ padding: '6px', background: '#fef2f2', color: '#ef4444', borderColor: '#fee2e2' }} onClick={() => handleDeleteDocument(doc.id)}>
                                                    <Trash2 size={12} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'photos' && (
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#1a3c63' }}>Gallery & Photos</h3>
                            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Upload photos to Google Drive or link photos of physical parts or assembly blueprints</p>
                        </div>
                        {!isNewItem && (
                            driveFolder?.photosFolderId ? (
                                <a
                                    href={driveFolder.photosWebViewLink}
                                    target="_blank" rel="noopener noreferrer"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '8px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none' }}
                                >
                                    <FolderOpen size={16} /> Open Photos_Media in Drive
                                </a>
                            ) : (
                                <button
                                    onClick={handleProvisionDriveFolder}
                                    disabled={provisioningDrive}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#1a3c63', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: provisioningDrive ? 'not-allowed' : 'pointer', opacity: provisioningDrive ? 0.7 : 1 }}
                                >
                                    {provisioningDrive ? <Loader size={16} className="animate-spin" /> : <Cloud size={16} />}
                                    {provisioningDrive ? 'Creating Drive Folders…' : 'Create Drive Folder'}
                                </button>
                            )
                        )}
                    </div>

                    {/* Drive upload panel for photos */}
                    <div style={{ background: 'linear-gradient(135deg, #fdf4ff 0%, #eff6ff 100%)', border: '1px solid #e9d5ff', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: '#7c3aed', borderRadius: '10px', padding: '10px', display: 'flex' }}>
                                    <Camera size={20} color="#fff" />
                                </div>
                                <div>
                                    <p style={{ margin: 0, fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>Upload to Google Drive</p>
                                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.78rem' }}>Photos go to <strong>Photos_Media</strong> folder</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                {!getStoredToken() && (
                                    <button
                                        type="button"
                                        onClick={handleConnectGoogle}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#fee2e2', border: '1px solid #ef4444', color: '#ef4444', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                                    >
                                        <Globe size={16} /> Reconnect Drive
                                    </button>
                                )}
                                <input
                                    ref={photoFileInputRef}
                                    type="file"
                                    style={{ display: 'none' }}
                                    onChange={handleDrivePhotoUpload}
                                    accept="image/*"
                                />
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const folderId = await ensurePhotosFolder();
                                        if (folderId) photoFileInputRef.current?.click();
                                    }}
                                    disabled={uploadingDrivePhoto}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#7c3aed', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: uploadingDrivePhoto ? 'not-allowed' : 'pointer', opacity: uploadingDrivePhoto ? 0.7 : 1 }}
                                >
                                    {uploadingDrivePhoto ? <Loader size={16} className="animate-spin" /> : <Camera size={16} />}
                                    {uploadingDrivePhoto ? 'Uploading…' : 'Upload Photo'}
                                </button>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        setQrModal({ isOpen: true, folderId: null, folderName: 'Photos & Gallery' });
                                        const folderId = await ensurePhotosFolder();
                                        if (folderId) {
                                            setQrModal({ isOpen: true, folderId, folderName: 'Photos & Gallery' });
                                        } else {
                                            setQrModal({ isOpen: false, folderId: null, folderName: '' });
                                        }
                                    }}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #7c3aed', color: '#7c3aed', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                                >
                                    <QrCode size={16} /> Scan with Mobile
                                </button>
                            </div>
                        </div>

                        {/* Direct Image Drop Holder */}
                        <div 
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.currentTarget.style.borderColor = '#7c3aed';
                                e.currentTarget.style.background = '#f5f3ff';
                            }}
                            onDragLeave={(e) => {
                                e.preventDefault();
                                e.currentTarget.style.borderColor = '#cbd5e1';
                                e.currentTarget.style.background = '#fff';
                            }}
                            onDrop={async (e) => {
                                e.preventDefault();
                                e.currentTarget.style.borderColor = '#cbd5e1';
                                e.currentTarget.style.background = '#fff';
                                
                                const file = e.dataTransfer.files?.[0];
                                if (!file) return;
                                if (!file.type.startsWith('image/')) {
                                    return toast.error('Only image files are allowed in this gallery drop zone.');
                                }
                                
                                const folderId = await ensurePhotosFolder();
                                if (folderId) {
                                    setUploadingDrivePhoto(true);
                                    try {
                                        const accessToken = localStorage.getItem('google_access_token');
                                        const uploaded = await uploadFileToDrive(accessToken, file, { folderId });
                                        const payload = {
                                            entity_type: 'spare_part',
                                            entity_id: id,
                                            url: `https://lh3.googleusercontent.com/d/${uploaded.id}=w800`,
                                            company_id: profile?.company_id
                                        };
                                        await createMarinePhoto(payload);
                                        toast.success(`"${file.name}" uploaded to Drive & linked!`);
                                        fetchItemData();
                                        fetchDriveFiles();
                                    } catch (err) {
                                        toast.error('Upload failed: ' + err.message);
                                    } finally {
                                        setUploadingDrivePhoto(false);
                                    }
                                }
                            }}
                            style={{ border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '32px', textAlign: 'center', background: '#fff', transition: 'all 0.2s', cursor: 'pointer' }}
                            onClick={async () => {
                                const folderId = await ensurePhotosFolder();
                                if (folderId) photoFileInputRef.current?.click();
                            }}
                        >
                            <Camera size={36} color="#94a3b8" style={{ marginBottom: '12px', display: 'inline-block' }} />
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#334155' }}>Drag & Drop Image Here</div>
                            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px' }}>Or click/drop here to select from your computer</div>
                        </div>
                    </div>

                    <form onSubmit={handleAddPhoto} style={{ display: 'flex', gap: '12px', marginBottom: '28px' }}>
                        <input type="url" className="form-input" value={photoUrlInput} onChange={e => setPhotoUrlInput(e.target.value)} placeholder="Or paste a photo URL (e.g. https://.../image.jpg)" style={{ flex: 1 }} />
                        <button type="submit" className="btn btn-primary" style={{ background: '#1a3c63', borderColor: '#1a3c63' }}>Add by URL</button>
                    </form>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                        {photos.map(p => (
                            <div key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: '#fff', position: 'relative' }}>
                                <img src={p.url} alt="Item Gallery" style={{ width: '100%', height: '150px', objectFit: 'cover' }} />
                                <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(p.created_at).toLocaleDateString()}</span>
                                    <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px', background: '#fef2f2', color: '#ef4444', borderColor: '#fee2e2' }} onClick={() => handleDeletePhoto(p.id)}>
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ))}
                        {photos.length === 0 && (
                            <div style={{ gridColumn: '1 / -1', padding: '32px 0', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No photos uploaded.</div>
                        )}
                    </div>

                    {/* Google Drive Live Explorer */}
                    {driveFolder?.folderId && (
                        <div className="glass-panel" style={{ padding: '24px', borderRadius: '18px', border: '1px solid #e2e8f0', marginTop: '32px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1a3c63', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <HardDrive size={18} /> Google Drive Live Folder Explorer
                                    </h4>
                                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.78rem' }}>Real-time synchronization with GDrive project structure</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={fetchDriveFiles}
                                    disabled={loadingDriveFiles}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#475569', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    <RefreshCw size={13} className={loadingDriveFiles ? 'animate-spin' : ''} /> Refresh files
                                </button>
                            </div>

                            {loadingDriveFiles ? (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                                    <Loader size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                                    <span style={{ fontSize: '0.85rem' }}>Loading live files from Google Drive...</span>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {/* Photos Section */}
                                    <div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Camera size={14} /> Photos & Media ({driveFiles.photos.length})
                                        </div>
                                        {driveFiles.photos.length > 0 ? (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                                                {driveFiles.photos.map(file => (
                                                    <a
                                                        key={file.id}
                                                        href={file.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', display: 'block', background: '#fff', position: 'relative', textDecoration: 'none' }}
                                                    >
                                                        <img
                                                            src={file.thumbnail}
                                                            alt={file.name}
                                                            style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block' }}
                                                            onError={(e) => {
                                                                e.target.style.display = 'none';
                                                            }}
                                                        />
                                                        <div style={{ padding: '8px', fontSize: '0.7rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                                                            {file.name}
                                                        </div>
                                                    </a>
                                                ))}
                                            </div>
                                        ) : (
                                            <div style={{ padding: '16px', border: '1px dashed #cbd5e1', borderRadius: '10px', color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center' }}>
                                                No photos found in Drive Photos_Media subfolder.
                                            </div>
                                        )}
                                    </div>

                                    {/* Documents Section */}
                                    <div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <FileText size={14} /> Datasheets & Manuals ({driveFiles.docs.length})
                                        </div>
                                        {driveFiles.docs.length > 0 ? (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                                                {driveFiles.docs.map(file => (
                                                    <a
                                                        key={file.id}
                                                        href={file.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', background: '#fff', textDecoration: 'none', transition: 'border-color 0.2s' }}
                                                        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#1a3c63'}
                                                        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                                                    >
                                                        <div style={{ background: '#fee2e2', borderRadius: '8px', padding: '6px', display: 'flex', color: '#ef4444' }}>
                                                            <FileText size={16} />
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '2px' }}>Open in Google Drive</div>
                                                        </div>
                                                        <ExternalLink size={12} color="#94a3b8" />
                                                    </a>
                                                ))}
                                            </div>
                                        ) : (
                                            <div style={{ padding: '16px', border: '1px dashed #cbd5e1', borderRadius: '10px', color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center' }}>
                                                No files found in Drive Datasheets_Manuals subfolder.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'compatibility' && (
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                    <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#1a3c63' }}>Cross-System & Model Compatibility</h3>
                        <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Define other machinery systems or vessel models this spare part is compatible with</p>
                    </div>

                    <form onSubmit={handleAddCompatibility} style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div className="form-group" style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}>
                                <label className="form-label" style={{ fontSize: '0.78rem' }}>Compatible System</label>
                                <select className="form-select" value={compatInput.system_id} onChange={e => setCompatInput(prev => ({ ...prev, system_id: e.target.value }))}>
                                    <option value="">Select System...</option>
                                    {systems.map(s => <option key={s.id} value={s.id}>{s.name} ({s.system_no})</option>)}
                                </select>
                            </div>

                            <div className="form-group" style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}>
                                <label className="form-label" style={{ fontSize: '0.78rem' }}>Compatible Model</label>
                                <select className="form-select" value={compatInput.model_id} onChange={e => setCompatInput(prev => ({ ...prev, model_id: e.target.value }))}>
                                    <option value="">Select Model...</option>
                                    {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.maker?.name})</option>)}
                                </select>
                            </div>

                            <button type="submit" className="btn btn-primary" style={{ padding: '10px 24px', background: '#1a3c63', borderColor: '#1a3c63' }}>
                                Add Mapping
                            </button>
                        </div>
                    </form>

                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Compatible System</th>
                                    <th>Compatible Model</th>
                                    <th>Maker Reference</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {compatibility.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontStyle: 'italic' }}>No cross-system compatibility registered.</td>
                                    </tr>
                                ) : (
                                    compatibility.map(c => (
                                        <tr key={c.id}>
                                            <td style={{ fontWeight: 600 }}>{c.system ? `${c.system.name} (${c.system.system_no})` : 'Any System'}</td>
                                            <td style={{ fontWeight: 600 }}>{c.model ? `${c.model.name}` : 'Any Model'}</td>
                                            <td>{c.model?.model_no || '-'}</td>
                                            <td>
                                                <button className="btn btn-danger btn-sm" style={{ padding: '6px', background: '#fef2f2', color: '#ef4444', borderColor: '#fee2e2' }} onClick={() => handleDeleteCompat(c.id)}>
                                                    Remove Mapping
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'purchase_history' && (
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#1a3c63' }}>Purchase Records</h3>
                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>Historical supplier purchases and pricing logs</p>
                        </div>
                        <button className="btn btn-primary" style={{ background: '#1a3c63', borderColor: '#1a3c63' }} onClick={openNewPurchaseModal}>
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
                                    <th>Total Value</th>
                                    <th>Remarks</th>
                                    <th>Bill Doc</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {purchaseHistory.length === 0 ? (
                                    <tr>
                                        <td colSpan="9" style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontStyle: 'italic' }}>No purchase logs available.</td>
                                    </tr>
                                ) : (
                                    purchaseHistory.map(p => {
                                        const priceVal = parseFloat(p.last_purchase_price) || 0;
                                        const qtyVal = parseFloat(p.quantity) || 0;
                                        const total = priceVal * qtyVal;
                                        return (
                                            <tr key={p.id}>
                                                <td>{p.purchase_date ? new Date(p.purchase_date).toLocaleDateString() : '-'}</td>
                                                <td style={{ fontWeight: 600 }}>{p.supplier?.name || 'Unknown Supplier'}</td>
                                                <td>{p.pic || '-'}</td>
                                                <td>${priceVal.toFixed(2)}</td>
                                                <td>{qtyVal}</td>
                                                <td style={{ fontWeight: 700 }}>${total.toFixed(2)}</td>
                                                <td>{p.remarks || '-'}</td>
                                                <td>
                                                    {p.bill_url ? (
                                                        <a href={p.bill_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>View Bill</a>
                                                    ) : '-'}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => openEditPurchaseModal(p)}>Edit</button>
                                                        <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px', background: '#fef2f2', color: '#ef4444', borderColor: '#fee2e2' }} onClick={() => handleDeletePurchaseRecord(p.id)}>Delete</button>
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
            )}

            {activeTab === 'sales_history' && (
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                    <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#1a3c63' }}>Sales & Job Dispatch Transactions</h3>
                        <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Track jobs and tax invoices referencing this spare part</p>
                    </div>

                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Document No.</th>
                                    <th>Type</th>
                                    <th>Customer / Vessel</th>
                                    <th>Quantity</th>
                                    <th>Selling Price</th>
                                    <th>Total Revenue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {salesHistory.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontStyle: 'italic' }}>No sales records found in system workflows.</td>
                                    </tr>
                                ) : (
                                    salesHistory.map(sale => {
                                        const doc = sale.workflow_documents;
                                        const total = (parseFloat(sale.price) || 0) * (parseFloat(sale.quantity) || 0);
                                        if (!doc) return null;
                                        return (
                                            <tr key={sale.id}>
                                                <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                                                <td style={{ fontWeight: 800, color: '#1a3c63' }}>{doc.document_no}</td>
                                                <td>
                                                    <span style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                                        {doc.document_type}
                                                    </span>
                                                </td>
                                                <td style={{ fontWeight: 600 }}>{doc.partner?.name || 'Walk-in Client'}</td>
                                                <td>{sale.quantity}</td>
                                                <td>${(parseFloat(sale.price) || 0).toFixed(2)}</td>
                                                <td style={{ fontWeight: 700 }}>${total.toFixed(2)}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'maintenance' && (
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '18px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b' }}>
                    <Wrench size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                    <h3 style={{ fontWeight: 800, color: '#1a3c63' }}>Machinery Maintenance Schedule</h3>
                    <p style={{ fontSize: '0.88rem', maxWidth: '500px', margin: '8px auto 0' }}>
                        Maintenance schedule is managed directly at the **Machinery System level** to orchestrate all associated spare parts and manuals.
                    </p>
                    {formData.system_id ? (
                        <button className="btn btn-primary" style={{ marginTop: '20px', background: '#1a3c63', borderColor: '#1a3c63' }} onClick={() => navigate(`/catalog/system/${formData.system_id}`)}>
                            Go to Associated System Maintenance
                        </button>
                    ) : (
                        <div style={{ marginTop: '16px', fontSize: '0.8rem', fontStyle: 'italic' }}>Please link this Spare Part to a Machinery System on the Overview tab first.</div>
                    )}
                </div>
            )}

            {activeTab === 'audit_logs' && (
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                    <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#1a3c63' }}>Audit History Trail</h3>
                        <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Track modifications, updates, and creation logs for security and validation</p>
                    </div>

                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>Action</th>
                                    <th>User ID / PIC</th>
                                    <th>Details / Fields Changed</th>
                                </tr>
                            </thead>
                            <tbody>
                                {auditLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontStyle: 'italic' }}>No audit history records available.</td>
                                    </tr>
                                ) : (
                                    auditLogs.map(log => (
                                        <tr key={log.id}>
                                            <td>{new Date(log.created_at).toLocaleString()}</td>
                                            <td>
                                                <span style={{ 
                                                    fontSize: '0.75rem', 
                                                    padding: '3px 8px', 
                                                    borderRadius: '4px', 
                                                    fontWeight: 700,
                                                    background: log.action === 'CREATE' ? '#d1fae5' : '#fef3c7',
                                                    color: log.action === 'CREATE' ? '#065f46' : '#92400e'
                                                }}>
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td>{log.user_id || 'System Process'}</td>
                                            <td style={{ fontSize: '0.82rem' }}><code>{JSON.stringify(log.changed_fields)}</code></td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Record Purchase Modal */}
            {showPurchaseModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '24px', background: '#fff', borderRadius: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                            <h3 style={{ margin: 0, fontWeight: 800 }}>{editingPurchaseId ? 'Edit Purchase Entry' : 'Record Purchase Entry'}</h3>
                            <button className="btn btn-secondary" style={{ padding: '6px', minWidth: 'auto' }} onClick={() => setShowPurchaseModal(false)}><X size={16} /></button>
                        </div>

                        <form onSubmit={handleSavePurchase}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div className="form-group">
                                    <label className="form-label">Supplier *</label>
                                    <select className="form-select" value={purchaseFormData.supplier_id} onChange={e => setPurchaseFormData(prev => ({ ...prev, supplier_id: e.target.value }))} required>
                                        <option value="">Select Supplier...</option>
                                        {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>

                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Unit Cost Price *</label>
                                        <input type="number" step="0.01" className="form-input" value={purchaseFormData.last_purchase_price} onChange={e => setPurchaseFormData(prev => ({ ...prev, last_purchase_price: e.target.value }))} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Quantity *</label>
                                        <input type="number" className="form-input" value={purchaseFormData.quantity} onChange={e => setPurchaseFormData(prev => ({ ...prev, quantity: e.target.value }))} required />
                                    </div>
                                </div>

                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Purchase Date</label>
                                        <input type="date" className="form-input" value={purchaseFormData.purchase_date} onChange={e => setPurchaseFormData(prev => ({ ...prev, purchase_date: e.target.value }))} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Authorized PIC</label>
                                        <input type="text" className="form-input" value={purchaseFormData.pic} onChange={e => setPurchaseFormData(prev => ({ ...prev, pic: e.target.value }))} />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Remarks / Batch details</label>
                                    <input type="text" className="form-input" value={purchaseFormData.remarks} onChange={e => setPurchaseFormData(prev => ({ ...prev, remarks: e.target.value }))} placeholder="e.g. Batch #900, custom invoice #44" />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Bill / Invoicing Document URL</label>
                                    <input type="url" className="form-input" value={purchaseFormData.bill_url} onChange={e => setPurchaseFormData(prev => ({ ...prev, bill_url: e.target.value }))} placeholder="https://..." />
                                </div>

                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowPurchaseModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" style={{ background: '#1a3c63', borderColor: '#1a3c63' }}>Save Record</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* ===== Google Drive Connect Modal ===== */}
            {showDriveModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
                }}>
                    <div style={{
                        background: '#ffffff', borderRadius: '24px', padding: '40px 36px',
                        maxWidth: '480px', width: '100%', boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
                        border: '1px solid #e2e8f0', textAlign: 'center'
                    }}>
                        {/* Icon */}
                        <div style={{ width: '72px', height: '72px', borderRadius: '20px', background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <Cloud size={36} color="#fff" />
                        </div>

                        <h2 style={{ margin: '0 0 10px', fontSize: '1.4rem', fontWeight: 800, color: '#1e293b' }}>
                            Google Drive Not Connected
                        </h2>
                        <p style={{ margin: '0 0 8px', color: '#475569', fontSize: '0.95rem', lineHeight: 1.6 }}>
                            Your spare part <strong>#{formData.spare_number || '—'}</strong> has been saved, but a Google Drive folder structure is required to store photos and datasheets.
                        </p>
                        <p style={{ margin: '0 0 28px', color: '#64748b', fontSize: '0.85rem', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px 14px' }}>
                            ⚠️ Please connect Google Drive to automatically create the <strong>Photos_Media</strong> and <strong>Datasheets_Manuals</strong> folders for this part.
                        </p>

                        <button
                            onClick={() => {
                                // Store the spare part id so we can auto-provision on return
                                sessionStorage.setItem('catalog_spare_drive_pending_id', pendingSaveId);
                                sessionStorage.setItem('google_auth_return_url', `/catalog/${pendingSaveId}`);
                                connectGoogleAPI('catalog_spare_new');
                            }}
                            style={{
                                width: '100%', padding: '14px', borderRadius: '12px',
                                background: 'linear-gradient(135deg, #1a3c63 0%, #2563eb 100%)',
                                color: '#fff', border: 'none', fontWeight: 800, fontSize: '1rem',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '10px', marginBottom: '12px', boxShadow: '0 4px 14px rgba(26,60,99,0.35)'
                            }}
                        >
                            <Cloud size={20} /> Connect Google Drive &amp; Create Folders
                        </button>

                        <button
                            onClick={() => {
                                setShowDriveModal(false);
                                navigate(`/catalog/${pendingSaveId}`);
                            }}
                            style={{
                                width: '100%', padding: '11px', borderRadius: '12px',
                                background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0',
                                fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer'
                            }}
                        >
                            Skip for now (I'll connect later)
                        </button>
                    </div>
                </div>
            )}
            {qrModal.isOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div className="glass-panel animate-scale-up" style={{ background: '#fff', color: '#1e293b', maxWidth: '400px', width: '100%', padding: '32px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', textAlign: 'center', position: 'relative' }}>
                        <button 
                            onClick={() => setQrModal({ isOpen: false, folderId: null, folderName: '' })}
                            style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                            onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                        >
                            <X size={24} />
                        </button>

                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <Smartphone size={24} />
                        </div>

                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>Mobile Upload Gateway</h3>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '24px', lineHeight: '1.4' }}>
                            Scan this QR code with your smartphone camera to upload files directly to your <strong>{qrModal.folderName}</strong> folder.
                        </p>

                        {!qrModal.folderId ? (
                            <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                <Loader size={36} className="animate-spin text-primary" />
                                <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Connecting Google Drive...</span>
                            </div>
                        ) : (
                            <div>
                                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px dashed #cbd5e1', display: 'inline-block', marginBottom: '24px' }}>
                                    <img 
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                                            `${window.location.origin}/upload-media?folderId=${qrModal.folderId}&token=${getStoredToken() || localStorage.getItem('google_access_token')}&jobName=${encodeURIComponent(qrModal.folderName)}`
                                        )}`}
                                        alt="Upload QR Code"
                                        style={{ width: '200px', height: '200px', display: 'block' }}
                                    />
                                </div>

                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                    <Info size={14} style={{ flexShrink: 0 }} />
                                    <span>Session active. QR code is valid for temporary uploading.</span>
                                </div>
                            </div>
                        )}

                        <button 
                            className="btn btn-primary" 
                            style={{ width: '100%', marginTop: '24px', padding: '12px', borderRadius: '12px', fontWeight: 700 }}
                            onClick={() => setQrModal({ isOpen: false, folderId: null, folderName: '' })}
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CatalogForm;
