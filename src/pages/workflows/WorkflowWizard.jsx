import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { 
    FileText, ArrowLeft, Save, Sparkles, RefreshCcw, CheckCircle, 
    Smartphone, Folder, HelpCircle, History, Trash2, X, AlertCircle, Play, ExternalLink, Upload 
} from 'lucide-react';
import toast from 'react-hot-toast';

import ModuleSwitcherHeader from '../../components/common/ModuleSwitcherHeader';
import WizardProgressBar, { WIZARD_STEPS } from '../../components/workflow-wizard/WizardProgressBar';
import StepEnquiryLanding from '../../components/workflow-wizard/StepEnquiryLanding';
import StepQuotationCosting from '../../components/workflow-wizard/StepQuotationCosting';
import StepCustomerPO from '../../components/workflow-wizard/StepCustomerPO';
import StepOrdersToSuppliers from '../../components/workflow-wizard/StepOrdersToSuppliers';
import StepJobExecution from '../../components/workflow-wizard/StepJobExecution';
import StepSupplierInvoices from '../../components/workflow-wizard/StepSupplierInvoices';
import StepSupplierAndJobExecution from '../../components/workflow-wizard/StepSupplierAndJobExecution';
import StepDeliveryOrder from '../../components/workflow-wizard/StepDeliveryOrder';
import StepInvoicing from '../../components/workflow-wizard/StepInvoicing';
import StepPaymentReceived from '../../components/workflow-wizard/StepPaymentReceived';
import StepExpensesAndProfit from '../../components/workflow-wizard/StepExpensesAndProfit';
import StepJobDriveExplorer from '../../components/workflow-wizard/StepJobDriveExplorer';
import WorkflowUploadModal from '../../components/workflow-wizard/WorkflowUploadModal';

const DRAFT_STORAGE_KEY = 'celron_workflow_wizard_active_draft';
const DRAFT_HISTORY_KEY = 'celron_workflow_wizard_saved_drafts';

