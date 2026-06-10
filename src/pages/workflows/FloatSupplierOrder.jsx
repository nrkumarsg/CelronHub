import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    LayoutDashboard, 
    ArrowLeft, 
    DollarSign, 
    ShieldCheck, 
    CheckCircle2, 
    ArrowRightLeft,
    Clock,
    Search,
    Filter,
    FileText,
    TrendingUp,
    Plus,
    MoreVertical,
    Check,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    BadgeDollarSign
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { shortlistSupplierQuote, saveSupplierQuote } from '../../lib/workflowService';
import { createQuotationFromSupplierQuote, createSupplierPOFromSupplierQuote } from '../../lib/workflowV2Service';

export default function FloatSupplierOrder() {
    const navigate = useNavigate();
    const [quotes, setQuotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isConverting, setIsConverting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedEnquiries, setExpandedEnquiries] = useState({});
    const [showRecordModal, setShowRecordModal] = useState(false);
    const [selectedQuote, setSelectedQuote] = useState(null);
    const [quoteForm, setQuoteForm] = useState({ amount: '', notes: '' });

    useEffect(() => {
        fetchQuotes();
    }, []);

    const handleGoBack = () => {
        if (window.history.state && window.history.state.idx > 0) {
            navigate(-1);
        } else {
            navigate('/unified-supplier-hub');
        }
    };

    async function fetchQuotes() {
        setLoading(true);
        try {
            // Fetch all supplier quotes
            // Note: 'enquiry' might be 'customer_enquiries' depending on DB relation name
            const { data, error } = await supabase
                .from('supplier_quotes')
                .select(`
                    *,
                    supplier:partners(id, name),
                    enquiry:customer_enquiries(id, enquiry_no, subject, status)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            // If data is null or empty, we might have wrong relation name
            // Let's try to handle possible null enquiry if relation name changed
            setQuotes(data || []);
            
            // Expand all by default
            const initialExpanded = {};
            (data || []).forEach(q => {
                if (q.enquiry?.id) initialExpanded[q.enquiry.id] = true;
            });
            setExpandedEnquiries(initialExpanded);

        } catch (err) {
            console.error("Error fetching quotes:", err);
        } finally {
            setLoading(false);
        }
    }

    const handleRecordQuote = (quote) => {
        setSelectedQuote(quote);
        setQuoteForm({ amount: quote.quote_amount || '', notes: quote.notes || '' });
        setShowRecordModal(true);
    };

    const submitQuote = async () => {
        if (!selectedQuote) return;
        try {
            const { error } = await saveSupplierQuote({
                id: selectedQuote.id,
                quote_amount: parseFloat(quoteForm.amount),
                status: 'Received',
                notes: quoteForm.notes
            });
            if (error) throw error;
            setShowRecordModal(false);
            fetchQuotes();
        } catch (err) {
            alert("Failed to save quote: " + err.message);
        }
    };

    const toggleExpand = (enquiryId) => {
        setExpandedEnquiries(prev => ({
            ...prev,
            [enquiryId]: !prev[enquiryId]
        }));
    };

    const filteredQuotes = quotes.filter(q => 
        q.supplier?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.enquiry?.enquiry_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.enquiry?.subject?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Grouping quotes by Enquiry
    const enquiryGroups = filteredQuotes.reduce((groups, quote) => {
        const enquiryId = quote.enquiry?.id || 'orphaned';
        if (!groups[enquiryId]) {
            groups[enquiryId] = {
                enquiry: quote.enquiry,
                quotes: []
            };
        }
        groups[enquiryId].quotes.push(quote);
        return groups;
    }, {});

    return (
        <div className="page-container" style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <button onClick={handleGoBack} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '8px', borderRadius: '10px', cursor: 'pointer', color: '#64748b', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            <ArrowLeft size={20} />
                        </button>
                        <h1 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 800, color: '#1e293b', letterSpacing: '-0.02em' }}>Float Supplier Orders</h1>
                    </div>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '1rem' }}>Track and manage outgoing RFQs and incoming supplier quotations.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input 
                            type="text" 
                            placeholder="Search enquiries or suppliers..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ padding: '10px 12px 10px 40px', borderRadius: '12px', border: '1px solid #e2e8f0', width: '300px', outline: 'none', fontSize: '0.9rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                        />
                    </div>
                    <button className="btn btn-primary" onClick={fetchQuotes} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#6366f1', border: 'none', padding: '10px 20px', borderRadius: '12px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                        <Clock size={18} /> Refresh
                    </button>
                </div>
            </div>

            {/* Stats Overview */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '32px' }}>
                {[
                    { label: 'Pending RFQs', value: quotes.filter(q => q.status === 'Pending').length, icon: <Clock color="#f59e0b" />, bg: '#fffbeb' },
                    { label: 'Quotes Received', value: quotes.filter(q => q.status === 'Received').length, icon: <FileText color="#6366f1" />, bg: '#eef2ff' },
                    { label: 'Shortlisted', value: quotes.filter(q => q.status === 'Shortlisted').length, icon: <ShieldCheck color="#10b981" />, bg: '#ecfdf5' },
                    { label: 'Total Volume', value: `$${quotes.reduce((sum, q) => sum + (q.quote_amount || 0), 0).toLocaleString()}`, icon: <TrendingUp color="#8b5cf6" />, bg: '#f5f3ff' },
                ].map((stat, idx) => (
                    <div key={idx} style={{ background: '#fff', padding: '24px', borderRadius: '20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {stat.icon}
                        </div>
                        <div>
                            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.025em' }}>{stat.label}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>{stat.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Grouped Enquiry List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {loading ? (
                    <div style={{ padding: '100px', textAlign: 'center', color: '#64748b' }}>
                        <div className="animate-spin" style={{ display: 'inline-block', marginBottom: '12px' }}><Clock size={32} /></div>
                        <p>Synchronizing with supplier database...</p>
                    </div>
                ) : Object.keys(enquiryGroups).length === 0 ? (
                    <div style={{ padding: '100px', textAlign: 'center', background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
                        <AlertCircle size={48} style={{ color: '#94a3b8', marginBottom: '16px' }} />
                        <h3 style={{ color: '#1e293b', marginBottom: '8px' }}>No Active Floats</h3>
                        <p style={{ color: '#64748b' }}>Start by floating an Enquiry to suppliers from the Enquiry Details page.</p>
                    </div>
                ) : (
                    Object.values(enquiryGroups).map((group) => (
                        <div key={group.enquiry?.id || 'orphaned'} style={{ background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.04)' }}>
                            {/* Group Header */}
                            <div 
                                onClick={() => toggleExpand(group.enquiry?.id)}
                                style={{ padding: '24px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}>
                                        <FileText size={20} />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '1.1rem' }}>{group.enquiry?.enquiry_no || 'Manual RFQ'}</span>
                                            <span style={{ fontSize: '0.75rem', background: '#eef2ff', color: '#6366f1', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                                {group.quotes.length} RFQs
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.9rem', color: '#64748b' }}>{group.enquiry?.subject}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700 }}>LOWEST BID</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}>
                                            ${Math.min(...group.quotes.filter(q => q.quote_amount > 0).map(q => q.quote_amount), Infinity).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                    <button style={{ background: 'none', border: 'none', color: '#94a3b8' }}>
                                        {expandedEnquiries[group.enquiry?.id] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                    </button>
                                </div>
                            </div>

                            {/* Group Content (Quotes Table) */}
                            {expandedEnquiries[group.enquiry?.id] && (
                                <div style={{ padding: '0' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
                                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Supplier</th>
                                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Status</th>
                                                <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Amount</th>
                                                <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {group.quotes.map((quote) => (
                                                <tr key={quote.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '16px 24px' }}>
                                                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{quote.supplier?.name}</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Created: {new Date(quote.created_at).toLocaleDateString()}</div>
                                                    </td>
                                                    <td style={{ padding: '16px 24px' }}>
                                                        <span style={{ 
                                                            display: 'inline-flex', 
                                                            alignItems: 'center', 
                                                            gap: '4px', 
                                                            padding: '4px 10px', 
                                                            borderRadius: '10px', 
                                                            fontSize: '0.75rem', 
                                                            fontWeight: 700,
                                                            background: quote.status === 'Pending' ? '#fffbeb' : (quote.status === 'Received' ? '#eef2ff' : '#ecfdf5'),
                                                            color: quote.status === 'Pending' ? '#b45309' : (quote.status === 'Received' ? '#4f46e5' : '#059669')
                                                        }}>
                                                            {quote.status === 'Pending' ? <Clock size={12} /> : (quote.status === 'Received' ? <Check size={12} /> : <ShieldCheck size={12} />)}
                                                            {quote.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 800, color: '#1e293b', fontSize: '1.05rem' }}>
                                                        {quote.quote_amount > 0 ? `$${quote.quote_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                                    </td>
                                                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                            {quote.status === 'Pending' ? (
                                                                <button 
                                                                    onClick={() => handleRecordQuote(quote)}
                                                                    style={{ padding: '6px 12px', borderRadius: '8px', background: '#f59e0b', color: '#fff', border: 'none', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                                                                >
                                                                    Record Quote
                                                                </button>
                                                            ) : (
                                                                <>
                                                                    {quote.status !== 'Shortlisted' ? (
                                                                        <button 
                                                                            onClick={async () => {
                                                                                await shortlistSupplierQuote(quote.enquiry_id, quote.id);
                                                                                fetchQuotes();
                                                                            }}
                                                                            style={{ padding: '6px 12px', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                                                                        >
                                                                            Shortlist Bid
                                                                        </button>
                                                                    ) : (
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                            <button 
                                                                                disabled={isConverting}
                                                                                onClick={async () => {
                                                                                    setIsConverting(true);
                                                                                    try {
                                                                                        const doc = await createQuotationFromSupplierQuote(quote.id);
                                                                                        navigate(`/workflows/editor/quotation/${doc.id}`);
                                                                                    } catch (err) {
                                                                                        alert("Failed to generate quotation");
                                                                                        setIsConverting(false);
                                                                                    }
                                                                                }}
                                                                                style={{ padding: '6px 12px', borderRadius: '8px', background: '#6366f1', color: '#fff', border: 'none', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                                                                            >
                                                                                <ArrowRightLeft size={14} /> Generate QTN
                                                                            </button>
                                                                            <button 
                                                                                disabled={isConverting}
                                                                                onClick={async () => {
                                                                                    setIsConverting(true);
                                                                                    try {
                                                                                        const doc = await createSupplierPOFromSupplierQuote(quote.id);
                                                                                        navigate(`/workflows/editor/purchase-order/${doc.id}`);
                                                                                    } catch (err) {
                                                                                        alert("Failed to generate supplier PO: " + err.message);
                                                                                        setIsConverting(false);
                                                                                    }
                                                                                }}
                                                                                style={{ padding: '6px 12px', borderRadius: '8px', background: '#059669', color: '#fff', border: 'none', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                                                                            >
                                                                                <BadgeDollarSign size={14} /> Generate Supplier PO
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                    <button 
                                                                        onClick={() => handleRecordQuote(quote)}
                                                                        style={{ padding: '6px', borderRadius: '8px', background: '#f1f5f9', color: '#64748b', border: 'none', cursor: 'pointer' }}
                                                                    >
                                                                        <Plus size={16} />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div style={{ padding: '12px 24px', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
                                        <button 
                                            onClick={() => navigate(`/workflows/enquiry/${group.enquiry?.id}`)}
                                            style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            View Original Enquiry <ExternalLink size={12} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Record Quote Modal */}
            {showRecordModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: '#fff', borderRadius: '24px', width: '400px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>Record Quote</h3>
                                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>{selectedQuote?.supplier?.name}</p>
                            </div>
                            <button onClick={() => setShowRecordModal(false)} style={{ background: '#f1f5f9', border: 'none', padding: '6px', borderRadius: '8px', cursor: 'pointer' }}>
                                <ArrowLeft size={16} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div className="form-group">
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>Quote Amount ($)</label>
                                <div style={{ position: 'relative' }}>
                                    <DollarSign size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                    <input 
                                        type="number" 
                                        className="form-input" 
                                        placeholder="0.00"
                                        value={quoteForm.amount}
                                        onChange={(e) => setQuoteForm({...quoteForm, amount: e.target.value})}
                                        style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '1rem', fontWeight: 600, outline: 'none' }}
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>Internal Notes</label>
                                <textarea 
                                    className="form-input" 
                                    placeholder="Add any lead time or validity notes..."
                                    value={quoteForm.notes}
                                    onChange={(e) => setQuoteForm({...quoteForm, notes: e.target.value})}
                                    style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none', minHeight: '100px', resize: 'none' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                            <button 
                                onClick={() => setShowRecordModal(false)}
                                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={submitQuote}
                                style={{ flex: 2, padding: '12px', borderRadius: '12px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Save Quote
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
