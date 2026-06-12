import React, { useState, useEffect } from 'react';
import { Search, Users, DollarSign, Activity, FileSpreadsheet, Ship, MapPin, Brain, MessageSquare, FileText, Briefcase, ShoppingCart, Truck, Receipt, Award, CheckCircle, List, ClipboardCheck, Package, Layers, RefreshCw, FileDigit, Clock, HardDrive, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getPartners, getContacts } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import StageReminders from '../components/dashboard/StageReminders';
import TodoReminder from '../components/dashboard/TodoReminder';
import SystemReminders from '../components/dashboard/SystemReminders';

export default function Dashboard() {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const { profile } = useAuth();
    const [stats, setStats] = useState({
        totalPartners: 0,
        customers: 0,
        suppliers: 0,
        totalContacts: 0,
        totalVessels: 0,
        totalLocations: 0
    });

    const [partners, setPartners] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            if (!profile) return; // Wait for profile to load to avoid wrong counts
            setLoading(true);
            try {
                const [p, c] = await Promise.all([
                    getPartners(profile),
                    getContacts(profile)
                ]);

                setPartners(p);

                let customers = 0;
                let suppliers = 0;
                p.forEach(pt => {
                    if (pt.types?.includes('Customer') || pt.types?.includes('Customer Related')) customers++;
                    if (pt.types?.includes('Supplier') || pt.types?.includes('Supplier Related')) suppliers++;
                });

                const { count: vesselsCount } = await supabase.from('vessels').select('*', { count: 'exact', head: true });
                const { count: locationsCount } = await supabase.from('work_locations').select('*', { count: 'exact', head: true });

                const { getWorkflowCounts } = await import('../lib/workflowV2Service');
                const { all: allDocs } = await getWorkflowCounts(profile.company_id);

                setStats({
                    totalPartners: p.length,
                    customers,
                    suppliers,
                    totalContacts: c.length,
                    totalVessels: vesselsCount || 0,
                    totalLocations: locationsCount || 0,
                    workflow: {
                        offers: allDocs.filter(d => d.document_type === 'Quotation').length,
                        orders: allDocs.filter(d => d.document_type === 'Job').length,
                        awaitOrders: allDocs.filter(d => d.document_type === 'Quotation' && d.status === 'Sent').length,
                        awaitOffers: allDocs.filter(d => d.document_type === 'Enquiry' && d.status === 'Confirmed').length,
                        awaitDO: allDocs.filter(d => d.document_type === 'Job' && d.status === 'Confirmed').length,
                        awaitInvoice: allDocs.filter(d => d.document_type === 'Job' && d.status === 'Active').length
                    }
                });
            } catch (err) {
                console.error("Dashboard load error:", err);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [profile]);

    const filteredPartners = partners.filter(p =>
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.email1?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div style={{ background: '#f8fafc', minHeight: '100%', padding: '32px', color: '#334155', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Dashboard</h2>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <a
                        href="https://business-card-merger.vercel.app"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            background: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            color: '#ec4899',
                            textDecoration: 'none',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                    >
                        <Sparkles size={18} /> Business Card Merger
                    </a>
                    <button
                        onClick={() => navigate('/partners/ai-parser')}
                        style={{
                            background: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            color: '#a855f7',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                    >
                        <Sparkles size={18} /> AI Parser
                    </button>
                    <button
                        onClick={() => navigate('/storage?tab=explorer')}
                        style={{
                            background: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            color: '#6366f1',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                    >
                        <HardDrive size={18} /> Storage Hub
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 12px', width: '300px' }}>
                        <Search size={18} color="#94a3b8" />
                        <input
                            type="text"
                            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '10px 0', marginLeft: '8px', fontSize: '0.95rem', color: '#334155' }}
                            placeholder="Global Search Partners..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '24px', marginBottom: '32px' }}>
                <div className="stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                        <span>Total Partners</span>
                        <Users size={20} color="var(--accent)" />
                    </div>
                    <div className="stat-value">{loading ? '...' : stats.totalPartners}</div>
                </div>

                <div className="stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                        <span>Customers</span>
                        <DollarSign size={20} color="#4ade80" />
                    </div>
                    <div className="stat-value">{loading ? '...' : stats.customers}</div>
                </div>

                <div className="stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                        <span>Suppliers</span>
                        <Activity size={20} color="#facc15" />
                    </div>
                    <div className="stat-value">{loading ? '...' : stats.suppliers}</div>
                </div>

                <div className="stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                        <span>Total Contacts</span>
                        <FileSpreadsheet size={20} color="#c084fc" />
                    </div>
                    <div className="stat-value">{loading ? '...' : stats.totalContacts}</div>
                </div>

            </div>

            {/* Operations Hub Section */}
            <div style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                    <Ship size={22} color="#3b82f6" />
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#1e293b' }}>Operations Hub</h3>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                    <div className="stat-card" style={{ 
                        background: 'linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)',
                        borderLeft: '4px solid #3b82f6',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontWeight: 600 }}>
                            <span>Total Vessels</span>
                            <Ship size={24} color="#3b82f6" />
                        </div>
                        <div className="stat-value" style={{ color: '#1e40af' }}>{loading ? '...' : stats.totalVessels}</div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '-8px' }}>Active fleet management</div>
                        <Ship size={80} color="#3b82f6" style={{ position: 'absolute', right: '-10px', bottom: '-20px', opacity: 0.05 }} />
                    </div>

                    <div className="stat-card" style={{ 
                        background: 'linear-gradient(135deg, #ffffff 0%, #fff7ed 100%)',
                        borderLeft: '4px solid #f97316',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontWeight: 600 }}>
                            <span>Work Locations</span>
                            <MapPin size={24} color="#f97316" />
                        </div>
                        <div className="stat-value" style={{ color: '#9a3412' }}>{loading ? '...' : stats.totalLocations}</div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '-8px' }}>Global operational points</div>
                        <MapPin size={80} color="#f97316" style={{ position: 'absolute', right: '-10px', bottom: '-20px', opacity: 0.05 }} />
                    </div>
                </div>
            </div>

            {/* Workflow Monitoring Group */}
            <div style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                    <Activity size={22} color="var(--accent)" />
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#1e293b' }}>Workflow Monitoring</h3>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
                    <div className="stat-card" style={{ borderLeft: '4px solid #6366f1' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            <span>Offers</span>
                            <FileText size={18} color="#6366f1" />
                        </div>
                        <div className="stat-value" style={{ fontSize: '1.5rem' }}>{loading ? '...' : stats.workflow?.offers}</div>
                    </div>

                    <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            <span>Orders</span>
                            <Briefcase size={18} color="#10b981" />
                        </div>
                        <div className="stat-value" style={{ fontSize: '1.5rem' }}>{loading ? '...' : stats.workflow?.orders}</div>
                    </div>

                    <div className="stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            <span>Await Orders</span>
                            <Clock size={18} color="#f59e0b" />
                        </div>
                        <div className="stat-value" style={{ fontSize: '1.5rem' }}>{loading ? '...' : stats.workflow?.awaitOrders}</div>
                    </div>

                    <div className="stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            <span>Await Offers</span>
                            <RefreshCw size={18} color="#3b82f6" />
                        </div>
                        <div className="stat-value" style={{ fontSize: '1.5rem' }}>{loading ? '...' : stats.workflow?.awaitOffers}</div>
                    </div>

                    <div className="stat-card" style={{ borderLeft: '4px solid #f97316' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            <span>Await DO</span>
                            <Truck size={18} color="#f97316" />
                        </div>
                        <div className="stat-value" style={{ fontSize: '1.5rem' }}>{loading ? '...' : stats.workflow?.awaitDO}</div>
                    </div>

                    <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            <span>Await Invoice</span>
                            <Receipt size={18} color="#ef4444" />
                        </div>
                        <div className="stat-value" style={{ fontSize: '1.5rem' }}>{loading ? '...' : stats.workflow?.awaitInvoice}</div>
                    </div>
                </div>
            </div>

            {/* Workflow Navigation Hub */}
            <div className="glass-panel" style={{ marginBottom: '32px', padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                    <Layers size={20} color="var(--accent)" />
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Workflow Hub</h3>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    {[
                        { label: 'Storage Hub', icon: HardDrive, path: '/storage?tab=explorer', color: '#6366f1' },
                        { label: 'All Documents', icon: Layers, path: '/workflows', color: '#64748b' },
                        { label: 'Jobs', icon: Briefcase, path: '/workflows?type=Jobs', color: '#0f172a' },
                        { label: 'Enquiry from customer', icon: FileText, path: '/workflows?type=Enquiry', color: '#3b82f6' },
                        { label: 'Enquiry to Supplier', icon: RefreshCw, path: '/workflows?type=Supplier Enquiry', color: '#10b981' },
                        { label: 'Quotation', icon: FileText, path: '/workflows?type=Quotation', color: '#6366f1' },
                        { label: 'Order Acknowledgment', icon: ClipboardCheck, path: '/workflows?type=Order Acknowledgment', color: '#f59e0b' },
                        { label: 'Purchase Order', icon: ShoppingCart, path: '/workflows?type=Purchase Order', color: '#ec4899' },
                        { label: 'Delivery Order', icon: Truck, path: '/workflows?type=Delivery Order', color: '#8b5cf6' },
                        { label: 'Service Report', icon: Activity, path: '/workflows?type=Service Report', color: '#06b6d4' },
                        { label: 'Proforma Invoice', icon: FileDigit, path: '/workflows?type=Proforma Invoice', color: '#f43f5e' },
                        { label: 'Packing List', icon: Package, path: '/workflows?type=Packing List', color: '#14b8a6' },
                        { label: 'Tax Invoice', icon: Receipt, path: '/workflows?type=Tax Invoice', color: '#1e3a8a' },
                        { label: 'Certificate', icon: Award, path: '/workflows?type=Certificate', color: '#d946ef' },
                        { label: 'Payment Received', icon: CheckCircle, path: '/workflows?type=Payment Received', color: '#22c55e' },
                        { label: 'Statement of Account', icon: List, path: '/soa', color: '#475569' }
                    ].map((item, idx) => (
                        <button
                            key={idx}
                            onClick={() => navigate(item.path)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 16px',
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '100px',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                color: '#475569',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                            onMouseOver={e => {
                                e.currentTarget.style.background = '#f8fafc';
                                e.currentTarget.style.borderColor = item.color;
                                e.currentTarget.style.color = item.color;
                                e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseOut={e => {
                                e.currentTarget.style.background = '#ffffff';
                                e.currentTarget.style.borderColor = '#e2e8f0';
                                e.currentTarget.style.color = '#475569';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            <item.icon size={16} />
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* AI Workflow Action Reminders */}
            {!searchTerm && <SystemReminders />}
            {!searchTerm && <TodoReminder />}
            {!searchTerm && <StageReminders />}

            {searchTerm && (
                <div className="glass-panel">
                    <h3 style={{ marginBottom: '16px' }}>Search Results ({filteredPartners.length})</h3>
                    {filteredPartners.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {filteredPartners.map(p => (
                                <div key={p.id} style={{ padding: '16px', background: 'var(--input-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                    <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{p.name}</div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{p.email1 || 'No email provided'} • {p.types?.join(', ') || 'No Type'}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>No partners found matching "{searchTerm}"</p>
                    )}
                </div>
            )}

            {!searchTerm && (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <div style={{
                        width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
                    }}>
                        <Users size={32} color="var(--accent)" />
                    </div>
                    <h3 style={{ marginBottom: '8px', fontSize: '1.2rem' }}>Welcome to the SaaS Partners Module</h3>
                    <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto', marginBottom: '24px' }}>
                        This dashboard gives you a high-level overview of your business partners. Use the sidebar to manage full partner details and contacts.
                    </p>
                    <button
                        className="btn btn-secondary"
                        onClick={() => window.open('https://contacts.google.com/', '_blank')}
                    >
                        <FileSpreadsheet size={18} />
                        Open Google Contacts
                    </button>
                </div>
            )}
            {/* Floating AI Assistant Trigger */}
            <div style={{ position: 'fixed', bottom: '32px', right: '32px', zIndex: 100 }}>
                <button
                    onClick={() => window.open('https://notebooklm.google.com/notebook/0ee30281-09bf-4d58-9bc6-7cfc804552bf', '_blank')}
                    style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                        color: 'white',
                        border: 'none',
                        boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.4)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'transform 0.2s'
                    }}
                    onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                    onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                    title="Ask Job History AI"
                >
                    <Brain size={28} />
                </button>
            </div>
        </div>
    );
}
