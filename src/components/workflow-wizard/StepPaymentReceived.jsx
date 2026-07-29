import React, { useState, useEffect } from 'react';
import { 
    DollarSign, Upload, Check, Sparkles, ArrowLeft, 
    RefreshCcw, CheckCircle2, ShieldCheck, PartyPopper, ExternalLink 
} from 'lucide-react';
import SmartUploadPanel from '../upload/SmartUploadPanel';
import UniversalFileViewer from '../common/UniversalFileViewer';
import { generateDocNumber } from '../../lib/workflowV2Service';
import toast from 'react-hot-toast';

export default function StepPaymentReceived({ 
    wizardData, 
    updateWizardData, 
    onPrev,
    onCompleteWorkflow,
    isSaving = false,
    companyId 
}) {
    const [isUploadPanelOpen, setIsUploadPanelOpen] = useState(false);
    const [isGeneratingNo, setIsGeneratingNo] = useState(false);

    useEffect(() => {
        if (!wizardData.paymentNo && companyId) {
            autoGeneratePaymentNo();
        }
        if (!wizardData.paymentAmount) {
            updateWizardData({ paymentAmount: wizardData.grandTotal || 0 });
        }
    }, [companyId]);

    const autoGeneratePaymentNo = async () => {
        setIsGeneratingNo(true);
        try {
            const nextNo = await generateDocNumber(companyId, 'Payment Received');
            updateWizardData({ paymentNo: nextNo });
        } catch (err) {
            console.error('Error generating payment no:', err);
            updateWizardData({ paymentNo: `PAY-${new Date().getFullYear()}-0001` });
        } finally {
            setIsGeneratingNo(false);
        }
    };

    const invoiceTotal = wizardData.grandTotal || 0;
    const paidAmount = wizardData.paymentAmount || 0;
    const remainingBalance = Math.max(0, invoiceTotal - paidAmount);
    const isFullyPaid = remainingBalance <= 0.01;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(22, 163, 74, 0.08) 100%)',
                border: '1px solid rgba(34, 197, 94, 0.2)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: '#22c55e', color: '#fff', padding: '8px', borderRadius: '10px' }}>
                            <DollarSign size={22} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                                Step 9: Payment Received &amp; Workflow Closure
                            </h2>
                            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                Record payment advice details, attach PayNow/Bank TT proof, and complete full transaction lifecycle.
                            </span>
                        </div>
                    </div>

                    {/* Quick Cross-Check External Links */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <a
                            href="/soa"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                            💰 Statement of Accounts (SOA) <ExternalLink size={12} />
                        </a>
                        <a
                            href="/workflows/jobs-dashboard"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                            📊 Job Control <ExternalLink size={12} />
                        </a>
                    </div>
                </div>
            </div>

            {/* Payment Details Form */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 700 }}>
                    Payment Receipt Details
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Incremental Payment Receipt No *
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={wizardData.paymentNo || ''}
                                onChange={(e) => updateWizardData({ paymentNo: e.target.value })}
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
                                onClick={autoGeneratePaymentNo}
                                disabled={isGeneratingNo}
                                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 12px', cursor: 'pointer' }}
                            >
                                <RefreshCcw size={16} className={isGeneratingNo ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Payment Method
                        </label>
                        <select
                            value={wizardData.paymentMethod || 'Bank TT'}
                            onChange={(e) => updateWizardData({ paymentMethod: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}
                        >
                            <option value="PayNow">PayNow UEN</option>
                            <option value="Bank TT">Bank Telegraphic Transfer (TT)</option>
                            <option value="Cheque">Bank Cheque</option>
                            <option value="Credit Card">Credit Card</option>
                            <option value="Cash">Cash</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Transaction Ref / Cheque No
                        </label>
                        <input
                            type="text"
                            value={wizardData.paymentRef || ''}
                            onChange={(e) => updateWizardData({ paymentRef: e.target.value })}
                            placeholder="e.g. TT-20260722-0918"
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Payment Received Date
                        </label>
                        <input
                            type="date"
                            value={wizardData.paymentDate || new Date().toISOString().split('T')[0]}
                            onChange={(e) => updateWizardData({ paymentDate: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Amount Received (SGD) *
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={wizardData.paymentAmount || 0}
                            onChange={(e) => updateWizardData({ paymentAmount: parseFloat(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 800 }}
                        />
                    </div>
                </div>

                {/* Status Indicator */}
                <div style={{
                    marginTop: '20px',
                    padding: '16px',
                    borderRadius: '12px',
                    background: isFullyPaid ? '#f0fdf4' : '#fffbeb',
                    border: `1px solid ${isFullyPaid ? '#bbf7d0' : '#fde68a'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {isFullyPaid ? <ShieldCheck size={28} color="#166534" /> : <DollarSign size={28} color="#b45309" />}
                        <div>
                            <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: isFullyPaid ? '#166534' : '#92400e' }}>
                                {isFullyPaid ? 'FULL PAYMENT RECEIVED & VERIFIED' : 'PARTIAL PAYMENT RECORDED'}
                            </h4>
                            <span style={{ fontSize: '0.8rem', color: isFullyPaid ? '#15803d' : '#b45309' }}>
                                Invoice Total: ${invoiceTotal.toFixed(2)} | Paid: ${paidAmount.toFixed(2)} | Balance Due: ${remainingBalance.toFixed(2)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Smart Upload Payment Proof */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>
                        Step 7: Payment Advice / PayNow Screenshot / Bank Advice Attachment
                    </h4>
                    <button
                        type="button"
                        onClick={() => setIsUploadPanelOpen(true)}
                        style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(34, 197, 94, 0.25)' }}
                    >
                        <Sparkles size={14} /> Smart Upload Receipt
                    </button>
                </div>

                <UniversalFileViewer
                    file={wizardData.paymentProofFile}
                    fileUrl={wizardData.paymentProofUrl}
                    title="Payment Proof & Bank Advice Preview"
                    emptyTitle="No Payment Proof Attached"
                    emptySubtitle="Upload bank receipt, PayNow screenshot, or payment advice to preview loaded file here."
                    onRemove={() => {
                        updateWizardData({
                            paymentProofFile: null,
                            paymentProofUrl: ''
                        });
                        toast.info('Removed Payment Proof file');
                    }}
                />
            </div>

            <SmartUploadPanel
                isOpen={isUploadPanelOpen}
                onClose={() => setIsUploadPanelOpen(false)}
                onSelect={(file) => {
                    updateWizardData({
                        paymentProofFile: file.name || file.fileName,
                        paymentProofUrl: file.webViewLink || file.previewUrl
                    });
                    toast.success("Attached Payment Proof!");
                    setIsUploadPanelOpen(false);
                }}
                documentType="payment"
            />

            {/* Navigation & Final Save */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                <button
                    onClick={onPrev}
                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '12px 20px', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <ArrowLeft size={18} /> Back
                </button>
                <button
                    onClick={onCompleteWorkflow}
                    disabled={isSaving}
                    style={{
                        background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '14px 28px',
                        fontSize: '0.95rem',
                        fontWeight: 900,
                        cursor: isSaving ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        boxShadow: '0 4px 16px rgba(22, 163, 74, 0.4)'
                    }}
                >
                    <PartyPopper size={20} /> {isSaving ? 'Saving All Documents...' : 'Complete & Seal Job Workflow'}
                </button>
            </div>
        </div>
    );
}
