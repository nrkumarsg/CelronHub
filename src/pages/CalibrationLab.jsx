import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    FileCheck, Plus, Search, Archive, Sparkles, ExternalLink,
    Download, Trash2, Save, FileText, Ship, User, Hash,
    Calendar, AlertCircle, CheckCircle2, Loader2, Brain, RefreshCcw, Globe,
    LayoutGrid, List, Clock, Youtube, Book, MessageSquare, Pencil, Trash, QrCode, X,
    Eye, Printer, Copy, Folder
} from 'lucide-react';
import UploadOverlay from '../components/common/UploadOverlay';
import GDriveConnectionModal from '../components/common/GDriveConnectionModal';
import {
    getCalibrationRecords, createCalibrationRecord, updateCalibrationRecord, deleteCalibrationRecord, archiveOldRecords,
    getInstruments, createInstrument, getPartners, updateInstrument, deleteInstrument,
    getInstrumentHistory
} from '../lib/calibrationService';
import { getWorkLocations } from '../lib/store';
import { QuickPartnerAdd, QuickVesselAdd } from '../components/workflow/QuickAddForms';
import { supabase } from '../lib/supabase';
import { getJobs } from '../lib/workflowService';
import { useVesselsStore } from '../lib/vesselsStore';
import { provisionCalibrationStructure, uploadFileToDrive, provisionTemplateLibrary, listFolderContent, deleteFile, provisionInstrumentVault } from '../lib/driveService';
import { connectGoogleAPI, isTokenValid } from '../lib/googleAuthService';
import html2pdf from 'html2pdf.js';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { QRCodeSVG } from 'qrcode.react';
import { getDocumentSettings } from '../lib/store';
import { 
    generateDocNumber, 
    saveWorkflowDocument, 
    getWorkflowDocuments, 
    deleteWorkflowDocument, 
    duplicateWorkflowDocument, 
    getDocumentHistory 
} from '../lib/workflowV2Service';

