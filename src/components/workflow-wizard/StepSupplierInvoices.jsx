import React, { useState } from 'react';
import { 
    Receipt, Plus, Trash2, Sparkles, ArrowRight, ArrowLeft, 
    Check, Building2, Calendar, DollarSign, FileText, CheckCircle2, 
    Layers, Paperclip, ExternalLink, RefreshCw, AlertCircle
} from 'lucide-react';
import SearchableSelect from '../common/SearchableSelect';
import SmartUploadPanel from '../upload/SmartUploadPanel';
import UniversalFileViewer from '../common/UniversalFileViewer';
import toast from 'react-hot-toast';

export default function StepSupplierInvoices({
    wizardData,
    updateWizardData,
    onNext,
    onPrev,
    partners = [],
    companyId
}) {
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [activeTargetInvoiceIndex, setActiveTargetInvoiceIndex] = useState(null);
    const [selectedPreviewFile, setSelectedPreviewFile] = useState(null);

    // Get supplier orders from Step 4 for drop-down matching
    const existingOrders = Array.isArray(wizardData.supplierOrders) ? wizardData.supplierOrders : [];

    // Initialize supplier invoices array
    const supplierInvoices = Array.isArray(wizardData.supplierInvoices) && wizardData.supplierInvoices.length > 0
        ? wizardData.supplierInvoices
        : [
            {
                id: `sinv-1`,
                supplierId: existingOrders[0]?.supplierId || '',
                supplierName: existingOrders[0]?.supplierName || '',
                linkedPoNo: existingOrders[0]?.supplierPoNo || '',
                supplierInvoiceNo: `INV-SUP-${Math.floor(100000 + Math.random() * 900000)}`,
                invoiceDate: new Date().toISOString().split('T')[0],
                dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                subtotal: existingOrders[0]?.amount || 0,
                taxPercent: 9,
                taxAmount: (parseFloat(existingOrders[0]?.amount || 0) * 0.09),
                grandTotal: (parseFloat(existingOrders[0]?.amount || 0) * 1.09),
                currency: 'SGD',
                paymentStatus: 'Unpaid',
                attachments: [] // Multi-file support: [{ id, name, url, date }]
            }
        ];

    const setSupplierInvoices = (updatedList) => {
        updateWizardData({ supplierInvoices: updatedList });
    };

    // Add new supplier invoice entry
    const handleAddInvoice = () => {
        const nextIndex = supplierInvoices.length + 1;
        const newInvoice = {
            id: `sinv-${Date.now()}`,
            supplierId: '',
            supplierName: '',
            linkedPoNo: '',
            supplierInvoiceNo: `INV-SUP-${Math.floor(100000 + Math.random() * 900000)}`,
            invoiceDate: new Date().toISOString().split('T')[0],
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            subtotal: 0,
            taxPercent: 9,
            taxAmount: 0,
            grandTotal: 0,
            currency: 'SGD',
            paymentStatus: 'Unpaid',
            attachments: []
        };
        setSupplierInvoices([...supplierInvoices, newInvoice]);
        toast.success("Added new Supplier Invoice record");
    };

    // Delete supplier invoice
    const handleDeleteInvoice = (index) => {
        if (supplierInvoices.length === 1) {
            toast.error("At least one Supplier Invoice entry is required.");
            return;
        }
        const updated = supplierInvoices.filter((_, i) => i !== index);
        setSupplierInvoices(updated);
        toast.info("Removed Supplier Invoice entry");
    };

    // Update field values
    const handleInvoiceChange = (index, field, value) => {
        const updated = [...supplierInvoices];
        const item = { ...updated[index], [field]: value };

        // Recalculate tax & total if amounts changed
        if (field === 'subtotal' || field === 'taxPercent') {
            const sub = parseFloat(field === 'subtotal' ? value : item.subtotal) || 0;
            const taxPct = parseFloat(field === 'taxPercent' ? value : item.taxPercent) || 0;
            const taxAmt = sub * (taxPct / 100);
            item.taxAmount = taxAmt;
            item.grandTotal = sub + taxAmt;
        }

        // Link with PO
        if (field === 'linkedPoNo') {
            const matchedPO = existingOrders.find(o => o.supplierPoNo === value);
            if (matchedPO) {
                item.supplierId = matchedPO.supplierId;
                item.supplierName = matchedPO.supplierName;
                if (!item.subtotal && matchedPO.amount) {
                    item.subtotal = parseFloat(matchedPO.amount);
                    item.taxAmount = item.subtotal * 0.09;
                    item.grandTotal = item.subtotal * 1.09;
                }
            }
        }

        updated[index] = item;
        setSupplierInvoices(updated);
    };

    // Trigger upload modal for specific supplier invoice
    const handleOpenUploadForInvoice = (index) => {
        setActiveTargetInvoiceIndex(index);
        setIsUploadModalOpen(true);
    };

    // Attach file from SmartUploadPanel
    const handleAttachFileToInvoice = (file) => {
        if (activeTargetInvoiceIndex === null) return;
        const targetInv = supplierInvoices[activeTargetInvoiceIndex];
        const newAtt = {
            id: `att-inv-${Date.now()}`,
            name: file.name || file.fileName || 'Supplier_Tax_Invoice.pdf',
            url: file.webViewLink || file.previewUrl || (file instanceof File ? URL.createObjectURL(file) : ''),
            date: new Date().toISOString().split('T')[0],
            type: file.type || 'document'
        };

        const updatedAtts = [...(targetInv.attachments || []), newAtt];
        handleInvoiceChange(activeTargetInvoiceIndex, 'attachments', updatedAtts);
        setIsUploadModalOpen(false);
        setActiveTargetInvoiceIndex(null);
        toast.success(`Attached "${newAtt.name}" to ${targetInv.supplierInvoiceNo}`);
    };

    // Remove attachment
    const handleRemoveAttachment = (invIndex, attId) => {
        const targetInv = supplierInvoices[invIndex];
        const updatedAtts = targetInv.attachments.filter(a => a.id !== attId);
        handleInvoiceChange(invIndex, 'attachments', updatedAtts);
        if (selectedPreviewFile?.id === attId) {
            setSelectedPreviewFile(null);
        }
        toast.info("Removed invoice attachment");
    };

    // Totals
    const totalInvoicesValue = supplierInvoices.reduce((sum, inv) => sum + (parseFloat(inv.grandTotal) || 0), 0);
    const totalInvoiceDocsCount = supplierInvoices.reduce((sum, inv) => sum + (inv.attachments?.length || 0), 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Step Header Banner */}
            <div style={{
                background: 'linear-gradient(135deg, #831843 0%, #9d174d 100%)',
                color: '#fff',
                borderRadius: '16px',
                padding: '24px',
                display: 'flex',
                justify: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                boxShadow: '0 8px 24px rgba(157, 23, 77, 0.25)'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <span style={{ background: '#ec4899', color: '#fff', fontSize: '0.75rem', fontWeight: 800, padding: '4px 10px', borderRadius: '12px' }}>
                            Step 6 of 9
                        </span>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>
                            Supplier Invoices &amp; Bills (Incoming Vendor Invoices)
                        </h2>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.84rem', color: '#fbcfe8' }}>
                        Track incoming bills and tax invoices from multiple suppliers, match against POs, and attach multi-page invoice scans.
                    </p>
                </div>

                {/* Metrics Badges & Cross-Check Quick Links */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <a
                            href="/unified-supplier-hub"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', backdropFilter: 'blur(4px)' }}
                        >
                            🧾 Supplier Hub <ExternalLink size={12} />
                        </a>
                        <a
                            href="/soa"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', backdropFilter: 'blur(4px)' }}
                        >
                            💳 Statement of Account <ExternalLink size={12} />
                        </a>
                    </div>
                    <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '10px 16px', borderRadius: '12px', backdropFilter: 'blur(4px)', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', color: '#fbcfe8', textTransform: 'uppercase', fontWeight: 700 }}>Total Supplier Invoices</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff' }}>{supplierInvoices.length} Bills</div>
                    </div>
                    <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '10px 16px', borderRadius: '12px', backdropFilter: 'blur(4px)', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', color: '#fbcfe8', textTransform: 'uppercase', fontWeight: 700 }}>Total Payable Value</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f472b6' }}>${totalInvoicesValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                    </div>
                </div>
            </div>

            {/* SUPPLIER INVOICES LIST */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {supplierInvoices.map((inv, idx) => (
                    <div 
                        key={inv.id || idx}
                        style={{
                            background: 'var(--card-bg, #fff)',
                            border: '1px solid var(--border-color, #e2e8f0)',
                            borderRadius: '16px',
                            padding: '20px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px'
                        }}
                    >
                        {/* Header Bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ background: '#fce7f3', color: '#9d174d', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem' }}>
                                    #{idx + 1}
                                </div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                                        {inv.supplierInvoiceNo || `Supplier Invoice #${idx + 1}`}
                                    </h4>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                        {inv.supplierName || 'Unassigned Supplier'} {inv.linkedPoNo ? `(PO: ${inv.linkedPoNo})` : ''}
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <select
                                    value={inv.paymentStatus || 'Unpaid'}
                                    onChange={(e) => handleInvoiceChange(idx, 'paymentStatus', e.target.value)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        border: '1px solid #cbd5e1',
                                        background: inv.paymentStatus === 'Fully Paid' ? '#dcfce7' : inv.paymentStatus === 'Partially Paid' ? '#fef3c7' : '#fee2e2',
                                        color: inv.paymentStatus === 'Fully Paid' ? '#15803d' : inv.paymentStatus === 'Partially Paid' ? '#b45309' : '#991b1b',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="Unpaid">Unpaid</option>
                                    <option value="Partially Paid">Partially Paid</option>
                                    <option value="Fully Paid">Fully Paid</option>
                                </select>

                                {supplierInvoices.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteInvoice(idx)}
                                        style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', padding: '6px 10px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        <Trash2 size={14} /> Remove
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Fields Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                            {/* Link to Supplier PO */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    Match with Supplier PO
                                </label>
                                <select
                                    value={inv.linkedPoNo || ''}
                                    onChange={(e) => handleInvoiceChange(idx, 'linkedPoNo', e.target.value)}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', fontWeight: 700 }}
                                >
                                    <option value="">-- Direct Supplier Invoice (No PO) --</option>
                                    {existingOrders.map(o => (
                                        <option key={o.id} value={o.supplierPoNo}>
                                            {o.supplierPoNo} - {o.supplierName || 'Supplier'} (${parseFloat(o.amount || 0).toFixed(2)})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Supplier Name */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    Supplier Company *
                                </label>
                                <SearchableSelect
                                    options={partners.map(p => ({ value: p.id || p.company_name, label: p.company_name || p.name }))}
                                    value={inv.supplierId || inv.supplierName}
                                    onChange={(val) => handleInvoiceChange(idx, 'supplierId', val)}
                                    placeholder="Select supplier company..."
                                />
                            </div>

                            {/* Supplier Invoice / Bill Number */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    Supplier Bill / Invoice No *
                                </label>
                                <input
                                    type="text"
                                    value={inv.supplierInvoiceNo || ''}
                                    onChange={(e) => handleInvoiceChange(idx, 'supplierInvoiceNo', e.target.value)}
                                    placeholder="e.g. INV-88912"
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', fontWeight: 700 }}
                                />
                            </div>

                            {/* Invoice Date */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    Invoice Date
                                </label>
                                <input
                                    type="date"
                                    value={inv.invoiceDate || ''}
                                    onChange={(e) => handleInvoiceChange(idx, 'invoiceDate', e.target.value)}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem' }}
                                />
                            </div>

                            {/* Payment Due Date */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    Payment Due Date
                                </label>
                                <input
                                    type="date"
                                    value={inv.dueDate || ''}
                                    onChange={(e) => handleInvoiceChange(idx, 'dueDate', e.target.value)}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem' }}
                                />
                            </div>

                            {/* Amount & Tax Subtotal */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    Subtotal &amp; Tax (9% GST) *
                                </label>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={inv.subtotal || ''}
                                        onChange={(e) => handleInvoiceChange(idx, 'subtotal', e.target.value)}
                                        placeholder="Subtotal $"
                                        style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', fontWeight: 700 }}
                                    />
                                    <div style={{ background: '#f1f5f9', padding: '9px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.78rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>
                                        Total: ${(parseFloat(inv.grandTotal) || 0).toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Multi-File Attachments for this Supplier Invoice */}
                        <div style={{ background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: '12px', padding: '14px', marginTop: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#831843', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Paperclip size={15} color="#ec4899" /> Supplier Invoice Scans &amp; Receipts ({inv.attachments?.length || 0})
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleOpenUploadForInvoice(idx)}
                                    style={{ background: '#ec4899', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 10px rgba(236, 72, 153, 0.2)' }}
                                >
                                    <Sparkles size={14} /> + Attach Tax Invoice / Camera Scan
                                </button>
                            </div>

                            {/* Attachments List */}
                            {inv.attachments && inv.attachments.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                                    {inv.attachments.map((att) => (
                                        <div key={att.id} style={{ background: '#fff', border: '1px solid #f472b6', borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                            <div style={{ minWidth: 0, flex: 1, cursor: 'pointer' }} onClick={() => setSelectedPreviewFile(att)}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {att.name}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#831843', marginTop: '2px' }}>
                                                    Uploaded: {att.date}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                {att.url && (
                                                    <a
                                                        href={att.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ background: '#fdf2f8', color: '#db2777', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, textDecoration: 'none' }}
                                                    >
                                                        <ExternalLink size={12} />
                                                    </a>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveAttachment(idx, att.id)}
                                                    style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '6px', padding: '4px 6px', cursor: 'pointer' }}
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '16px', color: '#9d174d', fontSize: '0.78rem' }}>
                                    No invoice document uploaded yet. Click "+ Attach Tax Invoice / Camera Scan" above to snap or upload supplier bills.
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Add Another Supplier Invoice Button */}
            <button
                type="button"
                onClick={handleAddInvoice}
                style={{
                    background: '#ffffff',
                    border: '2px dashed #ec4899',
                    color: '#be185d',
                    borderRadius: '16px',
                    padding: '14px',
                    fontSize: '0.88rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                }}
            >
                <Plus size={18} /> Add Another Supplier Invoice / Bill
            </button>

            {/* Selected File Universal Preview Modal Box */}
            {selectedPreviewFile && (
                <div style={{ marginTop: '10px' }}>
                    <UniversalFileViewer
                        file={selectedPreviewFile.name}
                        fileUrl={selectedPreviewFile.url}
                        title={`Selected Invoice Preview: ${selectedPreviewFile.name}`}
                        onRemove={() => setSelectedPreviewFile(null)}
                    />
                </div>
            )}

            {/* Smart Upload Tool Modal */}
            <SmartUploadPanel
                isOpen={isUploadModalOpen}
                onClose={() => { setIsUploadModalOpen(false); setActiveTargetInvoiceIndex(null); }}
                onSelect={handleAttachFileToInvoice}
                documentType="invoice"
            />

            {/* Step Navigation Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                <button
                    type="button"
                    onClick={onPrev}
                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '12px 20px', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <ArrowLeft size={18} /> Back: Job Execution
                </button>
                <button
                    type="button"
                    onClick={onNext}
                    style={{ background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)', color: '#fff', border: 'none', borderRadius: '12px', padding: '12px 24px', fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(219, 39, 119, 0.3)' }}
                >
                    Next Activity: Delivery &amp; Service <ArrowRight size={18} />
                </button>
            </div>
        </div>
    );
}
