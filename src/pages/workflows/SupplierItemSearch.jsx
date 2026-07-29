import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, ChevronDown, Building2, Globe, MapPin, Mail, Phone, Loader2, ShieldCheck, Wrench, Award } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const SERVICE_TYPES = [
    { value: 'new_supply', label: 'New Supply' },
    { value: 'spare_parts', label: 'Spare Parts' },
    { value: 'repair', label: 'Repair' },
    { value: 'recondition', label: 'Recondition' },
    { value: 'service_attendance', label: 'Service Attendance' },
    { value: 'calibration', label: 'Calibration' },
    { value: 'rental', label: 'Rental' },
    { value: 'inspection', label: 'Inspection' },
    { value: 'consumables', label: 'Consumables' }
];

export default function SupplierItemSearch() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [service, setService] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    const runSearch = useCallback(async (term, svc) => {
        if (!term.trim() || !profile?.company_id) {
            setResults([]);
            setSearched(false);
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('search_partners_by_capability', {
                p_company_id: profile.company_id,
                p_query: term.trim(),
                p_service: svc || null,
                p_country: null,
                p_limit: 50
            });
            if (error) throw error;
            setResults(data || []);
        } catch (err) {
            console.error('Supplier capability search failed', err);
            toast.error(`Search failed: ${err.message || 'Please try again.'}`);
            setResults([]);
        } finally {
            setSearched(true);
            setLoading(false);
        }
    }, [profile?.company_id]);

    useEffect(() => {
        const timer = setTimeout(() => runSearch(query, service), 350);
        return () => clearTimeout(timer);
    }, [query, service, runSearch]);

    return (
        <div style={{ background: '#f8fafc', minHeight: '100%', padding: '32px', color: '#334155', borderRadius: '16px', position: 'relative' }}>
            <header style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', margin: '0 0 8px 0' }}>Supplier Search by Item</h1>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>Find suppliers by equipment, maker, or category and the service type they can provide</p>
            </header>

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flex: 1, minWidth: '400px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', color: '#94a3b8' }}>
                        <Search size={18} />
                    </div>
                    <input
                        type="text"
                        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '8px 0', fontSize: '0.95rem', color: '#334155' }}
                        placeholder="Search by item, equipment category, or maker (e.g. Wartsila fuel pump)..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>

                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 16px', gap: '8px' }}>
                    <Filter size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                    <select
                        value={service}
                        onChange={(e) => setService(e.target.value)}
                        style={{ appearance: 'none', background: 'transparent', border: 'none', outline: 'none', color: '#475569', fontSize: '0.9rem', fontWeight: 500, padding: '10px 24px 10px 0', cursor: 'pointer', width: '100%', minWidth: '200px' }}
                    >
                        <option value="">All Service Types</option>
                        {SERVICE_TYPES.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </select>
                    <ChevronDown size={14} color="#94a3b8" style={{ position: 'absolute', right: '16px', pointerEvents: 'none' }} />
                </div>
            </div>

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                    <Loader2 className="animate-spin" size={32} style={{ marginBottom: '16px', display: 'inline-block' }} />
                    <p>Searching supplier capabilities...</p>
                </div>
            ) : !query.trim() ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '80px 40px', background: '#fff' }}>
                    <div style={{ width: '64px', height: '64px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                        <Search size={32} color="#94a3b8" />
                    </div>
                    <h3 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>Search for a supplier by item</h3>
                    <p style={{ margin: 0, color: '#64748b' }}>Type an equipment name, category, or maker above to find suppliers who can provide it.</p>
                </div>
            ) : searched && results.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '80px 40px', background: '#fff' }}>
                    <div style={{ width: '64px', height: '64px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                        <Search size={32} color="#94a3b8" />
                    </div>
                    <h3 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>No matching suppliers found</h3>
                    <p style={{ margin: 0, color: '#64748b' }}>No suppliers matched "{query}"{service ? ` for ${SERVICE_TYPES.find(s => s.value === service)?.label}` : ''}. Try a broader term or a different service type.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '24px' }}>
                    {results.map(res => (
                        <div key={res.partner_id} style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0', position: 'relative', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', cursor: 'pointer' }} onClick={() => navigate(`/partners/${res.partner_id}`)}>

                            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                                <div style={{ width: '48px', height: '48px', background: '#e0e7ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}>
                                    <Building2 size={24} />
                                </div>
                                <div style={{ flex: 1, paddingRight: '24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>{res.partner_name}</h3>
                                        {res.website && (
                                            <a href={res.website.trim().startsWith('http') ? res.website.trim() : `https://${res.website.trim()}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#6366f1', display: 'flex', alignItems: 'center' }} title="Visit Website">
                                                <Globe size={16} />
                                            </a>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.85rem' }}>
                                        <MapPin size={14} /> {[res.city, res.country].filter(Boolean).join(', ') || 'No Location'}
                                        {res.is_authorised && (
                                            <div style={{
                                                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px',
                                                padding: '2px 8px', background: '#ecfdf5', borderRadius: '6px',
                                                color: '#059669', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #a7f3d0'
                                            }} title="Authorised Dealer/Service Provider">
                                                <ShieldCheck size={12} /> AUTHORISED
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.9rem' }}>
                                    <Mail size={16} /> {res.email || 'No email provided'}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.9rem' }}>
                                    <Phone size={16} /> {res.phone || 'No phone provided'}
                                </div>
                            </div>

                            {res.services && res.services.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                                    {res.services.map((svc, i) => (
                                        <span key={i} style={{ background: '#eef2ff', color: '#4f46e5', fontSize: '0.75rem', padding: '4px 10px', borderRadius: '16px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Wrench size={11} /> {SERVICE_TYPES.find(s => s.value === svc)?.label || svc}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {res.makers && res.makers.length > 0 && (
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px' }}>
                                    Makers: <span style={{ color: '#475569' }}>{res.makers.join(', ')}</span>
                                </div>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#94a3b8' }}>
                                <Award size={12} /> Matched on {res.matched_on || 'capability'} &middot; {res.evidence_count} record{res.evidence_count === 1 ? '' : 's'}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
