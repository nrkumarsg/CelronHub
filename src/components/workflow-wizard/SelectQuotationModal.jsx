import React, { useState, useEffect } from 'react';
import { X, Search, FileText, CheckCircle2, ArrowRight, Loader2, DollarSign, Calendar, Building2, ExternalLink } from 'lucide-react';
import { fetchQuotationsForWizard, getFullQuotationDetails } from '../../lib/workflowV2Service';
import toast from 'react-hot-toast';

export default function SelectQuotationModal({ isOpen, onClose, companyId, currentQuotationNo, onSelectQuotation }) {
    const [quotations, setQuotations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [importingId, setImportingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');

    useEffect(() => {
        if (isOpen && companyId) {
            loadQuotations();
        }
    }, [isOpen, companyId]);

    const loadQuotations = async () => {
        setLoading(true);
        try {
            const data = await fetchQuotationsForWizard(companyId);
            setQuotations(data || []);
        } catch (err) {
            console.error('Error loading quotations:', err);
            toast.error('Failed to load quotations from Quote2Customers');
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async (quote) => {
        setImportingId(quote.id);
        try {
            const fullDetails = await getFullQuotationDetails(quote.id);
            if (!fullDetails) {
                toast.error('Could not fetch quotation line items');
                return;
            }

            // Map line items to wizard format
            const formattedLineItems = (fullDetails.items || []).map((item, idx) => ({
                id: item.id || Date.now() + idx,
                description: item.description || '',
                quantity: parseFloat(item.quantity) || 1,
                uom: item.uom || 'LOT',
                unit_price: parseFloat(item.unit_price) || 0,
                tax_enabled: item.tax_enabled !== false,
                amount: parseFloat(item.amount) || ((parseFloat(item.quantity) || 1) * (parseFloat(item.unit_price) || 0))
            }));

            onSelectQuotation({
                linkedQuotationId: quote.id,
                quotationNo: quote.document_no || quote.quotation_no,
                quotationDate: quote.issue_date || new Date().toISOString().split('T')[0],
                partnerId: quote.partner_id || '',
                customerName: quote.partners?.name || quote.customer_name || '',
                contactId: quote.contact_id || '',
                vesselId: quote.vessel_id || '',
                workLocationId: quote.work_location_id || '',
                subject: quote.subject || '',
                lineItems: formattedLineItems.length > 0 ? formattedLineItems : [
                    { id: 1, description: 'Supply & Technical Service Works', quantity: 1, uom: 'LOT', unit_price: 0, tax_enabled: true, amount: 0 }
                ],
                subtotal: parseFloat(quote.subtotal) || parseFloat(quote.total_amount) || 0,
                taxAmount: parseFloat(quote.tax_amount) || 0,
                grandTotal: parseFloat(quote.total_amount) || 0,
                quotationUrl: quote.attachment_url || quote.attachment_urls?.[0] || ''
            });

            toast.success(`Imported ${quote.document_no || 'Quotation'} into Step 2`);
            onClose();
        } catch (err) {
            console.error('Error importing quotation:', err);
            toast.error('Failed to import selected quotation');
        } finally {
            setImportingId(null);
        }
    };

    if (!isOpen) return null;

    // Filtering
    const filtered = quotations.filter(q => {
        const docNo = (q.document_no || '').toLowerCase();
        const custName = (q.partners?.name || q.customer_name || '').toLowerCase();
        const subject = (q.subject || '').toLowerCase();
        const query = searchTerm.toLowerCase();

        const matchesSearch = docNo.includes(query) || custName.includes(query) || subject.includes(query);

        if (!matchesSearch) return false;

        const stat = (q.status || 'Draft').toUpperCase();
        if (statusFilter === 'DRAFT') return stat.includes('DRAFT');
        if (statusFilter === 'SENT') return stat.includes('SENT') || stat.includes('AWAITING') || stat.includes('OPEN');
        if (statusFilter === 'CONVERTED') return stat.includes('CONVERTED') || stat.includes('JOB');

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
                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                    color: '#ffffff',
                    display: 'flex',
                    justify: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '10px', borderRadius: '12px' }}>
                            <FileText size={24} color="#ffffff" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                                Link / Import Quote from Quote2Customers
                            </h3>
                            <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', opacity: 0.9 }}>
                                Select an existing quotation from your library to populate Step 2
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

                {/* Search & Tabs Toolbar */}
                <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                        <Search size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="Search Quote No, Customer name, or subject..."
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
                        {['ALL', 'DRAFT', 'SENT', 'CONVERTED'].map(f => (
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
                                    background: statusFilter === f ? '#4f46e5' : '#e2e8f0',
                                    color: statusFilter === f ? '#ffffff' : '#475569',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {f === 'ALL' ? 'All Quotes' : f === 'DRAFT' ? 'Drafts' : f === 'SENT' ? 'Sent' : 'Converted'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content List */}
                <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                            <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', display: 'block' }} />
                            <span>Loading Quote2Customers library...</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                            <FileText size={36} style={{ opacity: 0.4, margin: '0 auto 12px auto' }} />
                            <p style={{ fontWeight: 600, margin: 0 }}>No matching quotations found</p>
                            <span style={{ fontSize: '0.82rem' }}>Try adjusting your search query or status filter.</span>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {filtered.map(q => {
                                const isCurrent = currentQuotationNo && (q.document_no === currentQuotationNo);
                                const isImporting = importingId === q.id;
                                const totalAmt = parseFloat(q.total_amount) || 0;
                                const status = q.status || 'Draft';

                                return (
                                    <div
                                        key={q.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '14px 18px',
                                            borderRadius: '12px',
                                            background: isCurrent ? '#f0fdf4' : '#ffffff',
                                            border: isCurrent ? '1.5px solid #22c55e' : '1px solid #e2e8f0',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                            transition: 'all 0.15s ease',
                                            gap: '16px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#4f46e5' }}>
                                                    {q.document_no || 'QTN-UNKNOWN'}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    background: status === 'Draft' ? '#fef3c7' : status === 'Converted' ? '#dcfce7' : '#dbeafe',
                                                    color: status === 'Draft' ? '#92400e' : status === 'Converted' ? '#166534' : '#1e40af'
                                                }}>
                                                    {status}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.82rem', color: '#64748b' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Building2 size={13} /> {q.partners?.name || q.customer_name || 'No Customer Specified'}
                                                </span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Calendar size={13} /> {q.issue_date || '—'}
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
                                            onClick={() => handleImport(q)}
                                            disabled={isImporting || isCurrent}
                                            style={{
                                                padding: '8px 16px',
                                                borderRadius: '8px',
                                                fontSize: '0.82rem',
                                                fontWeight: 700,
                                                border: 'none',
                                                cursor: isCurrent || isImporting ? 'default' : 'pointer',
                                                background: isCurrent ? '#dcfce7' : '#4f46e5',
                                                color: isCurrent ? '#15803d' : '#ffffff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            {isImporting ? (
                                                <>
                                                    <Loader2 size={14} className="animate-spin" /> Importing...
                                                </>
                                            ) : isCurrent ? (
                                                <>
                                                    <CheckCircle2 size={14} /> Currently Linked
                                                </>
                                            ) : (
                                                <>
                                                    Import to Step 2 <ArrowRight size={14} />
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
                        Showing {filtered.length} of {quotations.length} total quotes from Quote2Customers.
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <a
                            href="/quotations"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                padding: '8px 14px',
                                borderRadius: '8px',
                                border: '1px solid #c7d2fe',
                                background: '#eef2ff',
                                color: '#4f46e5',
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <ExternalLink size={14} /> Open Q2Customers Library in New Tab ↗
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
