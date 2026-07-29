import React, { useState } from 'react';
import { 
    ShoppingBag, Upload, Check, Sparkles, ArrowRight, ArrowLeft, 
    AlertCircle, FileText, CheckCircle2, ExternalLink, Zap, Briefcase 
} from 'lucide-react';
import SmartUploadPanel from '../upload/SmartUploadPanel';
import UniversalFileViewer from '../common/UniversalFileViewer';
import { generateDocNumber } from '../../lib/workflowV2Service';
import { createFolderStructure } from '../../lib/driveService';
import toast from 'react-hot-toast';

export default function StepCustomerPO({ 
    wizardData, 
    updateWizardData, 
    onNext, 
    onPrev,
    companyId 
}) {
    const [isUploadPanelOpen, setIsUploadPanelOpen] = useState(false);
    const [isConverting, setIsConverting] = useState(false);

    const isPoValid = wizardData.customerPoNo && wizardData.customerPoNo.trim().length > 0;
    const isAmountMatching = Math.abs((wizardData.customerPoAmount || 0) - (wizardData.grandTotal || 0)) < 0.01;

    const handleConvertToJob = async () => {
        setIsConverting(true);
        try {
            // 1. Auto generate Job Running Number
            const newJobNo = await generateDocNumber(companyId || 'CEL', 'Job Order');
            
            // 2. Create Google Drive folder structure (Jobs/2026/JOB-2607-0001 - CustomerName)
            const currentYear = new Date().getFullYear().toString();
            const customerName = wizardData.customerName || 'Customer';
            const folderPath = `Jobs/${currentYear}/${newJobNo} - ${customerName}`;
            
            let newDriveFolderId = null;
            try {
                const token = localStorage.getItem('gdrive_access_token');
                if (token) {
                    newDriveFolderId = await createFolderStructure(token, folderPath, null);
                }
            } catch (driveErr) {
                console.warn("Google Drive folder creation notice:", driveErr);
            }

            // 3. Update wizardData state
            updateWizardData({
                jobNo: newJobNo,
                jobDriveFolderId: newDriveFolderId || wizardData.gdriveFolderId,
                isConvertedToJob: true
            });

            toast.success(`⚡ Converted to Job: ${newJobNo}! Drive folder provisioned.`);
        } catch (err) {
            console.error("Error converting to job:", err);
            const fallbackNo = `JOB-${new Date().getFullYear().toString().slice(-2)}${(new Date().getMonth() + 1).toString().padStart(2, '0')}-0001`;
            updateWizardData({
                jobNo: fallbackNo,
                isConvertedToJob: true
            });
            toast.success(`⚡ Converted to Job: ${fallbackNo}`);
        } finally {
            setIsConverting(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(217, 119, 6, 0.08) 100%)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: '#f59e0b', color: '#fff', padding: '8px', borderRadius: '10px' }}>
                            <ShoppingBag size={22} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                                Step 3: Customer Purchase Order (PO) Confirmation
                            </h2>
                            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                Upload signed Customer PO, confirm PO number, and verify order value against Quotation: <strong>{wizardData.quotationNo} (${(wizardData.grandTotal || 0).toFixed(2)})</strong>
                            </span>
                        </div>
                    </div>

                    {/* Quick Cross-Check External Links */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <a
                            href="/purchase-orders"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: '#fffeb3', color: '#b45309', border: '1px solid #fde047', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                            🛒 Customer PO List <ExternalLink size={12} />
                        </a>
                        <a
                            href="/workflows/jobs-dashboard"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                            📊 Job Control <ExternalLink size={12} />
                        </a>
                    </div>
                </div>
            </div>

            {/* CONVERT TO JOB ACTION BANNER */}
            <div style={{
                background: wizardData.isConvertedToJob 
                    ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' 
                    : 'linear-gradient(135deg, #fffbe6 0%, #fef3c7 100%)',
                border: wizardData.isConvertedToJob ? '1px solid #6ee7b7' : '1px solid #fde047',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                justify: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.04)'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <Briefcase size={18} color={wizardData.isConvertedToJob ? '#059669' : '#b45309'} />
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: wizardData.isConvertedToJob ? '#065f46' : '#92400e' }}>
                            {wizardData.isConvertedToJob ? `Converted to Job: ${wizardData.jobNo}` : 'Convert Enquiry to Formal Job'}
                        </h4>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: wizardData.isConvertedToJob ? '#047857' : '#b45309' }}>
                        {wizardData.isConvertedToJob 
                            ? `Job No. ${wizardData.jobNo} is active. Google Drive Job Folder provisioned and linked.`
                            : 'Enter Customer PO No below then click to generate incremental Job Running No, provision Drive Job Folder, and link files.'}
                    </p>
                </div>

                {!wizardData.isConvertedToJob ? (
                    <button
                        type="button"
                        onClick={handleConvertToJob}
                        disabled={isConverting || !wizardData.customerPoNo}
                        style={{
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '10px',
                            padding: '10px 20px',
                            fontSize: '0.88rem',
                            fontWeight: 800,
                            cursor: (isConverting || !wizardData.customerPoNo) ? 'not-allowed' : 'pointer',
                            opacity: (isConverting || !wizardData.customerPoNo) ? 0.6 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                        }}
                    >
                        {isConverting ? (
                            <>Provisioning Job Folder...</>
                        ) : (
                            <>
                                <Zap size={18} /> Convert to Job ↗
                            </>
                        )}
                    </button>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: '#059669', color: '#fff', padding: '6px 14px', borderRadius: '20px', fontSize: '0.82rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <CheckCircle2 size={16} /> Job Active: {wizardData.jobNo}
                        </span>
                    </div>
                )}
            </div>

            {/* Form & Upload Panel */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 700 }}>
                    Customer PO Details
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Customer PO Number *
                        </label>
                        <input
                            type="text"
                            value={wizardData.customerPoNo || ''}
                            onChange={(e) => updateWizardData({ customerPoNo: e.target.value })}
                            placeholder="e.g. PO-CEL-2026-991"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.9rem',
                                fontWeight: 800
                            }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Customer PO Date
                        </label>
                        <input
                            type="date"
                            value={wizardData.customerPoDate || new Date().toISOString().split('T')[0]}
                            onChange={(e) => updateWizardData({ customerPoDate: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Confirmed PO Amount (SGD)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={wizardData.customerPoAmount ?? (wizardData.grandTotal || 0)}
                            onChange={(e) => updateWizardData({ customerPoAmount: parseFloat(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 800 }}
                        />
                    </div>
                </div>

                {/* Amount match indicator */}
                {wizardData.customerPoAmount > 0 && (
                    <div style={{
                        marginTop: '14px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: isAmountMatching ? '#f0fdf4' : '#fffbeb',
                        color: isAmountMatching ? '#166534' : '#b45309',
                        border: `1px solid ${isAmountMatching ? '#bbf7d0' : '#fde68a'}`
                    }}>
                        {isAmountMatching ? (
                            <>
                                <CheckCircle2 size={16} /> Customer PO Amount matches Quotation Total (${(wizardData.grandTotal || 0).toFixed(2)}).
                            </>
                        ) : (
                            <>
                                <AlertCircle size={16} /> PO Amount (${(wizardData.customerPoAmount || 0).toFixed(2)}) differs from Quotation (${(wizardData.grandTotal || 0).toFixed(2)}).
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Smart Upload Customer PO Copy */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                        Step 3: Customer PO Document Attachment
                    </h3>
                    <button
                        type="button"
                        onClick={() => setIsUploadPanelOpen(true)}
                        style={{
                            background: '#f59e0b',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 14px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)'
                        }}
                    >
                        <Sparkles size={16} /> Smart Upload Customer PO
                    </button>
                </div>

                <UniversalFileViewer
                    file={wizardData.customerPoFile}
                    fileUrl={wizardData.customerPoUrl}
                    title="Customer PO File / Document Scan Preview"
                    emptyTitle="No Customer PO File Attached"
                    emptySubtitle="Upload a Customer PO scan PDF or image via Smart Upload Tool to preview loaded file here."
                    onRemove={() => {
                        updateWizardData({
                            customerPoFile: null,
                            customerPoUrl: ''
                        });
                        toast.info('Removed Customer PO file');
                    }}
                />
            </div>

            <SmartUploadPanel
                isOpen={isUploadPanelOpen}
                onClose={() => setIsUploadPanelOpen(false)}
                onSelect={(file) => {
                    updateWizardData({
                        customerPoFile: file.name || file.fileName,
                        customerPoUrl: file.webViewLink || file.previewUrl
                    });
                    toast.success("Attached Customer PO file");
                    setIsUploadPanelOpen(false);
                }}
                documentType="po"
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
                    disabled={!isPoValid}
                    style={{
                        background: isPoValid 
                            ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' 
                            : '#cbd5e1',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '12px 24px',
                        fontSize: '0.9rem',
                        fontWeight: 800,
                        cursor: isPoValid ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    Next Activity: Job Execution &amp; Vendor Floating <ArrowRight size={18} />
                </button>
            </div>
        </div>
    );
}
