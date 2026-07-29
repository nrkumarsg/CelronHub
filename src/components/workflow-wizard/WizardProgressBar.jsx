import React from 'react';
import { 
    FileText, Send, ShoppingBag, Briefcase, Truck, Receipt, CheckCircle, ChevronRight, DollarSign, FolderOpen, ShoppingCart, FileSpreadsheet, Folder, ExternalLink, TrendingUp, Building2
} from 'lucide-react';

export const WIZARD_STEPS = [
    {
        id: 0,
        key: 'job_drive_repository',
        title: 'Jobs & Drive Repository',
        subtitle: 'Audit updates & Drive folders',
        icon: FolderOpen,
        nextActivity: 'Enquiry & Landing Note',
        color: '#3b82f6',
        isAlwaysAccessible: true
    },
    {
        id: 1,
        key: 'enquiry',
        title: 'Enquiry & Landing Note',
        subtitle: 'Upload paper notes & customer info',
        icon: FileText,
        nextActivity: 'Quotation Costing',
        color: '#6366f1'
    },
    {
        id: 2,
        key: 'quotation',
        title: 'Quotation Costing',
        subtitle: 'Catalog lookup & line items',
        icon: Send,
        nextActivity: 'Customer PO',
        color: '#8b5cf6'
    },
    {
        id: 3,
        key: 'customer_po',
        title: 'Customer PO',
        subtitle: 'Upload signed PO & convert to Job',
        icon: ShoppingBag,
        nextActivity: 'Job Execution & Supplier Operations',
        color: '#f59e0b'
    },
    {
        id: 4,
        key: 'job_execution_supplier_ops',
        title: 'Job Execution & Supplier Operations',
        subtitle: 'Supplier POs, Field Execution & Supplier Bills',
        icon: Briefcase,
        nextActivity: 'Delivery & Service',
        color: '#10b981'
    },
    {
        id: 5,
        key: 'delivery',
        title: 'Delivery & Service',
        subtitle: 'Issue Delivery Order & signed copy',
        icon: Truck,
        nextActivity: 'Tax Invoicing',
        color: '#06b6d4'
    },
    {
        id: 6,
        key: 'invoicing',
        title: 'Tax Invoicing',
        subtitle: 'Subtotal & 9% GST calculation',
        icon: Receipt,
        nextActivity: 'Payment Received',
        color: '#ec4899'
    },
    {
        id: 7,
        key: 'payment',
        title: 'Payment Received',
        subtitle: 'Receipt & Payment Verification',
        icon: DollarSign,
        nextActivity: 'Expenses & Profit',
        color: '#22c55e'
    },
    {
        id: 8,
        key: 'expenses_profit',
        title: 'Expenses & Profit',
        subtitle: 'Job Costing, Expenses & Profitability',
        icon: TrendingUp,
        nextActivity: 'All Steps Complete',
        color: '#10b981'
    }
];

const FALLBACK_CELRON_ROOT_FOLDER = '1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w';

