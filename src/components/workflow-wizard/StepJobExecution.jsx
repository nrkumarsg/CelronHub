import React, { useState, useEffect, useRef } from 'react';
import { 
    Briefcase, Plus, Trash2, RefreshCcw, Sparkles, ArrowRight, ArrowLeft, 
    Check, User, Building2, Layers, Clock, Users, Printer, FileSpreadsheet, X, Eye, ShoppingCart, ExternalLink, Link, CheckCircle2 
} from 'lucide-react';
import SearchableSelect from '../common/SearchableSelect';
import SmartUploadPanel from '../upload/SmartUploadPanel';
import SelectSupplierPoModal from './SelectSupplierPoModal';
import UniversalFileViewer from '../common/UniversalFileViewer';
import { generateDocNumber } from '../../lib/workflowV2Service';
import toast from 'react-hot-toast';

export default function StepJobExecution({ 
    wizardData, 
    updateWizardData, 
    onNext, 
    onPrev, 
    partners = [], 
    staff = [],
    companyId 
}) {
    const [isUploadPanelOpen, setIsUploadPanelOpen] = useState(false);
    const [isGeneratingNo, setIsGeneratingNo] = useState(false);
    const [showTimeSheetModal, setShowTimeSheetModal] = useState(false);
    const [isSelectPoModalOpen, setIsSelectPoModalOpen] = useState(false);

    // Initialize default time-sheet metadata & attendance rows if empty
    useEffect(() => {
        if (!wizardData.jobNo && companyId) {
            autoGenerateJobNo();
        }

        if (!wizardData.timeSheet) {
            updateWizardData({
                timeSheet: {
                    date: new Date().toISOString().split('T')[0],
                    mobilizationDate: new Date().toISOString().split('T')[0],
                    demobilizationDate: new Date().toISOString().split('T')[0],
                    jobScope: wizardData.subject || 'Machine cable open & reconnect',
                    qrmeRef: '',
                    attendanceRows: [
                        { id: 1, name: 'P. Premnath', designation: 'Engineer', timeIn: '08:00', timeOut: '18:00', remark: new Date().toLocaleDateString('en-GB') },
                        { id: 2, name: 'Anandhakumar', designation: 'Technician', timeIn: '08:00', timeOut: '18:00', remark: new Date().toLocaleDateString('en-GB') }
                    ]
                }
            });
        }
    }, [companyId]);

    const autoGenerateJobNo = async () => {
        setIsGeneratingNo(true);
        try {
            const nextNo = await generateDocNumber(companyId, 'Job');
            updateWizardData({ jobNo: nextNo });
        } catch (err) {
            console.error('Error generating job no:', err);
            updateWizardData({ jobNo: `JCEL-${new Date().getFullYear()}-0001` });
        } finally {
            setIsGeneratingNo(false);
        }
    };

    // Attendance Grid Handlers
    const addAttendanceRow = () => {
        const currentRows = wizardData.timeSheet?.attendanceRows || [];
        const newRow = {
            id: Date.now(),
            name: '',
            designation: 'Technician',
            timeIn: '08:00',
            timeOut: '18:00',
            remark: new Date().toLocaleDateString('en-GB')
        };
        const updatedTimeSheet = {
            ...wizardData.timeSheet,
            attendanceRows: [...currentRows, newRow]
        };
        updateWizardData({ timeSheet: updatedTimeSheet });
    };

    const removeAttendanceRow = (index) => {
        const currentRows = wizardData.timeSheet?.attendanceRows || [];
        const updatedRows = currentRows.filter((_, i) => i !== index);
        updateWizardData({
            timeSheet: {
                ...wizardData.timeSheet,
                attendanceRows: updatedRows
            }
        });
    };

    const updateAttendanceRow = (index, field, value) => {
        const currentRows = [...(wizardData.timeSheet?.attendanceRows || [])];
        currentRows[index][field] = value;
        updateWizardData({
            timeSheet: {
                ...wizardData.timeSheet,
                attendanceRows: currentRows
            }
        });
    };

    const updateTimeSheetMeta = (field, value) => {
        updateWizardData({
            timeSheet: {
                ...wizardData.timeSheet,
                [field]: value
            }
        });
    };

    // Supplier Floating Order Handlers
    const addSupplierPo = () => {
        const newPo = {
            id: Date.now(),
            supplierId: '',
            supplierPoNo: `SPO-${Date.now().toString().slice(-4)}`,
            amount: 0,
            status: 'Issued'
        };
        updateWizardData({ supplierPos: [...(wizardData.supplierPos || []), newPo] });
    };

    const removeSupplierPo = (index) => {
        const updated = (wizardData.supplierPos || []).filter((_, i) => i !== index);
        updateWizardData({ supplierPos: updated });
    };

    const updateSupplierPo = (index, field, value) => {
        const updated = [...(wizardData.supplierPos || [])];
        updated[index][field] = value;
        updateWizardData({ supplierPos: updated });
    };

    const handleSelectPoFromModal = (selectedPo) => {
        const currentPos = wizardData.supplierPos || [];
        updateWizardData({ supplierPos: [...currentPos, selectedPo] });
    };

    const attendanceRows = wizardData.timeSheet?.attendanceRows || [];
    const tsMeta = wizardData.timeSheet || {};

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.08) 0%, rgba(14, 165, 233, 0.08) 100%)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: '#06b6d4', color: '#fff', padding: '8px', borderRadius: '10px' }}>
                        <Briefcase size={22} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                            Step 4: Job Execution, Attendance Time-Sheet &amp; Vendor Floating
                        </h2>
                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                            Assign engineer in charge, fill workers attendance time-sheet record, and float supplier orders.
                        </span>
                    </div>
                </div>
            </div>

            {/* Job Execution Details */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 700 }}>
                    Job Execution Details
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Incremental Job Order No *
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={wizardData.jobNo || ''}
                                onChange={(e) => updateWizardData({ jobNo: e.target.value })}
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
                                onClick={autoGenerateJobNo}
                                disabled={isGeneratingNo}
                                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 12px', cursor: 'pointer' }}
                            >
                                <RefreshCcw size={16} className={isGeneratingNo ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Job Type
                        </label>
                        <select
                            value={wizardData.jobType || 'Service'}
                            onChange={(e) => updateWizardData({ jobType: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}
                        >
                            <option value="Service">Service &amp; Repair Work</option>
                            <option value="Supply">Parts Supply &amp; Trading</option>
                            <option value="Calibration">Calibration &amp; Testing</option>
                            <option value="Turnkey">Turnkey Project</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Engineer / Staff in Charge (Supabase)
                        </label>
                        <SearchableSelect
                            options={staff.map(s => ({ id: s.id, name: `${s.full_name || s.name || s.email} (${s.role || 'Staff'})` }))}
                            value={wizardData.engineerId}
                            onChange={(e) => updateWizardData({ engineerId: e.target.value })}
                            placeholder="Select lead engineer / manager..."
                        />
                    </div>
                </div>
            </div>

            {/* WORKERS ATTENDANCE RECORD FORM / TIME-SHEET (Matches Image 2 Example) */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid #06b6d4',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 4px 16px rgba(6, 182, 212, 0.06)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ background: '#ecfeff', color: '#0891b2', padding: '8px', borderRadius: '8px' }}>
                            <FileSpreadsheet size={20} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0891b2' }}>
                                Workers Attendance Record Form (TIME-SHEET)
                            </h3>
                            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                Modelled from standard marine &amp; industrial time-sheet forms (Image 2)
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={() => setShowTimeSheetModal(true)}
                            style={{
                                background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 14px',
                                fontSize: '0.82rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <Printer size={16} /> View &amp; Print Formal Time-Sheet
                        </button>
                    </div>
                </div>

                {/* Time-Sheet Header Metadata Grid */}
                <div style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '14px',
                    marginBottom: '16px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px'
                }}>
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>Vessel / Customer</label>
                        <input
                            type="text"
                            value={wizardData.vesselName || wizardData.customerName || 'Celron Enterprises'}
                            onChange={(e) => updateWizardData({ customerName: e.target.value })}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>Work Location</label>
                        <input
                            type="text"
                            value={tsMeta.location || 'Jalan Pesawat / Shipyard'}
                            onChange={(e) => updateTimeSheetMeta('location', e.target.value)}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>Start / Mobilization Date</label>
                        <input
                            type="date"
                            value={tsMeta.mobilizationDate || ''}
                            onChange={(e) => updateTimeSheetMeta('mobilizationDate', e.target.value)}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>End / Demobilization Date</label>
                        <input
                            type="date"
                            value={tsMeta.demobilizationDate || ''}
                            onChange={(e) => updateTimeSheetMeta('demobilizationDate', e.target.value)}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>Job Scope</label>
                        <input
                            type="text"
                            value={tsMeta.jobScope || 'Machine cable open & reconnect'}
                            onChange={(e) => updateTimeSheetMeta('jobScope', e.target.value)}
                            placeholder="e.g. Electrical overhaul & cable reconnect"
                            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>QRME / Ref</label>
                        <input
                            type="text"
                            value={tsMeta.qrmeRef || ''}
                            onChange={(e) => updateTimeSheetMeta('qrmeRef', e.target.value)}
                            placeholder="e.g. QRME-2026-9"
                            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                        />
                    </div>
                </div>

                {/* Attendance Table */}
                <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', border: '1px solid #cbd5e1' }}>
                        <thead>
                            <tr style={{ background: '#0891b2', color: '#fff', textAlign: 'left' }}>
                                <th style={{ padding: '8px 10px', width: '60px' }}>S/No</th>
                                <th style={{ padding: '8px 10px', width: '30%' }}>NAME OF THE PERSONS</th>
                                <th style={{ padding: '8px 10px', width: '20%' }}>DESIGNATION</th>
                                <th style={{ padding: '8px 10px', width: '12%' }}>TIME IN</th>
                                <th style={{ padding: '8px 10px', width: '12%' }}>TIME OUT</th>
                                <th style={{ padding: '8px 10px', width: '20%' }}>REMARK / DATE</th>
                                <th style={{ padding: '8px 10px', width: '50px', textAlign: 'center' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {attendanceRows.map((row, idx) => (
                                <tr key={row.id || idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                    <td style={{ padding: '8px 10px', fontWeight: 800, color: '#64748b' }}>
                                        {String(idx + 1).padStart(2, '0')}
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                        <input
                                            type="text"
                                            value={row.name}
                                            onChange={(e) => updateAttendanceRow(idx, 'name', e.target.value)}
                                            placeholder="Enter worker / person name..."
                                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 700 }}
                                        />
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                        <input
                                            type="text"
                                            value={row.designation}
                                            onChange={(e) => updateAttendanceRow(idx, 'designation', e.target.value)}
                                            placeholder="Engineer / Technician"
                                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                        />
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                        <input
                                            type="text"
                                            value={row.timeIn}
                                            onChange={(e) => updateAttendanceRow(idx, 'timeIn', e.target.value)}
                                            placeholder="08:00"
                                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', textAlign: 'center' }}
                                        />
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                        <input
                                            type="text"
                                            value={row.timeOut}
                                            onChange={(e) => updateAttendanceRow(idx, 'timeOut', e.target.value)}
                                            placeholder="18:00"
                                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', textAlign: 'center' }}
                                        />
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                        <input
                                            type="text"
                                            value={row.remark}
                                            onChange={(e) => updateAttendanceRow(idx, 'remark', e.target.value)}
                                            placeholder="Date / Remark"
                                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                        />
                                    </td>
                                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                        {attendanceRows.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeAttendanceRow(idx)}
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

                <button
                    type="button"
                    onClick={addAttendanceRow}
                    style={{
                        background: '#ecfeff',
                        color: '#0891b2',
                        border: '1px solid #a5f3fc',
                        borderRadius: '8px',
                        padding: '8px 16px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <Plus size={16} /> Add Person Attendance Row
                </button>
            </div>

            {/* Supplier Floating Purchase Orders */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Layers size={18} color="#06b6d4" /> Supplier Floating Purchase Orders
                        </h3>
                        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            Issue POs to vendors or sub-contractors for job materials/services
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={addSupplierPo}
                            style={{
                                background: '#ecfeff',
                                color: '#0891b2',
                                border: '1px solid #a5f3fc',
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
                            <Plus size={16} /> Float Supplier PO
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsSelectPoModalOpen(true)}
                            style={{
                                background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '6px 14px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 2px 8px rgba(6, 182, 212, 0.2)'
                            }}
                        >
                            <ShoppingCart size={15} /> Link 2 Supplier Order
                        </button>
                        <a
                            href="/purchase-orders"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                background: '#ffffff',
                                color: '#0891b2',
                                border: '1px solid #a5f3fc',
                                borderRadius: '8px',
                                padding: '6px 12px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
                            }}
                            title="Open P.O. 2 Suppliers library in a new window to create or manage purchase orders"
                        >
                            <ExternalLink size={15} /> Open P.O. 2 Suppliers ↗
                        </a>
                    </div>
                </div>

                {(wizardData.supplierPos || []).length === 0 ? (
                    <div style={{ padding: '16px', textStyle: 'italic', fontSize: '0.82rem', color: '#94a3b8', textAlign: 'center', background: '#f8fafc', borderRadius: '8px' }}>
                        No supplier orders floated for this job yet. Click "+ Float Supplier PO" if required.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {(wizardData.supplierPos || []).map((spo, idx) => (
                            <div key={spo.id || idx} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr)) 40px', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', alignItems: 'center' }}>
                                <div>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>Vendor / Supplier</label>
                                    <SearchableSelect
                                        options={partners.filter(p => p.type === 'Supplier' || p.is_supplier || true).map(p => ({ id: p.id, name: p.name }))}
                                        value={spo.supplierId}
                                        onChange={(e) => updateSupplierPo(idx, 'supplierId', e.target.value)}
                                        placeholder="Select supplier..."
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>Supplier PO No</label>
                                    <input
                                        type="text"
                                        value={spo.supplierPoNo}
                                        onChange={(e) => updateSupplierPo(idx, 'supplierPoNo', e.target.value)}
                                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>Cost Amount (SGD)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={spo.amount}
                                        onChange={(e) => updateSupplierPo(idx, 'amount', parseFloat(e.target.value) || 0)}
                                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 700 }}
                                    />
                                </div>
                                <button
                                    onClick={() => removeSupplierPo(idx)}
                                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', marginTop: '14px' }}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Smart Upload Job Documents */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>
                        Step 4: Job Order Sheet &amp; Technical Documentation Upload
                    </h4>
                    <button
                        type="button"
                        onClick={() => setIsUploadPanelOpen(true)}
                        style={{ background: '#06b6d4', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(6, 182, 212, 0.25)' }}
                    >
                        <Sparkles size={14} /> Smart Upload Job Doc
                    </button>
                </div>

                <UniversalFileViewer
                    file={wizardData.jobFile}
                    fileUrl={wizardData.jobUrl}
                    title="Job Order & Technical Specs Preview"
                    emptyTitle="No Job Document Attached"
                    emptySubtitle="Upload job execution sheet or technical files to preview loaded file here."
                    onRemove={() => {
                        updateWizardData({
                            jobFile: null,
                            jobUrl: ''
                        });
                        toast.info('Removed Job document');
                    }}
                />
            </div>

            <SmartUploadPanel
                isOpen={isUploadPanelOpen}
                onClose={() => setIsUploadPanelOpen(false)}
                onSelect={(file) => {
                    updateWizardData({
                        jobFile: file.name || file.fileName,
                        jobUrl: file.webViewLink || file.previewUrl
                    });
                    toast.success("Attached Job Document");
                    setIsUploadPanelOpen(false);
                }}
                documentType="job"
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
                    Next Activity: Delivery &amp; Service Completion <ArrowRight size={18} />
                </button>
            </div>

            {/* PRINTABLE TIME-SHEET MODAL (EXACT COPY OF IMAGE 2 EXAMPLE) */}
            {showTimeSheetModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
                    zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px'
                }}>
                    <div style={{
                        background: '#fff', borderRadius: '16px', maxWidth: '900px', width: '100%',
                        maxHeight: '90vh', overflowY: 'auto', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        position: 'relative'
                    }}>
                        {/* Control Bar */}
                        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', pb: '12px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                                Formal Time-Sheet Preview (Image 2 Model)
                            </h3>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    onClick={() => window.print()}
                                    style={{ background: '#0891b2', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <Printer size={16} /> Print / Save as PDF
                                </button>
                                <button
                                    onClick={() => setShowTimeSheetModal(false)}
                                    style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* FORMAL TIME-SHEET PRINTABLE DOCUMENT (MATCHES IMAGE 2 EXACTLY) */}
                        <div id="printable-timesheet" style={{ color: '#000', fontFamily: 'Arial, sans-serif', padding: '10px' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '12px' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: '#0056b3', letterSpacing: '0.05em' }}>
                                        CEL-RON ENTERPRISES PTE LTD
                                    </h2>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#333' }}>
                                        11 Tuas Bay Close #03-04 West Star Singapore 636996<br />
                                        Tel: (65) 94477352 | Email: enquiry@celron.com.sg<br />
                                        Company Reg. No: 201435227C
                                    </p>
                                </div>
                                <div style={{ border: '2px solid #00a651', padding: '6px 12px', borderRadius: '4px', textAlign: 'center' }}>
                                    <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#00a651', textTransform: 'uppercase' }}>CEL-RON</span>
                                </div>
                            </div>

                            <h3 style={{ textAlign: 'center', margin: '12px 0', fontSize: '1.2rem', fontWeight: 900, textDecoration: 'underline', textTransform: 'uppercase' }}>
                                TIME-SHEET
                            </h3>

                            {/* Time-Sheet Header Metadata Table */}
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '0.85rem' }}>
                                <tbody>
                                    <tr>
                                        <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold', width: '20%' }}>Vessel / Customer</td>
                                        <td style={{ border: '1px solid #000', padding: '6px', width: '5%' }}>-</td>
                                        <td style={{ border: '1px solid #000', padding: '6px', width: '35%', fontWeight: 'bold' }}>{wizardData.vesselName || wizardData.customerName || 'celron'}</td>
                                        <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold', width: '15%' }}>Date</td>
                                        <td style={{ border: '1px solid #000', padding: '6px', width: '5%' }}>-</td>
                                        <td style={{ border: '1px solid #000', padding: '6px', width: '20%' }}>{tsMeta.date || new Date().toLocaleDateString('en-GB')}</td>
                                    </tr>
                                    <tr>
                                        <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>Location</td>
                                        <td style={{ border: '1px solid #000', padding: '6px' }}>-</td>
                                        <td style={{ border: '1px solid #000', padding: '6px' }}>{tsMeta.location || 'jalan pesawat'}</td>
                                        <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>QRME</td>
                                        <td style={{ border: '1px solid #000', padding: '6px' }}>-</td>
                                        <td style={{ border: '1px solid #000', padding: '6px' }}>{tsMeta.qrmeRef || '-'}</td>
                                    </tr>
                                    <tr>
                                        <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>Start / Mobilization</td>
                                        <td style={{ border: '1px solid #000', padding: '6px' }}>-</td>
                                        <td style={{ border: '1px solid #000', padding: '6px' }}>{tsMeta.mobilizationDate || '-'}</td>
                                        <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>Job number</td>
                                        <td style={{ border: '1px solid #000', padding: '6px' }}>-</td>
                                        <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>{wizardData.jobNo || 'CEL-2607-6095'}</td>
                                    </tr>
                                    <tr>
                                        <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>Job Scope</td>
                                        <td style={{ border: '1px solid #000', padding: '6px' }}>-</td>
                                        <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>{tsMeta.jobScope || 'Machine cable open & reconnect'}</td>
                                        <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>End / Demobilization</td>
                                        <td style={{ border: '1px solid #000', padding: '6px' }}>-</td>
                                        <td style={{ border: '1px solid #000', padding: '6px' }}>{tsMeta.demobilizationDate || '-'}</td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* Attendance Table */}
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr>
                                        <th style={{ border: '1px solid #000', padding: '8px', width: '8%', textAlign: 'center' }}>Sl/No</th>
                                        <th style={{ border: '1px solid #000', padding: '8px', width: '35%', textAlign: 'left' }}>NAME OF THE PERSONS</th>
                                        <th style={{ border: '1px solid #000', padding: '8px', width: '20%', textAlign: 'left' }}>DESIGNATION</th>
                                        <th style={{ border: '1px solid #000', padding: '8px', width: '12%', textAlign: 'center' }}>TIME IN</th>
                                        <th style={{ border: '1px solid #000', padding: '8px', width: '12%', textAlign: 'center' }}>TIME OUT</th>
                                        <th style={{ border: '1px solid #000', padding: '8px', width: '13%', textAlign: 'center' }}>REMARK</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {attendanceRows.map((row, idx) => (
                                        <tr key={idx}>
                                            <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>{String(idx + 1).padStart(2, '0')}</td>
                                            <td style={{ border: '1px solid #000', padding: '8px', fontWeight: 'bold' }}>{row.name}</td>
                                            <td style={{ border: '1px solid #000', padding: '8px' }}>{row.designation}</td>
                                            <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>{row.timeIn}</td>
                                            <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>{row.timeOut}</td>
                                            <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>{row.remark}</td>
                                        </tr>
                                    ))}
                                    {/* Fill empty rows to match paper form presentation if needed */}
                                    {[...Array(Math.max(0, 10 - attendanceRows.length))].map((_, i) => (
                                        <tr key={`empty-${i}`}>
                                            <td style={{ border: '1px solid #000', padding: '14px' }}></td>
                                            <td style={{ border: '1px solid #000', padding: '14px' }}></td>
                                            <td style={{ border: '1px solid #000', padding: '14px' }}></td>
                                            <td style={{ border: '1px solid #000', padding: '14px' }}></td>
                                            <td style={{ border: '1px solid #000', padding: '14px' }}></td>
                                            <td style={{ border: '1px solid #000', padding: '14px' }}></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Signatures & Stamp Block */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '40px', paddingTop: '20px' }}>
                                <div style={{ textAlign: 'center', width: '40%' }}>
                                    <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontFamily: 'cursive', fontSize: '1.4rem', color: '#1e3a8a' }}>Sign &amp; Stamp</span>
                                    </div>
                                    <div style={{ borderTop: '1px solid #000', paddingTop: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                        Customer/Master/Chief Engineer<br />(Signature &amp; Stamp)
                                    </div>
                                </div>

                                <div style={{ textAlign: 'center', width: '40%' }}>
                                    <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontFamily: 'cursive', fontSize: '1.4rem', color: '#1e3a8a' }}>Authorized</span>
                                    </div>
                                    <div style={{ borderTop: '1px solid #000', paddingTop: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                        Celron Enterprises Pte Ltd<br />
                                        <span style={{ fontSize: '0.7rem', color: '#555' }}>ISO 9001:2015 | bizSAFE STAR</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <SelectSupplierPoModal
                isOpen={isSelectPoModalOpen}
                onClose={() => setIsSelectPoModalOpen(false)}
                companyId={companyId}
                onSelectPo={handleSelectPoFromModal}
            />
        </div>
    );
}
