import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Save, Trash2, Plus, Edit2, Building2, User, Ship, MapPin, Loader2, Sparkles, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { researchVesselWithGemini } from '../../lib/geminiService';
import { runUniversalSearch } from '../../lib/universalFinder';

/**
 * Universal Modal for CRUD (Create, Edit/Amend, Delete) on Supabase reference datasets:
 * - Partner / Customer
 * - Contact Person
 * - Vessel / Ship
 * - Work Location / Shipyard
 */
export default function DropdownCrudModal({
    isOpen,
    onClose,
    type = 'partner', // 'partner' | 'contact' | 'vessel' | 'location'
    mode = 'create',  // 'create' | 'edit'
    initialData = null,
    companyId = null,
    partners = [], // reference for contact partner link
    vessels = [], // reference for duplicate vessel detection
    onSuccess // callback with updated item
}) {
    const [loading, setLoading] = useState(false);
    const [isAiResearching, setIsAiResearching] = useState(false);
    const [formData, setFormData] = useState({});

    // Real-time Duplicate Vessel Detection Logic
    const duplicateVessel = React.useMemo(() => {
        if (type !== 'vessel' || !formData.vessel_name || formData.vessel_name.trim().length < 2) {
            return null;
        }
        const cleanStr = (s) => (s || '').toLowerCase().replace(/^(mv|mt|ss|m\/v|m\/t)\b/gi, '').replace(/[^a-z0-9]/gi, '').trim();
        const targetNorm = cleanStr(formData.vessel_name);
        if (!targetNorm) return null;

        return vessels.find(v => {
            if (mode === 'edit' && v.id === formData.id) return false;
            const vNorm = cleanStr(v.vessel_name || v.name);
            return vNorm === targetNorm || (targetNorm.length >= 3 && vNorm.includes(targetNorm));
        });
    }, [type, formData.vessel_name, formData.id, mode, vessels]);

    const handleAiVesselSearch = async () => {
        const queryName = formData.vessel_name || formData.name;
        if (!queryName && !formData.imo_number) {
            toast.error("Please enter a Vessel / Ship Name or IMO Number first.");
            return;
        }

        setIsAiResearching(true);
        try {
            let searchContext = '';
            try {
                const query = `${queryName || ''} ${formData.imo_number || ''}`.trim();
                const searchId = await runUniversalSearch({
                    query: `${query} vessel details (site:marinetraffic.com OR site:vesselfinder.com OR site:equasis.org)`,
                    userId: '00000000-0000-0000-0000-000000000000'
                });

                const { data: results } = await supabase
                    .from('search_results')
                    .select('title, snippet, url')
                    .eq('search_id', searchId)
                    .limit(5);

                if (results && results.length > 0) {
                    searchContext = results.map(r => `[Maritime Data] ${r.title} (${r.url}): ${r.snippet}`).join('\n');
                }
            } catch (searchErr) {
                console.warn('[AI] Live search context unavailable, relying on AI model knowledge.');
            }

            const result = await researchVesselWithGemini(queryName, formData.imo_number, '', searchContext);

            if (result && result.fields) {
                const f = result.fields;
                setFormData(prev => ({
                    ...prev,
                    vessel_name: f.vessel_name || prev.vessel_name || prev.name || queryName,
                    imo_number: f.imo_number || prev.imo_number || '',
                    vessel_type: f.vessel_type || prev.vessel_type || 'Tug Boat',
                    vessel_owner: f.vessel_owner || f.vessel_management || prev.vessel_owner || ''
                }));
                toast.success(`AI Auto-filled vessel details for "${f.vessel_name || queryName}"!`);
            } else {
                toast.error("Could not fetch vessel details via AI.");
            }
        } catch (err) {
            console.error("AI Vessel Search Error:", err);
            toast.error("Error searching vessel: " + (err.message || 'Unknown error'));
        } finally {
            setIsAiResearching(false);
        }
    };

    const handleGoogleVesselSearch = () => {
        const queryName = (formData.vessel_name || formData.name || '').trim();
        const imo = (formData.imo_number || '').trim();
        const query = [queryName, imo].filter(Boolean).join(' ');

        if (!query) {
            toast.error("Please enter a Vessel / Ship Name or IMO Number first.");
            return;
        }

        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' vessel')}`;
        window.open(searchUrl, '_blank', 'noopener,noreferrer');
    };

    const handleGoogleCompanyNameSearch = () => {
        const name = (formData.name || '').trim();
        if (!name) {
            toast.error("Please enter a Company / Customer Name first.");
            return;
        }
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(name + ' company')}`;
        window.open(searchUrl, '_blank', 'noopener,noreferrer');
    };

    const handleGoogleUenSearch = () => {
        const uen = (formData.uen || '').trim();
        const name = (formData.name || '').trim();
        if (!uen && !name) {
            toast.error("Please enter a UEN / Tax Registration Number first.");
            return;
        }
        const query = uen ? `${uen} Singapore UEN company` : `${name} UEN company`;
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        window.open(searchUrl, '_blank', 'noopener,noreferrer');
    };

    useEffect(() => {
        if (mode === 'edit' && initialData) {
            setFormData(initialData);
        } else {
            // Default initial state for create mode
            if (type === 'partner') {
                setFormData({ name: '', city: '', country: 'Singapore', email1: '', phone1: '', uen: '', address: '' });
            } else if (type === 'contact') {
                setFormData({ 
                    name: '', 
                    email: '', 
                    phone: '', 
                    partnerId: initialData?.partnerId || initialData?.partner_id || '' 
                });
            } else if (type === 'vessel') {
                setFormData({ 
                    vessel_name: initialData?.vessel_name || initialData?.name || '', 
                    imo_number: initialData?.imo_number || '', 
                    vessel_type: initialData?.vessel_type || 'Tug Boat', 
                    vessel_owner: initialData?.vessel_owner || '' 
                });
            } else if (type === 'location') {
                setFormData({ location_name: '', pincode: '', address: '' });
            }
        }
    }, [mode, initialData, type, isOpen]);

    if (!isOpen) return null;

    const titles = {
        partner: mode === 'edit' ? 'Amend Customer / Partner Details' : 'Add New Customer / Partner',
        contact: mode === 'edit' ? 'Amend Contact Person Details' : 'Add New Contact Person',
        vessel: mode === 'edit' ? 'Amend Vessel / Ship Details' : 'Add New Vessel / Ship',
        location: mode === 'edit' ? 'Amend Work Location / Shipyard Details' : 'Add New Work Location / Shipyard'
    };

    const icons = {
        partner: Building2,
        contact: User,
        vessel: Ship,
        location: MapPin
    };

    const Icon = icons[type] || Building2;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            let resData = null;
            let tableName = '';

            if (type === 'partner') {
                tableName = 'partners';
                const payload = {
                    name: formData.name,
                    city: formData.city || null,
                    country: formData.country || 'Singapore',
                    email1: formData.email1 || null,
                    phone1: formData.phone1 || null,
                    uen: formData.uen || null,
                    address: formData.address || null,
                    ...(mode === 'create' && companyId ? { company_id: companyId } : {})
                };

                if (mode === 'edit' && formData.id) {
                    const { data, error } = await supabase.from(tableName).update(payload).eq('id', formData.id).select().single();
                    if (error) throw error;
                    resData = data;
                } else {
                    const { data, error } = await supabase.from(tableName).insert(payload).select().single();
                    if (error) throw error;
                    resData = data;
                }
            } else if (type === 'contact') {
                tableName = 'contacts';
                const payload = {
                    name: formData.name,
                    email: formData.email || null,
                    phone: formData.phone || null,
                    partnerId: formData.partnerId || null,
                    ...(mode === 'create' && companyId ? { company_id: companyId } : {})
                };

                if (mode === 'edit' && formData.id) {
                    const { data, error } = await supabase.from(tableName).update(payload).eq('id', formData.id).select().single();
                    if (error) throw error;
                    resData = data;
                } else {
                    const { data, error } = await supabase.from(tableName).insert(payload).select().single();
                    if (error) throw error;
                    resData = data;
                }
            } else if (type === 'vessel') {
                tableName = 'vessels';
                const payload = {
                    vessel_name: formData.vessel_name || formData.name,
                    imo_number: formData.imo_number || null,
                    vessel_type: formData.vessel_type || 'Tug Boat',
                    vessel_owner: formData.vessel_owner || null,
                    ...(mode === 'create' && companyId ? { company_id: companyId } : {})
                };

                if (mode === 'edit' && formData.id) {
                    const { data, error } = await supabase.from(tableName).update(payload).eq('id', formData.id).select().single();
                    if (error) throw error;
                    resData = data;
                } else {
                    const { data, error } = await supabase.from(tableName).insert(payload).select().single();
                    if (error) throw error;
                    resData = data;
                }
            } else if (type === 'location') {
                tableName = 'work_locations';
                const payload = {
                    location_name: formData.location_name || formData.name,
                    pincode: formData.pincode || null,
                    ...(mode === 'create' && companyId ? { company_id: companyId } : {})
                };

                if (mode === 'edit' && formData.id) {
                    const { data, error } = await supabase.from(tableName).update(payload).eq('id', formData.id).select().single();
                    if (error) throw error;
                    resData = data;
                } else {
                    const { data, error } = await supabase.from(tableName).insert(payload).select().single();
                    if (error) throw error;
                    resData = data;
                }
            }

            toast.success(mode === 'edit' ? 'Record amended successfully!' : 'New record created!');
            if (onSuccess) onSuccess(resData);
            onClose();
        } catch (err) {
            console.error('Error saving record:', err);
            toast.error('Failed to save record: ' + (err.message || 'Database error'));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!formData.id) return;
        if (!window.confirm(`Are you sure you want to delete this record? This action cannot be undone.`)) return;

        setLoading(true);
        try {
            const tableNames = { partner: 'partners', contact: 'contacts', vessel: 'vessels', location: 'work_locations' };
            const { error } = await supabase.from(tableNames[type]).delete().eq('id', formData.id);
            if (error) throw error;

            toast.success('Record deleted.');
            if (onSuccess) onSuccess({ deletedId: formData.id });
            onClose();
        } catch (err) {
            console.error('Error deleting record:', err);
            toast.error('Failed to delete record: ' + (err.message || 'Database error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
            zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px'
        }}>
            <div style={{
                background: '#fff', borderRadius: '16px', maxWidth: '550px', width: '100%',
                padding: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', position: 'relative'
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ background: '#eff6ff', color: '#2563eb', padding: '8px', borderRadius: '10px' }}>
                            <Icon size={20} />
                        </div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                            {titles[type]}
                        </h3>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                    {/* PARTNER / CUSTOMER FIELDS */}
                    {type === 'partner' && (
                        <>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                                        Company / Customer Name *
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleGoogleCompanyNameSearch}
                                        style={{
                                            background: '#ffffff',
                                            color: '#2563eb',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '6px',
                                            padding: '3px 10px',
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                        }}
                                        title="Search company name on Google in a new window"
                                    >
                                        <Search size={12} /> Google Search
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    required
                                    value={formData.name || ''}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. Pacific Ocean Lines Pte Ltd"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px', color: '#475569' }}>City</label>
                                    <input
                                        type="text"
                                        value={formData.city || ''}
                                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                        placeholder="Singapore"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                    />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>UEN / Tax Reg</label>
                                        <button
                                            type="button"
                                            onClick={handleGoogleUenSearch}
                                            style={{
                                                background: '#ffffff',
                                                color: '#2563eb',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '6px',
                                                padding: '3px 10px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                            }}
                                            title="Search UEN / Tax Registration Number on Google in a new window"
                                        >
                                            <Search size={12} /> Google Search
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        value={formData.uen || ''}
                                        onChange={(e) => setFormData({ ...formData, uen: e.target.value })}
                                        placeholder="201435227C"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px', color: '#475569' }}>Email</label>
                                    <input
                                        type="email"
                                        value={formData.email1 || ''}
                                        onChange={(e) => setFormData({ ...formData, email1: e.target.value })}
                                        placeholder="enquiry@customer.com"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px', color: '#475569' }}>Phone</label>
                                    <input
                                        type="text"
                                        value={formData.phone1 || ''}
                                        onChange={(e) => setFormData({ ...formData, phone1: e.target.value })}
                                        placeholder="+65 6789 0000"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* CONTACT PERSON FIELDS */}
                    {type === 'contact' && (
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px', color: '#475569' }}>
                                    Full Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name || ''}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. John Tan / Capt. David"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px', color: '#475569' }}>
                                    Link to Customer / Partner
                                </label>
                                <select
                                    value={formData.partnerId || formData.partner_id || ''}
                                    onChange={(e) => setFormData({ ...formData, partnerId: e.target.value, partner_id: e.target.value })}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', background: '#fff' }}
                                >
                                    <option value="">-- Optional: Select Customer / Partner --</option>
                                    {partners.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} {p.city ? `(${p.city})` : ''}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px', color: '#475569' }}>Email</label>
                                    <input
                                        type="email"
                                        value={formData.email || ''}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="john@customer.com"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px', color: '#475569' }}>Phone</label>
                                    <input
                                        type="text"
                                        value={formData.phone || ''}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        placeholder="+65 9123 4567"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* VESSEL FIELDS */}
                    {type === 'vessel' && (
                        <>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                                        Vessel / Ship Name *
                                    </label>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        <button
                                            type="button"
                                            onClick={handleAiVesselSearch}
                                            disabled={isAiResearching || (!formData.vessel_name && !formData.name && !formData.imo_number)}
                                            style={{
                                                background: isAiResearching 
                                                    ? '#f1f5f9' 
                                                    : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                                color: isAiResearching ? '#64748b' : '#ffffff',
                                                border: 'none',
                                                borderRadius: '6px',
                                                padding: '3px 10px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                cursor: isAiResearching ? 'not-allowed' : 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                boxShadow: isAiResearching ? 'none' : '0 2px 6px rgba(79, 70, 229, 0.25)'
                                            }}
                                            title="Search web & AI for IMO number, vessel type, and owner details"
                                        >
                                            {isAiResearching ? (
                                                <>
                                                    <Loader2 size={12} className="animate-spin" /> Auto-Searching AI...
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles size={12} /> AI Search &amp; Autofill
                                                </>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleGoogleVesselSearch}
                                            style={{
                                                background: '#ffffff',
                                                color: '#2563eb',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '6px',
                                                padding: '3px 10px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                            }}
                                            title="Search vessel name in Google in a new window"
                                        >
                                            <Search size={12} /> Google Search
                                        </button>
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    required
                                    value={formData.vessel_name || formData.name || ''}
                                    onChange={(e) => setFormData({ ...formData, vessel_name: e.target.value })}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            // Trigger AI search if fields are not filled
                                            if (!formData.imo_number) {
                                                e.preventDefault();
                                                handleAiVesselSearch();
                                            }
                                        }
                                    }}
                                    placeholder="e.g. MV OCEAN VOYAGER"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                />
                                {duplicateVessel && (
                                    <div style={{
                                        marginTop: '8px',
                                        background: '#fffbebfb',
                                        border: '1px solid #fcd34d',
                                        borderRadius: '8px',
                                        padding: '8px 12px',
                                        fontSize: '0.78rem',
                                        color: '#92400e',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '8px'
                                    }}>
                                        <div>
                                            <strong style={{ color: '#b45309' }}>⚠️ Potential Duplicate Found:</strong> "{duplicateVessel.vessel_name || duplicateVessel.name}"
                                            {duplicateVessel.imo_number && <span> (IMO: {duplicateVessel.imo_number})</span>}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                toast.success(`Selected existing vessel "${duplicateVessel.vessel_name || duplicateVessel.name}"`);
                                                onSuccess(duplicateVessel);
                                                onClose();
                                            }}
                                            style={{
                                                background: '#d97706',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: '6px',
                                                padding: '4px 10px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                flexShrink: 0
                                            }}
                                        >
                                            Use Existing
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px', color: '#475569' }}>IMO Number</label>
                                    <input
                                        type="text"
                                        value={formData.imo_number || ''}
                                        onChange={(e) => setFormData({ ...formData, imo_number: e.target.value })}
                                        placeholder="IMO 9876543"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px', color: '#475569' }}>Vessel Type</label>
                                    <select
                                        value={formData.vessel_type || 'Tug Boat'}
                                        onChange={(e) => setFormData({ ...formData, vessel_type: e.target.value })}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', background: '#fff' }}
                                    >
                                        <option value="Tug Boat">Tug Boat</option>
                                        <option value="Barge">Barge</option>
                                        <option value="Container Ship">Container Ship</option>
                                        <option value="Tanker">Tanker</option>
                                        <option value="Bulk Carrier">Bulk Carrier</option>
                                        <option value="Supply Vessel">Supply Vessel</option>
                                        <option value="Cargo Ship">Cargo Ship</option>
                                        <option value="Passenger / Cruise">Passenger / Cruise</option>
                                        <option value="Offshore / Workboat">Offshore / Workboat</option>
                                        <option value="Others">Others</option>
                                    </select>
                                </div>
                            </div>
                            {(formData.vessel_owner || mode === 'edit') && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px', color: '#475569' }}>Vessel Owner / Manager</label>
                                    <input
                                        type="text"
                                        value={formData.vessel_owner || ''}
                                        onChange={(e) => setFormData({ ...formData, vessel_owner: e.target.value })}
                                        placeholder="Owner or management company"
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                    />
                                </div>
                            )}
                        </>
                    )}

                    {/* WORK LOCATION FIELDS */}
                    {type === 'location' && (
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px', color: '#475569' }}>
                                    Work Location / Shipyard Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.location_name || formData.name || ''}
                                    onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                                    placeholder="e.g. Tuas Shipyard / Jalan Pesawat"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px', color: '#475569' }}>Pincode / Postal Code</label>
                                <input
                                    type="text"
                                    value={formData.pincode || ''}
                                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                                    placeholder="636996"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                                />
                            </div>
                        </>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                        {mode === 'edit' && formData.id ? (
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={loading}
                                style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 14px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <Trash2 size={16} /> Delete Record
                            </button>
                        ) : <div />}

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={loading}
                                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 16px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                {mode === 'edit' ? 'Save Amendments' : 'Create Record'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