export default function CalibrationLab() {
    const navigate = useNavigate();
    const { profile } = useAuth();
    const companyId = profile?.company_id || sessionStorage.getItem('company_id');
    
    const [records, setRecords] = useState([]);
    const [workflowDocs, setWorkflowDocs] = useState([]);
    const [instruments, setInstruments] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [partners, setPartners] = useState([]);
    const [activeTab, setActiveTab] = useState('records'); // 'records', 'form', 'templates'
    const { vessels, fetchVessels } = useVesselsStore();
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [fileToUpload, setFileToUpload] = useState(null);
    const [templateFiles, setTemplateFiles] = useState([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [templateSearchTerm, setTemplateSearchTerm] = useState('');
    const [templateViewMode, setTemplateViewMode] = useState('grid'); // 'grid' | 'list'
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadLink, setUploadLink] = useState(null);
    const [editModal, setEditModal] = useState({ isOpen: false, type: null, initialData: null });

    // Instrument Library State
    const [instrumentSearchTerm, setInstrumentSearchTerm] = useState('');
    const [instrumentViewMode, setInstrumentViewMode] = useState('grid');
    const [isInstrumentModalOpen, setIsInstrumentModalOpen] = useState(false);
    const [editingInstrument, setEditingInstrument] = useState(null);
    const [instrumentFormData, setInstrumentFormData] = useState({
        name: '', maker: '', model: '', description: '', youtube_link: '', manual_url: '', notes: ''
    });

    const [editingRecordId, setEditingRecordId] = useState(null);
    const [instrumentHistory, setInstrumentHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    
    // Workflow History States
    const [historyDoc, setHistoryDoc] = useState(null);
    const [historyItems, setHistoryItems] = useState([]);
    const [selectedInstrumentTitle, setSelectedInstrumentTitle] = useState('');
    const [isQRModalOpen, setIsQRModalOpen] = useState(false);
    const [qrValue, setQrValue] = useState('');
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        job_id: '',
        job_no: '', // Maintain job_no for quick access
        vessel_id: '',
        customer_id: '',
        remark: '',
        remark_category: 'Normal',
        calibration_date: new Date().toISOString().split('T')[0],
        due_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
        selectedInstruments: [] // { instrument_id, name, maker, model, serial_no, standard_reading, actual_reading, result: 'Pass' }
    });


    const handleArchive = async () => {
        if (!confirm("Are you sure you want to archive records older than 1 year?")) return;
        try {
            setLoading(true);
            await archiveOldRecords();
            alert("Old records archived successfully.");
            fetchData();
        } catch (err) {
            console.error("Archive error:", err);
            alert("Failed to archive: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePrintPreview = (docId) => {
        window.open(`/workflows/print/${docId}`, '_blank');
    };

    const handleDuplicateWorkflow = async (id) => {
        if (!confirm('Are you sure you want to duplicate this document? All items will be copied to a new draft.')) return;
        try {
            setLoading(true);
            await duplicateWorkflowDocument(id);
            alert('Document duplicated successfully.');
            fetchData();
        } catch (err) {
            console.error("Duplicate error:", err);
            alert("Failed to duplicate: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleShowWorkflowHistory = async (doc) => {
        setHistoryDoc(doc);
        setLoadingHistory(true);
        try {
            const { data, error } = await getDocumentHistory(doc);
            if (data) setHistoryItems(data);
            if (error) throw error;
        } catch (err) {
            console.error("History fetch error:", err);
            alert("Failed to fetch history: " + err.message);
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleDeleteWorkflow = async (id) => {
        if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) return;
        try {
            setLoading(true);
            const { error } = await deleteWorkflowDocument(id);
            if (error) throw error;
            alert('Document deleted successfully.');
            fetchData();
        } catch (err) {
            console.error("Delete error:", err);
            alert("Failed to delete: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const openDriveFolder = async (doc) => {
        const token = sessionStorage.getItem('google_contacts_token');
        if (!token) {
            alert("Connect GDrive first!");
            setIsAuthModalOpen(true);
            return;
        }

        const folderId = doc.drive_folder_id || doc.gdrive_folder_id;
        if (folderId) {
            window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
        } else {
            // Auto-provision logic for certificates
            if (!confirm("No drive folder linked. Would you like to provision a new project structure for this job?")) return;
            
            try {
                setLoading(true);
                const { getDocumentSettings } = await import('../lib/store');
                const { provisionFullProjectStructure } = await import('../lib/driveService');
                
                const settings = await getDocumentSettings(profile?.company_id);
                let rootId = settings?.gdrive_celron_root_id;
                
                const year = new Date().getFullYear().toString();
                const jobNo = doc.assigned_job_no || doc.document_no; // Fallback to doc no if not linked to job
                const customerName = doc.partners?.name || doc.customer_name || 'Walk-in';
                const vesselName = doc.vessels?.vessel_name || doc.vessel_name || '';
                const folderTitle = vesselName ? `${jobNo} - ${customerName} - ${vesselName}` : `${jobNo} - ${customerName}`;
                const cleanTitle = folderTitle.replace(/[/\\?%*:|"<>]/g, '-');
                
                const newFolderId = await provisionFullProjectStructure(token, rootId, year, cleanTitle);
                
                // Update doc with folder ID
                await supabase.from('workflow_documents').update({ drive_folder_id: newFolderId }).eq('id', doc.id);
                
                alert("Folder structure provisioned successfully!");
                fetchData();
                window.open(`https://drive.google.com/drive/folders/${newFolderId}`, '_blank');
            } catch (err) {
                console.error("Provisioning error:", err);
                alert("Failed to provision folder: " + err.message);
            } finally {
                setLoading(false);
            }
        }
    };

    const fetchData = async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const [recRes, insRes, jobRes, parRes, wfRes, vRes, wfJobRes] = await Promise.all([
                getCalibrationRecords(),
                getInstruments(),
                getJobs(companyId),
                getPartners(),
                getWorkflowDocuments(companyId, 'Certificate'),
                fetchVessels(),
                getWorkflowDocuments(companyId, 'Job')
            ]);
            
            if (recRes?.data) setRecords(recRes.data);
            if (insRes?.data) setInstruments(insRes.data);
            
            // Unify Jobs: Merge legacy jobs table with unified workflow documents (type=Job)
            const legacyJobs = jobRes?.data || [];
            const unifiedJobs = (wfJobRes?.data || []).map(j => ({
                id: j.id,
                job_no: j.document_no,
                vessel_id: j.vessel_id,
                customer_id: j.partner_id,
                customer_name: j.partners?.name || '',
                vessel_name: j.vessels?.vessel_name || '',
                created_at: j.created_at
            }));
            
            const mergedJobs = [...legacyJobs, ...unifiedJobs].sort((a, b) => 
                new Date(b.created_at) - new Date(a.created_at)
            );
            setJobs(mergedJobs);
            
            if (parRes?.data) setPartners(parRes.data);
            if (wfRes?.data) setWorkflowDocs(wfRes.data);
            else if (wfRes?.error) setWorkflowDocs([]); // Safety fallback
            
            // fetchVessels() updates the zustand store automatically, no need to set state here
        } catch (err) {
            console.error("Error fetching calibration data:", err);
        } finally {
            setLoading(false);
        }
    };

    // Auto-update due_date when calibration_date changes
    useEffect(() => {
        if (formData.calibration_date) {
            const calDate = new Date(formData.calibration_date);
            const dueDate = new Date(calDate.setFullYear(calDate.getFullYear() + 1)).toISOString().split('T')[0];
            setFormData(prev => ({ ...prev, due_date: dueDate }));
        }
    }, [formData.calibration_date]);

    useEffect(() => {
        if (companyId) {
            fetchData();
            fetchTemplates();
        }
    }, [companyId]);

    const addInstrumentRow = () => {
        setFormData(prev => ({
            ...prev,
            selectedInstruments: [
                ...prev.selectedInstruments,
                {
                    instrument_id: null,
                    name: '',
                    maker: '',
                    model: '',
                    serial_no: '',
                    standard_reading: '',
                    actual_reading: '',
                    result: 'Pass'
                }
            ]
        }));
    };

    const [viewerType, setViewerType] = useState(null); // 'youtube' or 'manual'
    const [activeResource, setActiveResource] = useState(null);

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const getTypeColor = (type) => {
        switch (type) {
            case 'Enquiry': return '#6366f1';
            case 'Quotation': return '#3b82f6';
            case 'Purchase Order': return '#f59e0b';
            case 'Order Acknowledgment': return '#059669';
            case 'Delivery Order': return '#10b981';
            case 'Service Report': return '#ec4899';
            case 'Tax Invoice': return '#ef4444';
            case 'Certificate': return '#6366f1';
            case 'Payment Received': return '#10b981';
            case 'Statement of Account': return '#3b82f6';
            case 'Proforma Invoice': return '#f43f5e';
            case 'Packing List': return '#f97316';
            default: return '#64748b';
        }
    };

    const showQR = (instrument) => {
        const qrContent = JSON.stringify({
            type: 'celron_instrument',
            id: instrument.id,
            name: instrument.name,
            model: instrument.model
        });
        setQrValue(qrContent);
        setSelectedInstrumentTitle(instrument.name);
        setIsQRModalOpen(true);
    };

    const getYouTubeId = (url) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url?.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };

    useEffect(() => {
        // Recover token from localStorage if valid but missing from sessionStorage
        const sessToken = sessionStorage.getItem('google_contacts_token');
        if (!sessToken && isTokenValid()) {
            const localToken = localStorage.getItem('google_access_token');
            const localExpiry = localStorage.getItem('google_token_expiry');
            sessionStorage.setItem('google_contacts_token', localToken);
            sessionStorage.setItem('google_contacts_expires', localExpiry);
        }

        fetchData();
        if (activeTab === 'templates') {
            fetchTemplates();
        }
    }, [activeTab]);

    const fetchTemplates = async () => {
        const token = sessionStorage.getItem('google_contacts_token');
        if (!token) return;
        setLoadingTemplates(true);
        try {
            const { id: folderId } = await provisionTemplateLibrary(token);
            const files = await listFolderContent(token, folderId);
            setTemplateFiles(files);
        } catch (err) {
            console.error("Error fetching templates:", err);
        } finally {
            setLoadingTemplates(false);
        }
    };

    const fetchHistory = async (instrumentId, instrumentName) => {
        setLoadingHistory(true);
        setSelectedInstrumentTitle(instrumentName);
        setIsHistoryModalOpen(true);
        try {
            const { data, error } = await getInstrumentHistory(instrumentId);
            if (data) setInstrumentHistory(data);
        } catch (err) {
            console.error("Error fetching history:", err);
        } finally {
            setLoadingHistory(false);
        }
    };

    const getHealthStatus = (lastDueDate) => {
        if (!lastDueDate) return { label: 'Unknown', color: '#94a3b8', bgColor: '#f1f5f9', days: 0 };
        const today = new Date();
        const due = new Date(lastDueDate);
        const diffTime = due - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { label: 'Overdue', color: '#ef4444', bgColor: '#fef2f2', days: diffDays };
        if (diffDays <= 30) return { label: 'Expiring', color: '#f59e0b', bgColor: '#fffbeb', days: diffDays };
        return { label: 'Healthy', color: '#10b981', bgColor: '#f0fdf4', days: diffDays };
    };

    const handleMultiUpload = async (files) => {
        const token = sessionStorage.getItem('google_contacts_token');
        if (!token) {
            alert("Connect GDrive first!");
            return;
        }
        setIsUploading(true);
        try {
            const settings = await getDocumentSettings();
            const { id: folderId } = await provisionTemplateLibrary(token, settings?.gdrive_celron_root_id);
            for (const file of files) {
                await uploadFileToDrive(token, file, { 
                    folderId,
                    onProgress: (p) => setUploadProgress(p)
                });
            }
            setUploadLink(folderId); // Pass folderId to let user open the templates folder
            alert(`Successfully uploaded ${files.length} files.`);
            fetchTemplates();
        } catch (err) {
            console.error("Multi-upload error:", err);
            alert("Upload failed: " + err.message);
        } finally {
            setIsUploading(false);
            // setUploadProgress(0); // Handled by onClose
        }
    };

    const filteredTemplates = templateFiles.filter(file =>
        file.name.toLowerCase().includes(templateSearchTerm.toLowerCase())
    );

    const filteredInstruments = instruments.filter(ins =>
        ins.name?.toLowerCase().includes(instrumentSearchTerm.toLowerCase()) ||
        ins.maker?.toLowerCase().includes(instrumentSearchTerm.toLowerCase()) ||
        ins.model?.toLowerCase().includes(instrumentSearchTerm.toLowerCase()) ||
        ins.serial_no?.toLowerCase().includes(instrumentSearchTerm.toLowerCase())
    );





    const handleInstrumentSave = async (e) => {
        e.preventDefault();
        try {
            if (editingInstrument) {
                const { error } = await updateInstrument(editingInstrument.id, instrumentFormData);
                if (error) throw error;
                alert("Instrument updated successfully!");
            } else {
                const { error } = await createInstrument(instrumentFormData);
                if (error) throw error;
                alert("Instrument created successfully!");
            }
            setIsInstrumentModalOpen(false);
            setEditingInstrument(null);
            setInstrumentFormData({ name: '', maker: '', model: '', serial_no: '', description: '', youtube_link: '', manual_url: '', notes: '' });
            fetchData();
        } catch (err) {
            console.error("Error saving instrument:", err);
            alert("Failed to save: " + err.message);
        }
    };

    const handleInstrumentDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this instrument?")) return;
        try {
            const { error } = await deleteInstrument(id);
            if (error) throw error;
            fetchData();
        } catch (err) {
            console.error("Error deleting instrument:", err);
            alert("Delete failed: " + err.message);
        }
    };

    const handleEditInstrument = (ins) => {
        setEditingInstrument(ins);
        setInstrumentFormData({
            name: ins.name,
            maker: ins.maker || '',
            model: ins.model || '',
            serial_no: ins.serial_no || '',
            description: ins.description || '',
            youtube_link: ins.youtube_link || '',
            manual_url: ins.manual_url || '',
            notes: ins.notes || ''
        });
        setIsInstrumentModalOpen(true);
    };

    const handleInstrumentSelect = (e) => {
        const id = e.target.value;
        if (!id) return;

        const ins = instruments.find(i => i.id === id);
        if (ins) {
            // Check if already selected
            if (formData.selectedInstruments.find(item => item.instrument_id === ins.id)) {
                alert("Instrument already added!");
                return;
            }

            setFormData({
                ...formData,
                selectedInstruments: [
                    ...formData.selectedInstruments,
                    {
                        instrument_id: ins.id,
                        name: ins.name,
                        maker: ins.maker || '',
                        model: ins.model || '',
                        serial_no: ins.serial_no || '',
                        standard_reading: '',
                        actual_reading: '',
                        result: 'Pass'
                    }
                ]
            });
        }
    };

    const removeInstrument = (index) => {
        const newList = [...formData.selectedInstruments];
        newList.splice(index, 1);
        setFormData({ ...formData, selectedInstruments: newList });
    };

    const updateInstrumentData = (index, field, value) => {
        const newList = [...formData.selectedInstruments];

        if (field === 'name') {
            // Find the instrument in our library to auto-fill maker and model
            const selectedIns = instruments.find(ins => ins.name === value);
            if (selectedIns) {
                newList[index] = {
                    ...newList[index],
                    name: value,
                    maker: selectedIns.maker || '',
                    model: selectedIns.model || ''
                };
            } else {
                newList[index] = { ...newList[index], name: value };
            }
        } else {
            newList[index] = { ...newList[index], [field]: value };
        }

        setFormData({ ...formData, selectedInstruments: newList });
    };

    const handleEditRecord = async (record) => {
        setEditingRecordId(record.id);
        setFormData({
            job_id: record.job_id || '',
            job_no: record.job_no || '',
            vessel_id: record.vessel_id || '',
            customer_id: record.customer_id || '',
            remark: record.remark || '',
            remark_category: record.remark_category || 'Normal',
            calibration_date: record.calibration_date,
            due_date: record.due_date,
            selectedInstruments: record.items?.map(item => ({
                instrument_id: item.instrument_id,
                name: item.instrument_name,
                maker: item.instrument_maker,
                model: item.instrument_model,
                serial_no: item.instrument_serial_no,
                standard_reading: item.standard_reading,
                actual_reading: item.actual_reading,
                result: item.result
            })) || []
        });
        setActiveTab('form');
    };

    const handleEditMaster = (type) => {
        let initialData = null;
        if (type === 'vessel_id') initialData = vessels.find(v => v.id === formData.vessel_id);
        else if (type === 'customer_id') initialData = partners.find(p => p.id === formData.customer_id);

        if (!initialData) return alert('Please select a record to edit first.');
        setEditModal({ isOpen: true, type, initialData });
    };

    const handleEditMasterSuccess = () => {
        setEditModal({ isOpen: false, type: null, initialData: null });
        fetchData();
        fetchVessels();
    };

    const handleDeleteRecord = async (id) => {
        if (window.confirm("Are you sure you want to delete this calibration record?")) {
            const { error } = await deleteCalibrationRecord(id);
            if (error) alert("Error deleting record: " + error.message);
            else fetchData();
        }
    };

    const handleFileUpload = (e) => {
        setFileToUpload(e.target.files[0]);
    };

    const handleSave = async (e, mode = 'full') => {
        if (e) e.preventDefault();
        if (formData.selectedInstruments.length === 0) {
            alert("Please select at least one instrument!");
            return;
        }
        setIsSaving(true);
        try {
            const token = sessionStorage.getItem('google_contacts_token');
            if (!token) {
                alert("Please connect Google Drive first in Settings > Google Drive Sync");
                setIsSaving(false);
                return;
            }

            const vessel = vessels.find(v => v.id === formData.vessel_id);
            const customer = partners.find(p => p.id === formData.customer_id);
            const job = jobs.find(j => j.id === formData.job_id);

            const vesselName = vessel ? (vessel.vessel_name || vessel.name) : 'Unknown';
            const customerName = customer ? customer.name : 'Unknown';
            const jobNo = job ? job.job_no : (formData.job_no || 'Manual');

            const recordPayload = {
                job_id: formData.job_id || null,
                job_no: jobNo,
                vessel_id: formData.vessel_id || null,
                customer_id: formData.customer_id || null,
                customer_name: customerName,
                calibration_date: formData.calibration_date,
                due_date: formData.due_date,
                remark: formData.remark,
                remark_category: formData.remark_category,
                instrument_name: formData.selectedInstruments.map(i => i.name).join(', ')
            };

            const itemsPayload = formData.selectedInstruments.map(i => ({
                instrument_id: i.instrument_id || null,
                instrument_name: i.name,
                instrument_maker: i.maker,
                instrument_model: i.model,
                instrument_serial_no: i.serial_no,
                standard_reading: i.standard_reading,
                actual_reading: i.actual_reading,
                result: i.result
            }));

            let pdfBlob = null;

            if (mode === 'full') {

                const settings = await getDocumentSettings();
                // 1. Provision GDrive Structure
                const driveInfo = await provisionCalibrationStructure(
                    token,
                    customerName,
                    vesselName,
                    jobNo,
                    settings?.gdrive_celron_root_id
                );

                // 2. Generate PDF Certificate
                const element = document.getElementById('certificate-template');
                element.style.display = 'block';

                const opt = {
                    margin: 10,
                    filename: `Calibration_Cert_${jobNo}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, allowTaint: false, scrollX: 0, scrollY: 0 },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };

                pdfBlob = await html2pdf().from(element).set(opt).output('blob');
                element.style.display = 'none';

                const certFile = await uploadFileToDrive(token, new File([pdfBlob], opt.filename, { type: 'application/pdf' }), {
                    title: opt.filename,
                    folderId: driveInfo.id,
                    onProgress: (p) => setUploadProgress(p)
                });

                if (certFile) {
                    recordPayload.certificate_file_id = certFile.id;
                    recordPayload.certificate_url = certFile.webViewLink;
                    setUploadLink(certFile.webViewLink);
                }
            }

            // 3. Generate Workflow Certificate Document (v3 Integration)
            let workflowDocId = null;
            try {
                const companyId = sessionStorage.getItem('company_id');
                const certDocNo = await generateDocNumber(companyId, 'Certificate');
                
                const workflowDocData = {
                    company_id: companyId,
                    document_type: 'Certificate',
                    document_no: certDocNo,
                    issue_date: formData.calibration_date,
                    expiry_date: formData.due_date,
                    partner_id: formData.customer_id,
                    vessel_id: formData.vessel_id,
                    subject: `Calibration Certificate: ${formData.selectedInstruments.map(i => i.name).join(', ')}`,
                    status: 'Confirmed',
                    notes: `System generated from Calibration Lab. Job: ${jobNo}. Remark: ${formData.remark}`,
                    attachment_urls: recordPayload.certificate_url ? [recordPayload.certificate_url] : []
                };

                const workflowItems = formData.selectedInstruments.map(i => ({
                    description: i.name,
                    details: `${i.maker} ${i.model} (S/N: ${i.serial_no})`,
                    quantity: 1,
                    unit_price: 0,
                    amount: 0,
                    notes: `Std: ${i.standard_reading}, Act: ${i.actual_reading}, Result: ${i.result}`
                }));

                const { data: savedWfDoc } = await saveWorkflowDocument(workflowDocData, workflowItems);
                if (savedWfDoc) {
                    workflowDocId = savedWfDoc.id;
                    recordPayload.workflow_doc_id = workflowDocId;
                }
            } catch (wfErr) {
                console.error("Failed to generate workflow document:", wfErr);
                // Continue saving calibration even if workflow doc fails
            }

            // 4. Save Relational Data to Supabase
            let result;
            if (editingRecordId) {
                result = await updateCalibrationRecord(editingRecordId, recordPayload, itemsPayload);
            } else {
                result = await createCalibrationRecord(recordPayload, itemsPayload);
            }

            if (result.error) throw result.error;

            // 4. Automated Vault Filing for each instrument (if PDF was generated)
            if (mode === 'full' && token && isTokenValid()) {
                const certName = `Cert_${vesselName}_${formData.calibration_date}_${jobNo}.pdf`;
                // Use a standard File object for the upload
                const settings = await getDocumentSettings();
                const pdfFile = new File([pdfBlob], certName, { type: 'application/pdf' });

                for (const item of formData.selectedInstruments) {
                    try {
                        const { id: instCertsId } = await provisionInstrumentVault(token, item.name, settings?.gdrive_celron_root_id);
                        await uploadFileToDrive(token, pdfFile, {
                            title: certName,
                            folderId: instCertsId,
                            onProgress: (p) => setUploadProgress(p)
                        });
                    } catch (vaultErr) {
                        console.error(`Failed to file cert for ${item.name}:`, vaultErr);
                    }
                }
            }

            alert(editingRecordId ? 'Calibration record updated successfully!' : 'Calibration record saved and file uploaded to Job folder!');
            setEditingRecordId(null);

            setFormData({
                job_id: '',
                job_no: '',
                vessel_id: '',
                customer_id: '',
                remark: '',
                remark_category: 'Normal',
                calibration_date: new Date().toISOString().split('T')[0],
                due_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
                selectedInstruments: []
            });
            fetchData();
            setActiveTab('records');
        } catch (err) {
            console.error("Error saving calibration:", err);
            alert("Failed to save calibration record: " + err.message);
        } finally {
            setIsSaving(false);
            // setUploadProgress(0); // Handled by onClose
        }
    };


    const filteredRecords = records.filter(r =>
        r.job_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.instrument_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.customer_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh' }}>
            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <div style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', padding: '10px', borderRadius: '12px', color: '#fff' }}>
                            <FileCheck size={28} />
                        </div>
                        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', margin: 0, letterSpacing: '-0.02em' }}>
                            Calibration Lab
                        </h1>
                    </div>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '1.1rem' }}>Templates & Automated Certification Management</p>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={handleArchive}
                        style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', padding: '10px 20px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, cursor: 'pointer' }}
                    >
                        <Archive size={18} /> Archive Old
                    </button>
                    <button
                        onClick={() => {
                            if (activeTab === 'form') {
                                setEditingRecordId(null);
                                setFormData({
                                    job_id: '', job_no: '', vessel_id: '', customer_id: '', remark: '', remark_category: 'Normal',
                                    calibration_date: new Date().toISOString().split('T')[0],
                                    due_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
                                    selectedInstruments: []
                                });
                                setActiveTab('records');
                            } else {
                                setActiveTab('form');
                            }
                        }}
                        className="btn btn-primary"
                        style={{ padding: '12px 24px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', background: activeTab === 'form' ? '#64748b' : '#10b981' }}
                    >
                        {activeTab === 'form' ? 'Cancel' : <><Plus size={18} /> New Calibration</>}
                    </button>
                </div>
            </header>

            {/* Tabs Navigation */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: '#fff', padding: '4px', borderRadius: '12px', border: '1px solid #e2e8f0', width: 'fit-content' }}>
                <button
                    onClick={() => setActiveTab('records')}
                    style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: activeTab === 'records' ? '#10b981' : 'transparent', color: activeTab === 'records' ? '#fff' : '#64748b', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                    Records History
                </button>
                <button
                    onClick={() => setActiveTab('form')}
                    style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: activeTab === 'form' ? '#10b981' : 'transparent', color: activeTab === 'form' ? '#fff' : '#64748b', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                    New Calibration
                </button>
                <button
                    onClick={() => {
                        setActiveTab('templates');
                        const token = sessionStorage.getItem('google_contacts_token');
                        if (token) {
                            getDocumentSettings().then(settings => {
                                provisionTemplateLibrary(token, settings?.gdrive_celron_root_id);
                            });
                        }
                    }}
                    style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: activeTab === 'templates' ? '#10b981' : 'transparent', color: activeTab === 'templates' ? '#fff' : '#64748b', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                    Template Library
                </button>
                <button
                    onClick={() => setActiveTab('library')}
                    style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: activeTab === 'library' ? '#10b981' : 'transparent', color: activeTab === 'library' ? '#fff' : '#64748b', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                    Instrument Library
                </button>
                <button
                    onClick={() => window.open('https://celron-pmr.vercel.app', '_blank')}
                    style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#3b82f6', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
                    title="Open CelRon PMR"
                >
                    <ExternalLink size={16} /> PMR App
                </button>
                <button
                    onClick={() => window.open('https://pcb-repair-form.vercel.app', '_blank')}
                    style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#8b5cf6', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
                    title="Open PCB Repair Form"
                >
                    <ExternalLink size={16} /> PCB Repair Form
                </button>
            </div>

            {activeTab === 'form' && (
                <div className="glass-panel" style={{ background: '#fff', borderRadius: '24px', padding: '40px', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05)' }}>
                    <form onSubmit={handleSave}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '32px' }}>
                            <div>
                                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 600, color: '#475569' }}>
                                    <Hash size={16} /> Job Number
                                </label>
                                <select
                                    className="form-input"
                                    value={formData.job_id}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === 'new') {
                                            setFormData({ ...formData, job_id: 'new', job_no: '' });
                                        } else {
                                            const selectedJob = jobs.find(j => j.id === val);
                                            setFormData({
                                                ...formData,
                                                job_id: val,
                                                job_no: selectedJob ? selectedJob.job_no : '',
                                                vessel_id: selectedJob?.vessel_id || '',
                                                customer_id: selectedJob?.customer_id || ''
                                            });
                                        }
                                    }}
                                    required
                                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}
                                >
                                    <option value="">Select Job No</option>
                                    {jobs.map(job => (
                                        <option key={job.id} value={job.id}>{job.job_no}</option>
                                    ))}
                                    <option value="new">+ Manual Entry</option>
                                </select>
                                {formData.job_id === 'new' && (
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Enter Job Number..."
                                        value={formData.job_no}
                                        onChange={(e) => setFormData({ ...formData, job_no: e.target.value })}
                                        required
                                        style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', marginTop: '8px' }}
                                    />
                                )}
                            </div>

                            <div>
                                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between', marginBottom: '8px', fontWeight: 600, color: '#475569' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Ship size={16} /> Vessel</span>
                                    {formData.vessel_id && <Pencil size={12} style={{ cursor: 'pointer', color: '#10b981' }} onClick={() => handleEditMaster('vessel_id')} />}
                                </label>
                                <select
                                    className="form-input"
                                    value={formData.vessel_id}
                                    onChange={(e) => setFormData({ ...formData, vessel_id: e.target.value })}
                                    required
                                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}
                                >
                                    <option value="">Select Vessel</option>
                                    {vessels.map(v => (
                                        <option key={v.id} value={v.id}>{v.vessel_name || v.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between', marginBottom: '8px', fontWeight: 600, color: '#475569' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><User size={16} /> Customer (Partners)</span>
                                    {formData.customer_id && <Pencil size={12} style={{ cursor: 'pointer', color: '#10b981' }} onClick={() => handleEditMaster('customer_id')} />}
                                </label>
                                <select
                                    className="form-input"
                                    value={formData.customer_id}
                                    onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                                    required
                                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}
                                >
                                    <option value="">Select Customer</option>
                                    {partners.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 600, color: '#475569' }}>
                                    <Calendar size={16} /> Calibration Date
                                </label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={formData.calibration_date}
                                    onChange={(e) => setFormData({ ...formData, calibration_date: e.target.value })}
                                    required
                                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}
                                />
                            </div>

                            <div>
                                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 600, color: '#475569' }}>
                                    <Clock size={16} /> Due Date
                                </label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={formData.due_date}
                                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                                    required
                                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}
                                />
                            </div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '16px', marginBottom: '32px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem', color: '#1e293b' }}>
                                    <Sparkles size={20} color="#10b981" /> Instruments & Readings
                                </h3>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <select
                                        className="form-input"
                                        onChange={handleInstrumentSelect}
                                        style={{ width: '250px', padding: '8px' }}
                                        value=""
                                    >
                                        <option value="">+ Add from Library</option>
                                        {instruments.map(ins => (
                                            <option key={ins.id} value={ins.id}>{ins.name} ({ins.maker})</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={addInstrumentRow}
                                        className="btn-primary"
                                        style={{ padding: '8px 16px', borderRadius: '8px', background: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        <Plus size={16} /> Add Row
                                    </button>
                                </div>
                            </div>

                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                    <thead>
                                        <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Instrument Name</th>
                                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Serial No.</th>
                                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Maker / Model</th>
                                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Std. Reading</th>
                                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Act. Reading</th>
                                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Result</th>
                                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#64748b', fontWeight: 600, textAlign: 'center' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {formData.selectedInstruments.length === 0 ? (
                                            <tr>
                                                <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                                    No instruments added. Please add from library or add a manual row.
                                                </td>
                                            </tr>
                                        ) : (
                                            formData.selectedInstruments.map((item, index) => (
                                                <tr key={index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '8px 16px' }}>
                                                        <select
                                                            className="form-input"
                                                            value={item.name}
                                                            onChange={(e) => updateInstrumentData(index, 'name', e.target.value)}
                                                            style={{ width: '100%', border: 'none', background: 'transparent' }}
                                                        >
                                                            <option value="">Select Instrument</option>
                                                            {instruments.map(ins => (
                                                                <option key={ins.id} value={ins.name}>{ins.name}</option>
                                                            ))}
                                                            <option value="Manual">+ Manual Entry</option>
                                                        </select>
                                                        {item.name === 'Manual' && (
                                                            <input
                                                                className="form-input"
                                                                value={item.name === 'Manual' ? '' : item.name}
                                                                onChange={(e) => updateInstrumentData(index, 'name', e.target.value)}
                                                                placeholder="Enter Name..."
                                                                style={{ width: '100%', border: 'none', background: 'transparent', borderBottom: '1px solid #e2e8f0', marginTop: '4px' }}
                                                            />
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '8px 16px' }}>
                                                        <input
                                                            className="form-input"
                                                            value={item.serial_no}
                                                            onChange={(e) => updateInstrumentData(index, 'serial_no', e.target.value)}
                                                            placeholder="S/N"
                                                            style={{ width: '100%', border: 'none', background: 'transparent' }}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px 16px' }}>
                                                        <div style={{ display: 'flex', gap: '4px' }}>
                                                            <input
                                                                className="form-input"
                                                                value={item.maker}
                                                                onChange={(e) => updateInstrumentData(index, 'maker', e.target.value)}
                                                                placeholder="Maker"
                                                                style={{ width: '50%', border: 'none', background: 'transparent' }}
                                                            />
                                                            <input
                                                                className="form-input"
                                                                value={item.model}
                                                                onChange={(e) => updateInstrumentData(index, 'model', e.target.value)}
                                                                placeholder="Model"
                                                                style={{ width: '50%', border: 'none', background: 'transparent' }}
                                                            />
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '8px 16px' }}>
                                                        <input
                                                            className="form-input"
                                                            value={item.standard_reading}
                                                            onChange={(e) => updateInstrumentData(index, 'standard_reading', e.target.value)}
                                                            style={{ width: '100%', border: 'none', background: 'transparent' }}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px 16px' }}>
                                                        <input
                                                            className="form-input"
                                                            value={item.actual_reading}
                                                            onChange={(e) => updateInstrumentData(index, 'actual_reading', e.target.value)}
                                                            style={{ width: '100%', border: 'none', background: 'transparent' }}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px 16px' }}>
                                                        <select
                                                            className="form-input"
                                                            value={item.result}
                                                            onChange={(e) => updateInstrumentData(index, 'result', e.target.value)}
                                                            style={{ width: '100%', border: 'none', background: 'transparent', fontWeight: 600, color: item.result === 'Pass' ? '#10b981' : '#ef4444' }}
                                                        >
                                                            <option value="Pass">Pass</option>
                                                            <option value="Fail">Fail</option>
                                                        </select>
                                                    </td>
                                                    <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeInstrument(index)}
                                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '32px' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#475569' }}>Final Remarks</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
                                <div>
                                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Category</label>
                                    <select
                                        className="form-input"
                                        value={formData.remark_category}
                                        onChange={(e) => setFormData({ ...formData, remark_category: e.target.value })}
                                        style={{ width: '100%' }}
                                    >
                                        <option value="Normal">Normal</option>
                                        <option value="Urgent">Urgent</option>
                                        <option value="Minor Issue">Minor Issue</option>
                                        <option value="Replacement Needed">Replacement Needed</option>
                                    </select>
                                </div>
                                <textarea
                                    className="form-textarea"
                                    rows={3}
                                    value={formData.remark}
                                    onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                                    placeholder="Enter multi-line remarks..."
                                    style={{ width: '100%' }}
                                ></textarea>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <button
                                type="button"
                                onClick={(e) => handleSave(e, 'db_only')}
                                disabled={isSaving}
                                className="btn btn-secondary"
                                style={{
                                    padding: '16px',
                                    borderRadius: '12px',
                                    fontSize: '1rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    border: '1px solid #e2e8f0',
                                    background: '#fff'
                                }}
                            >
                                <Save size={18} /> {editingRecordId ? 'Update Record Only' : 'Save Record (No PDF)'}
                            </button>
                            <button
                                type="submit"
                                className="btn-primary"
                                disabled={isSaving}
                                style={{
                                    padding: '16px',
                                    borderRadius: '12px',
                                    background: '#10b981',
                                    color: '#fff',
                                    border: 'none',
                                    fontSize: '1.1rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '12px',
                                    boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.2)'
                                }}
                            >
                                {isSaving ? <Loader2 className="animate-spin" /> : <Download size={20} />}
                                {isSaving ? 'Processing...' : (editingRecordId ? 'Update & Generate PDF' : 'Generate Certificate & Save')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {activeTab === 'records' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                    <div className="glass-panel" style={{ background: '#fff', borderRadius: '24px', padding: '32px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '8px 16px', minWidth: '450px' }}>
                                <Search size={20} color="#94a3b8" style={{ marginRight: '12px' }} />
                                <input
                                    type="text"
                                    placeholder="Search by doc no, customer, vessel or job..."
                                    style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, color: '#1e293b', fontSize: '1rem' }}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button onClick={fetchData} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <RefreshCcw size={16} /> Refresh
                                </button>
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', background: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                                        <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Type</th>
                                        <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Document No</th>
                                        <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Issue Date</th>
                                        <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Customer</th>
                                        <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Vessel / Work Location</th>
                                        <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Signature</th>
                                        <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Status</th>
                                        <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', textAlign: 'center' }}>Folder</th>
                                        <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {workflowDocs.filter(doc => 
                                        doc.document_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        doc.partners?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        doc.vessels?.vessel_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        doc.assigned_job_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        doc.subject?.toLowerCase().includes(searchTerm.toLowerCase())
                                    ).length === 0 ? (
                                        <tr>
                                            <td colSpan="9" style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                                                <FileText size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                                                <p>No certificates found matching your criteria.</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        workflowDocs.filter(doc => 
                                            doc.document_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            doc.partners?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            doc.vessels?.vessel_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            doc.assigned_job_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            doc.subject?.toLowerCase().includes(searchTerm.toLowerCase())
                                        ).map((doc) => (
                                            <tr key={doc.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                                <td style={{ padding: '16px' }}>
                                                    <span style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        color: getTypeColor(doc.document_type),
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: getTypeColor(doc.document_type) }} />
                                                        {doc.document_type}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '16px', fontWeight: 600, color: '#6366f1' }}>{doc.document_no}</td>
                                                <td style={{ padding: '16px', color: '#64748b' }}>{formatDate(doc.issue_date)}</td>
                                                <td style={{ padding: '16px' }}>
                                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{doc.partners?.name || 'Walk-in'}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.subject || '-'}</div>
                                                </td>
                                                <td style={{ padding: '16px', color: '#475569' }}>
                                                    {doc.vessels?.vessel_name || doc.work_locations?.location_name || '-'}
                                                </td>
                                                <td style={{ padding: '16px' }}>
                                                    {doc.signature_url ? (
                                                        <img src={doc.signature_url} alt="Sig" style={{ height: '24px', maxWidth: '80px', objectFit: 'contain' }} />
                                                    ) : (
                                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>-</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '16px' }}>
                                                    <span style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '20px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        background: doc.status === 'Draft' ? 'rgba(100, 116, 139, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                                        color: doc.status === 'Draft' ? '#64748b' : '#10b981'
                                                    }}>
                                                        {doc.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '16px', textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => openDriveFolder(doc)}
                                                        style={{ background: 'none', border: 'none', color: (doc.drive_folder_id || doc.gdrive_folder_id) ? '#f59e0b' : '#6366f1', cursor: 'pointer', opacity: (doc.drive_folder_id || doc.gdrive_folder_id) ? 1 : 0.4 }}
                                                        title={(doc.drive_folder_id || doc.gdrive_folder_id) ? "Open Drive Folder" : "Provision Drive Folder"}
                                                    >
                                                        <Folder size={20} fill={(doc.drive_folder_id || doc.gdrive_folder_id) ? "#f59e0b" : "currentColor"} fillOpacity={0.2} />
                                                    </button>
                                                </td>
                                                <td style={{ padding: '16px', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                        <button
                                                            className="btn btn-sm btn-secondary"
                                                            onClick={() => navigate(`/workflows/editor/certificate/${doc.id}`)}
                                                            title="Open Editor"
                                                        >
                                                            <Eye size={14} /> Open
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-secondary"
                                                            onClick={() => handlePrintPreview(doc.id)}
                                                            title="Print / Save PDF"
                                                        >
                                                            <Printer size={14} />
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-secondary"
                                                            style={{ color: '#3b82f6' }}
                                                            onClick={() => handleDuplicateWorkflow(doc.id)}
                                                            title="Duplicate Certificate"
                                                        >
                                                            <Copy size={14} />
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-secondary"
                                                            style={{ color: '#8b5cf6' }}
                                                            onClick={() => handleShowWorkflowHistory(doc)}
                                                            title="View Revision History"
                                                        >
                                                            <Clock size={14} />
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-secondary"
                                                            style={{ color: '#ef4444', borderColor: '#fecaca', background: '#fef2f2' }}
                                                            onClick={() => handleDeleteWorkflow(doc.id)}
                                                            title="Delete Certificate"
                                                        >
                                                            <Trash2 size={14} />
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
                </div>
            )}

            {activeTab === 'templates' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 4fr', gap: '24px', height: 'calc(100vh - 250px)' }}>
                    {/* Left Side: Multi-upload */}
                    <div className="glass-panel" style={{ background: '#fff', borderRadius: '24px', padding: '24px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                            <div style={{ background: '#f0f9ff', width: '64px', height: '64px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#0369a1' }}>
                                <Plus size={32} />
                            </div>
                            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem' }}>Upload Templates</h3>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Select multiple .doc or .pdf files</p>
                        </div>

                        <div
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={async (e) => {
                                e.preventDefault();
                                const files = Array.from(e.dataTransfer.files);
                                await handleMultiUpload(files);
                            }}
                            style={{
                                flex: 1,
                                border: '2px dashed #e2e8f0',
                                borderRadius: '16px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '20px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                background: '#f8fafc'
                            }}
                            onClick={() => document.getElementById('multi-upload-input').click()}
                        >
                            <Download size={32} color="#94a3b8" style={{ marginBottom: '12px' }} />
                            <span style={{ fontSize: '0.9rem', color: '#64748b', textAlign: 'center' }}>Drag & Drop or click to browse</span>
                            <input
                                id="multi-upload-input"
                                type="file"
                                multiple
                                accept=".doc,.docx,.pdf"
                                style={{ display: 'none' }}
                                onChange={async (e) => {
                                    const files = Array.from(e.target.files);
                                    await handleMultiUpload(files);
                                }}
                            />
                        </div>

                        {isUploading && (
                            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>
                                <Loader2 size={16} className="animate-spin" /> Uploading files...
                            </div>
                        )}
                    </div>

                    {/* Right Side: GDrive Explorer */}
                    <div className="glass-panel" style={{ background: '#fff', borderRadius: '24px', padding: '24px', border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: '#4285F4', padding: '8px', borderRadius: '10px', color: '#fff' }}>
                                    <Brain size={20} />
                                </div>
                                <h3 style={{ margin: 0 }}>Template Explorer</h3>
                            </div>
                            <button
                                onClick={fetchTemplates}
                                style={{ background: 'none', border: '1px solid #e2e8f0', padding: '8px', borderRadius: '8px', color: '#64748b', cursor: 'pointer' }}
                                title="Refresh List"
                            >
                                <RefreshCcw size={18} />
                            </button>
                        </div>

                        {/* Search and View Toggle */}
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'center' }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input
                                    type="text"
                                    placeholder="Search by title, type, or author..."
                                    className="form-input"
                                    value={templateSearchTerm}
                                    onChange={(e) => setTemplateSearchTerm(e.target.value)}
                                    style={{ paddingLeft: '40px', width: '100%' }}
                                />
                            </div>
                            <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', gap: '4px' }}>
                                <button
                                    onClick={() => setTemplateViewMode('grid')}
                                    style={{
                                        padding: '6px', borderRadius: '8px', border: 'none',
                                        background: templateViewMode === 'grid' ? '#fff' : 'transparent',
                                        color: templateViewMode === 'grid' ? '#4285F4' : '#94a3b8',
                                        cursor: 'pointer', display: 'flex', boxShadow: templateViewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                    }}
                                >
                                    <LayoutGrid size={18} />
                                </button>
                                <button
                                    onClick={() => setTemplateViewMode('list')}
                                    style={{
                                        padding: '6px', borderRadius: '8px', border: 'none',
                                        background: templateViewMode === 'list' ? '#fff' : 'transparent',
                                        color: templateViewMode === 'list' ? '#4285F4' : '#94a3b8',
                                        cursor: 'pointer', display: 'flex', boxShadow: templateViewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                    }}
                                >
                                    <List size={18} />
                                </button>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {!sessionStorage.getItem('google_contacts_token') ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '20px', padding: '40px', textAlign: 'center' }}>
                                    <div style={{ background: '#fef2f2', padding: '24px', borderRadius: '50%', color: '#ef4444' }}>
                                        <AlertCircle size={48} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: '0 0 8px 0' }}>Google Drive Disconnected</h3>
                                        <p style={{ margin: 0, color: '#64748b', maxWidth: '400px' }}>
                                            Connect your Google account to access your certificate templates and upload new ones.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => connectGoogleAPI('calibration_lab')}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            background: '#4285F4',
                                            color: '#fff',
                                            border: 'none',
                                            padding: '12px 24px',
                                            borderRadius: '12px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 6px -1px rgba(66, 133, 244, 0.3)'
                                        }}
                                    >
                                        <Globe size={20} />
                                        Connect Google Drive
                                    </button>
                                </div>
                            ) : loadingTemplates ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', padding: '10px', justifyContent: 'center' }}>
                                    <Loader2 size={32} className="animate-spin" color="#e2e8f0" />
                                </div>
                            ) : (
                                <>
                                    {templateViewMode === 'grid' ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                                            {filteredTemplates.length === 0 ? (
                                                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
                                                    {templateSearchTerm ? `No templates matching "${templateSearchTerm}"` : 'No templates found in drive.'}
                                                </div>
                                            ) : (
                                                filteredTemplates.map(file => (
                                                    <div
                                                        key={file.id}
                                                        className="template-card"
                                                        style={{
                                                            padding: '20px',
                                                            borderRadius: '20px',
                                                            border: '1px solid #f1f5f9',
                                                            background: '#fff',
                                                            transition: 'all 0.2s',
                                                            cursor: 'default',
                                                            position: 'relative'
                                                        }}
                                                    >
                                                        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                                                            {file.mimeType.includes('pdf') ? (
                                                                <FileText size={56} color="#ef4444" />
                                                            ) : (
                                                                <FileText size={56} color="#4285F4" />
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>
                                                            {file.name}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                            {(file.size / 1024).toFixed(1)} KB
                                                        </div>
                                                        <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
                                                            <button
                                                                onClick={() => window.open(file.webViewLink, '_blank')}
                                                                style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#4285F4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                                title="Preview"
                                                            >
                                                                <ExternalLink size={16} />
                                                            </button>
                                                            <button
                                                                onClick={async () => {
                                                                    if (window.confirm(`Delete ${file.name}?`)) {
                                                                        const token = sessionStorage.getItem('google_contacts_token');
                                                                        await deleteFile(token, file.id);
                                                                        fetchTemplates();
                                                                    }
                                                                }}
                                                                style={{ padding: '8px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fff', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                                title="Delete"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {filteredTemplates.length === 0 ? (
                                                <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
                                                    {templateSearchTerm ? `No templates matching "${templateSearchTerm}"` : 'No templates found in drive.'}
                                                </div>
                                            ) : (
                                                <div style={{ border: '1px solid #f1f5f9', borderRadius: '16px', overflow: 'hidden' }}>
                                                    {filteredTemplates.map((file, idx) => (
                                                        <div
                                                            key={file.id}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                padding: '16px 24px',
                                                                background: idx % 2 === 0 ? '#fff' : '#f8fafc',
                                                                borderBottom: idx === filteredTemplates.length - 1 ? 'none' : '1px solid #f1f5f9',
                                                                transition: 'background 0.2s'
                                                            }}
                                                        >
                                                            <div style={{ marginRight: '16px' }}>
                                                                {file.mimeType.includes('pdf') ? (
                                                                    <FileText size={24} color="#ef4444" />
                                                                ) : (
                                                                    <FileText size={24} color="#4285F4" />
                                                                )}
                                                            </div>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>{file.name}</div>
                                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{(file.size / 1024).toFixed(1)} KB</div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                                <button
                                                                    onClick={() => window.open(file.webViewLink, '_blank')}
                                                                    style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#4285F4' }}
                                                                    title="Preview"
                                                                >
                                                                    <ExternalLink size={18} />
                                                                </button>
                                                                <button
                                                                    onClick={async () => {
                                                                        if (window.confirm(`Delete ${file.name}?`)) {
                                                                            const token = sessionStorage.getItem('google_contacts_token');
                                                                            await deleteFile(token, file.id);
                                                                            fetchTemplates();
                                                                        }
                                                                    }}
                                                                    style={{ padding: '8px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fff', cursor: 'pointer', color: '#ef4444' }}
                                                                    title="Delete"
                                                                >
                                                                    <Trash2 size={18} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'library' && (
                <div style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', gap: '16px', flex: 1 }}>
                            <div style={{ position: 'relative', flex: 1, maxWidth: '500px' }}>
                                <Search style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }} size={18} />
                                <input
                                    type="text"
                                    placeholder="Search instruments by name, maker, model, or S/N..."
                                    className="form-input"
                                    value={instrumentSearchTerm}
                                    onChange={(e) => setInstrumentSearchTerm(e.target.value)}
                                    style={{ paddingLeft: '40px', width: '100%', height: '44px' }}
                                />
                            </div>
                            <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                <button
                                    onClick={() => setInstrumentViewMode('grid')}
                                    style={{ padding: '8px', borderRadius: '8px', border: 'none', background: instrumentViewMode === 'grid' ? '#fff' : 'transparent', color: instrumentViewMode === 'grid' ? '#10b981' : '#64748b', boxShadow: instrumentViewMode === 'grid' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer' }}
                                >
                                    <LayoutGrid size={20} />
                                </button>
                                <button
                                    onClick={() => setInstrumentViewMode('list')}
                                    style={{ padding: '8px', borderRadius: '8px', border: 'none', background: instrumentViewMode === 'list' ? '#fff' : 'transparent', color: instrumentViewMode === 'list' ? '#10b981' : '#64748b', boxShadow: instrumentViewMode === 'list' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer' }}
                                >
                                    <List size={20} />
                                </button>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                setEditingInstrument(null);
                                setInstrumentFormData({ name: '', maker: '', model: '', serial_no: '', description: '', youtube_link: '', manual_url: '', notes: '' });
                                setIsInstrumentModalOpen(true);
                            }}
                            className="btn btn-primary"
                            style={{ background: '#10b981', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px' }}
                        >
                            <Plus size={20} /> Add Instrument
                        </button>
                    </div>

                    {instrumentViewMode === 'grid' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                            {filteredInstruments.map(ins => (
                                <div key={ins.id} className="glass-panel" style={{ background: '#fff', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px', transition: 'transform 0.2s', cursor: 'default' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <div style={{ background: '#f0fdf4', color: '#10b981', padding: '8px', borderRadius: '12px' }}>
                                                <FileCheck size={24} />
                                            </div>
                                            {(() => {
                                                const status = getHealthStatus(ins.last_due_date);
                                                return (
                                                    <div style={{
                                                        background: status.bgColor,
                                                        color: status.color,
                                                        padding: '4px 10px',
                                                        borderRadius: '20px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        <Clock size={12} /> {status.label}
                                                        {status.days !== 0 && ` (${status.days > 0 ? '+' : ''}${status.days}d)`}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => showQR(ins)} style={{ padding: '6px', borderRadius: '8px', border: 'none', background: '#f8fafc', color: '#10b981', cursor: 'pointer' }} title="Print QR"><QrCode size={16} /></button>
                                            <button onClick={() => fetchHistory(ins.id, ins.name)} style={{ padding: '6px', borderRadius: '8px', border: 'none', background: '#f8fafc', color: '#6366f1', cursor: 'pointer' }} title="Service History"><Clock size={16} /></button>
                                            <button onClick={() => handleEditInstrument(ins)} style={{ padding: '6px', borderRadius: '8px', border: 'none', background: '#f8fafc', color: '#64748b', cursor: 'pointer' }} title="Edit"><Pencil size={16} /></button>
                                            <button onClick={() => handleInstrumentDelete(ins.id)} style={{ padding: '6px', borderRadius: '8px', border: 'none', background: '#f8fafc', color: '#ef4444', cursor: 'pointer' }} title="Delete"><Trash size={16} /></button>
                                        </div>
                                    </div>
                                    <div>
                                        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', color: '#1e293b' }}>{ins.name}</h3>
                                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>{ins.maker} {ins.model}</p>
                                        <p style={{ margin: '4px 0 0 0', fontStyle: 'italic', fontSize: '0.85rem', color: '#94a3b8' }}>S/N: {ins.serial_no}</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                                        {ins.youtube_link && (
                                            <button onClick={() => { setActiveResource(ins.youtube_link); setViewerType('youtube'); }} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                                                <Youtube size={16} /> YouTube
                                            </button>
                                        )}
                                        {ins.manual_url && (
                                            <button onClick={() => { setActiveResource(ins.manual_url); setViewerType('manual'); }} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                                                <Book size={16} /> Manual
                                            </button>
                                        )}
                                        <button
                                            className="btn btn-secondary"
                                            style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                                            onClick={() => window.open(`/smart-assistant?context=${encodeURIComponent(ins.name + ' ' + ins.model)}`, '_blank')}
                                        >
                                            <Brain size={16} /> AI Chat
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="glass-panel" style={{ background: '#fff', borderRadius: '20px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ background: '#f8fafc' }}>
                                    <tr>
                                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.9rem', color: '#64748b' }}>Instrument Name</th>
                                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.9rem', color: '#64748b' }}>Maker / Model</th>
                                        <th style={{ padding: '16px', textAlign: 'right', fontSize: '0.9rem', color: '#64748b' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredInstruments.map(ins => (
                                        <tr key={ins.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '16px', fontWeight: 600, color: '#1e293b' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    {ins.name}
                                                    {(() => {
                                                        const status = getHealthStatus(ins.last_due_date);
                                                        return (
                                                            <span style={{
                                                                background: status.bgColor,
                                                                color: status.color,
                                                                padding: '2px 8px',
                                                                borderRadius: '12px',
                                                                fontSize: '0.7rem'
                                                            }}>
                                                                {status.label}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px', color: '#475569' }}>{ins.maker} / {ins.model}</td>
                                            <td style={{ padding: '16px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                    <button onClick={() => fetchHistory(ins.id, ins.name)} style={{ padding: '8px', borderRadius: '8px', border: 'none', background: '#fff', color: '#6366f1', cursor: 'pointer' }} title="History"><Clock size={18} /></button>
                                                    {ins.youtube_link && <button onClick={() => { setActiveResource(ins.youtube_link); setViewerType('youtube'); }} style={{ padding: '8px', borderRadius: '8px', border: 'none', background: '#fff', color: '#ef4444', cursor: 'pointer' }}><Youtube size={18} /></button>}
                                                    {ins.manual_url && <button onClick={() => { setActiveResource(ins.manual_url); setViewerType('manual'); }} style={{ padding: '8px', borderRadius: '8px', border: 'none', background: '#fff', color: '#10b981', cursor: 'pointer' }}><Book size={18} /></button>}
                                                    <button onClick={() => window.open(`/smart-assistant?context=${encodeURIComponent(ins.name + ' ' + ins.model)}`, '_blank')} style={{ padding: '8px', borderRadius: '8px', border: 'none', background: '#fff', color: '#1e293b', cursor: 'pointer' }}><Brain size={18} /></button>
                                                    <button onClick={() => handleEditInstrument(ins)} style={{ padding: '8px', borderRadius: '8px', border: 'none', background: '#fff', color: '#64748b', cursor: 'pointer' }}><Pencil size={18} /></button>
                                                    <button onClick={() => handleInstrumentDelete(ins.id)} style={{ padding: '8px', borderRadius: '8px', border: 'none', background: '#fff', color: '#ef4444', cursor: 'pointer' }}><Trash size={18} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Instrument Create/Edit Modal */}
            {isInstrumentModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100, padding: '20px' }} onClick={() => setIsInstrumentModalOpen(false)}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', background: '#fff', borderRadius: '24px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ margin: 0, color: '#1e293b' }}>{editingInstrument ? 'Edit Instrument' : 'Add New Instrument'}</h2>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={() => {
                                        const query = `${instrumentFormData.name} ${instrumentFormData.maker} ${instrumentFormData.model}`.trim();
                                        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank');
                                    }}
                                    className="btn btn-secondary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px' }}
                                >
                                    <Search size={14} /> YouTube
                                </button>
                                <button
                                    onClick={() => {
                                        const query = `${instrumentFormData.name} ${instrumentFormData.maker} ${instrumentFormData.model}`.trim();
                                        window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
                                    }}
                                    className="btn btn-secondary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px' }}
                                >
                                    <Search size={14} /> Google
                                </button>
                            </div>
                        </div>
                        <form onSubmit={handleInstrumentSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label className="form-label">Instrument Name</label>
                                <input className="form-input" value={instrumentFormData.name} onChange={e => setInstrumentFormData({ ...instrumentFormData, name: e.target.value })} required />
                            </div>
                            <div>
                                <label className="form-label">Maker / Manufacturer</label>
                                <input className="form-input" value={instrumentFormData.maker} onChange={e => setInstrumentFormData({ ...instrumentFormData, maker: e.target.value })} />
                            </div>
                            <div>
                                <label className="form-label">Model Number</label>
                                <input className="form-input" value={instrumentFormData.model} onChange={e => setInstrumentFormData({ ...instrumentFormData, model: e.target.value })} />
                            </div>
                            <div>
                                <label className="form-label">YouTube Tutorial Link</label>
                                <input className="form-input" value={instrumentFormData.youtube_link} onChange={e => setInstrumentFormData({ ...instrumentFormData, youtube_link: e.target.value })} placeholder="https://youtube.com/..." />
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label className="form-label">Maker's Manual URL (NotebookLM/PDF)</label>
                                <input className="form-input" value={instrumentFormData.manual_url} onChange={e => setInstrumentFormData({ ...instrumentFormData, manual_url: e.target.value })} placeholder="https://manual_url.com/..." />
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label className="form-label">Rich Description / Notes</label>
                                <textarea className="form-input" value={instrumentFormData.description} onChange={e => setInstrumentFormData({ ...instrumentFormData, description: e.target.value })} style={{ height: '100px', resize: 'vertical' }} />
                            </div>
                            <div style={{ gridColumn: 'span 2', display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                                <button type="button" onClick={() => setIsInstrumentModalOpen(false)} className="btn btn-secondary">Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ background: '#10b981' }}>{editingInstrument ? 'Update Instrument' : 'Add to Library'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Hidden Certificate Template for PDF Generation */}
            <div id="certificate-template" style={{ display: 'none', width: '100%', padding: '40px', fontFamily: 'Arial, sans-serif', color: '#1e293b', background: '#fff' }}>
                <div style={{ border: '4px solid #10b981', padding: '30px' }}>
                    <header style={{ textAlign: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '20px', marginBottom: '30px' }}>
                        <h1 style={{ color: '#10b981', margin: '0 0 10px 0', fontSize: '28px' }}>CERTIFICATE OF CALIBRATION</h1>
                        <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>Cel-Ron Enterprises - Global Maritime Excellence</p>
                    </header>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginBottom: '40px' }}>
                        <div>
                            <h3 style={{ color: '#10b981', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>Customer & Vessel Details</h3>
                            <p><strong>Vessel:</strong> {vessels.find(v => v.id === formData.vessel_id)?.vessel_name || vessels.find(v => v.id === formData.vessel_id)?.name}</p>
                            <p><strong>Customer:</strong> {partners.find(p => p.id === formData.customer_id)?.name}</p>
                            <p><strong>Job No:</strong> {jobs.find(j => j.id === formData.job_id)?.job_no || formData.job_no}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <h3 style={{ color: '#10b981', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>Date of Calibration</h3>
                            <p style={{ fontSize: '18px', fontWeight: 700 }}>{formData.calibration_date}</p>
                            <h3 style={{ color: '#ef4444', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginTop: '16px' }}>Due Date</h3>
                            <p style={{ fontSize: '18px', fontWeight: 700 }}>{formData.due_date}</p>
                        </div>
                    </div>

                    <div style={{ marginBottom: '40px' }}>
                        <h3 style={{ color: '#10b981', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>Instrument Readings (Relational Data)</h3>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    <th style={{ padding: '12px', border: '1px solid #e2e8f0', textAlign: 'left' }}>Instrument / Model</th>
                                    <th style={{ padding: '12px', border: '1px solid #e2e8f0', textAlign: 'left' }}>Serial No.</th>
                                    <th style={{ padding: '12px', border: '1px solid #e2e8f0' }}>Standard</th>
                                    <th style={{ padding: '12px', border: '1px solid #e2e8f0' }}>Actual</th>
                                    <th style={{ padding: '12px', border: '1px solid #e2e8f0' }}>Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {formData.selectedInstruments.map((item, idx) => (
                                    <tr key={idx}>
                                        <td style={{ padding: '12px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontWeight: 600 }}>{item.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{item.maker} {item.model}</div>
                                        </td>
                                        <td style={{ padding: '12px', border: '1px solid #e2e8f0' }}>{item.serial_no}</td>
                                        <td style={{ padding: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{item.standard_reading}</td>
                                        <td style={{ padding: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{item.actual_reading}</td>
                                        <td style={{ padding: '12px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 'bold', color: item.result === 'Pass' ? '#166534' : '#991b1b' }}>{item.result}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop: '20px' }}>
                        <h3 style={{ color: '#10b981', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>Final Remarks</h3>
                        <p><strong>Category:</strong> {formData.remark_category}</p>
                        <div style={{ padding: '15px', background: '#f8fafc', borderRadius: '8px', minHeight: '80px', marginTop: '10px', whiteSpace: 'pre-wrap' }}>
                            {formData.remark || "No specific remarks."}
                        </div>
                    </div>

                    <footer style={{ marginTop: '50px', paddingTop: '20px', borderTop: '2px solid #e2e8f0', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
                        <p>This is a computer-generated certificate stored in CelronHub Cloud Systems.</p>
                        <p>© Cel-Ron Enterprises Pte Ltd</p>
                    </footer>
                </div>
            </div>

            {/* Resource Viewers (YouTube / Manual) */}
            {
                viewerType && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                        <div style={{ background: '#fff', width: '100%', maxWidth: '1200px', height: '80vh', borderRadius: '24px', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
                                <h3 style={{ margin: 0 }}>{viewerType === 'youtube' ? 'YouTube Tutorial' : 'Maker\'s Manual'}</h3>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button
                                        onClick={() => window.open('https://notebooklm.google.com/', '_blank')}
                                        className="btn-primary"
                                        style={{ padding: '8px 16px', borderRadius: '8px', background: '#4285F4', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', border: 'none', cursor: 'pointer' }}
                                    >
                                        AI Assist <Sparkles size={18} />
                                    </button>
                                    <button onClick={() => { setViewerType(null); setActiveResource(null); }} style={{ padding: '8px', borderRadius: '50%', border: 'none', background: '#f1f5f9', cursor: 'pointer' }}>
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>
                            <div style={{ flex: 1 }}>
                                {viewerType === 'youtube' ? (
                                    <iframe
                                        width="100%"
                                        height="100%"
                                        src={`https://www.youtube.com/embed/${getYouTubeId(activeResource)}`}
                                        frameBorder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                    ></iframe>
                                ) : (
                                    <iframe src={activeResource} width="100%" height="100%" frameBorder="0"></iframe>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Instrument History Modal */}
            {isHistoryModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10001, padding: '20px' }} onClick={() => setIsHistoryModalOpen(false)}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '800px', background: '#fff', borderRadius: '24px', padding: '32px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
                            <h2 style={{ margin: 0, color: '#1e293b' }}>History: {selectedInstrumentTitle}</h2>
                            <button onClick={() => setIsHistoryModalOpen(false)} style={{ padding: '8px', borderRadius: '50%', border: 'none', background: '#f1f5f9', cursor: 'pointer' }}>
                                <Trash2 size={20} />
                            </button>
                        </div>

                        {loadingHistory ? (
                            <div style={{ textAlign: 'center', padding: '40px' }}>
                                <div className="animate-spin" style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #6366f1', borderRadius: '50%', margin: '0 auto' }}></div>
                            </div>
                        ) : instrumentHistory.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                <Clock size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                                <p>No calibration history found for this instrument.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {instrumentHistory.map((item, idx) => (
                                    <div key={idx} style={{
                                        padding: '20px',
                                        borderRadius: '16px',
                                        borderLeft: `4px solid ${item.result === 'Pass' ? '#10b981' : '#ef4444'}`,
                                        background: '#f8fafc',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                                                    {item.record.vessel?.vessel_name || 'Generic Service'}
                                                </div>
                                                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                    Job No: {item.record.job_no} | Date: {item.record.calibration_date}
                                                </div>
                                            </div>
                                            <div style={{
                                                background: item.result === 'Pass' ? '#f0fdf4' : '#fef2f2',
                                                color: item.result === 'Pass' ? '#10b981' : '#ef4444',
                                                padding: '4px 12px',
                                                borderRadius: '20px',
                                                fontSize: '0.8rem',
                                                fontWeight: 800
                                            }}>
                                                {item.result.toUpperCase()}
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '12px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Standard Reading</div>
                                                <div style={{ fontWeight: 600 }}>{item.standard_reading}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Actual Reading</div>
                                                <div style={{ fontWeight: 600 }}>{item.actual_reading}</div>
                                            </div>
                                        </div>
                                        <div style={{ alignSelf: 'flex-end', display: 'flex', gap: '8px' }}>
                                            {item.record.workflow_doc_id ? (
                                                <button
                                                    onClick={() => navigate(`/workflows/editor/certificate/${item.record.workflow_doc_id}`)}
                                                    style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #e0e7ff', background: '#fff', fontSize: '0.8rem', fontWeight: 600, color: '#6366f1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                                >
                                                    <FileText size={14} /> Workflow Cert
                                                </button>
                                            ) : item.record.certificate_url && (
                                                <button
                                                    onClick={() => window.open(item.record.certificate_url, '_blank')}
                                                    style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.8rem', fontWeight: 600, color: '#4285F4', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                                >
                                                    <Download size={14} /> View PDF
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* QR Code Modal */}
            {isQRModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10002, padding: '20px' }} onClick={() => setIsQRModalOpen(false)}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', background: '#fff', borderRadius: '24px', padding: '32px', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ marginBottom: '8px', color: '#1e293b' }}>Instrument QR Tag</h2>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '24px' }}>{selectedInstrumentTitle}</p>

                        <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', display: 'inline-block', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                            <QRCodeSVG value={qrValue} size={200} level="H" includeMargin={true} />
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => window.print()} className="btn btn-secondary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <Download size={18} /> Print Tag
                            </button>
                            <button onClick={() => setIsQRModalOpen(false)} className="btn btn-primary" style={{ flex: 1 }}>Close</button>
                        </div>
                        <p style={{ marginTop: '16px', fontSize: '0.75rem', color: '#94a3b8' }}>Scanning this QR in "New Calibration" will auto-fill the instrument details.</p>
                    </div>
                </div>
            )}
            {/* Standardized Upload Overlay */}
            <UploadOverlay 
                isVisible={uploadProgress > 0 || !!uploadLink} 
                progress={uploadProgress} 
                title="Processing Certificates..."
                locationLink={uploadLink}
                onClose={() => {
                    setUploadProgress(0);
                    setUploadLink(null);
                }}
            />

            <GDriveConnectionModal 
                isOpen={isAuthModalOpen} 
                onClose={() => setIsAuthModalOpen(false)} 
                state="calibration_template_upload"
            />

            {/* Master Data Edit Modal */}
            {editModal.isOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: '24px' }}>
                    <div style={{ width: '100%', maxWidth: '1000px', maxHeight: '90vh', background: 'white', borderRadius: '16px', padding: '32px', overflowY: 'auto', position: 'relative' }}>
                        <button onClick={() => setEditModal({ isOpen: false, type: null })} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} /></button>
                        {editModal.type === 'vessel_id' ? (
                            <QuickVesselAdd 
                                company_id={partners[0]?.company_id} // Fallback to first partner's company_id
                                initialData={editModal.initialData} 
                                onSuccess={handleEditMasterSuccess} 
                                onCancel={() => setEditModal({ isOpen: false, type: null })} 
                            />
                        ) : (
                            <QuickPartnerAdd 
                                company_id={partners[0]?.company_id} 
                                initialData={editModal.initialData} 
                                onSuccess={handleEditMasterSuccess} 
                                onCancel={() => setEditModal({ isOpen: false, type: null })} 
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Revision History Modal */}
            {historyDoc && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10005, padding: '24px' }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '800px', background: '#fff', borderRadius: '24px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <div>
                                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: '#1e293b' }}>
                                    <Clock size={24} color="#6366f1" /> Revision History
                                </h2>
                                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.9rem' }}>Tracking changes for {historyDoc.document_no}</p>
                            </div>
                            <button onClick={() => setHistoryDoc(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
                            {loadingHistory ? (
                                <div style={{ textAlign: 'center', padding: '40px' }}>
                                    <Loader2 className="animate-spin" style={{ margin: '0 auto 16px' }} />
                                    <p style={{ color: '#64748b' }}>Loading history data...</p>
                                </div>
                            ) : historyItems.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                    <Clock size={48} style={{ opacity: 0.1, marginBottom: '16px' }} />
                                    <p>No revision history found for this document.</p>
                                </div>
                            ) : (
                                <div style={{ position: 'relative', paddingLeft: '32px' }}>
                                    <div style={{ position: 'absolute', left: '11px', top: 0, bottom: 0, width: '2px', background: '#f1f5f9' }} />
                                    {historyItems.map((item, index) => (
                                        <div key={item.id} style={{ position: 'relative', marginBottom: '32px' }}>
                                            <div style={{ position: 'absolute', left: '-26px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', background: index === 0 ? '#6366f1' : '#cbd5e1', border: '3px solid #fff', boxShadow: '0 0 0 1px #f1f5f9' }} />
                                            <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '20px', border: '1px solid #f1f5f9' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                                    <div>
                                                        <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '1rem' }}>{item.action_type}</div>
                                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{new Date(item.created_at).toLocaleString()}</div>
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6366f1', background: '#eef2ff', padding: '4px 10px', borderRadius: '20px' }}>
                                                        {item.action_by_name || 'System User'}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.5, background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                                    {item.description || 'No description provided.'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={() => setHistoryDoc(null)} className="btn btn-primary" style={{ padding: '10px 30px' }}>Done</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
