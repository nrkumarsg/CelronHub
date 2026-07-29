import React, { useState } from 'react';
import { 
    ShoppingCart, Plus, Trash2, Sparkles, ArrowRight, ArrowLeft, 
    Check, Building2, Calendar, DollarSign, FileText, CheckCircle2, 
    Layers, Paperclip, ExternalLink, RefreshCw
} from 'lucide-react';
import SearchableSelect from '../common/SearchableSelect';
import SmartUploadPanel from '../upload/SmartUploadPanel';
import UniversalFileViewer from '../common/UniversalFileViewer';
import { generateDocNumber } from '../../lib/workflowV2Service';
import toast from 'react-hot-toast';

export default function StepOrdersToSuppliers({
    wizardData,
    updateWizardData,
    onNext,
    onPrev,
    partners = [],
    companyId
}) {
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [activeTargetOrderIndex, setActiveTargetOrderIndex] = useState(null);
    const [selectedPreviewFile, setSelectedPreviewFile] = useState(null);

    // Initialize supplier orders array if empty
    const supplierOrders = Array.isArray(wizardData.supplierOrders) && wizardData.supplierOrders.length > 0
        ? wizardData.supplierOrders
        : [
            {
                id: `spo-1`,
                supplierId: '',
                supplierName: '',
                activityDescription: 'Supplier Component & Repair Service',
                supplierPoNo: `SPO-${new Date().getFullYear().toString().slice(-2)}${(new Date().getMonth() + 1).toString().padStart(2, '0')}-0001`,
                orderDate: new Date().toISOString().split('T')[0],
                deliveryDueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                amount: 0,
                currency: 'SGD',
                status: 'Draft',
                attachments: [] // Multi-file support: [{ id, name, url, date }]
            }
        ];

    // Update parent wizard state
    const setSupplierOrders = (updatedList) => {
        updateWizardData({ supplierOrders: updatedList });
    };

    // Add a new supplier order row/card
    const handleAddOrder = () => {
        const nextIndex = supplierOrders.length + 1;
        const newOrder = {
            id: `spo-${Date.now()}`,
            supplierId: '',
            supplierName: '',
            activityDescription: `Activity #${nextIndex} - Supplier Work Order`,
            supplierPoNo: `SPO-${new Date().getFullYear().toString().slice(-2)}${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${nextIndex.toString().padStart(4, '0')}`,
            orderDate: new Date().toISOString().split('T')[0],
            deliveryDueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            amount: 0,
            currency: 'SGD',
            status: 'Draft',
            attachments: []
        };
        setSupplierOrders([...supplierOrders, newOrder]);
        toast.success("Added new Supplier Order");
    };

    // Delete a supplier order card
    const handleDeleteOrder = (index) => {
        if (supplierOrders.length === 1) {
            toast.error("At least one Supplier Order entry is required.");
            return;
        }
        const updated = supplierOrders.filter((_, i) => i !== index);
        setSupplierOrders(updated);
        toast.info("Removed Supplier Order");
    };

    // Update specific field in order
    const handleOrderChange = (index, field, value) => {
        const updated = [...supplierOrders];
        updated[index] = { ...updated[index], [field]: value };

        // Auto-update supplier name if supplierId changed
        if (field === 'supplierId') {
            const matched = partners.find(p => p.id === value || p.company_name === value);
            if (matched) {
                updated[index].supplierName = matched.company_name || matched.name;
            }
        }
        setSupplierOrders(updated);
    };

    // Trigger upload modal for a specific supplier order
    const handleOpenUploadForOrder = (index) => {
        setActiveTargetOrderIndex(index);
        setIsUploadModalOpen(true);
    };

    // Handle file staged/selected from SmartUploadPanel
    const handleAttachFileToOrder = (file) => {
        if (activeTargetOrderIndex === null) return;
        const targetOrder = supplierOrders[activeTargetOrderIndex];
        const newAttachment = {
            id: `att-${Date.now()}`,
            name: file.name || file.fileName || 'Attached_Order_Document.pdf',
            url: file.webViewLink || file.previewUrl || (file instanceof File ? URL.createObjectURL(file) : ''),
            date: new Date().toISOString().split('T')[0],
            type: file.type || 'document'
        };

        const updatedAttachments = [...(targetOrder.attachments || []), newAttachment];
        handleOrderChange(activeTargetOrderIndex, 'attachments', updatedAttachments);
        setIsUploadModalOpen(false);
        setActiveTargetOrderIndex(null);
        toast.success(`Attached "${newAttachment.name}" to ${targetOrder.supplierPoNo}`);
    };

    // Remove an attachment from an order
    const handleRemoveAttachment = (orderIndex, attId) => {
        const targetOrder = supplierOrders[orderIndex];
        const updatedAtts = targetOrder.attachments.filter(att => att.id !== attId);
        handleOrderChange(orderIndex, 'attachments', updatedAtts);
        if (selectedPreviewFile?.id === attId) {
            setSelectedPreviewFile(null);
        }
        toast.info("Removed attachment from order");
    };

    // Calculate totals
    const totalOrderValue = supplierOrders.reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0);
    const totalAttachmentsCount = supplierOrders.reduce((sum, o) => sum + (o.attachments?.length || 0), 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Step Header Banner */}
            <div style={{
                background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                color: '#fff',
                borderRadius: '16px',
                padding: '24px',
                display: 'flex',
                justify: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                boxShadow: '0 8px 24px rgba(49, 46, 129, 0.25)'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <span style={{ background: '#6366f1', color: '#fff', fontSize: '0.75rem', fontWeight: 800, padding: '4px 10px', borderRadius: '12px' }}>
                            Step 4 of 9
                        </span>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>
                            Orders to Suppliers (Purchase Orders &amp; Activity Management)
                        </h2>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.84rem', color: '#c7d2fe' }}>
                        Manage Purchase Orders (POs) sent to multiple vendors for different job activities with multi-file attachment previews.
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
                            🛍️ Supplier Hub <ExternalLink size={12} />
                        </a>
                        <a
                            href="/partners"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', backdropFilter: 'blur(4px)' }}
                        >
                            🏭 Supplier Directory <ExternalLink size={12} />
                        </a>
                    </div>
                    <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '10px 16px', borderRadius: '12px', backdropFilter: 'blur(4px)', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', color: '#a5b4fc', textTransform: 'uppercase', fontWeight: 700 }}>Total Supplier Orders</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff' }}>{supplierOrders.length} Orders</div>
                    </div>
                    <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '10px 16px', borderRadius: '12px', backdropFilter: 'blur(4px)', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', color: '#a5b4fc', textTransform: 'uppercase', fontWeight: 700 }}>Total Order Value</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#34d399' }}>${totalOrderValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                    </div>
                </div>
            </div>

            {/* SUPPLIER ORDERS CARDS LIST */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {supplierOrders.map((order, idx) => (
                    <div 
                        key={order.id || idx}
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
                        {/* Order Card Top Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ background: '#e0e7ff', color: '#4338ca', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem' }}>
                                    #{idx + 1}
                                </div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                                        {order.supplierPoNo || `Supplier Order #${idx + 1}`}
                                    </h4>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                        {order.supplierName || 'Unassigned Supplier'}
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <select
                                    value={order.status || 'Draft'}
                                    onChange={(e) => handleOrderChange(idx, 'status', e.target.value)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        border: '1px solid #cbd5e1',
                                        background: order.status === 'Confirmed' ? '#dcfce7' : order.status === 'Sent' ? '#dbeafe' : '#f1f5f9',
                                        color: order.status === 'Confirmed' ? '#15803d' : order.status === 'Sent' ? '#1e40af' : '#475569',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="Draft">Draft Order</option>
                                    <option value="Sent">Order Sent to Vendor</option>
                                    <option value="Confirmed">Confirmed by Vendor</option>
                                    <option value="Delivered">Goods / Services Delivered</option>
                                    <option value="Paid">Fully Paid</option>
                                </select>

                                {supplierOrders.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteOrder(idx)}
                                        style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', padding: '6px 10px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        title="Delete Supplier Order"
                                    >
                                        <Trash2 size={14} /> Remove
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Order Fields Form Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                            {/* Supplier Dropdown */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    Select Supplier / Vendor *
                                </label>
                                <SearchableSelect
                                    options={partners.map(p => ({ value: p.id || p.company_name, label: p.company_name || p.name }))}
                                    value={order.supplierId || order.supplierName}
                                    onChange={(val) => handleOrderChange(idx, 'supplierId', val)}
                                    placeholder="Search supplier company..."
                                />
                            </div>

                            {/* Supplier PO Number */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    Supplier PO No *
                                </label>
                                <input
                                    type="text"
                                    value={order.supplierPoNo || ''}
                                    onChange={(e) => handleOrderChange(idx, 'supplierPoNo', e.target.value)}
                                    placeholder="e.g. SPO-2607-0001"
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', fontWeight: 700 }}
                                />
                            </div>

                            {/* Activity / Description */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    Activity / Work Description *
                                </label>
                                <input
                                    type="text"
                                    value={order.activityDescription || ''}
                                    onChange={(e) => handleOrderChange(idx, 'activityDescription', e.target.value)}
                                    placeholder="e.g. Main PCB Board Overhaul & Parts"
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem' }}
                                />
                            </div>

                            {/* Order Amount & Currency */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    Order Amount ($) *
                                </label>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <select
                                        value={order.currency || 'SGD'}
                                        onChange={(e) => handleOrderChange(idx, 'currency', e.target.value)}
                                        style={{ padding: '9px 8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 700 }}
                                    >
                                        <option value="SGD">SGD ($)</option>
                                        <option value="USD">USD ($)</option>
                                        <option value="EUR">EUR (€)</option>
                                    </select>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={order.amount || ''}
                                        onChange={(e) => handleOrderChange(idx, 'amount', e.target.value)}
                                        placeholder="0.00"
                                        style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', fontWeight: 700 }}
                                    />
                                </div>
                            </div>

                            {/* Order Date */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    PO Issue Date
                                </label>
                                <input
                                    type="date"
                                    value={order.orderDate || ''}
                                    onChange={(e) => handleOrderChange(idx, 'orderDate', e.target.value)}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem' }}
                                />
                            </div>

                            {/* Delivery Due Date */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    Target Delivery Date
                                </label>
                                <input
                                    type="date"
                                    value={order.deliveryDueDate || ''}
                                    onChange={(e) => handleOrderChange(idx, 'deliveryDueDate', e.target.value)}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem' }}
                                />
                            </div>
                        </div>

                        {/* Multi-File Attachments Section for this Supplier Order */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', marginTop: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Paperclip size={15} color="#6366f1" /> Order File Attachments ({order.attachments?.length || 0})
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleOpenUploadForOrder(idx)}
                                    style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 10px rgba(99, 102, 241, 0.2)' }}
                                >
                                    <Sparkles size={14} /> + Attach PO / Quote / Camera Photo
                                </button>
                            </div>

                            {/* Attachments Grid / List */}
                            {order.attachments && order.attachments.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                                    {order.attachments.map((att) => (
                                        <div key={att.id} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                            <div style={{ minWidth: 0, flex: 1, cursor: 'pointer' }} onClick={() => setSelectedPreviewFile(att)}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {att.name}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                                                    Attached: {att.date}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                {att.url && (
                                                    <a
                                                        href={att.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ background: '#eef2ff', color: '#4f46e5', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, textDecoration: 'none' }}
                                                        title="Open document in browser"
                                                    >
                                                        <ExternalLink size={12} />
                                                    </a>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveAttachment(idx, att.id)}
                                                    style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '6px', padding: '4px 6px', cursor: 'pointer' }}
                                                    title="Remove attachment"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '0.78rem' }}>
                                    No file attachments added yet. Click "+ Attach PO / Quote / Camera Photo" above to upload or take a camera photo.
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Add Another Supplier Order Button */}
            <button
                type="button"
                onClick={handleAddOrder}
                style={{
                    background: '#ffffff',
                    border: '2px dashed #818cf8',
                    color: '#4f46e5',
                    borderRadius: '16px',
                    padding: '14px',
                    fontSize: '0.88rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s'
                }}
            >
                <Plus size={18} /> Add Another Supplier Order / Activity
            </button>

            {/* Selected File Universal Preview Modal Box */}
            {selectedPreviewFile && (
                <div style={{ marginTop: '10px' }}>
                    <UniversalFileViewer
                        file={selectedPreviewFile.name}
                        fileUrl={selectedPreviewFile.url}
                        title={`Selected Attachment Preview: ${selectedPreviewFile.name}`}
                        onRemove={() => setSelectedPreviewFile(null)}
                    />
                </div>
            )}

            {/* Smart Upload Tool Modal */}
            <SmartUploadPanel
                isOpen={isUploadModalOpen}
                onClose={() => { setIsUploadModalOpen(false); setActiveTargetOrderIndex(null); }}
                onSelect={handleAttachFileToOrder}
                documentType="po"
            />

            {/* Step Navigation Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                <button
                    type="button"
                    onClick={onPrev}
                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '12px 20px', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <ArrowLeft size={18} /> Back: Customer PO
                </button>
                <button
                    type="button"
                    onClick={onNext}
                    style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: '#fff', border: 'none', borderRadius: '12px', padding: '12px 24px', fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)' }}
                >
                    Next Activity: Job Execution <ArrowRight size={18} />
                </button>
            </div>
        </div>
    );
}
