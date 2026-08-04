import React, { useState, useEffect } from 'react';
import { 
    FolderOpen, ExternalLink, Search, RefreshCcw, FileText, Send, ShoppingBag, 
    Briefcase, Truck, Receipt, DollarSign, CheckCircle2, AlertCircle, Clock, 
    Building2, Ship, Calendar, ArrowRight, ArrowLeft, Eye, Play, Sparkles, Filter, Plus, Upload, Edit3, Trash2 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getGoogleDriveExplorerUrl } from '../../lib/integrationService';
import { generateDocNumber } from '../../lib/workflowV2Service';
import WorkflowUploadModal from './WorkflowUploadModal';
import EditWorkflowDocumentModal from './EditWorkflowDocumentModal';
import toast from 'react-hot-toast';

export default function StepJobDriveExplorer({ 
    wizardData, 
    updateWizardData, 
    onPrev, 
    onNavigateStep,
    companyId,
    partners = [],
    contacts = [],
    vessels = [],
    workLocations = [],
    settings = {}
}) {
    const [jobsList, setJobsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [filterDocType, setFilterDocType] = useState('JOB'); // 'ALL' | 'ENQ' | 'QTN' | 'JOB' (Default: 'JOB')
    const [viewMode, setViewMode] = useState('table'); // 'table' or 'cards'
    
    // Modal states for CRUD
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [editingDoc, setEditingDoc] = useState(null);

    useEffect(() => {
        if (companyId) {
            loadJobsRepository();
        }
    }, [companyId]);

    const loadJobsRepository = async () => {
        setLoading(true);
        try {
            // Query workflow documents grouped by assigned_job_no or documents with document_type='Job'
            const { data: allDocs, error } = await supabase
                .from('workflow_documents')
                .select(`
                    *,
                    partners!partner_id(id, name),
                    vessels!vessel_id(id, vessel_name),
                    work_locations!work_location_id(id, location_name),
                    contacts!contact_id(id, name, email)
                `)
                .eq('company_id', companyId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Group documents strictly by Job No (ONLY Job / Workflow Order processes form table rows)
            const groupedByJob = {};
            const unassignedDocs = [];

            (allDocs || []).forEach(doc => {
                const type = (doc.document_type || '').toUpperCase();
                const docNo = doc.document_no || '';

                // Determine if document defines a Primary Job Key
                let jobKey = doc.assigned_job_no || null;

                if (!jobKey) {
                    const isJobType = type === 'JOB' || doc.is_job === true;
                    const hasJobPrefix = /^(CEL|JCEL|ARKIS|AIS|JOB)-/i.test(docNo);
                    const isWorkflowRoot = type.includes('ENQUIRY') || type.includes('QUOTE') || type.includes('QUOTATION');

                    if (isJobType || hasJobPrefix || isWorkflowRoot) {
                        jobKey = docNo;
                    }
                }

                // If no primary job key, collect for Pass 2 matching (DO, Invoice, Payment, PO)
                if (!jobKey) {
                    unassignedDocs.push(doc);
                    return;
                }

                if (!groupedByJob[jobKey]) {
                    groupedByJob[jobKey] = {
                        jobNo: jobKey,
                        companyId: doc.company_id,
                        customerName: doc.partners?.name || doc.customer_name || 'Celron Partner',
                        vesselName: doc.vessels?.vessel_name || '',
                        locationName: doc.work_locations?.location_name || '',
                        issueDate: doc.issue_date || doc.created_at?.split('T')[0] || '—',
                        enquiryDoc: null,
                        quotationDoc: null,
                        poDoc: null,
                        jobDoc: null,
                        doDoc: null,
                        invoiceDoc: null,
                        paymentDoc: null,
                        allDocs: []
                    };
                }

                groupedByJob[jobKey].allDocs.push(doc);

                if (doc.partners?.name) groupedByJob[jobKey].customerName = doc.partners.name;
                if (doc.vessels?.vessel_name) groupedByJob[jobKey].vesselName = doc.vessels.vessel_name;

                // Map specific document types
                if (type.includes('ENQUIRY')) groupedByJob[jobKey].enquiryDoc = doc;
                else if (type.includes('QUOTE') || type.includes('QUOTATION')) groupedByJob[jobKey].quotationDoc = doc;
                else if (type.includes('PURCHASE ORDER') || type.includes('PO')) groupedByJob[jobKey].poDoc = doc;
                else if (type === 'JOB') groupedByJob[jobKey].jobDoc = doc;
                else if (type.includes('DELIVERY') || type === 'DO') groupedByJob[jobKey].doDoc = doc;
                else if (type.includes('INVOICE') || type === 'TAX INVOICE') groupedByJob[jobKey].invoiceDoc = doc;
                else if (type.includes('PAYMENT')) groupedByJob[jobKey].paymentDoc = doc;
            });

            // Secondary Pass: Match unassigned subsidiary documents (DO, Invoice, Payment) to existing Job suites by Partner / Customer
            unassignedDocs.forEach(uDoc => {
                const type = (uDoc.document_type || '').toUpperCase();
                const partnerId = uDoc.partner_id;
                const custName = (uDoc.partners?.name || uDoc.customer_name || '').toLowerCase();

                let matchedKey = null;
                for (const key of Object.keys(groupedByJob)) {
                    const suite = groupedByJob[key];
                    const suitePartnerId = suite.enquiryDoc?.partner_id || suite.quotationDoc?.partner_id || suite.jobDoc?.partner_id || suite.invoiceDoc?.partner_id;
                    const suiteCustName = (suite.customerName || '').toLowerCase();

                    if (partnerId && suitePartnerId === partnerId) {
                        matchedKey = key;
                        break;
                    }
                    if (custName && suiteCustName && (suiteCustName.includes(custName) || custName.includes(suiteCustName))) {
                        matchedKey = key;
                        break;
                    }
                }

                if (matchedKey) {
                    const suite = groupedByJob[matchedKey];
                    suite.allDocs.push(uDoc);

                    if (type.includes('DELIVERY') || type === 'DO') {
                        if (!suite.doDoc) suite.doDoc = uDoc;
                    } else if (type.includes('INVOICE') || type === 'TAX INVOICE') {
                        if (!suite.invoiceDoc) suite.invoiceDoc = uDoc;
                    } else if (type.includes('PAYMENT')) {
                        if (!suite.paymentDoc) suite.paymentDoc = uDoc;
                    } else if (type.includes('PURCHASE ORDER') || type.includes('PO')) {
                        if (!suite.poDoc) suite.poDoc = uDoc;
                    }
                }
            });

            const suites = Object.values(groupedByJob);
            setJobsList(suites);
        } catch (err) {
            console.error('Error loading jobs repository:', err);
            toast.error('Failed to load jobs & drive repository');
        } finally {
            setLoading(false);
        }
    };

    // Filter jobs
    const filteredJobs = jobsList.filter(job => {
        const query = searchTerm.trim().toLowerCase();
        const matchesQuery = !query || 
            (job.jobNo || '').toLowerCase().includes(query) ||
            (job.customerName || '').toLowerCase().includes(query) ||
            (job.vesselName || '').toLowerCase().includes(query) ||
            (job.enquiryDoc?.document_no || '').toLowerCase().includes(query) ||
            (job.quotationDoc?.document_no || '').toLowerCase().includes(query) ||
            (job.poDoc?.document_no || '').toLowerCase().includes(query) ||
            (job.invoiceDoc?.document_no || '').toLowerCase().includes(query) ||
            (job.doDoc?.document_no || '').toLowerCase().includes(query) ||
            (job.allDocs || []).some(d => (d.document_no || '').toLowerCase().includes(query));

        if (!matchesQuery) return false;

        // Document Type filter
        if (filterDocType === 'ENQ' && !job.enquiryDoc && !/^(ENQ)-/i.test(job.jobNo)) return false;
        if (filterDocType === 'QTN' && !job.quotationDoc && !/^(QTN)-/i.test(job.jobNo)) return false;
        if (filterDocType === 'JOB' && !job.jobDoc && !/^(CEL|JCEL|ARKIS|AIS|JOB)-/i.test(job.jobNo)) return false;

        if (filterStatus === 'COMPLETED') {
            return job.paymentDoc || job.invoiceDoc?.status === 'Paid';
        }
        if (filterStatus === 'IN_PROGRESS') {
            return !job.paymentDoc;
        }

        return true;
    });

    const handleCreateNewEnquiry = async () => {
        try {
            let newEnqNo = '';
            if (companyId) {
                newEnqNo = await generateDocNumber(companyId, 'Enquiry');
            }
            if (!newEnqNo) {
                newEnqNo = `ENQ-${new Date().getFullYear()}-0001`;
            }

            updateWizardData({
                enquiryNo: newEnqNo,
                landingNoteFile: null,
                landingNoteUrl: '',
                landingNoteDriveId: null,
                partnerId: '',
                customerName: '',
                contactId: '',
                vesselId: '',
                workLocationId: '',
                subject: '',
                linkedQuotationId: null,
                quotationNo: '',
                quotationDate: new Date().toISOString().split('T')[0],
                lineItems: [
                    { id: 1, description: 'Supply & Technical Service Works', quantity: 1, uom: 'LOT', unit_price: 0, tax_enabled: true, amount: 0 }
                ],
                subtotal: 0,
                taxAmount: 0,
                grandTotal: 0,
                customerPoNo: '',
                jobNo: '',
                deliveryOrderNo: '',
                invoiceNo: '',
                paymentNo: ''
            });

            toast.success(`Generated New Enquiry ${newEnqNo}`);
            if (onNavigateStep) {
                onNavigateStep(1);
            }
        } catch (err) {
            console.error('Error generating new enquiry:', err);
            toast.error('Failed to generate new enquiry number');
        }
    };

    const handleLoadJobIntoWizard = (jobSuite) => {
        const qtn = jobSuite.quotationDoc || {};
        const enq = jobSuite.enquiryDoc || {};
        const po = jobSuite.poDoc || {};
        const job = jobSuite.jobDoc || {};
        const doDoc = jobSuite.doDoc || {};
        const inv = jobSuite.invoiceDoc || {};
        const pay = jobSuite.paymentDoc || {};

        updateWizardData({
            enquiryNo: enq.document_no || '',
            partnerId: qtn.partner_id || enq.partner_id || '',
            customerName: jobSuite.customerName || '',
            contactId: qtn.contact_id || enq.contact_id || '',
            vesselId: qtn.vessel_id || enq.vessel_id || '',
            workLocationId: qtn.work_location_id || enq.work_location_id || '',
            subject: qtn.subject || enq.subject || 'Loaded Job Audit',
            quotationNo: qtn.document_no || '',
            quotationDate: qtn.issue_date || new Date().toISOString().split('T')[0],
            subtotal: parseFloat(qtn.subtotal) || 0,
            taxAmount: parseFloat(qtn.tax_amount) || 0,
            grandTotal: parseFloat(qtn.total_amount) || 0,
            customerPoNo: po.document_no || po.customer_ref || '',
            jobNo: jobSuite.jobNo || '',
            deliveryOrderNo: doDoc.document_no || '',
            invoiceNo: inv.document_no || '',
            paymentNo: pay.document_no || ''
        });

        toast.success(`Loaded ${jobSuite.jobNo} into Wizard`);
        if (onNavigateStep) {
            onNavigateStep(1);
        }
    };

    const handleDeleteJobSuite = async (suite) => {
        const title = suite.jobNo || 'Selected Workflow Record';
        if (!window.confirm(`Are you sure you want to delete ${title}? This action will delete the workflow document record.`)) {
            return;
        }

        try {
            const docIds = (suite.allDocs || []).map(d => d.id).filter(Boolean);
            if (docIds.length > 0) {
                const { error } = await supabase
                    .from('workflow_documents')
                    .delete()
                    .in('id', docIds);
                if (error) throw error;
            } else if (suite.jobDoc?.id || suite.enquiryDoc?.id) {
                const targetId = suite.jobDoc?.id || suite.enquiryDoc?.id;
                const { error } = await supabase
                    .from('workflow_documents')
                    .delete()
                    .eq('id', targetId);
                if (error) throw error;
            }
            toast.success(`Deleted workflow suite ${title}`);
            loadJobsRepository();
        } catch (err) {
            console.error('Error deleting workflow record suite:', err);
            toast.error('Failed to delete: ' + (err.message || 'Database error'));
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header Banner */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: '#3b82f6', color: '#fff', padding: '10px', borderRadius: '12px' }}>
                        <FolderOpen size={24} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                            Step 0: Jobs &amp; Google Drive Repository
                        </h2>
                        <span style={{ fontSize: '0.84rem', color: '#64748b' }}>
                            Audit job lifecycle updates &amp; select a job or upload new enquiry/job (Step 1/4)
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* PRIMARY WORKFLOW UPLOAD BUTTON */}
                    <button
                        type="button"
                        onClick={() => setIsUploadModalOpen(true)}
                        style={{
                            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '10px',
                            padding: '8px 18px',
                            fontSize: '0.84rem',
                            fontWeight: 800,
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
                        type="button"
                        onClick={handleCreateNewEnquiry}
                        style={{
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '10px',
                            padding: '8px 16px',
                            fontSize: '0.82rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                        }}
                    >
                        <Plus size={16} /> + Create New Enquiry (Step 1)
                    </button>

                    <button
                        type="button"
                        onClick={loadJobsRepository}
                        style={{
                            background: '#ffffff',
                            color: '#475569',
                            border: '1px solid #cbd5e1',
                            borderRadius: '10px',
                            padding: '8px 14px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <RefreshCcw size={15} className={loading ? 'animate-spin' : ''} /> Refresh List
                    </button>
                    <a
                        href="/storage"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            color: '#ffffff',
                            borderRadius: '10px',
                            padding: '8px 16px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
                        }}
                    >
                        <FolderOpen size={16} /> Open Storage Explorer ↗
                    </a>
                </div>
            </div>

            {/* Toolbar: Search & Filters */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px'
            }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
                    <Search size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                        type="text"
                        placeholder="Search Job No, Customer, Vessel, Enquiry No or Quote..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '9px 12px 9px 36px',
                            borderRadius: '10px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.88rem',
                            background: '#ffffff',
                            outline: 'none'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <FileText size={14} /> Type:
                        </span>
                        {[
                            { key: 'ALL', label: 'All Types' },
                            { key: 'ENQ', label: 'Enquiries' },
                            { key: 'QTN', label: 'Quotations' },
                            { key: 'JOB', label: 'Jobs' }
                        ].map(t => (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => setFilterDocType(t.key)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: filterDocType === t.key ? '#6366f1' : '#f1f5f9',
                                    color: filterDocType === t.key ? '#ffffff' : '#475569',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Filter size={14} /> Status:
                        </span>
                        {['ALL', 'IN_PROGRESS', 'COMPLETED'].map(st => (
                            <button
                                key={st}
                                type="button"
                                onClick={() => setFilterStatus(st)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: filterStatus === st ? '#3b82f6' : '#f1f5f9',
                                    color: filterStatus === st ? '#ffffff' : '#475569',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {st === 'ALL' ? 'All Jobs' : st === 'IN_PROGRESS' ? 'In Progress' : 'Completed'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Jobs Audit Table */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '20px',
                overflowX: 'auto'
            }}>
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                        <RefreshCcw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', display: 'block' }} />
                        <span>Loading job status audit records...</span>
                    </div>
                ) : filteredJobs.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                        <FolderOpen size={36} style={{ opacity: 0.4, margin: '0 auto 12px auto' }} />
                        <p style={{ fontWeight: 600, margin: 0 }}>No matching job records found</p>
                        <span style={{ fontSize: '0.82rem' }}>Try clearing your search query or status filter.</span>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                                <th style={{ padding: '12px 10px', width: '22%' }}>1) Job No / Customer / Vessel</th>
                                <th style={{ padding: '12px 10px', width: '18%' }}>2) Enquiry / Quotation / Value</th>
                                <th style={{ padding: '12px 10px', width: '15%' }}>3) Customer PO &amp; Value</th>
                                <th style={{ padding: '12px 10px', width: '18%' }}>4) Delivery Order / Invoice / Status</th>
                                <th style={{ padding: '12px 10px', width: '15%' }}>5) Payment Outstanding / Status</th>
                                <th style={{ padding: '12px 10px', width: '12%', textAlign: 'center' }}>6) Google Drive / Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredJobs.map((suite, idx) => {
                                const qtn = suite.quotationDoc || {};
                                const enq = suite.enquiryDoc || {};
                                const po = suite.poDoc || {};
                                const doDoc = suite.doDoc || {};
                                const inv = suite.invoiceDoc || {};
                                const pay = suite.paymentDoc || {};

                                const driveUrl = getGoogleDriveExplorerUrl(enq.gdrive_folder_id ? enq : qtn, null);
                                const qtnAmount = parseFloat(qtn.total_amount) || parseFloat(qtn.subtotal) || parseFloat(po.total_amount) || 0;
                                const poAmount = parseFloat(po.total_amount) || qtnAmount;
                                const isPaid = pay.document_no || pay.status === 'Paid' || inv.status === 'Paid';
                                const outstandingAmt = isPaid ? 0 : (parseFloat(inv.total_amount) || qtnAmount);

                                return (
                                    <tr key={suite.jobNo || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        {/* 1) Job No / Customer / Vessel */}
                                        <td style={{ padding: '12px 10px' }}>
                                            <div style={{ fontWeight: 800, color: '#3b82f6', fontSize: '0.9rem' }}>
                                                {suite.jobNo}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: '#334155', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                <Building2 size={12} color="#64748b" /> {suite.customerName}
                                            </div>
                                            {suite.vesselName && (
                                                <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                    <Ship size={11} color="#94a3b8" /> {suite.vesselName}
                                                </div>
                                            )}
                                        </td>

                                        {/* 2) Enquiry / Quotation / Value */}
                                        <td style={{ padding: '12px 10px' }}>
                                            {enq.document_no && (
                                                <div style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>
                                                    Enq: <strong style={{ color: '#0f172a' }}>{enq.document_no}</strong>
                                                </div>
                                            )}
                                            {qtn.document_no ? (
                                                <div style={{ fontSize: '0.78rem', color: '#7c3aed', fontWeight: 700, marginTop: '2px' }}>
                                                    Qtn: {qtn.document_no}
                                                </div>
                                            ) : (
                                                !enq.document_no && <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>—</span>
                                            )}
                                            {qtnAmount > 0 && (
                                                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.82rem', marginTop: '2px' }}>
                                                    ${qtnAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                </div>
                                            )}
                                        </td>

                                        {/* 3) Customer PO & Value */}
                                        <td style={{ padding: '12px 10px' }}>
                                            {po.document_no || po.customer_ref ? (
                                                <div>
                                                    <div style={{ fontWeight: 700, color: '#d97706', fontSize: '0.8rem' }}>
                                                        {po.document_no || po.customer_ref}
                                                    </div>
                                                    {poAmount > 0 && (
                                                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.78rem', marginTop: '1px' }}>
                                                            ${poAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                        </div>
                                                    )}
                                                    <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', background: '#fef3c7', color: '#92400e', fontWeight: 700, display: 'inline-block', marginTop: '3px' }}>
                                                        Confirmed
                                                    </span>
                                                </div>
                                            ) : (
                                                <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>Pending PO</span>
                                            )}
                                        </td>

                                        {/* 4) Delivery Order / Invoice / Status */}
                                        <td style={{ padding: '12px 10px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                {doDoc.document_no ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontWeight: 700, color: '#059669', fontSize: '0.78rem' }}>
                                                            DO: {doDoc.document_no}
                                                        </span>
                                                        <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '4px', background: '#dcfce7', color: '#166534', fontWeight: 700 }}>
                                                            {doDoc.status || 'Delivered'}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>DO: Pending</span>
                                                )}

                                                {inv.document_no ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontWeight: 700, color: '#db2777', fontSize: '0.78rem' }}>
                                                            Inv: {inv.document_no}
                                                        </span>
                                                        <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '4px', background: '#fce7f3', color: '#9d174d', fontWeight: 700 }}>
                                                            {inv.status || 'Issued'}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Inv: Pending</span>
                                                )}
                                            </div>
                                        </td>

                                        {/* 5) Payment Outstanding / Status */}
                                        <td style={{ padding: '12px 10px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                {pay.document_no && (
                                                    <span style={{ fontWeight: 800, color: '#15803d', fontSize: '0.78rem' }}>
                                                        {pay.document_no}
                                                    </span>
                                                )}

                                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: isPaid ? '#166534' : '#c2410c' }}>
                                                    Due: ${outstandingAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                </div>

                                                {isPaid ? (
                                                    <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px', background: '#dcfce7', color: '#15803d', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}>
                                                        <CheckCircle2 size={12} /> Paid
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px', background: '#fff7ed', color: '#c2410c', fontWeight: 700, width: 'fit-content' }}>
                                                        Unpaid
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* 6) Google Drive / Actions */}
                                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                <a
                                                    href={driveUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        background: '#eef2ff',
                                                        color: '#4f46e5',
                                                        border: '1px solid #c7d2fe',
                                                        borderRadius: '8px',
                                                        padding: '6px 10px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        textDecoration: 'none',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                    title="Open Google Drive folder for this job in a new tab"
                                                >
                                                    <ExternalLink size={13} /> Drive ↗
                                                </a>
                                                <button
                                                    type="button"
                                                    onClick={() => handleLoadJobIntoWizard(suite)}
                                                    style={{
                                                        background: '#f1f5f9',
                                                        color: '#334155',
                                                        border: '1px solid #cbd5e1',
                                                        borderRadius: '8px',
                                                        padding: '6px 10px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                    title="Load this job details into wizard active state"
                                                >
                                                    <Eye size={13} /> Load
                                                </button>

                                                {/* Edit Action */}
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingDoc(suite.jobDoc || suite.enquiryDoc || suite.quotationDoc || suite.allDocs?.[0])}
                                                    style={{
                                                        background: '#fff',
                                                        color: '#2563eb',
                                                        border: '1px solid #93c5fd',
                                                        borderRadius: '8px',
                                                        padding: '6px 8px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                    title="Edit workflow document details"
                                                >
                                                    <Edit3 size={13} /> Edit
                                                </button>

                                                {/* Delete Action */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteJobSuite(suite)}
                                                    style={{
                                                        background: '#fef2f2',
                                                        color: '#ef4444',
                                                        border: '1px solid #fecaca',
                                                        borderRadius: '8px',
                                                        padding: '6px 8px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                    title="Delete workflow document record"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Navigation buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap', gap: '12px' }}>
                <span style={{ fontSize: '0.84rem', color: '#64748b', fontWeight: 600 }}>
                    Step 0: Select an existing job to audit/load, or create a new enquiry for Step 1
                </span>
                <button
                    type="button"
                    onClick={handleCreateNewEnquiry}
                    style={{
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '12px 22px',
                        fontSize: '0.88rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
                    }}
                >
                    + Create New Enquiry (Step 1) <ArrowRight size={18} />
                </button>
            </div>

            {/* Workflow Upload Modal */}
            <WorkflowUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                partners={partners}
                contacts={contacts}
                vessels={vessels}
                workLocations={workLocations}
                companyId={companyId}
                settings={settings}
                updateWizardData={updateWizardData}
                onNavigateStep={onNavigateStep}
                onRefreshRepository={loadJobsRepository}
            />

            {/* Edit Workflow Document Modal */}
            <EditWorkflowDocumentModal
                isOpen={!!editingDoc}
                onClose={() => setEditingDoc(null)}
                documentData={editingDoc}
                partners={partners}
                vessels={vessels}
                workLocations={workLocations}
                onRefreshRepository={loadJobsRepository}
            />
        </div>
    );
}
