import React, { useState, useEffect } from 'react';
import { 
    Send, Plus, Trash2, RefreshCcw, Sparkles, ArrowRight, ArrowLeft, 
    Upload, Check, DollarSign, Calculator, FileText, Link, CheckCircle2, ExternalLink 
} from 'lucide-react';
import SearchableSelect from '../common/SearchableSelect';
import SmartUploadPanel from '../upload/SmartUploadPanel';
import SelectQuotationModal from './SelectQuotationModal';
import UniversalFileViewer from '../common/UniversalFileViewer';
import { generateDocNumber } from '../../lib/workflowV2Service';
import toast from 'react-hot-toast';

export default function StepQuotationCosting({ 
    wizardData, 
    updateWizardData, 
    onNext, 
    onPrev, 
    catalogItems = [],
    companyId 
}) {
    const [isUploadPanelOpen, setIsUploadPanelOpen] = useState(false);
    const [isGeneratingNo, setIsGeneratingNo] = useState(false);
    const [isSelectQuoteModalOpen, setIsSelectQuoteModalOpen] = useState(false);

    useEffect(() => {
        if (!wizardData.quotationNo && companyId) {
            autoGenerateQuotationNo();
        }
        if (!wizardData.lineItems || wizardData.lineItems.length === 0) {
            // Default 1 blank line item
            updateWizardData({
                lineItems: [
                    { id: 1, description: 'Supply / Service Work', quantity: 1, uom: 'LOT', unit_price: 0, tax_enabled: true, amount: 0 }
                ]
            });
        }
    }, [companyId]);

    const autoGenerateQuotationNo = async () => {
        setIsGeneratingNo(true);
        try {
            const nextNo = await generateDocNumber(companyId, 'Quotation');
            updateWizardData({ quotationNo: nextNo });
        } catch (err) {
            console.error('Error generating quotation no:', err);
            updateWizardData({ quotationNo: `QTN-${new Date().getFullYear()}-0001` });
        } finally {
            setIsGeneratingNo(false);
        }
    };

    const handleSelectQuotationFromModal = (importedData) => {
        updateWizardData({
            linkedQuotationId: importedData.linkedQuotationId,
            quotationNo: importedData.quotationNo || wizardData.quotationNo,
            quotationDate: importedData.quotationDate || wizardData.quotationDate,
            lineItems: importedData.lineItems,
            subtotal: importedData.subtotal,
            taxAmount: importedData.taxAmount,
            grandTotal: importedData.grandTotal,
            partnerId: importedData.partnerId || wizardData.partnerId,
            customerName: importedData.customerName || wizardData.customerName,
            contactId: importedData.contactId || wizardData.contactId,
            vesselId: importedData.vesselId || wizardData.vesselId,
            workLocationId: importedData.workLocationId || wizardData.workLocationId,
            subject: importedData.subject || wizardData.subject,
            quotationUrl: importedData.quotationUrl || wizardData.quotationUrl
        });
    };

    const handleLineItemChange = (index, field, value) => {
        const updated = [...(wizardData.lineItems || [])];
        updated[index][field] = value;

        // Recalculate line total
        const qty = parseFloat(updated[index].quantity) || 0;
        const price = parseFloat(updated[index].unit_price) || 0;
        updated[index].amount = qty * price;

        updateWizardData({ lineItems: updated });
    };

    const addLineItem = () => {
        const newItem = {
            id: Date.now(),
            description: '',
            quantity: 1,
            uom: 'PCS',
            unit_price: 0,
            tax_enabled: true,
            amount: 0
        };
        updateWizardData({ lineItems: [...(wizardData.lineItems || []), newItem] });
    };

    const removeLineItem = (index) => {
        const updated = (wizardData.lineItems || []).filter((_, i) => i !== index);
        updateWizardData({ lineItems: updated });
    };

    // Computations
    const items = wizardData.lineItems || [];
    const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const taxableTotal = items.reduce((sum, item) => item.tax_enabled ? sum + (parseFloat(item.amount) || 0) : sum, 0);
    const taxAmount = wizardData.isGstExempt ? 0 : taxableTotal * 0.09; // 9% GST
    const grandTotal = subtotal + taxAmount;

    useEffect(() => {
        updateWizardData({ subtotal, taxAmount, grandTotal });
    }, [subtotal, taxAmount, grandTotal]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: '#8b5cf6', color: '#fff', padding: '8px', borderRadius: '10px' }}>
                        <Send size={22} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                            Step 2: Quotation Costing &amp; Estimation
                        </h2>
                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                            Linked Enquiry: <strong>{wizardData.enquiryNo || 'Draft Enquiry'}</strong> {wizardData.customerName ? `(${wizardData.customerName})` : ''}
                        </span>
                    </div>
                </div>

                {/* Integration Action: Link / Import Quote & Open Q2Customers in new window */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {wizardData.linkedQuotationId && (
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            background: '#dcfce7',
                            color: '#15803d',
                            border: '1px solid #86efac',
                            fontSize: '0.78rem',
                            fontWeight: 700
                        }}>
                            <CheckCircle2 size={14} /> Linked to Quote2Customers
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => setIsSelectQuoteModalOpen(true)}
                        style={{
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '10px',
                            padding: '8px 16px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)',
                            transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                        }}
                        onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                        onMouseOut={e => e.currentTarget.style.transform = 'none'}
                    >
                        <FileText size={16} /> Link Quote2Customers Library
                    </button>
                    <a
                        href="/quotations"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            background: '#ffffff',
                            color: '#4f46e5',
                            border: '1px solid #c7d2fe',
                            borderRadius: '10px',
                            padding: '8px 14px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                            transition: 'all 0.15s ease'
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.borderColor = '#818cf8'; }}
                        onMouseOut={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#c7d2fe'; }}
                        title="Open Quotations directory list in a new window"
                    >
                        <ExternalLink size={14} /> Open Quotations List ↗
                    </a>
                    <a
                        href="/workflows/editor/new?type=Quotation"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            background: '#ffffff',
                            color: '#7c3aed',
                            border: '1px solid #ddd6fe',
                            borderRadius: '10px',
                            padding: '8px 14px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)'
                        }}
                        title="Open Quotation Document Editor in a new window"
                    >
                        <ExternalLink size={14} /> Open Quotation Editor ↗
                    </a>
                </div>
            </div>

            {/* Quotation Details Header */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Incremental Quotation No *
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={wizardData.quotationNo || ''}
                                onChange={(e) => updateWizardData({ quotationNo: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '0.9rem',
                                    fontWeight: 800,
                                    background: '#f8fafc'
                                }}
                            />
                            <button
                                type="button"
                                onClick={autoGenerateQuotationNo}
                                disabled={isGeneratingNo}
                                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 12px', cursor: 'pointer' }}
                            >
                                <RefreshCcw size={16} className={isGeneratingNo ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Quotation Date &amp; Validity
                        </label>
                        <input
                            type="date"
                            value={wizardData.quotationDate || new Date().toISOString().split('T')[0]}
                            onChange={(e) => updateWizardData({ quotationDate: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                        />
                    </div>
                </div>
            </div>

            {/* Line Items Table */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calculator size={18} color="#8b5cf6" /> Costing Line Items
                    </h3>
                    <button
                        onClick={addLineItem}
                        style={{
                            background: '#f3e8ff',
                            color: '#7e22ce',
                            border: '1px solid #d8b4fe',
                            borderRadius: '8px',
                            padding: '6px 14px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Plus size={16} /> Add Line Item
                    </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                                <th style={{ padding: '10px', width: '40%' }}>Description / Item</th>
                                <th style={{ padding: '10px', width: '12%' }}>Qty</th>
                                <th style={{ padding: '10px', width: '12%' }}>UOM</th>
                                <th style={{ padding: '10px', width: '15%' }}>Unit Price (SGD)</th>
                                <th style={{ padding: '10px', width: '15%' }}>Amount (SGD)</th>
                                <th style={{ padding: '10px', width: '6%', textAlign: 'center' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={item.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '8px' }}>
                                        <input
                                            type="text"
                                            value={item.description || ''}
                                            onChange={(e) => handleLineItemChange(idx, 'description', e.target.value)}
                                            placeholder="Item description or scope of work..."
                                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                        />
                                    </td>
                                    <td style={{ padding: '8px' }}>
                                        <input
                                            type="number"
                                            min="0"
                                            value={item.quantity}
                                            onChange={(e) => handleLineItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                        />
                                    </td>
                                    <td style={{ padding: '8px' }}>
                                        <input
                                            type="text"
                                            value={item.uom || 'LOT'}
                                            onChange={(e) => handleLineItemChange(idx, 'uom', e.target.value)}
                                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                        />
                                    </td>
                                    <td style={{ padding: '8px' }}>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={item.unit_price}
                                            onChange={(e) => handleLineItemChange(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 600 }}
                                        />
                                    </td>
                                    <td style={{ padding: '8px', fontWeight: 800, color: '#1e293b' }}>
                                        ${(item.amount || 0).toFixed(2)}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                        {items.length > 1 && (
                                            <button
                                                onClick={() => removeLineItem(idx)}
                                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Calculation Summary */}
                <div style={{
                    marginTop: '16px',
                    paddingTop: '16px',
                    borderTop: '2px dashed #e2e8f0',
                    display: 'flex',
                    justifyContent: 'flex-end'
                }}>
                    <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                            <span>Subtotal:</span>
                            <span style={{ fontWeight: 700, color: '#1e293b' }}>${subtotal.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                            <span>GST (9%):</span>
                            <span style={{ fontWeight: 700, color: '#1e293b' }}>${taxAmount.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 900, color: '#4f46e5', borderTop: '1px solid #cbd5e1', paddingTop: '6px' }}>
                            <span>Total Amount:</span>
                            <span>${grandTotal.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Smart Upload for Quotation PDF/Scan */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>
                        Step 2: Quotation PDF / Document Scan Attachment
                    </h4>
                    <button
                        type="button"
                        onClick={() => setIsUploadPanelOpen(true)}
                        style={{ background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.25)' }}
                    >
                        <Sparkles size={14} /> Smart Upload Quotation
                    </button>
                </div>

                <UniversalFileViewer
                    file={wizardData.quotationFile}
                    fileUrl={wizardData.quotationUrl}
                    title="Quotation File / Document Scan Preview"
                    emptyTitle="No Quotation Document Attached"
                    emptySubtitle="Upload or select a quotation scan above to preview your loaded quote file here."
                    onRemove={() => {
                        updateWizardData({
                            quotationFile: null,
                            quotationUrl: ''
                        });
                        toast.info('Removed quotation file');
                    }}
                />
            </div>

            <SelectQuotationModal
                isOpen={isSelectQuoteModalOpen}
                onClose={() => setIsSelectQuoteModalOpen(false)}
                companyId={companyId}
                currentQuotationNo={wizardData.quotationNo}
                onSelectQuotation={handleSelectQuotationFromModal}
            />

            <SmartUploadPanel
                isOpen={isUploadPanelOpen}
                onClose={() => setIsUploadPanelOpen(false)}
                onSelect={(file) => {
                    updateWizardData({
                        quotationFile: file.name || file.fileName,
                        quotationUrl: file.webViewLink || file.previewUrl
                    });
                    toast.success("Attached quotation file");
                    setIsUploadPanelOpen(false);
                }}
                documentType="quotation"
            />

            {/* Navigation buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                <button
                    onClick={onPrev}
                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '12px 20px', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <ArrowLeft size={18} /> Back
                </button>
                <button
                    onClick={onNext}
                    style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: '#fff', border: 'none', borderRadius: '12px', padding: '12px 24px', fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    Next Activity: Customer PO <ArrowRight size={18} />
                </button>
            </div>
        </div>
    );
}
