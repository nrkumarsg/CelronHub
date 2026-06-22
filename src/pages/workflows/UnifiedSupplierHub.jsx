import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
    getWorkflowDocuments, 
    deleteWorkflowDocument, 
    getHubStats,
    getEnquiryLinkedStats,
    trackFloatedRFQ,
    createSupplierPOFromSupplierQuote
} from '../../lib/workflowV2Service';
import { 
    LayoutDashboard, 
    Search, 
    Plus, 
    FileText, 
    ArrowRightLeft, 
    ShoppingCart, 
    Clock, 
    CheckCircle2, 
    Eye,
    Trash2,
    Filter,
    ChevronDown,
    ExternalLink,
    Send,
    Building2,
    Calendar,
    Loader2,
    Camera,
    Users,
    Smartphone,
    Sparkles,
    FileCheck,
    Receipt,
    Wrench,
    Layers
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import FastFloatModal from '../../components/workflows/FastFloatModal';

export default function UnifiedSupplierHub() {
    const TABS = [
        { id: 'customer_enquiries', label: 'Customer Enquiries', icon: <FileText size={18} />, color: '#6366f1' },
        { id: 'rfq_floats', label: 'RFQ Floats', icon: <ArrowRightLeft size={18} />, color: '#f59e0b' },
        { id: 'supplier_quotes', label: 'Supplier Quotes', icon: <Clock size={18} />, color: '#10b981' },
        { id: 'orders_to_suppliers', label: 'Order to Suppliers', icon: <ShoppingCart size={18} />, color: '#ef4444' },
        { id: 'supplier_tools', label: 'Supplier Directory & Tools', icon: <Building2 size={18} />, color: '#8b5cf6' }
    ];

    const supplierTools = [
        { title: 'Partners Directory', description: 'Manage vendor and supplier profiles, payment terms, and organizational details.', icon: <Building2 size={24} />, color: '#f97316', path: '/partners' },
        { title: 'Contacts Registry', description: 'Access key contact persons, emails, and direct phone numbers.', icon: <Users size={24} />, color: '#6366f1', path: '/contacts' },
        { title: 'AI Drive Card Scanner', description: 'Upload business cards to Google Drive and auto-extract vendor metadata.', icon: <Smartphone size={24} />, color: '#ec4899', path: '/partners/ai-drive-parser' },
        { title: 'AI Email Parser', description: 'Extract supplier contact info automatically from copy-pasted emails.', icon: <Sparkles size={24} />, color: '#a855f7', path: '/partners/ai-parser' },
        { title: 'Business Card Merger', description: 'Combine scanned business cards using third-party web automation.', icon: <Layers size={24} />, color: '#e11d48', path: 'https://business-card-merger.vercel.app', isExternal: true },
        { title: 'Float Supplier Order', description: 'Cross-reference enquiries and dispatch quote requests to suppliers.', icon: <ArrowRightLeft size={24} />, color: '#f97316', path: '/workflows/float-supplier-order' },
        { title: 'RFQ Depository', description: 'Centralized repository for floated Requests for Quotes.', icon: <FileText size={24} />, color: '#f59e0b', path: '/workflows?type=Enquiry&view=depository' },
        { title: 'Stationery Directory', description: 'Access print templates, letterheads, and formal document frameworks.', icon: <FileCheck size={24} />, color: '#10b981', path: '/forms' },
        { title: 'Accounts Payable', description: 'Monitor vendor invoices, pending bills, and payments.', icon: <Receipt size={24} />, color: '#ef4444', path: '/accounts/bills' },
        { title: 'Weblinks & Resources', description: 'Access external maritime tools, calculators, and helpful resources.', icon: <Wrench size={24} />, color: '#db2777', path: '/tools' }
    ];

    const { profile } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const tabParam = searchParams.get('tab');
    const [activeTab, setActiveTab] = useState(tabParam || 'customer_enquiries');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) {
            setActiveTab(tab);
        } else {
            setActiveTab('customer_enquiries');
        }
    }, [searchParams]);
    const [stats, setStats] = useState({ activeEnquiries: 0, pendingRFQs: 0, receivedQuotes: 0, totalPOValue: 0 });
    const [selectedEnquiry, setSelectedEnquiry] = useState(null);
    const [isFloatModalOpen, setIsFloatModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [partners, setPartners] = useState([]);
    const [selectedPartnerId, setSelectedPartnerId] = useState('');

    useEffect(() => {
        if (profile?.company_id) {
            fetchStats();
            fetchData();
            fetchPartners();
        }
    }, [profile, activeTab]);

    const fetchPartners = async () => {
        const { data: pData } = await supabase
            .from('partners')
            .select('id, name')
            .eq('company_id', profile.company_id)
            .order('name');
        if (pData) setPartners(pData);
    };

    const fetchStats = async () => {
        try {
            const hubStats = await getHubStats(profile.company_id);
            setStats(hubStats);
        } catch (err) {
            console.error("Error fetching stats:", err);
        }
    };

    const fetchData = async () => {
        if (activeTab === 'supplier_tools') {
            setData([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            let result;
            if (activeTab === 'customer_enquiries') {
                result = await supabase
                    .from('customer_enquiries')
                    .select('*, customer:partners(name), contact:contacts(name)')
                    .eq('company_id', profile.company_id)
                    .order('created_at', { ascending: false });
            } else if (activeTab === 'rfq_floats') {
                result = await supabase
                    .from('workflow_documents')
                    .select('*, partners(name)')
                    .eq('company_id', profile.company_id)
                    .eq('document_type', 'Enquiry')
                    .order('created_at', { ascending: false });
            } else if (activeTab === 'supplier_quotes') {
                result = await supabase
                    .from('supplier_quotes')
                    .select('*, enquiry:customer_enquiries(enquiry_no, subject, customer_ref), supplier:partners(name)')
                    .eq('company_id', profile.company_id)
                    .order('created_at', { ascending: false });
            } else if (activeTab === 'orders_to_suppliers') {
                result = await supabase
                    .from('workflow_documents')
                    .select('*, partners(name)')
                    .eq('company_id', profile.company_id)
                    .eq('document_type', 'Purchase Order')
                    .order('created_at', { ascending: false });
            }

            if (result.error) throw result.error;
            setData(result.data || []);
        } catch (err) {
            console.error("Error fetching data:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id, table) => {
        if (!window.confirm('Are you sure you want to delete this record?')) return;
        try {
            const { error } = await supabase.from(table).delete().eq('id', id);
            if (error) throw error;
            fetchData();
            fetchStats();
        } catch (err) {
            alert('Error deleting record: ' + err.message);
        }
    };

    const handleCreatePO = async (quoteId) => {
        if (!window.confirm("Convert this Supplier Quote into a formal Purchase Order?")) return;
        try {
            setLoading(true);
            const po = await createSupplierPOFromSupplierQuote(quoteId);
            alert(`Purchase Order ${po.document_no} created successfully!`);
            navigate(`/workflows/editor/purchase-order/${po.id}`);
        } catch (err) {
            console.error("Failed to create PO:", err);
            alert("Failed to create PO: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const filterData = (item) => {
        const query = searchQuery.toLowerCase();
        const selectedPartner = partners.find(p => p.id === selectedPartnerId);
        const selectedPartnerName = selectedPartner?.name;
        
        let matchesPartner = true;
        if (selectedPartnerId) {
            const getPartnerName = (pId) => partners.find(p => p.id === pId)?.name;
            const docPartnerId = activeTab === 'customer_enquiries' ? item.partner_id :
                                 activeTab === 'rfq_floats' ? item.partner_id :
                                 activeTab === 'supplier_quotes' ? item.partner_id :
                                 activeTab === 'orders_to_suppliers' ? item.partner_id : null;
            const docPartnerName = getPartnerName(docPartnerId) || (activeTab === 'rfq_floats' ? item.partners?.name : activeTab === 'supplier_quotes' ? item.supplier?.name : activeTab === 'orders_to_suppliers' ? item.partners?.name : item.customer?.name);
            
            matchesPartner = docPartnerId === selectedPartnerId ||
                (docPartnerName && selectedPartnerName && docPartnerName.trim().toLowerCase() === selectedPartnerName.trim().toLowerCase());
        }

        if (activeTab === 'customer_enquiries') {
            return matchesPartner && (item.enquiry_no?.toLowerCase().includes(query) || 
                    item.customer?.name?.toLowerCase().includes(query) ||
                    item.subject?.toLowerCase().includes(query));
        } else if (activeTab === 'rfq_floats') {
            return matchesPartner && (item.document_no?.toLowerCase().includes(query) || 
                    item.partners?.name?.toLowerCase().includes(query) ||
                    item.subject?.toLowerCase().includes(query));
        } else if (activeTab === 'supplier_quotes') {
            return matchesPartner && (item.enquiry?.enquiry_no?.toLowerCase().includes(query) || 
                    item.supplier?.name?.toLowerCase().includes(query));
        } else if (activeTab === 'orders_to_suppliers') {
            return matchesPartner && (item.document_no?.toLowerCase().includes(query) || 
                    item.partners?.name?.toLowerCase().includes(query) ||
                    item.subject?.toLowerCase().includes(query));
        }
        return matchesPartner;
    };

    const filteredData = data.filter(filterData);

    const stripHtml = (html) => {
        if (!html) return '';
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || "";
    };

    const getStatusBadge = (status) => {
        const colors = {
            'Open': { bg: '#e0f2fe', text: '#0369a1' },
            'Draft': { bg: '#f1f5f9', text: '#475569' },
            'Sent': { bg: '#fef3c7', text: '#92400e' },
            'Received': { bg: '#dcfce7', text: '#166534' },
            'Shortlisted': { bg: '#f0f9ff', text: '#0284c7' },
            'RFQ Floated': { bg: '#f5f3ff', text: '#5b21b6' },
            'Job Created': { bg: '#ecfdf5', text: '#059669' }
        };
        const style = colors[status] || { bg: '#f1f5f9', text: '#475569' };
        return (
            <span style={{ 
                padding: '4px 10px', 
                borderRadius: '20px', 
                fontSize: '0.75rem', 
                fontWeight: 600,
                background: style.bg,
                color: style.text
            }}>
                {status}
            </span>
        );
    };

    return (
        <div className="hub-container" style={{ padding: '40px', maxWidth: '1400px', margin: '0 auto' }}>
            <header className="hub-header" style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div className="hub-title-group">
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '16px', margin: 0 }}>
                        <div style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff', padding: '12px', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)' }}>
                            <LayoutDashboard size={32} />
                        </div>
                        Unified Supplier Hub
                    </h1>
                    <p style={{ fontSize: '1.1rem', color: '#64748b', marginTop: '8px' }}>High-speed procurement lifecycle management</p>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {(() => {
                        let btnLabel = '';
                        let btnAction = () => {};
                        let btnColor = '#ef4444';
                        let showBtn = true;

                        if (activeTab === 'customer_enquiries') {
                            btnLabel = 'New Customer Enquiry';
                            btnAction = () => navigate('/workflows/enquiry/new');
                            btnColor = '#6366f1';
                        } else if (activeTab === 'rfq_floats') {
                            btnLabel = 'New RFQ Float';
                            btnAction = () => navigate('/workflows/editor/Enquiry/new');
                            btnColor = '#f59e0b';
                        } else if (activeTab === 'orders_to_suppliers') {
                            btnLabel = 'New Order';
                            btnAction = () => navigate('/workflows/editor/purchase-order/new');
                            btnColor = '#ef4444';
                        } else {
                            showBtn = false;
                        }

                        if (!showBtn) return null;

                        return (
                            <button 
                                onClick={btnAction}
                                style={{ 
                                    padding: '12px 20px', 
                                    background: btnColor, 
                                    color: '#fff', 
                                    borderRadius: '12px', 
                                    border: 'none', 
                                    fontWeight: 700, 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '8px',
                                    boxShadow: `0 4px 12px -2px ${btnColor}44`,
                                    transition: 'all 0.2s'
                                }}
                                onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                <Plus size={18} /> {btnLabel}
                            </button>
                        );
                    })()}
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ position: 'relative', width: '250px' }}>
                            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input 
                                type="text" 
                                placeholder="Quick Search..."
                                style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.9rem' }}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div style={{ position: 'relative', width: '220px' }}>
                            <Filter size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <select
                                style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.9rem', cursor: 'pointer', appearance: 'none' }}
                                value={selectedPartnerId}
                                onChange={(e) => setSelectedPartnerId(e.target.value)}
                            >
                                <option value="">All Partners</option>
                                {(() => {
                                    const unique = [];
                                    const seen = new Set();
                                    (partners || []).forEach(p => {
                                        const key = (p.name || '').trim().toLowerCase();
                                        if (key && !seen.has(key)) {
                                            seen.add(key);
                                            unique.push(p);
                                        }
                                    });
                                    return unique.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ));
                                })()}
                            </select>
                            <ChevronDown size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                        </div>
                    </div>
                </div>
            </header>

            <nav style={{ display: 'flex', gap: '12px', marginBottom: '32px', background: '#f1f5f9', padding: '6px', borderRadius: '14px', width: 'fit-content' }}>
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => {
                            setActiveTab(tab.id);
                            if (tab.id === 'supplier_tools') {
                                navigate('/unified-supplier-hub?tab=supplier_tools', { replace: true });
                            } else {
                                navigate('/unified-supplier-hub', { replace: true });
                            }
                        }}
                        style={{ 
                            padding: '10px 20px', 
                            borderRadius: '10px', 
                            border: 'none',
                            background: activeTab === tab.id ? '#fff' : 'transparent',
                            color: activeTab === tab.id ? tab.color : '#64748b',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: activeTab === tab.id ? '0 4px 6px -1px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </nav>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '40px' }}>
                {[
                    { label: 'Active Enquiries', val: stats.activeEnquiries, icon: <FileText size={20} />, col: '#6366f1' },
                    { label: 'Pending RFQs', val: stats.pendingRFQs, icon: <ArrowRightLeft size={20} />, col: '#f59e0b' },
                    { label: 'Received Quotes', val: stats.receivedQuotes, icon: <Clock size={20} />, col: '#10b981' },
                    { label: 'Total PO Value', val: `$${(stats.totalPOValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: <ShoppingCart size={20} />, col: '#ef4444' }
                ].map((s, i) => (
                    <div key={i} style={{ background: '#fff', padding: '24px', borderRadius: '20px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{ background: `${s.col}15`, color: s.col, padding: '12px', borderRadius: '14px' }}>{s.icon}</div>
                        <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>{s.label}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>{s.val}</div>
                        </div>
                    </div>
                ))}
            </div>

            {activeTab === 'supplier_tools' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px', width: '100%', marginBottom: '40px' }}>
                    {supplierTools.map((tool, idx) => (
                        <div 
                            key={idx}
                            onClick={() => {
                                if (tool.isExternal) {
                                    window.open(tool.path, '_blank');
                                } else {
                                    navigate(tool.path);
                                }
                            }}
                            style={{
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '20px',
                                padding: '24px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '16px',
                                cursor: 'pointer',
                                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.transform = 'translateY(-4px)';
                                e.currentTarget.style.boxShadow = '0 12px 20px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                                e.currentTarget.style.borderColor = tool.color + '44';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.transform = 'none';
                                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05)';
                                e.currentTarget.style.borderColor = '#e2e8f0';
                            }}
                        >
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '12px',
                                background: `${tool.color}15`,
                                color: tool.color,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                {tool.icon}
                            </div>
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {tool.title}
                                    {tool.isExternal && <ExternalLink size={14} style={{ opacity: 0.6 }} />}
                                </h3>
                                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                                    {tool.description}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '24px' }}>
                    {loading ? (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '100px' }}>
                            <Loader2 className="animate-spin" size={48} color="#6366f1" style={{ margin: '0 auto' }} />
                            <p style={{ marginTop: '16px', color: '#64748b', fontWeight: 600 }}>Syncing workspace...</p>
                        </div>
                    ) : filteredData.length === 0 ? (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '80px', background: '#fff', borderRadius: '24px', border: '2px dashed #e2e8f0' }}>
                            <div style={{ opacity: 0.3, marginBottom: '20px' }}><LayoutDashboard size={64} style={{ margin: '0 auto' }} /></div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e293b' }}>No Records Found</h3>
                            <p style={{ color: '#64748b' }}>Try adjusting your search or check another tab.</p>
                        </div>
                    ) : (
                        filteredData.map((item) => (
                            <div key={item.id} style={{ 
                                background: '#fff', 
                                borderRadius: '24px', 
                                border: '1px solid #f1f5f9', 
                                padding: '24px', 
                                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.04)',
                                display: 'flex',
                                flexDirection: 'column',
                                transition: 'transform 0.2s, box-shadow 0.2s',
                                cursor: 'default'
                            }} className="hub-card-hover">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>
                                        {activeTab === 'customer_enquiries' ? item.enquiry_no : 
                                         activeTab === 'rfq_floats' ? item.document_no : 
                                         activeTab === 'orders_to_suppliers' ? item.document_no :
                                         `Quote: ${item.enquiry?.enquiry_no || 'N/A'}`}
                                    </div>
                                    {getStatusBadge(item.status)}
                                </div>

                                <h3 style={{ 
                                    fontSize: '1.1rem', 
                                    fontWeight: 700, 
                                    color: '#1e293b', 
                                    margin: '0 0 12px 0', 
                                    minHeight: '3rem',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    lineHeight: '1.5rem'
                                }}>
                                    {activeTab === 'supplier_quotes' ? item.supplier?.name : 
                                     activeTab === 'orders_to_suppliers' ? (item.subject || `Order to ${item.partners?.name}`) :
                                     (stripHtml(item.subject) || item.customer?.name || 'Untitled Enquiry')}
                                </h3>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px', flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#64748b' }}>
                                        <Building2 size={14} />
                                        {activeTab === 'customer_enquiries' ? item.customer?.name : 
                                         activeTab === 'rfq_floats' ? item.partners?.name : 
                                         activeTab === 'orders_to_suppliers' ? item.partners?.name :
                                         `Source: ${item.enquiry?.customer_ref || 'Direct'}`}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#64748b' }}>
                                        <Calendar size={14} />
                                        {new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </div>
                                    {activeTab === 'supplier_quotes' && (
                                        <div style={{ marginTop: '8px', padding: '12px', background: '#f8fafc', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Bid Amount</div>
                                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#10b981' }}>${(item.quote_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                        </div>
                                    )}
                                    {activeTab === 'orders_to_suppliers' && (
                                        <div style={{ marginTop: '8px', padding: '12px', background: '#fef2f2', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#991b1b' }}>Order Value</div>
                                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ef4444' }}>${(item.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: '8px' }}>
                                     {activeTab === 'customer_enquiries' && (
                                        <button 
                                            onClick={() => { setSelectedEnquiry(item); setIsFloatModalOpen(true); }}
                                            style={{ flex: 1, background: '#6366f1', color: '#fff', border: 'none', padding: '10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                        >
                                            <Send size={14} /> Float RFQ
                                        </button>
                                    )}
                                    {activeTab === 'supplier_quotes' && (
                                        <button 
                                            onClick={() => handleCreatePO(item.id)}
                                            style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', padding: '10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                        >
                                            <ShoppingCart size={14} /> Order from Supplier
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => {
                                            if (activeTab === 'customer_enquiries') navigate(`/workflows/enquiry/${item.id}`);
                                            else if (activeTab === 'rfq_floats') navigate(`/workflows/editor/Enquiry/${item.id}`);
                                            else if (activeTab === 'orders_to_suppliers') navigate(`/workflows/editor/purchase-order/${item.id}`);
                                            else if (activeTab === 'supplier_quotes') navigate(`/workflows/enquiry/${item.enquiry_id}`);
                                        }}
                                        style={{ flex: activeTab === 'customer_enquiries' ? 0.4 : 1, background: '#f1f5f9', color: '#475569', border: 'none', padding: '10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                                    >
                                        View
                                    </button>
                                    {(activeTab === 'rfq_floats' || activeTab === 'orders_to_suppliers') && (
                                        <button 
                                            onClick={() => {
                                                const type = activeTab === 'rfq_floats' ? 'Enquiry' : 'purchase-order';
                                                navigate(`/workflows/editor/${type}/${item.id}?tab=gallery`);
                                            }}
                                            title="Gallery / Photos"
                                            style={{ padding: '10px', background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: '12px', cursor: 'pointer' }}
                                        >
                                            <Camera size={14} />
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => handleDelete(item.id, activeTab === 'customer_enquiries' ? 'customer_enquiries' : (activeTab === 'rfq_floats' || activeTab === 'orders_to_suppliers' ? 'workflow_documents' : 'supplier_quotes'))}
                                        style={{ padding: '10px', background: '#fff', color: '#ef4444', border: '1px solid #fee2e2', borderRadius: '12px', cursor: 'pointer' }}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            <FastFloatModal 
                isOpen={isFloatModalOpen}
                onClose={() => setIsFloatModalOpen(false)}
                enquiry={selectedEnquiry}
                onConfirm={async (suppliers) => {
                    await trackFloatedRFQ(selectedEnquiry.id, suppliers.map(s => s.id), profile.company_id);
                    setIsFloatModalOpen(false);
                    fetchData();
                    fetchStats();
                }}
            />

            <style dangerouslySetInnerHTML={{ __html: `
                .hub-card-hover:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1) !important;
                }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .animate-spin { animation: spin 1s linear infinite; }
            `}} />
        </div>
    );
}
