import React, { useState, useEffect } from 'react';
import { 
    X, Plus, Trash2, Save, ShoppingCart, DollarSign, Calendar, 
    Building2, FileText, CheckCircle2, AlertCircle, Loader2 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { saveWorkflowDocument, generateDocNumber } from '../../lib/workflowV2Service';
import toast from 'react-hot-toast';

export default function SupplierOrderCrudModal({ 
    isOpen, 
    onClose, 
    onSuccess, 
    job, 
    existingOrder = null,
    companyId = '' 
}) {
    const [loading, setLoading] = useState(false);
    const [suppliers, setSuppliers] = useState([]);
    
    // Header state
    const [header, setHeader] = useState({
        document_no: '',
        partner_id: '',
        issue_date: new Date().toISOString().split('T')[0],
        expiry_date: '',
        currency: 'SGD',
        terms_conditions: 'Standard 30 Days Net',
        status: 'Confirmed',
        notes: ''
    });

    // Line items state
    const [items, setItems] = useState([
        { description: '', quantity: 1, uom: 'Units', unit_price: 0, tax_rate: 9, amount: 0 }
    ]);

    useEffect(() => {
        if (isOpen) {
            loadSuppliers();
            if (existingOrder) {
                setHeader({
                    id: existingOrder.id,
                    document_no: existingOrder.document_no || '',
                    partner_id: existingOrder.partner_id || '',
                    issue_date: existingOrder.issue_date || new Date().toISOString().split('T')[0],
                    expiry_date: existingOrder.expiry_date || '',
                    currency: existingOrder.currency || 'SGD',
                    terms_conditions: existingOrder.terms_conditions || 'Standard 30 Days Net',
                    status: existingOrder.status || 'Confirmed',
                    notes: existingOrder.notes || ''
                });
                if (existingOrder.items && existingOrder.items.length > 0) {
                    setItems(existingOrder.items.map(it => ({
                        id: it.id,
                        description: it.description || '',
                        quantity: parseFloat(it.quantity) || 1,
                        uom: it.uom || 'Units',
                        unit_price: parseFloat(it.unit_price) || 0,
                        tax_rate: parseFloat(it.tax_rate) || 9,
                        amount: parseFloat(it.amount) || 0
                    })));
                }
            } else {
                initNewOrderNumber();
            }
        }
    }, [isOpen, existingOrder]);

    const loadSuppliers = async () => {
        try {
            const { data, error } = await supabase
                .from('partners')
                .select('id, name, partner_type')
                .order('name', { ascending: true });

            if (error) throw error;
            setSuppliers(data || []);
        } catch (err) {
            console.error('Error fetching suppliers:', err);
        }
    };

    const initNewOrderNumber = async () => {
        try {
            const docNo = await generateDocNumber(
                companyId || job?.company_id, 
                'Purchase Order', 
                false, 
                null, 
                job?.document_no || job?.assigned_job_no
            );
            setHeader(prev => ({ ...prev, document_no: docNo }));
        } catch (e) {
            const fallbackNo = `PO-${job?.document_no || job?.assigned_job_no || 'JOB'}-01`;
            setHeader(prev => ({ ...prev, document_no: fallbackNo }));
        }
    };

    const handleItemChange = (index, field, value) => {
        const updated = [...items];
        updated[index][field] = value;

        const qty = parseFloat(updated[index].quantity) || 0;
        const price = parseFloat(updated[index].unit_price) || 0;
        updated[index].amount = qty * price;

        setItems(updated);
    };

    const addItemRow = () => {
        setItems(prev => [
            ...prev,
            { description: '', quantity: 1, uom: 'Units', unit_price: 0, tax_rate: 9, amount: 0 }
        ]);
    };

    const removeItemRow = (index) => {
        if (items.length === 1) return;
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const taxAmount = items.reduce((sum, item) => {
        const itemAmt = parseFloat(item.amount) || 0;
        const tax = parseFloat(item.tax_rate) || 0;
        return sum + (itemAmt * (tax / 100));
    }, 0);
    const totalAmount = subtotal + taxAmount;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!header.partner_id) {
            toast.error('Please select a Supplier/Vendor');
            return;
        }
        if (!header.document_no) {
            toast.error('Supplier PO number is required');
            return;
        }
        if (items.some(i => !i.description.trim())) {
            toast.error('Please enter a description for all line items');
            return;
        }

        setLoading(true);
        try {
            const docHeader = {
                ...header,
                company_id: companyId || job?.company_id,
                document_type: 'Purchase Order',
                assigned_job_no: job?.document_no || job?.assigned_job_no,
                job_id: job?.id,
                subtotal: subtotal,
                tax_amount: taxAmount,
                total_amount: totalAmount
            };

            const result = await saveWorkflowDocument(docHeader, items);
            if (!result.success) {
                throw new Error(result.error || 'Failed to save Supplier Order');
            }

            toast.success(`Supplier Order ${docHeader.document_no} saved! PO Cost updated.`);
            if (onSuccess) onSuccess(result.data);
            onClose();
        } catch (err) {
            console.error('Error saving supplier order:', err);
            toast.error(err.message || 'Error saving supplier order');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyCenter: 'center', padding: '16px', background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)', width: '100%', maxWidth: '850px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ background: '#0f172a', color: '#ffffff', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyBetween: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                        <div style={{ width: '40px', height: '40px', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#fbbf24', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyCenter: 'center' }}>
                            <ShoppingCart size={20} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {existingOrder ? 'Edit Supplier Purchase Order' : 'Create Supplier Order'}
                                <span style={{ fontSize: '0.75rem', background: 'rgba(245, 158, 11, 0.2)', color: '#fde68a', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '2px 8px', borderRadius: '6px' }}>
                                    Linked Job: {job?.document_no || job?.assigned_job_no}
                                </span>
                            </h3>
                            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>Issue PO to supplier and record itemized cost against job</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body Form */}
                <form onSubmit={handleSubmit} style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Header Controls */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                                Supplier PO No *
                            </label>
                            <input
                                type="text"
                                value={header.document_no}
                                onChange={e => setHeader({ ...header, document_no: e.target.value })}
                                required
                                style={{ width: '100%', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', outline: 'none' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                                Select Supplier / Vendor *
                            </label>
                            <select
                                value={header.partner_id}
                                onChange={e => setHeader({ ...header, partner_id: e.target.value })}
                                required
                                style={{ width: '100%', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem', color: '#0f172a', outline: 'none' }}
                            >
                                <option value="">-- Choose Supplier --</option>
                                {suppliers.map(s => (
                                    <option key={s.id} value={s.id}>
                                        {s.name} {s.partner_type ? `(${s.partner_type})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                                Order Status
                            </label>
                            <select
                                value={header.status}
                                onChange={e => setHeader({ ...header, status: e.target.value })}
                                style={{ width: '100%', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem', color: '#0f172a', outline: 'none' }}
                            >
                                <option value="Draft">Draft</option>
                                <option value="Sent">Sent to Supplier</option>
                                <option value="Confirmed">Confirmed</option>
                                <option value="Delivered">Delivered</option>
                                <option value="Paid">Paid</option>
                            </select>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                                Issue Date
                            </label>
                            <input
                                type="date"
                                value={header.issue_date}
                                onChange={e => setHeader({ ...header, issue_date: e.target.value })}
                                style={{ width: '100%', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem', color: '#0f172a', outline: 'none' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                                Delivery / Expiration Date
                            </label>
                            <input
                                type="date"
                                value={header.expiry_date}
                                onChange={e => setHeader({ ...header, expiry_date: e.target.value })}
                                style={{ width: '100%', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem', color: '#0f172a', outline: 'none' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                                Currency
                            </label>
                            <select
                                value={header.currency}
                                onChange={e => setHeader({ ...header, currency: e.target.value })}
                                style={{ width: '100%', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem', color: '#0f172a', outline: 'none' }}
                            >
                                <option value="SGD">SGD - Singapore Dollar</option>
                                <option value="USD">USD - US Dollar</option>
                                <option value="EUR">EUR - Euro</option>
                            </select>
                        </div>
                    </div>

                    {/* Line Items Table */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ShoppingCart size={16} style={{ color: '#f59e0b' }} />
                                Supplier Order Items (Cost Lines)
                            </h4>
                            <button
                                type="button"
                                onClick={addItemRow}
                                style={{ background: '#fffbe finished', color: '#d97706', border: '1px solid #fcd34d', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                <Plus size={14} /> Add Cost Line
                            </button>
                        </div>

                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                                <thead style={{ background: '#f1f5f9', color: '#334155', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>
                                    <tr>
                                        <th style={{ padding: '10px 12px' }}>#</th>
                                        <th style={{ padding: '10px 12px', width: '50%' }}>Description / Part Details</th>
                                        <th style={{ padding: '10px 12px' }}>Qty</th>
                                        <th style={{ padding: '10px 12px' }}>Unit Cost ({header.currency})</th>
                                        <th style={{ padding: '10px 12px' }}>Tax %</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Line Total ({header.currency})</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody style={{ divideY: '1px solid #f1f5f9' }}>
                                    {items.map((item, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '10px 12px', fontWeight: 600, color: '#94a3b8' }}>{idx + 1}</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <input
                                                    type="text"
                                                    value={item.description}
                                                    placeholder="Enter supplier item description..."
                                                    onChange={e => handleItemChange(idx, 'description', e.target.value)}
                                                    required
                                                    style={{ width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem', color: '#0f172a', outline: 'none' }}
                                                />
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <input
                                                    type="number"
                                                    min="0.01"
                                                    step="any"
                                                    value={item.quantity}
                                                    onChange={e => handleItemChange(idx, 'quantity', e.target.value)}
                                                    style={{ width: '70px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 8px', fontSize: '0.8rem', color: '#0f172a', textAlign: 'center', outline: 'none' }}
                                                />
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    value={item.unit_price}
                                                    onChange={e => handleItemChange(idx, 'unit_price', e.target.value)}
                                                    style={{ width: '90px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 8px', fontSize: '0.8rem', color: '#0f172a', textAlign: 'right', outline: 'none' }}
                                                />
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    value={item.tax_rate}
                                                    onChange={e => handleItemChange(idx, 'tax_rate', e.target.value)}
                                                    style={{ width: '60px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 8px', fontSize: '0.8rem', color: '#0f172a', textAlign: 'center', outline: 'none' }}
                                                />
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                                                {(parseFloat(item.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => removeItemRow(idx)}
                                                    disabled={items.length === 1}
                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: items.length === 1 ? 0.3 : 1 }}
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Summary Totals */}
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                                Supplier Payment & Delivery Notes
                            </label>
                            <textarea
                                rows={2}
                                value={header.notes}
                                onChange={e => setHeader({ ...header, notes: e.target.value })}
                                placeholder="Payment terms, delivery instructions, reference codes..."
                                style={{ width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', fontSize: '0.8rem', color: '#0f172a', outline: 'none' }}
                            />
                        </div>

                        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', width: '300px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                                <span>PO Subtotal:</span>
                                <span style={{ fontWeight: 700 }}>{header.currency} {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                                <span>GST / Tax:</span>
                                <span style={{ fontWeight: 700 }}>{header.currency} {taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 900, color: '#b45309', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                                <span>Total PO Cost:</span>
                                <span>{header.currency} {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{ background: '#f1f5f9', color: '#334155', border: 'none', padding: '8px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            style={{ background: '#d97706', color: '#ffffff', border: 'none', padding: '10px 24px', borderRadius: '10px', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(217,119,6,0.3)' }}
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            Save & Link Supplier Order
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