export default function WizardProgressBar({ currentStep, onStepClick, completedSteps = [], wizardData = {}, settings = {} }) {
    const activeStepObj = WIZARD_STEPS.find(s => s.id === currentStep) || WIZARD_STEPS[0];
    const totalWorkflowSteps = 8;
    const progressPercent = currentStep === 0 ? 0 : Math.round((currentStep / totalWorkflowSteps) * 100);

    const hasJobNo = !!wizardData?.jobNo;
    const rawTargetFolder = wizardData?.jobDriveFolderId || 
                            wizardData?.gdriveFolderId || 
                            wizardData?.gdrive_folder_id || 
                            wizardData?.landingNoteDriveId || 
                            settings?.gdrive_01_id || 
                            settings?.gdrive_celron_root_id || 
                            settings?.google_drive_folder_id || 
                            FALLBACK_CELRON_ROOT_FOLDER;

    let driveFolderUrl = `https://drive.google.com/drive/folders/${FALLBACK_CELRON_ROOT_FOLDER}`;
    if (rawTargetFolder) {
        if (typeof rawTargetFolder === 'string' && (rawTargetFolder.startsWith('http://') || rawTargetFolder.startsWith('https://'))) {
            driveFolderUrl = rawTargetFolder;
        } else {
            driveFolderUrl = `https://drive.google.com/drive/folders/${rawTargetFolder}`;
        }
    }

    return (
        <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: '16px',
            padding: '16px 20px',
            border: '1px solid var(--border-color, #e2e8f0)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
            marginBottom: '20px'
        }}>
            {/* Header info */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '14px',
                flexWrap: 'wrap',
                gap: '10px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        background: currentStep === 0 ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        Step {currentStep} of {totalWorkflowSteps}
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                            {activeStepObj?.title}
                        </h3>
                        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            Next Activity: <strong style={{ color: '#4f46e5' }}>{activeStepObj?.nextActivity}</strong>
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {/* Partners Directory Button (Opens in New Window ↗) */}
                    <a
                        href="/partners"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '10px',
                            padding: '8px 14px',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 4px 10px rgba(2, 132, 199, 0.25)'
                        }}
                        title="Open Partners Directory in New Window"
                    >
                        <Building2 size={15} />
                        Partners Directory
                        <ExternalLink size={12} />
                    </a>

                    {/* Google Drive Folder Button (Opens Drive Repository Folder) */}
                    <a
                        href={driveFolderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            background: hasJobNo 
                                ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' 
                                : 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '10px',
                            padding: '8px 14px',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: hasJobNo 
                                ? '0 4px 10px rgba(16, 185, 129, 0.25)' 
                                : '0 4px 10px rgba(37, 99, 235, 0.25)'
                        }}
                        title={`Open ${hasJobNo ? 'Job' : 'Enquiry'} Google Drive Folder`}
                    >
                        <Folder size={15} />
                        {hasJobNo 
                            ? `Job Folder (${wizardData.jobNo})` 
                            : `Drive Folder (${wizardData.enquiryNo || 'Enquiry'})`}
                        <ExternalLink size={12} />
                    </a>

                    <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                            Workflow Progress
                        </span>
                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#4f46e5' }}>
                            {progressPercent}%
                        </div>
                    </div>
                    <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        background: `conic-gradient(#4f46e5 ${progressPercent}%, #e2e8f0 0)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative'
                    }}>
                        <div style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            background: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            color: '#4f46e5'
                        }}>
                            {currentStep}/{totalWorkflowSteps}
                        </div>
                    </div>
                </div>
            </div>

            {/* Progress Track */}
            <div style={{
                height: '6px',
                width: '100%',
                background: '#f1f5f9',
                borderRadius: '3px',
                overflow: 'hidden',
                marginBottom: '16px'
            }}>
                <div style={{
                    height: '100%',
                    width: `${progressPercent}%`,
                    background: 'linear-gradient(90deg, #6366f1 0%, #10b981 100%)',
                    borderRadius: '3px',
                    transition: 'width 0.3s ease'
                }} />
            </div>

            {/* Stepper Bar */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${WIZARD_STEPS.length}, 1fr)`,
                gap: '8px',
                overflowX: 'auto',
                paddingBottom: '4px'
            }}>
                {WIZARD_STEPS.map((step) => {
                    const Icon = step.icon;
                    const isActive = currentStep === step.id;
                    const isCompleted = completedSteps.includes(step.id) || step.id < currentStep;

                    return (
                        <button
                            key={step.id}
                            onClick={() => onStepClick(step.id)}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '10px 6px',
                                background: isActive 
                                    ? 'rgba(99, 102, 241, 0.08)' 
                                    : isCompleted 
                                        ? 'rgba(16, 185, 129, 0.05)' 
                                        : '#f8fafc',
                                border: isActive 
                                    ? '2px solid #6366f1' 
                                    : isCompleted 
                                        ? '1px solid #10b981' 
                                        : '1px solid #e2e8f0',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                minWidth: '95px'
                            }}
                        >
                            <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: isCompleted 
                                    ? '#10b981' 
                                    : isActive 
                                        ? '#6366f1' 
                                        : '#cbd5e1',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                {isCompleted ? <CheckCircle size={16} /> : <Icon size={14} />}
                            </div>
                            <span style={{
                                fontSize: '0.72rem',
                                fontWeight: isActive ? 800 : 600,
                                color: isActive ? '#4f46e5' : isCompleted ? '#059669' : '#64748b',
                                textAlign: 'center',
                                lineHeight: '1.1'
                            }}>
                                {step.id}. {step.title}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
