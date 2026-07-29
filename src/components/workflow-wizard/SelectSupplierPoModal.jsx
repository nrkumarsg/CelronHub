import React, { useState, useEffect } from 'react';
import { X, Search, ShoppingCart, CheckCircle2, ArrowRight, Loader2, Calendar, Building2, ExternalLink } from 'lucide-react';
import { fetchSupplierPosForWizard, getFullSupplierPoDetails } from '../../lib/workflowV2Service';
import toast from 'react-hot-toast';

export default function SelectSupplierPoModal({ isOpen, onClose, companyId, onSelectPo }) {
    const [poList, setPoList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [importingId, setImportingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');

    useEffect(() => {
        if (isOpen && companyId) {
            loadPos();
        }
    }, [isOpen, companyId]);

    const loadPos = async () => {
        setLoading(true);
        try {
            const data = await fetchSupplierPosForWizard(companyId);
            setPoList(data || []);
        } catch (err) {
            console.error('Error loading supplier POs:', err);
            toast.error('Failed to load supplier POs from P.O. 2 Suppliers library');
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async (po) => {
        setImportingId(po.id);
        try {
            const fullDetails = await getFullSupplierPoDetails(po.id);
            
            onSelectPo({
                id: Date.now(),
                linkedPoId: po.id,
                supplierId: po.partner_id || '',
                supplierPoNo: po.document_no || po.customer_ref || `SPO-${Date.now().toString().slice(-4)}`,
                supplierName: po.partners?.name || po.customer_name || 'Vendor',
                amount: parseFloat(po.total_amount) || parseFloat(po.subtotal) || 0,
                status: po.status || 'Issued'
            });

            toast.success(`Linked ${po.document_no || 'Supplier PO'} to job execution floating POs`);
            onClose();
        } catch (err) {
            console.error('Error linking supplier PO:', err);
            toast.error('Failed to link selected Supplier PO');
        } finally {
            setImportingId(null);
        }
    };

    if (!isOpen) return null;

    // Filter
    const filtered = poList.filter(po => {
        const docNo = (po.document_no || po.customer_ref || '').toLowerCase();
        const supplierName = (po.partners?.name || po.customer_name || '').toLowerCase();
        const subject = (po.subject || '').toLowerCase();
        const query = searchTerm.toLowerCase();

        const matchesSearch = docNo.includes(query) || supplierName.includes(query) || subject.includes(query);
        if (!matchesSearch) return false;

        const stat = (po.status || 'Draft').toUpperCase();
        if (statusFilter === 'SENT') return stat.includes('SENT') || stat.includes('ISSUED') || stat.includes('ACTIVE');
        if (statusFilter === 'DRAFT') return stat.includes('DRAFT');

        return true;
    });

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: '20px',
                width: '100%',
                maxWidth: '850px',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #e2e8f0',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px',
                    background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
                    color: '#ffffff',
                    display: 'flex',
                    justify: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '10px', borderRadius: '12px' }}>
                            <ShoppingCart size={24} color="#ffffff" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                                Link / Import from P.O. 2 Suppliers Library
                            </h3>
                            <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', opacity: 0.9 }}>
                                Select an existing Purchase Order from P.O. 2 Suppliers to float on this job
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.15)',
                            border: 'none',
                            color: '#ffffff',
                            borderRadius: '50%',
                            width: '36px',
                            height: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
                        onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Toolbar */}
                <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                        <Search size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="Search PO No, Vendor/Supplier name, or details..."
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
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {['ALL', 'SENT', 'DRAFT'].map(f => (
                            <button
                                key={f}
                                onClick={() => setStatusFilter(f)}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '8px',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: statusFilter === f ? '#0891b2' : '#e2e8f0',
                                    color: statusFilter === f ? '#ffffff' : '#475569',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {f === 'ALL' ? 'All Orders' : f === 'SENT' ? 'Sent / Issued' : 'Drafts'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content List */}
                <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                            <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', display: 'block' }} />
                            <span>Loading P.O. 2 Suppliers library...</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                            <ShoppingCart size={36} style={{ opacity: 0.4, margin: '0 auto 12px auto' }} />
                            <p style={{ fontWeight: 600, margin: 0 }}>No matching Supplier POs found</p>
                            <span style={{ fontSize: '0.82rem' }}>Try adjusting your search query or status filter.</span>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {filtered.map(po => {
                                const isImporting = importingId === po.id;
                                const totalAmt = parseFloat(po.total_amount) || parseFloat(po.subtotal) || 0;
                                const status = po.status || 'Sent';

                                return (
                                    <div
                                        key={po.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '14px 18px',
                                            borderRadius: '12px',
                                            background: '#ffffff',
                                            border: '1px solid #e2e8f0',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                            transition: 'all 0.15s ease',
                                            gap: '16px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0891b2' }}>
                                                    {po.document_no || po.customer_ref || 'PO-UNKNOWN'}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    background: status === 'Draft' ? '#fef3c7' : '#dcfce7',
                                                    color: status === 'Draft' ? '#92400e' : '#166534'
                                                }}>
                                                    {status}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.82rem', color: '#64748b' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Building2 size={13} /> {po.partners?.name || po.customer_name || 'Vendor / Supplier'}
                                                </span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Calendar size={13} /> {po.issue_date || '—'}
                                                </span>
                                            </div>
                                        </div>

                                        <div style={{ textAlign: 'right', minWidth: '110px' }}>
                                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                                                SGD ${totalAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Total Amount</span>
                                        </div>

                                        <button
                                            onClick={() => handleImport(po)}
                                            disabled={isImporting}
                                            style={{
                                                padding: '8px 16px',
                                                borderRadius: '8px',
                                                fontSize: '0.82rem',
                                                fontWeight: 700,
                                                border: 'none',
                                                cursor: isImporting ? 'default' : 'pointer',
                                                background: '#0891b2',
                                                color: '#ffffff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            {isImporting ? (
                                                <>
                                                    <Loader2 size={14} className="animate-spin" /> Linking...
                                                </>
                                            ) : (
                                                <>
                                                    Link to Job <ArrowRight size={14} />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        Showing {filtered.length} of {poList.length} total orders from P.O. 2 Suppliers.
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <a
                            href="/purchase-orders"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                padding: '8px 14px',
                                borderRadius: '8px',
                                border: '1px solid #a5f3fc',
                                background: '#ecfeff',
                                color: '#0891b2',
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <ExternalLink size={14} /> Open P.O. 2 Suppliers Library in New Tab ↗
                        </a>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '8px 18px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                background: '#ffffff',
                                color: '#475569',
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                cursor: 'pointer'
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
