import React, { useState, useEffect } from 'react';
import { 
    Receipt, Upload, Check, Sparkles, ArrowRight, ArrowLeft, 
    RefreshCcw, DollarSign, Calendar, ExternalLink 
} from 'lucide-react';
import SmartUploadPanel from '../upload/SmartUploadPanel';
import UniversalFileViewer from '../common/UniversalFileViewer';
import { generateDocNumber } from '../../lib/workflowV2Service';
import toast from 'react-hot-toast';

export default function StepInvoicing({ 
    wizardData, 
    updateWizardData, 
    onNext, 
    onPrev,
    companyId 
}) {
    const [isUploadPanelOpen, setIsUploadPanelOpen] = useState(false);
    const [isGeneratingNo, setIsGeneratingNo] = useState(false);

    useEffect(() => {
        if (!wizardData.invoiceNo && companyId) {
            handleAutoGenerateNo();
        }
    }, [companyId]);

    const handleAutoGenerateNo = async () => {
        setIsGeneratingNo(true);
        try {
            const nextNo = await generateDocNumber(companyId, 'Tax Invoice');
            updateWizardData({ invoiceNo: nextNo });
        } catch (err) {
            console.error('Error generating invoice no:', err);
            updateWizardData({ invoiceNo: `INV-${new Date().getFullYear()}-0001` });
        } finally {
            setIsGeneratingNo(false);
        }
    };

    const subtotal = wizardData.subtotal || 0;
    const taxAmount = wizardData.taxAmount || subtotal * 0.09;
    const totalInvoiceAmount = wizardData.grandTotal || (subtotal + taxAmount);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.08) 0%, rgba(219, 39, 119, 0.08) 100%)',
                border: '1px solid rgba(236, 72, 153, 0.2)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: '#ec4899', color: '#fff', padding: '8px', borderRadius: '10px' }}>
                            <Receipt size={22} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                                Step 8: Tax Invoice Generation
                            </h2>
                            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                Generate incremental Tax Invoice, calculate 9% GST, set payment due date, and upload invoice copy.
                            </span>
                        </div>
                    </div>

                    {/* Quick Cross-Check External Links */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <a
                            href="/invoices"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: '#fdf2f8', color: '#db2777', border: '1px solid #fbcfe8', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                            📄 Tax Invoices List <ExternalLink size={12} />
                        </a>
                        <a
                            href="/soa"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                            💳 Statement of Account <ExternalLink size={12} />
                        </a>
                    </div>
                </div>
            </div>

            {/* Invoice Form */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 700 }}>
                    Tax Invoice Details
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Incremental Tax Invoice No *
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={wizardData.invoiceNo || ''}
                                onChange={(e) => updateWizardData({ invoiceNo: e.target.value })}
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
                                onClick={autoGenerateInvoiceNo}
                                disabled={isGeneratingNo}
                                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 12px', cursor: 'pointer' }}
                            >
                                <RefreshCcw size={16} className={isGeneratingNo ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Invoice Date
                        </label>
                        <input
                            type="date"
                            value={wizardData.invoiceDate || new Date().toISOString().split('T')[0]}
                            onChange={(e) => updateWizardData({ invoiceDate: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Payment Terms
                        </label>
                        <select
                            value={wizardData.paymentTerms || '30 Days'}
                            onChange={(e) => updateWizardData({ paymentTerms: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}
                        >
                            <option value="Immediate">Immediate / Cash on Delivery</option>
                            <option value="15 Days">15 Days</option>
                            <option value="30 Days">30 Days Credit</option>
                            <option value="60 Days">60 Days Credit</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Payment Due Date
                        </label>
                        <input
                            type="date"
                            value={wizardData.dueDate || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]}
                            onChange={(e) => updateWizardData({ dueDate: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                        />
                    </div>
                </div>

                {/* Amount Summary */}
                <div style={{
                    marginTop: '20px',
                    padding: '16px',
                    borderRadius: '12px',
                    background: '#fdf2f8',
                    border: '1px solid #fbcfe8',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    <div>
                        <span style={{ fontSize: '0.82rem', color: '#9d174d', fontWeight: 700 }}>TAX INVOICE GRAND TOTAL</span>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#831843' }}>
                            ${totalInvoiceAmount.toFixed(2)} SGD
                        </div>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#9d174d', textAlign: 'right' }}>
                        Subtotal: <strong>${subtotal.toFixed(2)}</strong> | GST (9%): <strong>${taxAmount.toFixed(2)}</strong>
                    </div>
                </div>
            </div>

            {/* Smart Upload Tax Invoice Copy */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>
                        Step 6: Tax Invoice Document Scan / PDF Attachment
                    </h4>
                    <button
                        type="button"
                        onClick={() => setIsUploadPanelOpen(true)}
                        style={{ background: '#ec4899', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(236, 72, 153, 0.25)' }}
                    >
                        <Sparkles size={14} /> Smart Upload Tax Invoice
                    </button>
                </div>

                <UniversalFileViewer
                    file={wizardData.invoiceFile}
                    fileUrl={wizardData.invoiceUrl}
                    title="Tax Invoice Document Preview"
                    emptyTitle="No Tax Invoice File Attached"
                    emptySubtitle="Upload a Tax Invoice PDF or scan image to preview loaded file here."
                    onRemove={() => {
                        updateWizardData({
                            invoiceFile: null,
                            invoiceUrl: ''
                        });
                        toast.info('Removed Tax Invoice file');
                    }}
                />
            </div>

            <SmartUploadPanel
                isOpen={isUploadPanelOpen}
                onClose={() => setIsUploadPanelOpen(false)}
                onSelect={(file) => {
                    updateWizardData({
                        invoiceFile: file.name || file.fileName,
                        invoiceUrl: file.webViewLink || file.previewUrl
                    });
                    toast.success("Attached Tax Invoice!");
                    setIsUploadPanelOpen(false);
                }}
                documentType="invoice"
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
                    Next Activity: Payment Received <ArrowRight size={18} />
                </button>
            </div>
        </div>
    );
}