export default function WorkflowWizard() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [currentStep, setCurrentStep] = useState(0);
    const [completedSteps, setCompletedSteps] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [loadingData, setLoadingData] = useState(true);
    
    // Draft & Upload states
    const [activeDraftFound, setActiveDraftFound] = useState(null);
    const [savedDraftsList, setSavedDraftsList] = useState([]);
    const [showDraftsModal, setShowDraftsModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);

    // Supabase datasets for searchable select dropdowns
    const [partners, setPartners] = useState([]);
    const [contacts, setContacts] = useState([]);
    const [vessels, setVessels] = useState([]);
    const [workLocations, setWorkLocations] = useState([]);
    const [catalogItems, setCatalogItems] = useState([]);
    const [staff, setStaff] = useState([]);
    const [settings, setSettings] = useState(null);

    // Main Wizard State
    const [wizardData, setWizardData] = useState({
        // Step 1
        enquiryNo: '',
        landingNoteFile: null,
        landingNoteUrl: '',
        landingNoteDriveId: null,
        partnerId: '',
        customerName: '',
        contactId: '',
        vesselId: '',
        workLocationId: '',
        subject: '',
        
        // Step 2
        linkedQuotationId: null,
        quotationNo: '',
        quotationDate: new Date().toISOString().split('T')[0],
        lineItems: [
            { id: 1, description: 'Supply & Technical Service Works', quantity: 1, uom: 'LOT', unit_price: 0, tax_enabled: true, amount: 0 }
        ],
        subtotal: 0,
        taxAmount: 0,
        grandTotal: 0,
        quotationFile: null,
        quotationUrl: '',

        // Step 3 (Customer PO)
        customerPoNo: '',
        customerPoDate: new Date().toISOString().split('T')[0],
        customerPoAmount: 0,
        customerPoFile: null,
        customerPoUrl: '',
        isConvertedToJob: false,
        jobDriveFolderId: '',

        // Step 4 (Orders to Suppliers)
        supplierOrders: [],

        // Step 5 (Job Execution)
        jobNo: '',
        jobType: 'Service',
        engineerId: '',
        supplierPos: [],
        jobFile: null,
        jobUrl: '',

        // Step 6 (Supplier Invoices)
        supplierInvoices: [],

        // Step 5
        deliveryOrderNo: '',
        deliveryDate: new Date().toISOString().split('T')[0],
        receivedBy: '',
        signedDoFile: null,
        signedDoUrl: '',

        // Step 6
        invoiceNo: '',
        invoiceDate: new Date().toISOString().split('T')[0],
        paymentTerms: '30 Days',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        invoiceFile: null,
        invoiceUrl: '',

        // Step 7
        paymentNo: '',
        paymentMethod: 'Bank TT',
        paymentRef: '',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentAmount: 0,
        paymentProofFile: null,
        paymentProofUrl: ''
    });

    const companyId = profile?.company_id;

    // Load initial reference data & check for saved drafts on mount
    useEffect(() => {
        loadSupabaseDropdowns();
        checkSavedDrafts();
        const stepParam = searchParams.get('step');
        if (stepParam !== null && !isNaN(parseInt(stepParam))) {
            const parsedStep = parseInt(stepParam);
            if (parsedStep >= 0 && parsedStep <= 7) {
                setCurrentStep(parsedStep);
            }
        }
    }, [companyId, searchParams]);

    // Auto-save draft as user edits
    useEffect(() => {
        if (wizardData.enquiryNo || wizardData.partnerId || wizardData.customerName) {
            saveDraftAuto(wizardData, currentStep, completedSteps);
        }
    }, [wizardData, currentStep, completedSteps]);

    const checkSavedDrafts = () => {
        try {
            // Check active single draft
            const rawDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
            if (rawDraft) {
                const parsed = JSON.parse(rawDraft);
                if (parsed?.wizardData?.enquiryNo) {
                    setActiveDraftFound(parsed);
                }
            }

            // Check draft history list
            const rawHistory = localStorage.getItem(DRAFT_HISTORY_KEY);
            if (rawHistory) {
                const parsedList = JSON.parse(rawHistory);
                setSavedDraftsList(Array.isArray(parsedList) ? parsedList : []);
            }
        } catch (err) {
            console.error("Error reading saved drafts:", err);
        }
    };

    const saveDraftAuto = (data, step, stepsDone) => {
        try {
            const draftObj = {
                id: data.enquiryNo || `DRAFT-${Date.now()}`,
                wizardData: data,
                currentStep: step,
                completedSteps: stepsDone,
                updatedAt: new Date().toISOString()
            };
            localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftObj));
        } catch (e) {
            console.error("Error auto-saving draft:", e);
        }
    };

    const handleSaveDraftManual = () => {
        try {
            const draftId = wizardData.enquiryNo || `DRAFT-${Date.now().toString().slice(-4)}`;
            const draftObj = {
                id: draftId,
                title: `${wizardData.enquiryNo || 'Enquiry'} - ${wizardData.customerName || 'Customer'}`,
                wizardData,
                currentStep,
                completedSteps,
                updatedAt: new Date().toISOString()
            };

            // Save active
            localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftObj));

            // Save to history list
            const existingList = JSON.parse(localStorage.getItem(DRAFT_HISTORY_KEY) || '[]');
            const filtered = existingList.filter(d => d.id !== draftId);
            const updatedList = [draftObj, ...filtered];
            localStorage.setItem(DRAFT_HISTORY_KEY, JSON.stringify(updatedList));
            setSavedDraftsList(updatedList);

            toast.success(`Half-entered form saved! (${draftId})`);
        } catch (e) {
            console.error("Error saving manual draft:", e);
            toast.error("Failed to save draft.");
        }
    };

    const handleRestoreDraft = (draftToRestore) => {
        if (!draftToRestore || !draftToRestore.wizardData) return;
        setWizardData(draftToRestore.wizardData);
        setCurrentStep(draftToRestore.currentStep || 1);
        setCompletedSteps(draftToRestore.completedSteps || []);
        setActiveDraftFound(null);
        setShowDraftsModal(false);
        toast.success(`Retrieved draft for ${draftToRestore.wizardData.enquiryNo || 'Form'}! Restored at Step ${draftToRestore.currentStep || 1}.`);
    };

    const handleDeleteDraft = (draftId) => {
        const updatedList = savedDraftsList.filter(d => d.id !== draftId);
        localStorage.setItem(DRAFT_HISTORY_KEY, JSON.stringify(updatedList));
        setSavedDraftsList(updatedList);

        const activeDraft = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || '{}');
        if (activeDraft.id === draftId) {
            localStorage.removeItem(DRAFT_STORAGE_KEY);
            setActiveDraftFound(null);
        }
        toast.success("Draft removed.");
    };

    const handleStartFresh = () => {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        setActiveDraftFound(null);
        window.location.reload();
    };

    const loadSupabaseDropdowns = async () => {
        setLoadingData(true);
        try {
            let pQuery = supabase.from('partners').select('id, name, city, company_id').order('name');
            let cQuery = supabase.from('contacts').select('id, name, email, phone, company_id, "partnerId"').order('name');
            let vQuery = supabase.from('vessels').select('id, vessel_name, imo_number, company_id').order('vessel_name');
            let wQuery = supabase.from('work_locations').select('id, location_name, pincode, company_id').order('location_name');
            let catQuery = supabase.from('catalog_items').select('id, name, details, selling_price, company_id').order('name');
            let sQuery = supabase.from('profiles').select('id, full_name, email, role, company_id');

            if (companyId) {
                pQuery = pQuery.or(`company_id.eq.${companyId},is_shared.eq.true,company_id.is.null`);
                cQuery = cQuery.or(`company_id.eq.${companyId},is_shared.eq.true,company_id.is.null`);
                vQuery = vQuery.or(`company_id.eq.${companyId},is_shared.eq.true,company_id.is.null`);
                wQuery = wQuery.or(`company_id.eq.${companyId},is_shared.eq.true,company_id.is.null`);
                catQuery = catQuery.or(`company_id.eq.${companyId},company_id.is.null`);
                sQuery = sQuery.or(`company_id.eq.${companyId},company_id.is.null`);
            }

            const [
                { data: pData },
                { data: cData },
                { data: vData },
                { data: wData },
                { data: catData },
                { data: sData }
            ] = await Promise.all([pQuery, cQuery, vQuery, wQuery, catQuery, sQuery]);

            if (companyId && (!pData || pData.length === 0)) {
                const { data: fbP } = await supabase.from('partners').select('id, name, city').order('name').limit(500);
                setPartners(fbP || []);
            } else {
                setPartners(pData || []);
            }

            if (companyId && (!cData || cData.length === 0)) {
                const { data: fbC } = await supabase.from('contacts').select('id, name, email, phone, "partnerId"').order('name').limit(500);
                setContacts(fbC || []);
            } else {
                setContacts(cData || []);
            }

            if (companyId && (!vData || vData.length === 0)) {
                const { data: fbV } = await supabase.from('vessels').select('id, vessel_name, imo_number').order('vessel_name').limit(500);
                setVessels(fbV || []);
            } else {
                setVessels(vData || []);
            }

            if (companyId && (!wData || wData.length === 0)) {
                const { data: fbW } = await supabase.from('work_locations').select('id, location_name, pincode').order('location_name').limit(500);
                setWorkLocations(fbW || []);
            } else {
                setWorkLocations(wData || []);
            }

            if (companyId && (!catData || catData.length === 0)) {
                const { data: fbCat } = await supabase.from('catalog_items').select('id, name, details, selling_price').order('name').limit(500);
                setCatalogItems(fbCat || []);
            } else {
                setCatalogItems(catData || []);
            }

            setStaff(sData || []);

            try {
                let setQuery = supabase.from('document_settings').select('*');
                if (companyId) setQuery = setQuery.eq('company_id', companyId);
                const { data: setRes } = await setQuery.limit(1).maybeSingle();
                if (setRes) {
                    setSettings(setRes);
                } else {
                    const { data: fbSet } = await supabase.from('document_settings').select('*').limit(1).maybeSingle();
                    if (fbSet) setSettings(fbSet);
                }
            } catch (sErr) {
                console.warn('Could not load document_settings in wizard:', sErr);
            }
        } catch (err) {
            console.error('Error loading dropdown datasets:', err);
        } finally {
            setLoadingData(false);
        }
    };

    const updateWizardData = (fields) => {
        setWizardData(prev => ({ ...prev, ...fields }));
    };

    const handleNextStep = () => {
        if (!completedSteps.includes(currentStep)) {
            setCompletedSteps(prev => [...prev, currentStep]);
        }
        if (currentStep < 8) {
            setCurrentStep(prev => prev + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handlePrevStep = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleStepClick = (stepId) => {
        if (stepId === 0 || stepId <= currentStep || completedSteps.includes(stepId - 1)) {
            setCurrentStep(stepId);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            toast.error(`Please complete Step ${currentStep} first.`);
        }
    };

    // Save Complete Workflow Suite to Supabase & clear active draft
    const handleCompleteWorkflow = async () => {
        setIsSaving(true);
        try {
            // 1. Create Enquiry Document in workflow_documents
            const { data: enqDoc, error: enqErr } = await supabase
                .from('workflow_documents')
                .insert({
                    company_id: companyId,
                    document_type: 'Enquiry',
                    document_no: wizardData.enquiryNo,
                    issue_date: new Date().toISOString().split('T')[0],
                    partner_id: wizardData.partnerId || null,
                    contact_id: wizardData.contactId || null,
                    vessel_id: wizardData.vesselId || null,
                    work_location_id: wizardData.workLocationId || null,
                    subject: wizardData.subject || 'Paper Enquiry Landing Note',
                    status: 'Active',
                    notes: wizardData.landingNoteFile ? `Paper Scan: ${wizardData.landingNoteFile}` : null
                })
                .select('id')
                .single();

            if (enqErr) throw enqErr;

            // 2. Create or Update Quotation Document & Line Items
            let qtnDocId = wizardData.linkedQuotationId;
            if (qtnDocId) {
                // Update existing linked quotation in Quote2Customers database
                await supabase
                    .from('workflow_documents')
                    .update({
                        document_no: wizardData.quotationNo,
                        issue_date: wizardData.quotationDate,
                        partner_id: wizardData.partnerId || null,
                        contact_id: wizardData.contactId || null,
                        vessel_id: wizardData.vesselId || null,
                        work_location_id: wizardData.workLocationId || null,
                        subject: wizardData.subject || 'Quotation',
                        subtotal: wizardData.subtotal,
                        tax_amount: wizardData.taxAmount,
                        total_amount: wizardData.grandTotal,
                        status: 'Approved'
                    })
                    .eq('id', qtnDocId);

                // Replace existing line items
                await supabase.from('workflow_line_items').delete().eq('document_id', qtnDocId);
            } else {
                const { data: qtnDoc, error: qtnErr } = await supabase
                    .from('workflow_documents')
                    .insert({
                        company_id: companyId,
                        document_type: 'Quotation',
                        document_no: wizardData.quotationNo,
                        issue_date: wizardData.quotationDate,
                        partner_id: wizardData.partnerId || null,
                        contact_id: wizardData.contactId || null,
                        vessel_id: wizardData.vesselId || null,
                        work_location_id: wizardData.workLocationId || null,
                        subject: wizardData.subject || 'Quotation',
                        subtotal: wizardData.subtotal,
                        tax_amount: wizardData.taxAmount,
                        total_amount: wizardData.grandTotal,
                        status: 'Approved'
                    })
                    .select('id')
                    .single();

                if (qtnErr) throw qtnErr;
                qtnDocId = qtnDoc.id;
            }

            // Insert line items
            if (wizardData.lineItems && wizardData.lineItems.length > 0) {
                const lineItemsToInsert = wizardData.lineItems.map((item, idx) => ({
                    document_id: qtnDocId,
                    description: item.description || 'Service/Item',
                    quantity: item.quantity || 1,
                    uom: item.uom || 'LOT',
                    unit_price: item.unit_price || 0,
                    amount: item.amount || 0,
                    tax_enabled: item.tax_enabled ?? true,
                    sort_order: idx
                }));
                await supabase.from('workflow_line_items').insert(lineItemsToInsert);
            }

            // 3. Create Customer PO Document
            if (wizardData.customerPoNo) {
                await supabase.from('workflow_documents').insert({
                    company_id: companyId,
                    document_type: 'Purchase Order',
                    document_no: wizardData.customerPoNo,
                    customer_ref: wizardData.customerPoNo,
                    issue_date: wizardData.customerPoDate,
                    partner_id: wizardData.partnerId || null,
                    total_amount: wizardData.customerPoAmount || wizardData.grandTotal,
                    status: 'Confirmed'
                });
            }

            // 4. Create Job Document
            if (wizardData.jobNo) {
                await supabase.from('workflow_documents').insert({
                    company_id: companyId,
                    document_type: 'Job',
                    document_no: wizardData.jobNo,
                    issue_date: new Date().toISOString().split('T')[0],
                    partner_id: wizardData.partnerId || null,
                    vessel_id: wizardData.vesselId || null,
                    work_location_id: wizardData.workLocationId || null,
                    subject: wizardData.subject || 'Job Order',
                    status: 'Active'
                });
            }

            // 5. Create Delivery Order Document
            if (wizardData.deliveryOrderNo) {
                await supabase.from('workflow_documents').insert({
                    company_id: companyId,
                    document_type: 'Delivery Order',
                    document_no: wizardData.deliveryOrderNo,
                    issue_date: wizardData.deliveryDate,
                    partner_id: wizardData.partnerId || null,
                    vessel_id: wizardData.vesselId || null,
                    status: 'Delivered',
                    notes: wizardData.receivedBy ? `Received by: ${wizardData.receivedBy}` : null
                });
            }

            // 6. Create Tax Invoice Document
            if (wizardData.invoiceNo) {
                await supabase.from('workflow_documents').insert({
                    company_id: companyId,
                    document_type: 'Tax Invoice',
                    document_no: wizardData.invoiceNo,
                    issue_date: wizardData.invoiceDate,
                    expiry_date: wizardData.dueDate,
                    partner_id: wizardData.partnerId || null,
                    subtotal: wizardData.subtotal,
                    tax_amount: wizardData.taxAmount,
                    total_amount: wizardData.grandTotal,
                    status: 'Sent'
                });
            }

            // 7. Create Payment Received Document
            if (wizardData.paymentNo) {
                await supabase.from('workflow_documents').insert({
                    company_id: companyId,
                    document_type: 'Payment Received',
                    document_no: wizardData.paymentNo,
                    issue_date: wizardData.paymentDate,
                    partner_id: wizardData.partnerId || null,
                    total_amount: wizardData.paymentAmount,
                    notes: `Method: ${wizardData.paymentMethod} | Ref: ${wizardData.paymentRef}`,
                    status: 'Completed'
                });
            }

            // Clear draft storage
            localStorage.removeItem(DRAFT_STORAGE_KEY);
            toast.success("Job Workflow suite successfully created & sealed!");
            navigate(`/dashboard/job-workflow?enquiry_no=${wizardData.enquiryNo}`);
        } catch (err) {
            console.error('Error completing workflow:', err);
            toast.error('Failed to save workflow records: ' + (err.message || 'Database error'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '20px 16px 80px 16px',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            {/* 2-Module Core Switcher Header */}
            <ModuleSwitcherHeader
                activeModule="filing"
                activeJobNo={wizardData.jobNo || wizardData.enquiryNo}
                activeCustomer={wizardData.customerName}
            />

            {/* Top Bar Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        onClick={() => navigate('/dashboard/job-workflow')}
                        style={{
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: '10px',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: '#475569',
                            fontSize: '0.85rem',
                            fontWeight: 700
                        }}
                    >
                        <ArrowLeft size={18} /> Board
                    </button>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary, #0f172a)' }}>
                                Job Workflow Wizard
                            </h1>
                            <span style={{ background: '#e0e7ff', color: '#4338ca', fontSize: '0.72rem', fontWeight: 800, padding: '3px 8px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Smartphone size={12} /> Mobile Ready
                            </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                            Step-by-step transaction lifecycle wizard from paper landing note to final payment
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setShowUploadModal(true)}
                        style={{
                            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                            border: 'none',
                            borderRadius: '10px',
                            padding: '8px 16px',
                            fontSize: '0.84rem',
                            fontWeight: 800,
                            color: '#ffffff',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)'
                        }}
                    >
                        <Upload size={16} /> Workflow Upload
                    </button>

                    <button
                        onClick={() => setShowDraftsModal(true)}
                        style={{
                            background: '#eff6ff',
                            border: '1px solid #93c5fd',
                            borderRadius: '10px',
                            padding: '8px 14px',
                            fontSize: '0.82rem',
                            fontWeight: 800,
                            color: '#1d4ed8',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <History size={16} /> Saved Drafts ({savedDraftsList.length})
                    </button>

                    <button
                        onClick={handleSaveDraftManual}
                        style={{
                            background: '#fff',
                            border: '1px solid #cbd5e1',
                            borderRadius: '10px',
                            padding: '8px 14px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            color: '#475569',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Save size={16} /> Save Draft
                    </button>
                </div>
            </div>

            {/* QUICK CROSS-CHECK NAVIGATION BAR (OPENS NEW WINDOW ↗) */}
            <div style={{
                background: '#0f172a',
                borderRadius: '12px',
                padding: '10px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.78rem', fontWeight: 800 }}>
                    <ExternalLink size={14} color="#6366f1" /> Quick Cross-Check Modules:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <a
                        href="/partners"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ background: '#1e293b', color: '#38bdf8', border: '1px solid #334155', borderRadius: '8px', padding: '6px 12px', fontSize: '0.76rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        🏢 Partners ↗
                    </a>
                    <a
                        href="/contacts"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ background: '#1e293b', color: '#a7f3d0', border: '1px solid #334155', borderRadius: '8px', padding: '6px 12px', fontSize: '0.76rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        📇 Contacts ↗
                    </a>
                    <a
                        href="/unified-supplier-hub"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ background: '#1e293b', color: '#818cf8', border: '1px solid #334155', borderRadius: '8px', padding: '6px 12px', fontSize: '0.76rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        🤝 Supplier Hub ↗
                    </a>
                    <a
                        href="/workflows/jobs-dashboard"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ background: '#1e293b', color: '#34d399', border: '1px solid #334155', borderRadius: '8px', padding: '6px 12px', fontSize: '0.76rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        📊 Job Control ↗
                    </a>
                    <a
                        href="/soa"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ background: '#1e293b', color: '#f472b6', border: '1px solid #334155', borderRadius: '8px', padding: '6px 12px', fontSize: '0.76rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        💳 SOA ↗
                    </a>
                    <a
                        href="/expenses-profit"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ background: '#1e293b', color: '#34d399', border: '1px solid #334155', borderRadius: '8px', padding: '6px 12px', fontSize: '0.76rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        💸 Expenses & Profit ↗
                    </a>
                    <a
                        href="/workflows"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ background: '#1e293b', color: '#fbbf24', border: '1px solid #334155', borderRadius: '8px', padding: '6px 12px', fontSize: '0.76rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        📂 Workflow Board ↗
                    </a>
                    <a
                        href="/workflows/whiteboard"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ background: '#1e293b', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '8px', padding: '6px 12px', fontSize: '0.76rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        📌 Jobs Whiteboard ↗
                    </a>
                </div>
            </div>

            {/* RESTORE DRAFT PROMPT BANNER */}
            {activeDraftFound && (
                <div style={{
                    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                    border: '1px solid #93c5fd',
                    borderRadius: '14px',
                    padding: '14px 18px',
                    marginBottom: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                    boxShadow: '0 4px 12px rgba(29, 78, 216, 0.08)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: '#2563eb', color: '#fff', padding: '8px', borderRadius: '50%' }}>
                            <History size={18} />
                        </div>
                        <div>
                            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#1e40af' }}>
                                Found Half-Entered Form Draft ({activeDraftFound.wizardData?.enquiryNo || 'Draft'})
                            </h4>
                            <span style={{ fontSize: '0.8rem', color: '#1e3a8a' }}>
                                Saved at Step {activeDraftFound.currentStep} of 7 {activeDraftFound.wizardData?.customerName ? `for ${activeDraftFound.wizardData.customerName}` : ''} ({new Date(activeDraftFound.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => handleRestoreDraft(activeDraftFound)}
                            style={{
                                background: '#2563eb',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 16px',
                                fontSize: '0.82rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <Play size={14} /> Resume This Draft
                        </button>
                        <button
                            onClick={() => setActiveDraftFound(null)}
                            style={{ background: 'transparent', border: '1px solid #93c5fd', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: '#1e40af' }}
                            title="Dismiss notification"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Stepper Progress Bar */}
            <WizardProgressBar
                currentStep={currentStep}
                onStepClick={handleStepClick}
                completedSteps={completedSteps}
                wizardData={wizardData}
                settings={settings}
            />

            {/* Step Content */}
            {loadingData ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
                    <RefreshCcw size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                    <p style={{ fontWeight: 600 }}>Loading Supabase reference datasets...</p>
                </div>
            ) : (
                <>
                    {currentStep === 0 && (
                        <StepJobDriveExplorer
                            wizardData={wizardData}
                            updateWizardData={updateWizardData}
                            onPrev={handlePrevStep}
                            onNavigateStep={setCurrentStep}
                            companyId={companyId}
                            settings={settings}
                            partners={partners}
                            contacts={contacts}
                            vessels={vessels}
                            workLocations={workLocations}
                        />
                    )}

                    {currentStep === 1 && (
                        <StepEnquiryLanding
                            wizardData={wizardData}
                            updateWizardData={updateWizardData}
                            onNext={handleNextStep}
                            onPrev={handlePrevStep}
                            partners={partners}
                            contacts={contacts}
                            vessels={vessels}
                            workLocations={workLocations}
                            companyId={companyId}
                            reloadDatasets={loadSupabaseDropdowns}
                            settings={settings}
                        />
                    )}

                    {currentStep === 2 && (
                        <StepQuotationCosting
                            wizardData={wizardData}
                            updateWizardData={updateWizardData}
                            onNext={handleNextStep}
                            onPrev={handlePrevStep}
                            catalogItems={catalogItems}
                            companyId={companyId}
                        />
                    )}

                    {currentStep === 3 && (
                        <StepCustomerPO
                            wizardData={wizardData}
                            updateWizardData={updateWizardData}
                            onNext={handleNextStep}
                            onPrev={handlePrevStep}
                            companyId={companyId}
                        />
                    )}

                    {currentStep === 4 && (
                        <StepSupplierAndJobExecution
                            wizardData={wizardData}
                            updateWizardData={updateWizardData}
                            onNext={handleNextStep}
                            onPrev={handlePrevStep}
                            partners={partners}
                            staff={staff}
                            companyId={companyId}
                        />
                    )}

                    {currentStep === 5 && (
                        <StepDeliveryOrder
                            wizardData={wizardData}
                            updateWizardData={updateWizardData}
                            onNext={handleNextStep}
                            onPrev={handlePrevStep}
                            companyId={companyId}
                        />
                    )}

                    {currentStep === 6 && (
                        <StepInvoicing
                            wizardData={wizardData}
                            updateWizardData={updateWizardData}
                            onNext={handleNextStep}
                            onPrev={handlePrevStep}
                            companyId={companyId}
                        />
                    )}

                    {currentStep === 7 && (
                        <StepPaymentReceived
                            wizardData={wizardData}
                            updateWizardData={updateWizardData}
                            onNext={handleNextStep}
                            onPrev={handlePrevStep}
                            onCompleteWorkflow={handleCompleteWorkflow}
                            isSaving={isSaving}
                            companyId={companyId}
                        />
                    )}

                    {currentStep === 8 && (
                        <StepExpensesAndProfit
                            wizardData={wizardData}
                            updateWizardData={updateWizardData}
                            onPrev={handlePrevStep}
                            onCompleteWorkflow={handleCompleteWorkflow}
                            isSaving={isSaving}
                            companyId={companyId}
                        />
                    )}
                </>
            )}

            {/* SAVED DRAFTS LIST MODAL */}
            {showDraftsModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
                    zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px'
                }}>
                    <div style={{
                        background: '#fff', borderRadius: '16px', maxWidth: '650px', width: '100%',
                        maxHeight: '80vh', overflowY: 'auto', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <History size={20} color="#2563eb" /> Saved Half-Entered Forms &amp; Drafts
                            </h3>
                            <button onClick={() => setShowDraftsModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                                <X size={20} />
                            </button>
                        </div>

                        {savedDraftsList.length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                                <AlertCircle size={32} style={{ margin: '0 auto 8px', color: '#94a3b8' }} />
                                <p style={{ margin: 0, fontWeight: 600 }}>No saved drafts found.</p>
                                <span style={{ fontSize: '0.8rem' }}>Click "Save Draft" anytime to save half-entered forms!</span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {savedDraftsList.map((draft, idx) => (
                                    <div key={draft.id || idx} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px'
                                    }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#1e293b' }}>
                                                {draft.title || draft.id}
                                            </h4>
                                            <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginTop: '2px' }}>
                                                Reached: <strong>Step {draft.currentStep || 1} of 7</strong> | Saved: {new Date(draft.updatedAt).toLocaleString()}
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={() => handleRestoreDraft(draft)}
                                                style={{
                                                    background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px',
                                                    padding: '8px 14px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', gap: '4px'
                                                }}
                                            >
                                                <Play size={14} /> Resume
                                            </button>
                                            <button
                                                onClick={() => handleDeleteDraft(draft.id)}
                                                style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px', cursor: 'pointer' }}
                                                title="Delete draft"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TOP BAR WORKFLOW UPLOAD MODAL */}
            <WorkflowUploadModal
                isOpen={showUploadModal}
                onClose={() => setShowUploadModal(false)}
                partners={partners}
                contacts={contacts}
                vessels={vessels}
                workLocations={workLocations}
                companyId={companyId}
                settings={settings}
                updateWizardData={updateWizardData}
                onNavigateStep={setCurrentStep}
            />
        </div>
    );
}
