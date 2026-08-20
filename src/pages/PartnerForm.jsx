import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { 
    Save, ArrowLeft, X, Plus, ExternalLink, Globe, Building2, 
    MessageSquare, Sparkles, Search, Loader2, Check, RotateCcw, 
    UserPlus, Mail, Phone, MapPin, User, Users, Edit, Trash2, Briefcase 
} from 'lucide-react';
import { 
    getPartners, savePartner, getContactsByPartner, deleteContact, 
    uploadFile, saveContact, getCategories, saveCategory 
} from '../lib/store';
import { useAuth } from '../contexts/AuthContext';
import { smartSearchCompany, researchContactWithGemini, parseOCRBusinessCard } from '../lib/geminiService';
import BusinessCardUpload from '../components/common/BusinessCardUpload';
import CompanyAutocomplete from '../components/common/CompanyAutocomplete';
import PartnerDocuments from '../components/partners/PartnerDocuments';
import { COUNTRIES, PARTNER_CATEGORIES } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { runUniversalSearch } from '../lib/universalFinder';
import toast from 'react-hot-toast';

export default function PartnerForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const isNew = id === 'new';
    const quillRef = useRef(null);

    const [formData, setFormData] = useState({
        types: [],
        others: '',
        name: '',
        uen: '',
        company_type: '',
        address: '',
        city: '',
        pincode: '',
        country: '',
        email1: '',
        email2: '',
        phone1: '',
        phone2: '',
        weblink: '',
        info: '',
        customerCredit: '',
        supplierCredit: '',
        customerCreditTime: '',
        supplierCreditTime: '',
        business_card_url: '',
        business_card_back_url: '',
        gdrive_folder_id: '',
        google_drive_link: '',
        activity_summary: '',
        is_shared: false
    });

    const [primaryContact, setPrimaryContact] = useState({
        name: '',
        post: '',
        department: '',
        email: '',
        handphone: ''
    });

    const [isAiResearching, setIsAiResearching] = useState(false);
    const [aiPreview, setAiPreview] = useState(null);
    const [showQuickContact, setShowQuickContact] = useState(false);
    const aiTimeoutRef = useRef(null);

    const [typeInput, setTypeInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('details'); // 'details' or 'documents'
    const [dbCategories, setDbCategories] = useState([]);

    const [draftMatches, setDraftMatches] = useState([]);

    useEffect(() => {
        if (!formData.name && !formData.uen) {
            setDraftMatches([]);
            return;
        }

        const delayDebounce = setTimeout(async () => {
            try {
                let query = supabase
                    .from('partners')
                    .select('*, contacts(*)')
                    .eq('status', 'pending_approval');
                
                const nameVal = formData.name ? formData.name.trim() : '';
                const uenVal = formData.uen ? formData.uen.trim() : '';
                
                if (nameVal && uenVal) {
                    query = query.or(`name.ilike.%${nameVal}%,uen.ilike.%${uenVal}%`);
                } else if (nameVal) {
                    query = query.ilike('name', `%${nameVal}%`);
                } else if (uenVal) {
                    query = query.ilike('uen', `%${uenVal}%`);
                } else {
                    return;
                }

                const { data, error } = await query.limit(5);
                if (error) throw error;

                // Avoid matching the current edited partner if we imported it
                const filtered = (data || []).filter(d => d.id !== formData.id);
                setDraftMatches(filtered);
            } catch (err) {
                console.error('Failed to search drafts in partner form:', err);
            }
        }, 400);

        return () => clearTimeout(delayDebounce);
    }, [formData.name, formData.uen, formData.id]);

    const handleImportAndApproveDraft = (draft) => {
        const updated = {
            ...formData,
            id: draft.id,
            name: draft.name || '',
            uen: draft.uen || '',
            address: draft.address || '',
            country: draft.country || '',
            city: draft.city || '',
            pincode: draft.postal_code || '',
            email1: draft.email1 || '',
            phone1: draft.phone1 || '',
            weblink: draft.weblink || '',
            brand: draft.brand || draft.brands || '',
            notes: draft.notes || '',
            activity_summary: draft.business_scope || '',
            status: 'new'
        };
        setFormData(updated);

        // Populate contact if exists
        const contact = draft.contacts?.[0] || {};
        setPrimaryContact({
            id: contact.id || '',
            name: contact.name || '',
            post: contact.post || '',
            department: contact.department || '',
            email: contact.email || '',
            handphone: contact.handphone || ''
        });

        toast.success(`Imported and prepared draft: ${draft.name}`);
        setDraftMatches([]);
    };

    const modules = {
        toolbar: [
            [{ 'header': [1, 2, false] }],
            ['bold', 'italic', 'underline', 'strike', 'blockquote'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
            ['link', 'image'],
            ['clean']
        ]
    };

    const SAFETY_TIMEOUT_MS = 10000; // 10 seconds max for any AI research

    const handleAiAutofill = async () => {
        if (!formData.name) return alert('Please enter a Company Name first.');
        
        setIsAiResearching(true);

        // Safety timeout: force-unblock the UI after 10 seconds regardless
        aiTimeoutRef.current = setTimeout(() => {
            console.warn('[AI Safety] Research timed out after 10s. Unblocking UI.');
            setIsAiResearching(false);
            setAiPreview({
                error: 'Registry search timed out. You can still fill in details manually and save.',
                confidence: 'none',
                manual_verification_required: true
            });
        }, SAFETY_TIMEOUT_MS);

        try {
            // Gather live context using Universal Search
            let searchContext = '';
            try {
                const { data: { user } } = await supabase.auth.getUser();
                const searchId = await runUniversalSearch({ 
                    query: formData.name, 
                    userId: user?.id || '00000000-0000-0000-0000-000000000000' 
                });
                
                const { data: results } = await supabase
                    .from('search_results')
                    .select('title, snippet, url, pagemap')
                    .eq('search_id', searchId)
                    .limit(5);
                
                if (results && results.length > 0) {
                    searchContext = results.map(r => {
                        const addr = r.pagemap?.address;
                        const addrStr = addr ? ` [Structured Address: ${addr.road || ''}, ${addr.city || addr.town || ''}, ${addr.country || ''} ${addr.postcode || ''}]` : '';
                        return `[Web Data] ${r.title} (${r.url}): ${r.snippet}${addrStr}`;
                    }).join('\n');
                }
            } catch (searchErr) {
                console.warn('[AI] Live search unavailable, using model intelligence only.');
            }

            const result = await smartSearchCompany(formData.name, formData.weblink, searchContext);

            if (result) {
                setAiPreview({
                    uen: result.uen || '',
                    address: result.address || '',
                    country: result.country || '',
                    city: result.city || '',
                    pincode: result.postal_code || '',
                    email1: result.email || '',
                    phone1: result.phone || '',
                    website: result.website || '',
                    categories: result.categories || [],
                    brands: result.brands || '',
                    activity_summary: result.activity_summary || '',
                    confidence: result.confidence || 'low',
                    manual_verification_required: result.manual_verification_required,
                    extraInfo: `Categories: ${result.categories?.join(', ') || 'N/A'}. Brands: ${result.brands || 'N/A'}. Activity: ${result.activity_summary || 'N/A'}`
                });
            }
        } catch (err) {
            console.error('AI Research Error:', err);
            setAiPreview({
                error: err.message || 'Unknown Research Error',
                confidence: 'none',
                manual_verification_required: true
            });
        } finally {
            clearTimeout(aiTimeoutRef.current);
            setIsAiResearching(false);
        }
    };

    const handlePhotonResearch = async () => {
        if (!formData.weblink && !formData.name) return alert('Please enter a Website or Company Name.');
        
        setIsAiResearching(true);

        // Safety timeout: force-unblock the UI after 10 seconds regardless
        aiTimeoutRef.current = setTimeout(() => {
            console.warn('[AI Safety] Photon research timed out after 10s. Unblocking UI.');
            setIsAiResearching(false);
            setAiPreview({
                error: 'Research timed out. You can still fill in details manually and save.',
                confidence: 'none',
                manual_verification_required: true
            });
        }, SAFETY_TIMEOUT_MS);

        try {
            const response = await fetch('/api/research/photon', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    url: formData.weblink, 
                    companyName: formData.name 
                })
            });
            const result = await response.json();
            
            if (result.success) {
                const p = result.data;
                setAiPreview({
                    address: p.address || '',
                    email1: p.emails?.[0] || '',
                    phone1: p.phone || '',
                    website: formData.weblink || '',
                    confidence: p.confidence || 'medium',
                    isPhoton: true,
                    photonData: p,
                    extraInfo: `Photon OSINT Findings: ${p.emails?.length || 0} emails, ${p.subdomains?.length || 0} subdomains found.`
                });
            }
        } catch (err) {
            console.error('Photon Research Error:', err);
            alert('Photon service error: ' + err.message);
        } finally {
            clearTimeout(aiTimeoutRef.current);
            setIsAiResearching(false);
        }
    };

    const applyAiResults = () => {
        if (!aiPreview) return;
        setFormData(prev => ({
            ...prev,
            uen: aiPreview.uen || prev.uen,
            address: aiPreview.address || prev.address,
            country: aiPreview.country || prev.country,
            city: aiPreview.city || prev.city,
            pincode: aiPreview.pincode || prev.pincode,
            email1: aiPreview.email1 || prev.email1,
            phone1: aiPreview.phone1 || prev.phone1,
            weblink: aiPreview.website || prev.weblink,
            activity_summary: aiPreview.activity_summary || prev.activity_summary,
            info: aiPreview.activity_summary ? `${prev.info || ''}<p><br></p><p><strong>[AI ACTIVITY SUMMARY]</strong></p><p>${aiPreview.activity_summary}</p>` : (prev.info || '')
        }));
        setAiPreview(null);
    };

    const [partnerContacts, setPartnerContacts] = useState([]);
    const [contactsLoading, setContactsLoading] = useState(false);
    const [showContactModal, setShowContactModal] = useState(false);
    const [editingContact, setEditingContact] = useState(null);

    const loadPartnerContacts = useCallback(async (partnerId) => {
        if (!partnerId || partnerId === 'new') return;
        setContactsLoading(true);
        try {
            const list = await getContactsByPartner(partnerId);
            setPartnerContacts(list || []);
        } catch (err) {
            console.error('Error fetching partner contacts:', err);
        } finally {
            setContactsLoading(false);
        }
    }, []);

    useEffect(() => {
        async function load() {
            setLoading(true);
            const [partners, catData] = await Promise.all([
                getPartners(),
                getCategories()
            ]);
            
            if (!isNew) {
                const existing = partners.find(p => p.id === id);
                if (existing) {
                    setFormData(existing);
                }
                await loadPartnerContacts(id);
            }
            setDbCategories(catData.map(c => c.name));
            setLoading(false);
        }
        load();
    }, [id, isNew, loadPartnerContacts]);

    // Automatically trigger Contact modal if launched from Workflow Editor for contact creation / edit
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const action = params.get('action');
        const editContactId = params.get('editContactId');
        
        if (action === 'add_contact' && !isNew) {
            setEditingContact(null);
            setShowContactModal(true);
        } else if (editContactId && partnerContacts.length > 0) {
            const found = partnerContacts.find(c => c.id === editContactId);
            if (found) {
                setEditingContact(found);
                setShowContactModal(true);
            }
        }
    }, [location.search, isNew, partnerContacts]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleEditorChange = (content) => {
        setFormData(prev => ({ ...prev, info: content }));
    };

    const openWebsite = () => {
        const link = (formData.weblink || '').trim();
        if (link) {
            const fullUrl = link.startsWith('http') ? link : `https://${link}`;
            window.open(fullUrl, '_blank');
        } else {
            window.open('https://www.google.com', '_blank');
        }
    };

    const handleCategoryToggle = (cat) => {
        setFormData(prev => ({
            ...prev,
            types: (prev.types || []).includes(cat)
                ? prev.types.filter(t => t !== cat)
                : [...(prev.types || []), cat]
        }));
    };

    const handleAddCustomCategory = async () => {
        const newCat = typeInput.trim();
        if (newCat && !(formData.types || []).includes(newCat)) {
            setFormData(prev => ({
                ...prev,
                types: [...(prev.types || []), newCat]
            }));
            
            // Also save to system-wide categories if it's new
            if (!dbCategories.includes(newCat)) {
                try {
                    await saveCategory({ name: newCat });
                    setDbCategories(prev => Array.from(new Set([...prev, newCat])).sort());
                } catch (err) {
                    console.error("Error saving new category to system list:", err);
                }
            }
            
            setTypeInput('');
        }
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!formData.name) return alert('Partner Name is required');

        setLoading(true);
        try {
            const dataToSave = { ...formData, id: id === 'new' ? formData.id : id };
            if (formData.id && id === 'new') {
                dataToSave.status = 'new';
            }
            if (isNew && profile?.company_id) {
                dataToSave.company_id = profile.company_id;
            }
            // Cleanup empty strings
            if (dataToSave.customerCredit === '') dataToSave.customerCredit = null;
            if (dataToSave.supplierCredit === '') dataToSave.supplierCredit = null;

            const savedPartner = await savePartner(dataToSave);
            
            // Save Primary Contact ONLY for new partner creation if provided
            let savedPrimaryContact = null;
            if (isNew && primaryContact.name && savedPartner?.id) {
                savedPrimaryContact = await saveContact({
                    ...primaryContact,
                    partnerId: savedPartner.id,
                    company_id: profile?.company_id
                });
            }

            // Cross-window synchronization broadcast to Workflow Editor and other tabs
            try {
                const bc = new BroadcastChannel('celron_partner_sync');
                bc.postMessage({
                    type: 'CELRON_PARTNER_SAVED',
                    partnerId: savedPartner.id,
                    partner: savedPartner,
                    contactId: savedPrimaryContact?.id || null
                });
                bc.close();
            } catch (e) {
                console.warn('BroadcastChannel error:', e);
            }

            if (window.opener) {
                try {
                    window.opener.postMessage({
                        type: 'CELRON_PARTNER_SAVED',
                        partnerId: savedPartner.id,
                        partner: savedPartner,
                        contactId: savedPrimaryContact?.id || null
                    }, '*');
                } catch (e) {}
            }

            toast.success(isNew ? 'Partner created successfully! (Synced with Workflow)' : 'Partner updated successfully! (Synced with Workflow)');
            navigate('/partners');
        } catch (err) {
            console.error("SUPABASE SAVE ERROR:", err);
            alert(`Error saving partner: ${err.message || 'Check console.'}`);
            setLoading(false);
        }
    };

    const handleCompanySelect = (place) => {
        const address = place.formatted_address || '';
        const name = place.name || '';
        const weblink = place.website || '';

        let country = '';
        let city = '';
        let pincode = '';
        place.address_components?.forEach(c => {
            if (c.types.includes('country')) country = c.long_name;
            if (c.types.includes('locality')) city = c.long_name;
            if (c.types.includes('postal_code')) pincode = c.long_name;
        });

        setFormData(prev => ({
            ...prev,
            name,
            address,
            city: city || prev.city,
            pincode: pincode || prev.pincode,
            country: country || prev.country,
            weblink: weblink || prev.weblink
        }));
    };

    const handleOCR = (text) => {
        if (!text) return;
        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const phoneMatch = text.match(/[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}/);
        const webMatch = text.match(/(https?:\/\/)?(www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/i);

        setFormData(prev => ({
            ...prev,
            email1: prev.email1 || emailMatch?.[0] || '',
            phone1: prev.phone1 || phoneMatch?.[0] || '',
            weblink: prev.weblink || webMatch?.[0] || '',
            info: (prev.info || '') + `<p><br></p><p><strong>[OCR EXTRACTED TEXT]</strong></p><p>${text.replace(/\n/g, '<br>')}</p>`
        }));
    };

    const isCustomerSelected = (formData.types || []).includes('Customer');
    const isSupplierSelected = (formData.types || []).includes('Supplier');

    if (loading && !isNew) return <div style={{ padding: '40px' }}>Loading partner data...</div>;

    return (
        <div className="animate-fade-in" style={{ padding: '24px' }}>
            <div className="page-header" style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className="btn btn-secondary" style={{ padding: '8px' }} onClick={() => navigate('/partners')}>
                        <ArrowLeft size={20} />
                    </button>
                    <h2 className="page-title">{isNew ? 'New Partner' : 'Edit Partner'}</h2>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Save size={18} />
                        {loading ? 'Saving...' : 'Save Partner'}
                    </button>
                </div>
            </div>

            <div style={{ borderBottom: '1px solid #e2e8f0', marginBottom: '32px', display: 'flex', gap: '24px' }}>
                <button
                    className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`}
                    onClick={() => setActiveTab('details')}
                    style={{
                        padding: '12px 16px',
                        border: 'none',
                        background: 'none',
                        borderBottom: activeTab === 'details' ? '3px solid #6366f1' : '3px solid transparent',
                        color: activeTab === 'details' ? '#6366f1' : '#64748b',
                        fontWeight: activeTab === 'details' ? 700 : 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s'
                    }}
                >
                    <Building2 size={18} /> 1. Partner Details
                </button>
                <button
                    className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
                    onClick={() => setActiveTab('documents')}
                    style={{
                        padding: '12px 16px',
                        border: 'none',
                        background: 'none',
                        borderBottom: activeTab === 'documents' ? '3px solid #6366f1' : '3px solid transparent',
                        color: activeTab === 'documents' ? '#6366f1' : '#64748b',
                        fontWeight: activeTab === 'documents' ? 700 : 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s'
                    }}
                >
                    <MapPin size={18} /> 2. Documents & Verification
                </button>
            </div>

            {activeTab === 'details' ? (
                <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        
                        {/* AI Research Banner */}
                        <div className="glass-panel" style={{ padding: '20px', background: 'linear-gradient(to right, #f8fafc, #f1f5f9)', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: aiPreview ? '20px' : '0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ position: 'relative', width: '40px', height: '40px', background: 'var(--ai-gradient)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)' }}>
                                        <Sparkles size={20} />
                                        {isAiResearching && <div className="ai-pulse" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: '12px' }} />}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#4338ca' }}>Intelligent Auto-fill</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Research company details with Antigravity AI</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button
                                        type="button"
                                        onClick={handleAiAutofill}
                                        disabled={isAiResearching || !formData.name}
                                        className="btn"
                                        style={{
                                            background: isAiResearching ? '#e2e8f0' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                            color: 'white',
                                            padding: '10px 20px',
                                            borderRadius: '12px',
                                            fontSize: '0.9rem',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            border: 'none',
                                            cursor: 'pointer',
                                            boxShadow: isAiResearching ? 'none' : '0 4px 12px rgba(99, 102, 241, 0.2)'
                                        }}
                                    >
                                        {isAiResearching ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                                        {isAiResearching ? 'Researching...' : 'AI Profile'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handlePhotonResearch}
                                        disabled={isAiResearching || (!formData.weblink && !formData.name)}
                                        className="btn"
                                        style={{
                                            background: isAiResearching ? '#e2e8f0' : 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                                            color: 'white',
                                            padding: '10px 20px',
                                            borderRadius: '12px',
                                            fontSize: '0.9rem',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            border: 'none',
                                            cursor: 'pointer',
                                            boxShadow: isAiResearching ? 'none' : '0 4px 12px rgba(14, 165, 233, 0.2)'
                                        }}
                                    >
                                        <Search size={18} />
                                        Crawl with Photon
                                    </button>
                                </div>
                            </div>

                            {aiPreview && (
                                <div className="ai-card-premium animate-fade-in" style={{ padding: '24px', borderRadius: '16px', border: '1px solid #bae6fd' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ padding: '4px 12px', background: aiPreview.error ? '#fee2e2' : 'rgba(16, 185, 129, 0.1)', color: aiPreview.error ? '#ef4444' : '#059669', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>
                                                {aiPreview.error ? 'Research Loop Terminated' : 'Verified Intelligence'}
                                            </div>
                                            {!aiPreview.error && (
                                                <div style={{ padding: '4px 12px', background: aiPreview.confidence === 'high' ? '#dcfce7' : '#fef3c7', color: aiPreview.confidence === 'high' ? '#15803d' : '#92400e', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>
                                                    {aiPreview.confidence} Confidence
                                                </div>
                                            )}
                                        </div>
                                        <button type="button" onClick={() => setAiPreview(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
                                    </div>

                                    {aiPreview.error ? (
                                        <div style={{ color: '#991b1b', fontSize: '0.9rem' }}>{aiPreview.error}</div>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '0.9rem' }}>
                                            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}><strong>UEN:</strong> {aiPreview.uen || '-'}</div>
                                            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}><strong>Email:</strong> {aiPreview.email1 || '-'}</div>
                                            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}><strong>Phone:</strong> {aiPreview.phone1 || '-'}</div>
                                            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}><strong>Website:</strong> {aiPreview.website || '-'}</div>
                                            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}><strong>City:</strong> {aiPreview.city || '-'}</div>
                                            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}><strong>Pincode:</strong> {aiPreview.pincode || '-'}</div>
                                            <div style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}><strong>Address:</strong> {aiPreview.address || '-'}</div>
                                            
                                            {!aiPreview.isPhoton && <div style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}><strong>Brands:</strong> {aiPreview.brands || '-'}</div>}
                                            
                                            {aiPreview.isPhoton && aiPreview.photonData && (
                                                <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    {aiPreview.photonData.emails?.length > 0 && (
                                                        <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                                                            <strong>Found Emails:</strong> {aiPreview.photonData.emails.join(', ')}
                                                        </div>
                                                    )}
                                                    {aiPreview.photonData.subdomains?.length > 0 && (
                                                        <div style={{ background: '#f0f9ff', padding: '12px', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                                                            <strong>Subdomains:</strong> {aiPreview.photonData.subdomains.join(', ')}
                                                        </div>
                                                    )}
                                                    {aiPreview.photonData.social && (
                                                        <div style={{ background: '#faf5ff', padding: '12px', borderRadius: '12px', border: '1px solid #e9d5ff' }}>
                                                            <strong>Social Profiles:</strong> {Object.entries(aiPreview.photonData.social).filter(([k,v]) => v).map(([k,v]) => `${k}: ${v}`).join(' | ')}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {aiPreview.activity_summary && (
                                                <div style={{ gridColumn: 'span 2', background: 'linear-gradient(to right, #f5f3ff, #ede9fe)', padding: '14px', borderRadius: '12px', border: '1px dashed #c7d2fe' }}>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', marginBottom: '4px' }}>Business Activity Insight</div>
                                                    <span style={{ fontSize: '0.85rem', color: '#4338ca', fontStyle: 'italic', lineHeight: 1.6 }}>"{aiPreview.activity_summary}"</span>
                                                </div>
                                            )}
                                            <div style={{ gridColumn: 'span 2', display: 'flex', gap: '12px', marginTop: '12px' }}>
                                                <button type="button" onClick={applyAiResults} className="btn btn-primary" style={{ flex: 1, background: '#10b981', borderColor: '#10b981' }}><Check size={18} /> Apply Intelligence</button>
                                                <button type="button" onClick={() => setAiPreview(null)} className="btn btn-secondary"><RotateCcw size={18} /> Dismiss</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Partner Details Card */}
                        <div className="glass-panel" style={{ background: '#fff', borderRadius: '24px', padding: '40px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', gap: '24px', alignItems: 'center', marginBottom: '40px' }}>
                                <div style={{ width: '64px', height: '64px', background: '#f1f5f9', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Building2 color="#6366f1" size={32} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', margin: 0 }}>Company Name *</label>
                                        {formData.name && (
                                            <a 
                                                href={`https://www.google.com/search?q=${encodeURIComponent(formData.name)}`} 
                                                target="_blank" 
                                                rel="noopener noreferrer" 
                                                style={{ color: '#6366f1', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
                                            >
                                                Search <Search size={12} />
                                            </a>
                                        )}
                                    </div>
                                    <CompanyAutocomplete
                                        value={formData.name || ''}
                                        onChange={(val) => setFormData(prev => ({ ...prev, name: val }))}
                                        onSelect={handleCompanySelect}
                                    />
                                    {draftMatches.length > 0 && (
                                        <div style={{
                                            marginTop: '16px',
                                            padding: '16px',
                                            background: 'rgba(124, 58, 237, 0.08)',
                                            border: '1.5px dashed #c084fc',
                                            borderRadius: '12px',
                                            color: '#5b21b6'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                                <Sparkles size={18} color="#7c3aed" />
                                                <span style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    Scanned Card Drafts Found ({draftMatches.length})
                                                </span>
                                            </div>
                                            <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: '#6d28d9' }}>
                                                A matching record was found in the business card scanner queue. You can import and approve it directly to activate it in the database.
                                            </p>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {draftMatches.map(draft => {
                                                    const contact = draft.contacts?.[0] || {};
                                                    return (
                                                        <div key={draft.id} style={{
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            background: '#fff',
                                                            padding: '10px 14px',
                                                            borderRadius: '10px',
                                                            border: '1px solid #e9d5ff',
                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                                        }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e1b4b' }}>{draft.name}</span>
                                                                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                                                    {draft.uen ? `UEN: ${draft.uen}` : 'No UEN'} • {draft.address || 'No Address'}
                                                                </span>
                                                                {contact.name && (
                                                                    <span style={{ fontSize: '0.75rem', color: '#7c3aed', fontWeight: 500 }}>
                                                                        Rep: {contact.name} ({contact.post || 'Representative'})
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleImportAndApproveDraft(draft)}
                                                                style={{
                                                                    background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                                                                    color: '#fff',
                                                                    border: 'none',
                                                                    padding: '6px 14px',
                                                                    borderRadius: '8px',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    boxShadow: '0 2px 4px rgba(124, 58, 237, 0.2)',
                                                                    transition: 'all 0.2s'
                                                                }}
                                                            >
                                                                Import &amp; Approve
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {/* Address & Location */}
                                <div className="form-group">
                                    <label className="form-label">Full Address</label>
                                    <textarea
                                        className="form-textarea"
                                        name="address"
                                        value={formData.address || ''}
                                        onChange={handleChange}
                                        placeholder="Street, Building, etc."
                                        rows={3}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div className="form-group">
                                        <label className="form-label">City</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            name="city"
                                            value={formData.city || ''}
                                            onChange={handleChange}
                                            placeholder="City"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Pin / ZIP</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            name="pincode"
                                            value={formData.pincode || ''}
                                            onChange={handleChange}
                                            placeholder="e.g. 629851"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Country *</label>
                                        <select
                                            className="form-select"
                                            name="country"
                                            value={formData.country || ''}
                                            onChange={handleChange}
                                            required
                                        >
                                            <option value="">Select Country...</option>
                                            {COUNTRIES.map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Contact Info */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div className="form-group">
                                        <label className="form-label">Primary Phone</label>
                                        <input type="tel" className="form-input" name="phone1" value={formData.phone1 || ''} onChange={handleChange} placeholder="+1..." />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Primary Email *</label>
                                        <input type="email" className="form-input" name="email1" value={formData.email1 || ''} onChange={handleChange} required placeholder="email@company.com" />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <label className="form-label" style={{ margin: 0 }}>Company Website</label>
                                        <a 
                                            href={`https://www.google.com/search?q=${encodeURIComponent(formData.weblink || formData.name || '')}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            style={{ color: '#6366f1', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            Search <Search size={14} />
                                        </a>
                                    </div>
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                        <input
                                            placeholder="https://company.com"
                                            name="weblink"
                                            value={formData.weblink || ''}
                                            onChange={handleChange}
                                            className="form-input"
                                            style={{ paddingRight: '70px' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={openWebsite}
                                            style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                                        >
                                            <ExternalLink size={14} /> Visit
                                        </button>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">UEN No (optional)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        name="uen"
                                        value={formData.uen || ''}
                                        onChange={handleChange}
                                        placeholder="e.g. 201436227C"
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <BusinessCardUpload
                                    frontValue={formData.business_card_url}
                                    backValue={formData.business_card_back_url}
                                    onFrontChange={(url) => setFormData(prev => ({ ...prev, business_card_url: url }))}
                                    onBackChange={(url) => setFormData(prev => ({ ...prev, business_card_back_url: url }))}
                                    onOCR={handleOCR}
                                />

                                {/* Categories */}
                                <div className="form-group">
                                    <label className="form-label">Categories</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                                        {Array.from(new Set([...PARTNER_CATEGORIES, ...dbCategories])).sort().map(cat => (
                                            <div
                                                key={cat}
                                                onClick={() => handleCategoryToggle(cat)}
                                                style={{ padding: '6px 14px', borderRadius: '24px', border: (formData.types || []).includes(cat) ? '1px solid #6366f1' : '1px solid #e2e8f0', background: (formData.types || []).includes(cat) ? '#e0e7ff' : '#fff', color: (formData.types || []).includes(cat) ? '#6366f1' : '#475569', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer' }}
                                            >
                                                {cat}
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            placeholder="Add custom category"
                                            value={typeInput}
                                            onChange={e => setTypeInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCustomCategory())}
                                            className="form-input"
                                            style={{ flex: 1, fontSize: '0.85rem' }}
                                        />
                                        <button type="button" onClick={handleAddCustomCategory} className="btn btn-secondary">Add</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Credit Section */}
                        {(isCustomerSelected || isSupplierSelected) && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', padding: '24px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                {isCustomerSelected && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer Credit</h4>
                                        <div className="form-group">
                                            <label className="form-label">Limit</label>
                                            <input type="text" className="form-input" name="customerCredit" value={formData.customerCredit || ''} onChange={handleChange} placeholder="e.g. 5000" />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Days</label>
                                            <input type="number" className="form-input" name="customerCreditTime" value={formData.customerCreditTime || ''} onChange={handleChange} placeholder="e.g. 30" />
                                        </div>
                                    </div>
                                )}
                                {isSupplierSelected && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supplier Credit</h4>
                                        <div className="form-group">
                                            <label className="form-label">Limit</label>
                                            <input type="text" className="form-input" name="supplierCredit" value={formData.supplierCredit || ''} onChange={handleChange} placeholder="e.g. 10000" />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Days</label>
                                            <input type="number" className="form-input" name="supplierCreditTime" value={formData.supplierCreditTime || ''} onChange={handleChange} placeholder="e.g. 60" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        </div>

                        {/* Primary Contact Section (Only when creating a New Partner) */}
                        {isNew && (
                            <div className="glass-panel" style={{ padding: '32px', background: '#f8fafc', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                                    <UserPlus size={20} color="#6366f1" />
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Primary Contact Person (Optional)</h3>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    <div className="form-group">
                                        <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Contact Name</label>
                                        <input
                                            className="form-input premium-input"
                                            placeholder="e.g. John Doe"
                                            value={primaryContact.name}
                                            onChange={e => setPrimaryContact({ ...primaryContact, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Designation</label>
                                        <input
                                            className="form-input premium-input"
                                            placeholder="e.g. Purchasing Manager"
                                            value={primaryContact.post}
                                            onChange={e => setPrimaryContact({ ...primaryContact, post: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Contact Email</label>
                                        <div style={{ position: 'relative' }}>
                                            <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                            <input
                                                className="form-input premium-input"
                                                style={{ paddingLeft: '40px' }}
                                                placeholder="john@company.com"
                                                value={primaryContact.email}
                                                onChange={e => setPrimaryContact({ ...primaryContact, email: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Department</label>
                                        <select
                                            className="form-select premium-input"
                                            value={primaryContact.department}
                                            onChange={e => setPrimaryContact({ ...primaryContact, department: e.target.value })}
                                        >
                                            <option value="">-- Select Department --</option>
                                            <option value="Accounts">Accounts / Finance</option>
                                            <option value="Purchasing">Purchasing / Procurement</option>
                                            <option value="Logistics">Logistics / Operations</option>
                                            <option value="Technical">Technical / Engineering</option>
                                            <option value="Sales">Sales / Marketing</option>
                                            <option value="Management">Management</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Handphone / WhatsApp</label>
                                        <div style={{ position: 'relative' }}>
                                            <Phone size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                            <input
                                                className="form-input premium-input"
                                                style={{ paddingLeft: '40px' }}
                                                placeholder="+65 9123 4567"
                                                value={primaryContact.handphone}
                                                onChange={e => setPrimaryContact({ ...primaryContact, handphone: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label" style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Notes (Rich Text Builder)</label>
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                <ReactQuill
                                    ref={quillRef}
                                    theme="snow"
                                    value={formData.info || ''}
                                    onChange={handleEditorChange}
                                    modules={{
                                        toolbar: [
                                            [{ 'header': [1, 2, false] }],
                                            ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                                            [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
                                            ['link', 'image'],
                                            ['clean']
                                        ]
                                    }}
                                    style={{ height: '300px', marginBottom: '40px' }}
                                />
                            </div>
                        </div>
                    </form>
                </div>
            ) : (
                <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                    <PartnerDocuments
                        partnerId={id}
                        partnerName={formData.name}
                        initialFolderId={formData.gdrive_folder_id}
                        initialDriveLink={formData.google_drive_link}
                        onUpdate={(data) => setFormData(prev => ({
                            ...prev,
                            gdrive_folder_id: data.id,
                            google_drive_link: data.link
                        }))}
                    />
                </div>
            )}

            {!isNew && (
                <div style={{ maxWidth: '1100px', margin: '48px auto 60px auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Related Contacts</h3>
                                {partnerContacts.length > 0 && (
                                    <span style={{ 
                                        background: '#ecfdf5', 
                                        color: '#059669', 
                                        border: '1px solid #a7f3d0', 
                                        padding: '2px 10px', 
                                        borderRadius: '20px', 
                                        fontSize: '0.75rem', 
                                        fontWeight: 700 
                                    }}>
                                        {partnerContacts.length} Linked
                                    </span>
                                )}
                            </div>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px', margin: 0 }}>Manage decision makers and point of contacts</p>
                        </div>
                        <button 
                            type="button"
                            className="btn btn-primary" 
                            onClick={() => {
                                setEditingContact(null);
                                setShowContactModal(true);
                            }} 
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                padding: '10px 20px',
                                fontWeight: 700,
                                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)'
                            }}
                        >
                            <Plus size={18} />
                            Quick Add Contact
                        </button>
                    </div>

                    <ContactsTable 
                        contacts={partnerContacts}
                        loading={contactsLoading}
                        onEdit={(c) => {
                            setEditingContact(c);
                            setShowContactModal(true);
                        }}
                        onDelete={async (c) => {
                            if (window.confirm(`Delete contact "${c.name}"? This action cannot be undone.`)) {
                                try {
                                    await deleteContact(c.id);
                                    setPartnerContacts(prev => prev.filter(item => item.id !== c.id));
                                    toast.success(`Contact "${c.name}" deleted`);
                                } catch (err) {
                                    console.error("Delete Contact Error:", err);
                                    toast.error("Failed to delete contact");
                                }
                            }
                        }}
                        onAdd={() => {
                            setEditingContact(null);
                            setShowContactModal(true);
                        }}
                    />

                    {showContactModal && (
                        <PartnerContactModal
                            isOpen={showContactModal}
                            partnerId={id}
                            partnerName={formData.name}
                            companyId={profile?.company_id}
                            initialContact={editingContact}
                            onClose={() => {
                                setShowContactModal(false);
                                setEditingContact(null);
                            }}
                            onSave={(saved) => {
                                setPartnerContacts(prev => {
                                    const exists = prev.some(c => c.id === saved.id);
                                    if (exists) {
                                        return prev.map(c => c.id === saved.id ? saved : c);
                                    } else {
                                        return [saved, ...prev];
                                    }
                                });

                                // Cross-window synchronization broadcast to Workflow Editor and other tabs
                                try {
                                    const bc = new BroadcastChannel('celron_partner_sync');
                                    bc.postMessage({
                                        type: 'CELRON_CONTACT_SAVED',
                                        contactId: saved.id,
                                        partnerId: id,
                                        contact: saved
                                    });
                                    bc.close();
                                } catch (e) {
                                    console.warn('BroadcastChannel error:', e);
                                }

                                if (window.opener) {
                                    try {
                                        window.opener.postMessage({
                                            type: 'CELRON_CONTACT_SAVED',
                                            contactId: saved.id,
                                            partnerId: id,
                                            contact: saved
                                        }, '*');
                                    } catch (e) {}
                                }

                                toast.success(editingContact?.id ? `Contact "${saved.name}" updated!` : `Contact "${saved.name}" added! (Synced with Workflow)`);
                                setShowContactModal(false);
                                setEditingContact(null);
                            }}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Related Contacts Table Component (Image 2 style)
 */
function ContactsTable({ contacts, loading, onEdit, onDelete, onAdd }) {
    if (loading) {
        return (
            <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: '#6366f1' }} />
                <span>Loading related contacts...</span>
            </div>
        );
    }

    if (!contacts || contacts.length === 0) {
        return (
            <div className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center', background: '#fff', borderRadius: '16px', border: '1.5px dashed #cbd5e1' }}>
                <div style={{ width: '48px', height: '48px', background: '#f1f5f9', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto' }}>
                    <Users size={24} color="#94a3b8" />
                </div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 700, color: '#334155' }}>No Contacts Linked Yet</h4>
                <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#64748b' }}>Add decision makers and operational points of contact for this company.</p>
                <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={onAdd}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}
                >
                    <Plus size={16} /> Add First Contact
                </button>
            </div>
        );
    }

    return (
        <div className="table-container" style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ background: '#f8fafc', padding: '14px 20px', fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact Name</th>
                        <th style={{ background: '#f8fafc', padding: '14px 20px', fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Position</th>
                        <th style={{ background: '#f8fafc', padding: '14px 20px', fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email / Phone</th>
                        <th style={{ background: '#f8fafc', padding: '14px 20px', fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {contacts.map(c => {
                        const phoneDigits = (c.handphone || c.phone || '').replace(/\D/g, '');
                        return (
                            <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                                <td style={{ padding: '16px 20px', verticalAlign: 'middle' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ 
                                            width: '36px', 
                                            height: '36px', 
                                            borderRadius: '8px', 
                                            background: c.business_card_url ? '#fff' : '#f0fdf4', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            color: '#16a34a', 
                                            border: '1px solid #bbf7d0',
                                            overflow: 'hidden',
                                            flexShrink: 0
                                        }}>
                                            {c.business_card_url ? (
                                                <img src={c.business_card_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <User size={18} />
                                            )}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>{c.name}</div>
                                            {c.department && (
                                                <span style={{ 
                                                    display: 'inline-block', 
                                                    marginTop: '2px',
                                                    fontSize: '0.7rem', 
                                                    color: '#0284c7', 
                                                    background: '#e0f2fe', 
                                                    padding: '1px 8px', 
                                                    borderRadius: '10px',
                                                    fontWeight: 600
                                                }}>
                                                    {c.department}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: '16px 20px', verticalAlign: 'middle', color: '#475569', fontSize: '0.9rem' }}>
                                    {c.post || '-'}
                                </td>
                                <td style={{ padding: '16px 20px', verticalAlign: 'middle' }}>
                                    {c.email ? (
                                        <a href={`mailto:${c.email}`} style={{ color: '#6366f1', fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none' }}>
                                            {c.email}
                                        </a>
                                    ) : (
                                        <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>-</span>
                                    )}
                                    {(c.handphone || c.phone) && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>HP: {c.handphone || c.phone}</span>
                                            {phoneDigits && (
                                                <a
                                                    href={`https://wa.me/${phoneDigits}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{ 
                                                        color: '#25d366', 
                                                        display: 'inline-flex', 
                                                        alignItems: 'center', 
                                                        transition: 'transform 0.2s',
                                                        textDecoration: 'none'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                                    title="Chat on WhatsApp"
                                                >
                                                    <MessageSquare size={14} fill="#25d366" color="#fff" />
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '16px 20px', verticalAlign: 'middle', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                        <button 
                                            type="button"
                                            className="btn btn-secondary" 
                                            style={{ 
                                                padding: '6px 14px', 
                                                fontSize: '0.8rem', 
                                                fontWeight: 600,
                                                borderRadius: '8px'
                                            }} 
                                            onClick={() => onEdit(c)}
                                        >
                                            Edit
                                        </button>
                                        <button 
                                            type="button"
                                            className="btn btn-secondary" 
                                            style={{ 
                                                padding: '6px 14px', 
                                                fontSize: '0.8rem', 
                                                fontWeight: 600,
                                                color: '#ef4444',
                                                borderColor: '#fecaca',
                                                borderRadius: '8px'
                                            }} 
                                            onClick={() => onDelete(c)}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/**
 * Full Contact Entry / Edit Modal (Matching Image 1 Form Layout)
 */
function PartnerContactModal({ isOpen, partnerId, partnerName, companyId, initialContact, onClose, onSave }) {
    const isEdit = !!initialContact?.id;

    const [formData, setFormData] = useState({
        id: initialContact?.id || '',
        name: initialContact?.name || '',
        post: initialContact?.post || '',
        department: initialContact?.department || '',
        email: initialContact?.email || '',
        phone: initialContact?.phone || '',
        handphone: initialContact?.handphone || '',
        address: initialContact?.address || '',
        type: initialContact?.type || 'Contact',
        info: initialContact?.info || '',
        business_card_url: initialContact?.business_card_url || '',
        business_card_back_url: initialContact?.business_card_back_url || ''
    });

    const [saving, setSaving] = useState(false);
    const [isAiResearching, setIsAiResearching] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleOCR = async (text) => {
        if (!text) return;
        setIsAiResearching(true);
        try {
            const result = await parseOCRBusinessCard(text);
            if (result) {
                setFormData(prev => ({
                    ...prev,
                    name: prev.name || result.person_name || '',
                    email: prev.email || result.email || '',
                    handphone: prev.handphone || result.mobile || result.phone || '',
                    post: prev.post || result.designation || '',
                    department: prev.department || result.department || '',
                    address: prev.address || result.address || ''
                }));
                toast.success('Extracted details from business card');
            }
        } catch (err) {
            console.error('OCR Parsing failed', err);
        } finally {
            setIsAiResearching(false);
        }
    };

    const handleAiAutofill = async () => {
        if (!formData.name || !formData.name.trim()) {
            return toast.error('Please enter a Contact Name first');
        }
        setIsAiResearching(true);
        try {
            const researchData = await researchContactWithGemini(formData.name, partnerName);
            if (researchData && researchData.fields) {
                setFormData(prev => ({
                    ...prev,
                    ...researchData.fields
                }));
                toast.success('Contact profile updated with AI intelligence');
            }
        } catch (err) {
            console.error('AI Research Error:', err);
            toast.error('AI Research failed. Please enter details manually.');
        } finally {
            setIsAiResearching(false);
        }
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!formData.name || !formData.name.trim()) {
            return toast.error('Contact Name is required');
        }

        setSaving(true);
        try {
            const payload = {
                ...formData,
                name: formData.name.trim(),
                partnerId: partnerId,
                company_id: companyId
            };
            const saved = await saveContact(payload);
            onSave(saved);
        } catch (err) {
            console.error('Failed to save contact:', err);
            toast.error(`Failed to save contact: ${err.message || 'Check console'}`);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        }}>
            <div 
                className="animate-fade-in"
                style={{
                    background: '#fff',
                    borderRadius: '24px',
                    width: '100%',
                    maxWidth: '680px',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
            >
                {/* Modal Header */}
                <div style={{
                    padding: '20px 28px',
                    background: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            background: '#e0e7ff',
                            color: '#4f46e5',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            {isEdit ? <User size={20} /> : <UserPlus size={20} />}
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#1e293b' }}>
                                {isEdit ? `Edit Contact: ${formData.name || 'Details'}` : 'Add New Contact'}
                            </h3>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                Linked to: <strong style={{ color: '#4f46e5' }}>{partnerName || 'Partner'}</strong>
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#64748b',
                            padding: '6px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Modal Form Body */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <div style={{ padding: '24px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        
                        {/* AI Research Banner */}
                        <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            padding: '12px 18px', 
                            background: 'linear-gradient(90deg, #f0f9ff 0%, #e0f2fe 100%)', 
                            borderRadius: '12px',
                            border: '1px solid #bae6fd'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Sparkles size={18} className={isAiResearching ? 'ai-pulse' : ''} style={{ color: '#0284c7' }} />
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0369a1' }}>
                                    {isAiResearching ? 'AI is researching contact...' : 'Contact Intelligence'}
                                </span>
                            </div>
                            <button 
                                type="button" 
                                onClick={handleAiAutofill}
                                disabled={isAiResearching || !formData.name}
                                style={{ 
                                    padding: '6px 14px', 
                                    borderRadius: '8px', 
                                    background: '#fff', 
                                    border: '1px solid #bae6fd', 
                                    color: '#0284c7', 
                                    fontSize: '0.8rem', 
                                    fontWeight: 700, 
                                    cursor: formData.name ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                    opacity: formData.name ? 1 : 0.6
                                }}
                            >
                                {isAiResearching ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                Profile with AI
                            </button>
                        </div>

                        {/* Customer / Partner (Image 1 top dropdown / readonly) */}
                        <div className="form-item">
                            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                Customer / Partner *
                            </label>
                            <input
                                className="form-input premium-input"
                                value={partnerName || ''}
                                readOnly
                                disabled
                                style={{ background: '#f8fafc', color: '#334155', fontWeight: 600 }}
                            />
                        </div>

                        {/* Form Fields Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className="form-item">
                                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                    Contact Name *
                                </label>
                                <input
                                    className="form-input premium-input"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder="e.g. John Doe"
                                    autoFocus
                                    required
                                />
                            </div>

                            <div className="form-item">
                                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                    Department
                                </label>
                                <input
                                    className="form-input premium-input"
                                    name="department"
                                    value={formData.department || ''}
                                    onChange={handleChange}
                                    placeholder="e.g. Sales, Technical, Purchasing"
                                    list="contact-departments-list"
                                />
                                <datalist id="contact-departments-list">
                                    <option value="Purchasing" />
                                    <option value="Sales" />
                                    <option value="Accounts / Finance" />
                                    <option value="Technical / Operations" />
                                    <option value="Logistics" />
                                    <option value="Management" />
                                </datalist>
                            </div>

                            <div className="form-item">
                                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                    Post / Designation
                                </label>
                                <input
                                    className="form-input premium-input"
                                    name="post"
                                    value={formData.post}
                                    onChange={handleChange}
                                    placeholder="e.g. Purchasing Manager"
                                />
                            </div>

                            <div className="form-item">
                                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <Mail size={13} /> Email Address
                                    </span>
                                </label>
                                <input
                                    className="form-input premium-input"
                                    name="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="john@example.com"
                                />
                            </div>

                            <div className="form-item">
                                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <Phone size={13} /> Office Phone
                                    </span>
                                </label>
                                <input
                                    className="form-input premium-input"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    placeholder="+65 ...."
                                />
                            </div>

                            <div className="form-item">
                                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <Phone size={13} /> Handphone / Mobile
                                    </span>
                                </label>
                                <input
                                    className="form-input premium-input"
                                    name="handphone"
                                    value={formData.handphone}
                                    onChange={handleChange}
                                    placeholder="+65 ...."
                                />
                            </div>
                        </div>

                        {/* Contact Address */}
                        <div className="form-item">
                            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                Contact Address (if different)
                            </label>
                            <textarea
                                className="form-textarea premium-input"
                                name="address"
                                value={formData.address}
                                onChange={handleChange}
                                placeholder="Enter specific address if any..."
                                rows={2}
                            />
                        </div>

                        {/* Business Card Upload & OCR */}
                        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                            <BusinessCardUpload
                                frontValue={formData.business_card_url}
                                backValue={formData.business_card_back_url}
                                onFrontChange={(url) => setFormData(prev => ({ ...prev, business_card_url: url }))}
                                onBackChange={(url) => setFormData(prev => ({ ...prev, business_card_back_url: url }))}
                                onOCR={handleOCR}
                                label="Contact Business Card (Auto-extracts fields)"
                            />
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div style={{
                        padding: '16px 28px',
                        background: '#f8fafc',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '12px'
                    }}>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                            disabled={saving}
                            style={{ padding: '10px 20px', borderRadius: '12px', fontWeight: 600 }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={saving || !formData.name}
                            style={{
                                padding: '10px 24px',
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                            }}
                        >
                            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            {saving ? 'Saving...' : isEdit ? 'Update Contact' : 'Save Contact'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
