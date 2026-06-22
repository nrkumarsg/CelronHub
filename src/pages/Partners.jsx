import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, MapPin, Globe, Building2, Mail, Phone, Star, Filter, ChevronDown, CheckCircle2, Circle, X, UploadCloud, Upload, Download, Printer, MoreVertical, Edit, Trash2, Loader2, ExternalLink, Settings, Paperclip, FileX, HardDrive, User, Users, ArrowRight, Sparkles, ArrowUpDown } from 'lucide-react';
import Papa from 'papaparse';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { getPartners, deletePartner, savePartner, purgeCategoryGlobally, getCategories } from '../lib/store';
import { useAuth } from '../contexts/AuthContext';
import Pagination from '../components/Pagination';
import BusinessCardUpload from '../components/common/BusinessCardUpload';
import { COUNTRIES, PARTNER_CATEGORIES } from '../lib/constants';


import CompanyAutocomplete from '../components/common/CompanyAutocomplete';
import { Modal, QuickPartnerContactDualAdd } from '../components/workflow/QuickAddForms';
import PartnerDocuments from '../components/partners/PartnerDocuments';

export default function Partners() {
    const { profile } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const typeParam = searchParams.get('type');
    const [partners, setPartners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCountry, setSelectedCountry] = useState('');
    const [selectedCountryNot, setSelectedCountryNot] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(typeParam || '');
    const [currentPage, setCurrentPage] = useState(1);
    const [dbCategories, setDbCategories] = useState([]);
    const [sortKey, setSortKey] = useState('name');
    const [sortDirection, setSortDirection] = useState('desc'); // 'asc' | 'desc'
    const itemsPerPage = 8;
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const [activeMenu, setActiveMenu] = useState(null);

    const modules = {
        toolbar: [
            [{ 'header': [1, 2, false] }],
            ['bold', 'italic', 'underline', 'strike', 'blockquote'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
            ['link', 'image'],
            ['clean']
        ]
    };

    // Close menu when clicking outside
    useEffect(() => {
        const closeMenu = () => setActiveMenu(null);
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, []);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [newPartner, setNewPartner] = useState({
        name: '', email1: '', phone1: '', weblink: '', country: '', city: '', address: '', notes: '', brand: '',
        types: [],
        rating: 0,
        customerCredit: '',
        supplierCredit: '',
        customerCreditTime: '',
        supplierCreditTime: '',
        business_card_url: '',
        business_card_back_url: ''
    });
    const [newContact, setNewContact] = useState({
        name: '', email: '', phone: '', handphone: '', post: '', address: '', business_card_url: '', business_card_back_url: ''
    });
    const [customCategory, setCustomCategory] = useState('');
    const [showCategoryMgr, setShowCategoryMgr] = useState(false);
    const [modalTab, setModalTab] = useState('details'); // 'details' or 'documents'
    const [createdPartner, setCreatedPartner] = useState(null);
    const [existingContacts, setExistingContacts] = useState([]);

    const handlePurgeCategory = async (catName) => {
        if (window.confirm(`Are you sure you want to delete "${catName}" globally? This will remove it from all partners.`)) {
            try {
                await purgeCategoryGlobally(catName);
                await loadPartners();
            } catch (err) {
                alert('Purge failed: ' + err.message);
            }
        }
    };

    const loadPartners = React.useCallback(async () => {
        setLoading(true);
        const [data, catData] = await Promise.all([
            getPartners(profile),
            getCategories()
        ]);
        const sorted = data.sort((a, b) => a.name.localeCompare(b.name));
        setPartners(sorted);
        setDbCategories(catData.map(c => c.name));
        setLoading(false);
    }, [profile]);

    useEffect(() => {
        loadPartners();
    }, [loadPartners]);

    useEffect(() => {
        const type = searchParams.get('type');
        setSelectedCategory(type || '');
        setSelectedCountry('');
        setSelectedCountryNot('');
        setCurrentPage(1);
    }, [searchParams]);

    const handleSearchChange = (e) => {
        setSearchTerm(e.target.value);
        setCurrentPage(1);
    };

    const handleCountryChange = (e) => {
        setSelectedCountry(e.target.value);
        setSelectedCountryNot('');
        setCurrentPage(1);
    };

    const handleCategoryChange = (e) => {
        const cat = e.target.value;
        setSelectedCategory(cat);
        setCurrentPage(1);
        if (cat) {
            setSearchParams({ type: cat });
        } else {
            setSearchParams({});
        }
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to delete this partner? This action cannot be undone.')) {
            try {
                await deletePartner(id);
                loadPartners();
            } catch (err) {
                alert('Failed to delete partner: ' + err.message);
            }
        }
    };

    const openWebsite = (url) => {
        const link = (url || '').trim();
        if (link) {
            const fullUrl = link.startsWith('http') ? link : `https://${link}`;
            window.open(fullUrl, '_blank');
        } else {
            window.open('https://www.google.com', '_blank');
        }
    };

    // Effect to find existing contacts if company name matches
    useEffect(() => {
        if (!newPartner.name || !showModal) {
            setExistingContacts([]);
            return;
        }
        const match = partners.find(p => p.name.toLowerCase() === newPartner.name.trim().toLowerCase());
        if (match) {
            supabase.from('contacts').select('*').eq('partnerId', match.id)
                .then(({ data }) => setExistingContacts(data || []));
        } else {
            setExistingContacts([]);
        }
    }, [newPartner.name, partners, showModal]);

    const handleSaveNewPartner = async (e) => {
        e.preventDefault();
        try {
            // Map fields that match the db schema
            const dataToSave = {
                name: newPartner.name,
                email1: newPartner.email1,
                phone1: newPartner.phone1,
                weblink: newPartner.weblink,
                country: newPartner.country,
                address: newPartner.address,
                types: newPartner.types,
                info: newPartner.notes || '',
                customerCredit: newPartner.customerCredit,
                supplierCredit: newPartner.supplierCredit,
                customerCreditTime: newPartner.customerCreditTime,
                supplierCreditTime: newPartner.supplierCreditTime,
                business_card_url: newPartner.business_card_url,
                business_card_back_url: newPartner.business_card_back_url
            };

            if (newPartner.city) {
                // We keep city separate in form but join in address if needed, 
                // or just rely on the address being updated by handleCompanySelect
                if (newPartner.address && !newPartner.address.includes(newPartner.city)) {
                    dataToSave.address = `${newPartner.city}, ${newPartner.address}`;
                }
            }

            if (newPartner.brand) {
                dataToSave.info += ` | Brands: ${newPartner.brand}`;
            }

            if (profile?.company_id) {
                dataToSave.company_id = profile.company_id;
            }

            const saved = await savePartner(dataToSave);

            // Save Contact if name is provided
            if (newContact.name && saved.id) {
                const { error: cError } = await supabase.from('contacts').insert([{
                    ...newContact,
                    partnerId: saved.id,
                    company_id: profile?.company_id
                }]);
                if (cError) {
                    console.error('Failed to save associated contact:', cError);
                    alert('Partner saved, but failed to create the primary contact.');
                }
            }

            setCreatedPartner(saved);
            setModalTab('documents');
            loadPartners(); // reload the grid
            // alert('Partner added successfully!'); // Removing alert for smoother tab transition
        } catch (error) {
            console.error('Failed to save partner', error);
            alert(`Failed to save: ${error.message || 'Check inputs.'}`);
        }
    };

    const handleOCR = (text) => {
        if (!text) return;
        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const phoneMatch = text.match(/[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}/);
        const webMatch = text.match(/(https?:\/\/)?(www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/i);

        setNewPartner(prev => ({
            ...prev,
            email1: prev.email1 || emailMatch?.[0] || '',
            phone1: prev.phone1 || phoneMatch?.[0] || '',
            weblink: prev.weblink || webMatch?.[0] || '',
            notes: (prev.notes || '') + `<p><br></p><p><strong>[OCR EXTRACTED TEXT]</strong></p><p>${text.replace(/\n/g, '<br>')}</p>`
        }));
    };

    const handleCompanySelect = (place) => {
        const address = place.formatted_address || '';
        const name = place.name || '';
        const weblink = place.website || '';

        let country = '';
        let city = '';

        place.address_components?.forEach(c => {
            if (c.types.includes('country')) country = c.long_name;
            if (c.types.includes('locality')) city = c.long_name;
        });

        setNewPartner(prev => ({
            ...prev,
            name,
            address,
            city: city || prev.city,
            country: country || prev.country,
            weblink: weblink || prev.weblink
        }));
    };

    const handleImportCSV = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async function (results) {
                let imported = 0;
                for (const row of results.data) {
                    const types = row.types ? row.types.split(';') : [];
                    const dataToSave = { ...row, types };
                    if (!dataToSave.id) delete dataToSave.id;
                    try {
                        await savePartner(dataToSave);
                        imported++;
                    } catch (err) {
                        console.error("Error saving partner row", err);
                    }
                }
                alert(`Successfully imported ${imported} partners`);
                loadPartners();
            },
            error: function () {
                alert('Error parsing CSV file');
                setLoading(false);
            }
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleExportCSV = () => {
        const csvData = filteredPartners.map(p => ({
            name: p.name || '',
            email1: p.email1 || '',
            phone1: p.phone1 || '',
            country: p.country || '',
            address: p.address || '',
            weblink: p.weblink || '',
            types: p.types ? p.types.join(';') : '',
            brand: p.brand || '',
            info: p.info || ''
        }));
        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', 'partners_export.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const filteredPartners = partners.filter(p => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm || (
            (p.name && p.name.toLowerCase().includes(term)) ||
            (p.email1 && p.email1.toLowerCase().includes(term)) ||
            (p.phone1 && p.phone1.toLowerCase().includes(term)) ||
            (p.country && p.country.toLowerCase().includes(term)) ||
            (p.address && p.address.toLowerCase().includes(term)) ||
            (p.weblink && p.weblink.toLowerCase().includes(term)) ||
            (p.types && p.types.some(t => t?.toLowerCase().includes(term))) ||
            (p.brand && p.brand.toLowerCase().includes(term)) ||
            (p.info && p.info.toLowerCase().includes(term))
        );
        const matchesCountry = !selectedCountry || (p.country && p.country === selectedCountry);
        const matchesCountryNot = !selectedCountryNot || (p.country !== selectedCountryNot);
        const matchesCategory = !selectedCategory || (p.types && p.types.includes(selectedCategory));

        return matchesSearch && matchesCountry && matchesCountryNot && matchesCategory;
    });

    const sortedPartners = [...filteredPartners].sort((a, b) => {
        let valA, valB;
        if (sortKey === 'name') {
            valA = a.name || '';
            valB = b.name || '';
            return sortDirection === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
        } else if (sortKey === 'created_at') {
            valA = a.created_at ? new Date(a.created_at) : 0;
            valB = b.created_at ? new Date(b.created_at) : 0;
            return sortDirection === 'desc' ? valB - valA : valA - valB;
        }
        return 0;
    });

    const paginatedPartners = sortedPartners.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const availableCategories = Array.from(new Set([...PARTNER_CATEGORIES, ...dbCategories, ...partners.flatMap(p => p.types || [])])).filter(Boolean).sort();

    const handleCategoryToggle = (cat) => {
        setNewPartner(prev => ({
            ...prev,
            types: prev.types.includes(cat)
                ? prev.types.filter(t => t !== cat)
                : [...prev.types, cat]
        }));
    };

    const handleAddCustomCategory = () => {
        if (customCategory.trim() && !newPartner.types.includes(customCategory.trim())) {
            setNewPartner(prev => ({
                ...prev,
                types: [...prev.types, customCategory.trim()]
            }));
            setCustomCategory('');
        }
    };

    return (
        <div style={{ background: '#f8fafc', minHeight: '100%', padding: '32px', color: '#334155', borderRadius: '16px', position: 'relative' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', margin: '0 0 8px 0' }}>Partners Directory</h1>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>Global network of suppliers, customers, and service providers</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }} className="hide-on-print">
                    <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} style={{ display: 'none' }} />
                    <button onClick={() => fileInputRef.current.click()} style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', padding: '10px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <Upload size={18} /> Add CSV
                    </button>
                    <button onClick={handleExportCSV} style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', padding: '10px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <Download size={18} /> Export
                    </button>
                    <button onClick={() => window.print()} style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', padding: '10px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <Printer size={18} /> Print
                    </button>
                    <button onClick={() => navigate('/partners/ai-parser')} style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(124, 58, 237, 0.2)' }}>
                        <Sparkles size={18} /> AI Email &amp; Contact Parser
                    </button>
                    <button onClick={() => navigate('/partners/ai-drive-parser')} style={{ background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(236, 72, 153, 0.2)' }}>
                        <HardDrive size={18} /> AI Drive Card Scanner
                    </button>
                    <button onClick={() => setShowModal(true)} style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.2)' }}>
                        <Plus size={18} /> Add Partner
                    </button>
                </div>
            </header>

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', alignItems: 'center', flexWrap: 'wrap' }} className="hide-on-print">
                <div style={{ display: 'flex', flex: 1, minWidth: '400px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', color: '#94a3b8' }}>
                        <Search size={18} />
                    </div>
                    <input
                        type="text"
                        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '8px 0', fontSize: '0.95rem', color: '#334155' }}
                        placeholder="Search by name, website, brand, address, or notes..."
                        value={searchTerm}
                        onChange={handleSearchChange}
                    />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 16px', gap: '8px' }}>
                        <MapPin size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                        <select
                            value={selectedCountry}
                            onChange={handleCountryChange}
                            style={{ appearance: 'none', background: 'transparent', border: 'none', outline: 'none', color: '#475569', fontSize: '0.9rem', fontWeight: 500, padding: '10px 24px 10px 0', cursor: 'pointer', width: '100%', minWidth: '150px' }}
                        >
                            <option value="">All Countries</option>
                            {COUNTRIES.map(country => (
                                <option key={country} value={country}>{country}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} color="#94a3b8" style={{ position: 'absolute', right: '16px', pointerEvents: 'none' }} />
                    </div>

                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 16px', gap: '8px' }}>
                        <Filter size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                        <select
                            value={selectedCategory}
                            onChange={handleCategoryChange}
                            style={{ appearance: 'none', background: 'transparent', border: 'none', outline: 'none', color: '#475569', fontSize: '0.9rem', fontWeight: 500, padding: '10px 24px 10px 0', cursor: 'pointer', width: '100%', minWidth: '150px' }}
                        >
                            <option value="">All Categories</option>
                            {availableCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} color="#94a3b8" style={{ position: 'absolute', right: '16px', pointerEvents: 'none' }} />
                    </div>

                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 16px', gap: '8px' }}>
                        <ArrowUpDown size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                        <select
                            value={`${sortKey}-${sortDirection}`}
                            onChange={(e) => {
                                const [key, dir] = e.target.value.split('-');
                                setSortKey(key);
                                setSortDirection(dir);
                            }}
                            style={{ appearance: 'none', background: 'transparent', border: 'none', outline: 'none', color: '#475569', fontSize: '0.9rem', fontWeight: 500, padding: '10px 24px 10px 0', cursor: 'pointer', width: '100%', minWidth: '180px' }}
                        >
                            <option value="name-desc">Name (Z-A)</option>
                            <option value="name-asc">Name (A-Z)</option>
                            <option value="created_at-desc">Date Added (Newest)</option>
                            <option value="created_at-asc">Date Added (Oldest)</option>
                        </select>
                        <ChevronDown size={14} color="#94a3b8" style={{ position: 'absolute', right: '16px', pointerEvents: 'none' }} />
                    </div>

                    <button
                        onClick={() => setShowCategoryMgr(true)}
                        style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: '8px', padding: '0 12px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                        title="Manage Categories"
                    >
                        <Settings size={18} />
                    </button>
                </div>
            </div>

            {/* Quick Filter Chips */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '32px', overflowX: 'auto', paddingBottom: '8px', alignItems: 'center' }} className="hide-on-print no-scrollbar">
                <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '8px' }}>Quick Filters:</div>
                {[
                    { label: 'All', cat: '', country: '', countryNot: '', color: '#6366f1' },
                    { label: 'Principals', cat: 'Principal', country: '', countryNot: '', color: '#f59e0b' },
                    { label: 'Local Customers', cat: 'Customer', country: 'Singapore', countryNot: '', color: '#10b981' },
                    { label: 'Int. Customers', cat: 'Customer', country: '', countryNot: 'Singapore', color: '#06b6d4' },
                    { label: 'Local Suppliers', cat: 'Supplier', country: 'Singapore', countryNot: '', color: '#ef4444' },
                    { label: 'Int. Suppliers', cat: 'Supplier', country: '', countryNot: 'Singapore', color: '#f97316' },
                    { label: 'Local Service', cat: 'Service Company', country: 'Singapore', countryNot: '', color: '#3b82f6' },
                    { label: 'Int. Service', cat: 'Service Company', country: '', countryNot: 'Singapore', color: '#64748b' },
                    { label: 'Freelancers', cat: 'Freelancer', country: '', countryNot: '', color: '#ec4899' },
                    { label: 'Forwarders', cat: 'Forwarder', country: '', countryNot: '', color: '#8b5cf6' },
                    { label: 'Couriers', cat: 'Courier', country: '', countryNot: '', color: '#eab308' }
                ].map(chip => {
                    const isActive = (chip.cat === selectedCategory && chip.country === selectedCountry && chip.countryNot === selectedCountryNot);
                    return (
                        <button
                            key={chip.label}
                             onClick={() => {
                                 setSelectedCategory(chip.cat);
                                 setSelectedCountry(chip.country);
                                 setSelectedCountryNot(chip.countryNot);
                                 setCurrentPage(1);
                                 if (chip.cat) {
                                     setSearchParams({ type: chip.cat });
                                 } else {
                                     setSearchParams({});
                                 }
                             }}
                            className="filter-chip"
                            style={{
                                padding: '8px 20px',
                                borderRadius: '100px',
                                border: '1px solid',
                                borderColor: isActive ? 'transparent' : `${chip.color}30`,
                                background: isActive ? `linear-gradient(135deg, ${chip.color} 0%, ${chip.color}dd 100%)` : `${chip.color}08`,
                                color: isActive ? '#fff' : chip.color,
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: isActive ? `0 4px 12px ${chip.color}40` : '0 2px 4px rgba(0,0,0,0.02)'
                            }}
                        >
                            {chip.label}
                        </button>
                    );
                })}
                {(selectedCategory || selectedCountry || selectedCountryNot || searchTerm) && (
                    <button 
                        onClick={() => { setSelectedCategory(''); setSelectedCountry(''); setSelectedCountryNot(''); setSearchTerm(''); setSearchParams({}); }}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', marginLeft: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <X size={14} /> Clear All
                    </button>
                )}
            </div>

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                    <Loader2 className="animate-spin" size={32} style={{ marginBottom: '16px', display: 'inline-block' }} />
                    <p>Loading your business network...</p>
                </div>
            ) : filteredPartners.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '80px 40px', background: '#fff' }}>
                    <div style={{ width: '64px', height: '64px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                        <Search size={32} color="#94a3b8" />
                    </div>
                    <h3 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>No local partners found</h3>
                    <p style={{ margin: '0 0 32px 0', color: '#64748b' }}>We couldn't find any partners matching "{searchTerm}" in your directory.</p>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                        <button onClick={() => { setSearchTerm(''); setSelectedCountry(''); setSelectedCategory(''); }} style={{ background: '#f1f5f9', color: '#475569', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>Clear Filters</button>
                        <button onClick={() => {
                            setNewPartner(prev => ({ ...prev, name: searchTerm }));
                            setShowModal(true);
                        }} style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Globe size={18} /> Search Worldwide
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '24px' }}>
                    {paginatedPartners.map(res => (
                        <div key={res.id} style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0', position: 'relative', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', cursor: 'pointer' }} onClick={() => navigate(`/partners/${res.id}`)}>

                            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                                <div style={{ width: '48px', height: '48px', background: res.business_card_url ? '#fff' : '#e0e7ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', overflow: 'hidden', border: res.business_card_url ? '1px solid #e2e8f0' : 'none' }}>
                                    {res.business_card_url ? (
                                        <img src={res.business_card_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <Building2 size={24} />
                                    )}
                                </div>
                                <div style={{ flex: 1, paddingRight: '24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>{res.name}</h3>
                                        {res.weblink && (
                                            <a href={res.weblink.trim().startsWith('http') ? res.weblink.trim() : `https://${res.weblink.trim()}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#6366f1', display: 'flex', alignItems: 'center' }} title="Visit Website">
                                                <Globe size={16} />
                                            </a>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.85rem' }}>
                                        <MapPin size={14} /> {res.country || 'No Location'}
                                        {res.google_drive_link && (
                                            <div style={{
                                                marginLeft: 'auto',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '2px 8px',
                                                background: '#eef2ff',
                                                borderRadius: '6px',
                                                color: '#4f46e5',
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                border: '1px solid #c7d2fe'
                                            }} title="Documents Linked to Google Drive">
                                                <HardDrive size={12} /> DOCS
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Ellipsis Menu */}
                                <div style={{ position: 'relative' }}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenu(activeMenu === res.id ? null : res.id);
                                        }}
                                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                                    >
                                        <MoreVertical size={20} />
                                    </button>

                                    {activeMenu === res.id && (
                                        <div style={{ position: 'absolute', top: '100%', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, padding: '4px', minWidth: '120px' }}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/partners/${res.id}`);
                                                }}
                                                style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569', cursor: 'pointer', borderRadius: '4px' }}
                                                onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                                onMouseOut={e => e.currentTarget.style.background = 'none'}
                                            >
                                                <Edit size={14} /> Edit
                                            </button>
                                            <button
                                                onClick={(e) => handleDelete(e, res.id)}
                                                style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#ef4444', cursor: 'pointer', borderRadius: '4px' }}
                                                onMouseOver={e => e.currentTarget.style.background = '#fef2f2'}
                                                onMouseOut={e => e.currentTarget.style.background = 'none'}
                                            >
                                                <Trash2 size={14} /> Delete
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '2px', marginBottom: '16px' }}>
                                {[...Array(5)].map((_, i) => (
                                    <Star key={i} size={16} fill={i < (res.rating || 5) ? "#fbbf24" : "transparent"} color={i < (res.rating || 5) ? "#fbbf24" : "#e2e8f0"} />
                                ))}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.9rem' }}>
                                    <Mail size={16} /> {res.email1 || 'No email provided'}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.9rem' }}>
                                    <Phone size={16} /> {res.phone1 || 'No phone provided'}
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                                {res.types && res.types.map((cat, i) => (
                                    <span key={i} style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.75rem', padding: '4px 10px', borderRadius: '16px', fontWeight: 500 }}>
                                        {cat}
                                    </span>
                                ))}
                            </div>

                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                Brands: <span style={{ color: '#475569' }}>{res.brand || 'General Supplies'}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!loading && filteredPartners.length > 0 && (
                <div style={{ marginTop: '32px' }}>
                    <Pagination
                        currentPage={currentPage}
                        totalItems={filteredPartners.length}
                        itemsPerPage={itemsPerPage}
                        onPageChange={setCurrentPage}
                    />
                </div>
            )}

            {showModal && (
                <Modal 
                    isOpen={showModal} 
                    onClose={() => { setShowModal(false); setCreatedPartner(null); }}
                    title={createdPartner ? "Partner Workspace & Documents" : "Add New Partner"}
                    icon={Users}
                    size="xl"
                >
                    <QuickPartnerContactDualAdd 
                        company_id={profile.company_id}
                        initialPartner={createdPartner}
                        partners={partners}
                        onSuccess={async ({ partner, contact }) => {
                            if (!createdPartner) {
                                setCreatedPartner(partner);
                            } else {
                                setShowModal(false);
                                setCreatedPartner(null);
                                await loadPartners();
                            }
                        }}
                        onCancel={() => { setShowModal(false); setCreatedPartner(null); }}
                    />
                </Modal>
            )}

            {/* Category Manager Modal */}
            {showCategoryMgr && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '24px', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>Manage Categories</h2>
                            <button onClick={() => setShowCategoryMgr(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X /></button>
                        </div>

                        <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {availableCategories.map(cat => (
                                <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontWeight: 500, color: '#334155' }}>{cat}</span>
                                    <button
                                        onClick={() => handlePurgeCategory(cat)}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                        title="Delete globally from all partners"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Link to="/categories" onClick={() => setShowCategoryMgr(false)} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6366f1', fontSize: '0.9rem', fontWeight: 600 }}>
                                Go to System Categories <ArrowRight size={14} />
                            </Link>
                            <button onClick={() => setShowCategoryMgr(false)} className="btn btn-secondary">Close</button>
                        </div>
                    </div>
                </div>
            )}
            <style>{`
                .filter-chip:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 16px rgba(99, 102, 241, 0.15);
                    border-color: #6366f1 !important;
                }
                .filter-chip:active {
                    transform: translateY(0);
                }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}
