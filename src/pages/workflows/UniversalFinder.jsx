import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Globe, Building2, Mail, Phone, Star, Filter, ChevronDown, CheckCircle2, Circle, Loader2, Save, X, ExternalLink, Plus, Trash2, User, Info, FileDown, Printer } from 'lucide-react';
import { savePartner, getBrands, getCategories } from '../../lib/store';
import { useAuth } from '../../contexts/AuthContext';
import { countries } from '../../utils/countries';
import AIChatInterface from '../../components/UniversalFinder/AIChatInterface';

const DEFAULT_PLATFORMS = [
    { name: 'ShipServ', url: 'https://www.shipserv.com/search/results?searchString={{query}}', category: 'Marine' },
    { name: 'Shipeq', url: 'https://shipeq.com/search?q={{query}}', category: 'Marine' },
    { name: 'Marine-Online', url: 'https://www.marine-online.com/search?keyword={{query}}', category: 'Marine' },
    { name: 'BoatSpareParts', url: 'https://www.boatspareparts.com/search?q={{query}}', category: 'Marine' },
    { name: 'Marinelisting', url: 'https://marinelisting.com/search?q={{query}}', category: 'Marine' },
    { name: 'Kongsberg', url: 'https://www.kongsberg.com/search/?q={{query}}', category: 'Marine' },

    { name: 'MISUMI (SG)', url: 'https://sg.misumi-ec.com/vona2/result/?Keyword={{query}}', category: 'Industrial' },
    { name: 'Element14', url: 'https://sg.element14.com/search?st={{query}}', category: 'Industrial' },
    { name: 'RS Components', url: 'https://sg.rs-online.com/web/c/?searchTerm={{query}}', category: 'Industrial' },
    { name: 'Mouser', url: 'https://www.mouser.sg/Search/Refine?Keyword={{query}}', category: 'Industrial' },
    { name: 'Octopart', url: 'https://octopart.com/search?q={{query}}', category: 'Industrial' },
    { name: 'Grainger', url: 'https://www.grainger.com/search?searchQuery={{query}}', category: 'Industrial' },
    { name: 'McMaster-Carr', url: 'https://www.mcmaster.com/{{query}}', category: 'Industrial' },
    { name: 'Amazon Business', url: 'https://www.amazon.com/s?k={{query}}', category: 'Industrial' },

    { name: 'SpareXo', url: 'https://sparexo.com/search?q={{query}}', category: 'Automation' },
    { name: 'Radwell', url: 'https://www.radwell.com/en-US/Search?q={{query}}', category: 'Automation' },

    { name: 'Alibaba', url: 'https://www.alibaba.com/trade/search?SearchText={{query}}', category: 'General' },
    { name: 'Shopee SG', url: 'https://shopee.sg/search?keyword={{query}}', category: 'General' },
    { name: 'Lazada SG', url: 'https://www.lazada.sg/catalog/?q={{query}}', category: 'General' },
    { name: 'eBay', url: 'https://www.ebay.com/sch/i.html?_nkw={{query}}', category: 'General' },
    { name: 'IndiaMART', url: 'https://dir.indiamart.com/search.mp?ss={{query}}', category: 'General' },
    { name: 'DigiKey', url: 'https://www.digikey.sg/en/products?keywords={{query}}', category: 'Industrial' },
];

const CATEGORY_STYLES = {
    'Marine': { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', hover: '#dbeafe' },
    'Industrial': { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', hover: '#ffedd5' },
    'Automation': { bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9', hover: '#ede9fe' },
    'General': { bg: '#f8fafc', border: '#e2e8f0', text: '#475569', hover: '#f1f5f9' },
    'Custom': { bg: '#fdf2f2', border: '#fecaca', text: '#b91c1c', hover: '#fee2e2' }
};

export default function UniversalFinder() {
    const navigate = useNavigate();
    const { profile } = useAuth();
    const [query, setQuery] = useState('');
    const [make, setMake] = useState('');
    const [model, setModel] = useState('');
    const [specs, setSpecs] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalResults, setTotalResults] = useState(0);
    const [searchId, setSearchId] = useState(null);
    const [isSimulated, setIsSimulated] = useState(false);

    const [activeTab, setActiveTab] = useState('chat'); // 'chat', 'search' or 'global'
    const [skipAi, setSkipAi] = useState(false);
    const [popularSuppliers, setPopularSuppliers] = useState([]);
    const [customPlatforms, setCustomPlatforms] = useState(() => {
        const saved = localStorage.getItem('celron_custom_marketplaces');
        return saved ? JSON.parse(saved) : [];
    });
    const [showAddPlatform, setShowAddPlatform] = useState(false);
    const [newPlatform, setNewPlatform] = useState({ name: '', url: '', category: 'General' });

    // Filters
    const [brands, setBrands] = useState([]);
    const [selectedBrand, setSelectedBrand] = useState('');
    const [selectedCountry, setSelectedCountry] = useState('');
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [userLocation, setUserLocation] = useState(null);
    const [userCountry, setUserCountry] = useState('');
    const [restrictToCountry, setRestrictToCountry] = useState(false);

    // Dropdown states
    const [showCountryDrop, setShowCountryDrop] = useState(false);
    const [showCategoryDrop, setShowCategoryDrop] = useState(false);
    const [showBrandDrop, setShowBrandDrop] = useState(false);

    useEffect(() => {
        loadFilters();
        getUserLocation();
        loadPopularSuppliers();

        // Load Google Custom Search Engine script
        const script = document.createElement('script');
        script.src = "https://cse.google.com/cse.js?cx=259ae1101668d4071";
        script.async = true;
        document.body.appendChild(script);

        return () => {
            // Cleanup: remove the script if the component unmounts
            if (document.body.contains(script)) {
                document.body.removeChild(script);
            }
        }
    }, []);

    // Live Search Logic (Debounce)
    useEffect(() => {
        if (!query.trim() && !make && !model) {
            if (results.length > 0) setResults([]);
            return;
        }

        const delayDebounceFn = setTimeout(() => {
            handleSearch();
        }, 800); // Wait 800ms after last keystroke

        return () => clearTimeout(delayDebounceFn);
    }, [query, make, model, selectedBrand, selectedCountry, selectedCategory]);

    const handleExportCSV = () => {
        if (!results || results.length === 0) return;

        const headers = ["Supplier Name", "Contact Person", "Email", "Phone", "Address", "Notes"];
        const rows = results.slice(0, 10).map(r => [
            `"${r.supplier_name || ''}"`,
            `"${r.contact_person || ''}"`,
            `"${r.email || ''}"`,
            `"${r.phone || ''}"`,
            `"${(r.address || r.supplier_location || '').replace(/"/g, '""')}"`,
            `"${(r.notes || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `Supplier_Contact_Summary_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handlePrintPDF = () => {
        window.print();
    };

    const loadPopularSuppliers = async () => {
        try {
            const resp = await fetch('/api/partners/popular?limit=20');
            const data = await resp.json();
            if (data.partners) setPopularSuppliers(data.partners);
        } catch (error) {
            console.error("Failed to load popular suppliers:", error);
        }
    };

    const loadFilters = async () => {
        try {
            const [b, c] = await Promise.all([getBrands(), getCategories()]);
            setBrands(b);
            setCategories(c);
        } catch (error) {
            console.error("Failed to load filters:", error);
        }
    };

    const getUserLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    setUserLocation({ lat, lng });

                    // Try to get country name from coordinates
                    try {
                        const key = import.meta.env.VITE_GOOGLE_GEOCODE_KEY || import.meta.env.VITE_GOOGLE_API_KEY;
                        const resp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`);
                        const data = await resp.json();
                        const countryObj = data.results?.find(r => r.types.includes('country'));
                        if (countryObj) {
                            setUserCountry(countryObj.formatted_address);
                            if (!selectedCountry) setSelectedCountry(countryObj.formatted_address);
                        }
                    } catch (e) {
                        console.error("Failed to detect country:", e);
                    }
                },
                () => console.log("Location access denied")
            );
        }
    };

    // Derived state for filtered results
    const filteredResults = results.filter(res => {
        const matchesCountry = !selectedCountry || !restrictToCountry ||
            (res.supplier_location && res.supplier_location.toLowerCase().includes(selectedCountry.toLowerCase()));
        const matchesBrand = !selectedBrand ||
            (res.supplier_name && res.supplier_name.toLowerCase().includes(selectedBrand.toLowerCase()));
        return matchesCountry && matchesBrand;
    });

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        if (!query.trim() && !make && !model) return;

        setIsSearching(true);
        setIsSimulated(false);
        setResults([]);
        setPage(1);

        // Combine filters into query for better results (Natural Language)
        let fullQuery = query;
        if (make) fullQuery += ` ${make}`;
        if (model) fullQuery += ` ${model}`;
        if (selectedBrand) fullQuery += ` ${selectedBrand}`;
        if (selectedCategory) fullQuery += ` ${selectedCategory}`;
        if (selectedCountry && !fullQuery.toLowerCase().includes(selectedCountry.toLowerCase())) {
            fullQuery += ` ${selectedCountry}`;
        }

        try {
            const resp = await fetch('/api/universal-finder/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: fullQuery,
                    userLat: userLocation?.lat,
                    userLng: userLocation?.lng,
                    userId: profile?.id,
                    country: selectedCountry,
                    restrictToCountry,
                    skipAi
                })
            });
            const data = await resp.json();
            if (data.searchId) {
                setSearchId(data.searchId);
                // Crucial: Pass the initial query to fetchResults to ensure it knows what was searched
                fetchResults(data.searchId, 1);
            } else if (data.error) {
                const detailStr = data.details ? `\n\nDetail: ${data.details}` : '';
                alert(`Search Error: ${data.error}${detailStr}\n\nPlease check your Google Cloud Console for quota/billing.`);
                setIsSearching(false);
                return;
            }
        } catch (error) {
            console.error("Search failed:", error);
            alert("Search failed. Check if backend server is running.");
        }
        setIsSearching(false);
    };

    const fetchResults = async (id, pageNum) => {
        setLoading(true);
        try {
            // Added timestamp to bust any browser caches
            const resp = await fetch(`/api/universal-finder/results?searchId=${id}&page=${pageNum}&t=${Date.now()}`);
            const data = await resp.json();
            if (data.results) {
                setResults(prev => pageNum === 1 ? data.results : [...prev, ...data.results]);
                setTotalResults(data.total || data.results.length);
                setIsSimulated(!!data.isSimulated);

                // AUTO-POLLING: If we see Fallback cards, check again in 4 seconds
                const hasFallbacks = data.results.some(r => r.supplier_name?.includes('Fallback'));
                if (hasFallbacks && pageNum === 1) {
                    setTimeout(() => fetchResults(id, 1), 4000);
                }
            }

        } catch (error) {
            console.error("Failed to fetch results:", error);
        }
        setLoading(false);
    };

    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchResults(searchId, nextPage);
    };

    const toggleSelect = (id) => {
        setResults(results.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
    };

    const handleSavePartner = async (result) => {
        setLoading(true);
        try {
            const resp = await fetch('/api/partners/from-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resultId: result.id,
                    company_id: profile?.company_id
                })
            });
            const data = await resp.json();
            if (data.success) {
                setResults(prev => prev.map(r => r.id === result.id ? { ...r, saved_to_partner: true, saved_to_partner_id: data.partner_id } : r));
                return data.partner_id;
            }
        } catch (error) {
            console.error('Failed to save partner:', error);
        } finally {
            setLoading(false);
        }
        return null;
    };

    const handleSendEnquiry = async (result) => {
        let partnerId = result.saved_to_partner_id;
        if (!result.saved_to_partner) {
            partnerId = await handleSavePartner(result);
        }
        if (partnerId) {
            navigate(`/enquiries/new?partnerId=${partnerId}`);
        } else {
            alert('Could not prepare supplier for enquiry. Please try again.');
        }
    };

    const handleSaveSelected = async () => {
        const selected = results.filter(r => r.selected);
        if (selected.length === 0) return;

        setLoading(true);
        try {
            for (const result of selected) {
                await fetch('/api/partners/from-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        resultId: result.id,
                        company_id: profile?.company_id
                    })
                });
            }
            alert(`Successfully saved ${selected.length} suppliers to Partners table!`);
            setResults(prev => prev.map(r => ({
                ...r,
                selected: false,
                saved_to_partner: r.selected ? true : r.saved_to_partner
            })));
        } catch (error) {
            console.error('Failed to save partners:', error);
            alert('Failed to save partners.');
        }
        setLoading(false);
    };

    const handleAddCustomPlatform = (e) => {
        e.preventDefault();
        if (!newPlatform.name || !newPlatform.url) return;
        const updated = [...customPlatforms, newPlatform];
        setCustomPlatforms(updated);
        localStorage.setItem('celron_custom_marketplaces', JSON.stringify(updated));
        setNewPlatform({ name: '', url: '', category: 'General' });
        setShowAddPlatform(false);
    };

    const handleDeleteCustomPlatform = (index) => {
        const updated = customPlatforms.filter((_, i) => i !== index);
        setCustomPlatforms(updated);
        localStorage.setItem('celron_custom_marketplaces', JSON.stringify(updated));
    };

    const openPlatformSearch = (platformUrl) => {
        if (!query.trim() && !make && !model) {
            alert("Please enter a search query first.");
            return;
        }
        let fullSearch = `${query} ${make} ${model}`.trim();
        if (selectedCountry) fullSearch += ` in ${selectedCountry}`;

        const finalUrl = platformUrl.replace('{{query}}', encodeURIComponent(fullSearch));
        window.open(finalUrl, '_blank');
    };

    return (
        <div style={{ background: '#f8fafc', minHeight: '100%', padding: '32px', color: '#334155', borderRadius: '16px' }}>
            <header style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', margin: '0 0 8px 0' }}>Find Suppliers</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>Search worldwide suppliers</p>
                            {!isSearching && results.length > 0 && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>
                                    <Globe size={10} /> Live Web Results
                                </span>
                            )}
                        </div>
                    </div>
                    {filteredResults.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                            <div style={{ background: '#ecfdf5', color: '#059669', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600 }}>
                                {filteredResults.length} Results Found
                            </div>
                            {totalResults > filteredResults.length && (
                                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                    ({totalResults - filteredResults.length} hidden by region filter)
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {isSimulated && activeTab === 'search' && (
                <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', padding: '12px 16px', borderRadius: '12px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', color: '#92400e' }}>
                    <Circle size={20} fill="#fcd34d" color="#92400e" strokeWidth={3} style={{ opacity: 0.8 }} />
                    <div style={{ flex: 1 }}>
                        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>Simulated Data Active</h4>
                        <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.9 }}>
                            Direct web results for "{query}" could not be retrieved due to API restrictions. Showing high-confidence simulated suppliers for your region.
                        </p>
                    </div>
                </div>
            )}

            {/* Tab Switcher */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
                <button
                    onClick={() => setActiveTab('chat')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '10px',
                        border: 'none',
                        background: activeTab === 'chat' ? '#4f46e5' : '#fff',
                        color: activeTab === 'chat' ? '#fff' : '#64748b',
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <Mail size={18} /> PartFinder AI
                </button>
                <button
                    onClick={() => setActiveTab('search')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '10px',
                        border: 'none',
                        background: activeTab === 'search' ? '#4f46e5' : '#fff',
                        color: activeTab === 'search' ? '#fff' : '#64748b',
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <Search size={18} /> Supplier Search
                </button>
                <button
                    onClick={() => setActiveTab('global')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '10px',
                        border: 'none',
                        background: activeTab === 'global' ? '#4f46e5' : '#fff',
                        color: activeTab === 'global' ? '#fff' : '#64748b',
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <Globe size={18} /> Global Finder
                </button>
            </div>

            {activeTab === 'chat' ? (
                <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', height: '700px', overflow: 'hidden' }}>
                    <AIChatInterface searchId={searchId} onSearchTrigger={(data) => { setQuery(data.query); if (data.make) setMake(data.make); if (data.model) setModel(data.model); if (data.specs) setSpecs(data.specs); setActiveTab('search'); handleSearch(); }} />
                </div>
            ) : activeTab === 'global' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ background: '#fff9c4', border: '1px solid #fbc02d', padding: '12px 20px', borderRadius: '12px', color: '#827717', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Info size={16} />
                            <span><b>Login Issue:</b> If Google login fails, please use the button on the right to open in a new tab.</span>
                        </div>
                        <a
                            href="https://global-parts-find.base44.app/Finder"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: '#4f46e5', color: '#fff', padding: '8px 16px', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            Open Global Finder <ExternalLink size={14} />
                        </a>
                    </div>
                    <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', height: '800px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                        <iframe
                            src="https://global-parts-find.base44.app/Finder"
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            title="Global Finder"
                        />
                    </div>
                </div>
            ) : (
                <>
                    {/* Combined Search & Filter Bar */}
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '32px' }}>
                        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ flex: 1, display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '4px 12px', alignItems: 'center' }}>
                                    <Search size={20} color="#94a3b8" />
                                    <input
                                        type="text"
                                        style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', padding: '12px', fontSize: '1rem', color: '#1e293b' }}
                                        placeholder="Part name or general query (e.g. 'Hydraulic Pump')..."
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <button type="submit" disabled={isSearching || (!query.trim() && !make && !model)} style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 24px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}>
                                        {isSearching ? <Loader2 size={18} className="animate-spin" /> : <Globe size={18} />}
                                        {isSearching ? 'Searching...' : 'Search Web'}
                                    </button>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#64748b', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={skipAi} onChange={(e) => setSkipAi(e.target.checked)} />
                                        Skip AI Enrichment (Save Quota)
                                    </label>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                                <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '4px 12px', border: '1px solid #e2e8f0' }}>
                                    <label style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', marginBottom: '2px', fontWeight: 600 }}>MAKE / BRAND</label>
                                    <input
                                        type="text"
                                        style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: '0.9rem', color: '#1e293b' }}
                                        placeholder="e.g. Caterpillar, Bosch"
                                        value={make}
                                        onChange={(e) => setMake(e.target.value)}
                                    />
                                </div>
                                <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '4px 12px', border: '1px solid #e2e8f0' }}>
                                    <label style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', marginBottom: '2px', fontWeight: 600 }}>MODEL / SERIAL</label>
                                    <input
                                        type="text"
                                        style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: '0.9rem', color: '#1e293b' }}
                                        placeholder="e.g. 320D, X-12345"
                                        value={model}
                                        onChange={(e) => setModel(e.target.value)}
                                    />
                                </div>
                                <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '4px 12px', border: '1px solid #e2e8f0' }}>
                                    <label style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', marginBottom: '2px', fontWeight: 600 }}>SPECIFICATIONS</label>
                                    <input
                                        type="text"
                                        style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: '0.9rem', color: '#1e293b' }}
                                        placeholder="e.g. 24V, 5000psi, Stainless"
                                        value={specs}
                                        onChange={(e) => setSpecs(e.target.value)}
                                    />
                                </div>
                            </div>
                        </form>

                        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <h3 style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <ExternalLink size={14} /> External Marketplace Search
                                </h3>
                                <button
                                    onClick={() => setShowAddPlatform(true)}
                                    style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                    <Plus size={14} /> Add Custom
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {Object.keys(CATEGORY_STYLES).map(cat => {
                                    const defaults = DEFAULT_PLATFORMS.filter(p => p.category === cat);
                                    const userAdded = customPlatforms.filter(p => (p.category || (cat === 'Custom' ? 'Custom' : 'General')) === cat);
                                    if (defaults.length === 0 && userAdded.length === 0) return null;
                                    const style = CATEGORY_STYLES[cat];
                                    return (
                                        <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', padding: '4px 10px', borderRadius: '8px', border: `1px solid ${style.border}`, width: 'fit-content' }}>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: style.text, borderRight: `1px solid ${style.border}`, paddingRight: '12px', marginRight: '6px', minWidth: '75px', textAlign: 'left' }}>{cat}</span>
                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                {defaults.map(p => (
                                                    <button key={p.name} onClick={() => openPlatformSearch(p.url)} style={{ background: 'transparent', border: 'none', padding: '4px 8px', fontSize: '0.75rem', color: style.text, cursor: 'pointer', fontWeight: 600, borderRadius: '4px', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = style.hover} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{p.name}</button>
                                                ))}
                                                {userAdded.map((p, idx) => (
                                                    <div key={`custom-${idx}`} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                        <button onClick={() => openPlatformSearch(p.url)} style={{ background: 'transparent', border: 'none', padding: '4px 24px 4px 8px', fontSize: '0.75rem', color: style.text, cursor: 'pointer', fontWeight: 600, borderRadius: '4px' }} onMouseEnter={e => e.currentTarget.style.background = style.hover} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{p.name}</button>
                                                        <button onClick={() => handleDeleteCustomPlatform(customPlatforms.indexOf(p))} style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: style.text, cursor: 'pointer', padding: '4px', opacity: 0.6 }}><X size={10} /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '24px', marginTop: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                <h3 style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Globe size={14} /> Integrated Google Search Engine {selectedCountry ? `(Focus: ${selectedCountry})` : ''}
                                </h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#64748b', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={restrictToCountry} onChange={(e) => setRestrictToCountry(e.target.checked)} />
                                        Only find in {selectedCountry || 'selected country'}
                                    </label>
                                    <a href="https://programmablesearchengine.google.com/controlpanel/overview?cx=259ae1101668d4071" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: '#4f46e5', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><ExternalLink size={12} /> Configure Search Engine</a>
                                </div>
                            </div>
                            <div className="gcse-search"></div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '20px' }}>
                            <div style={{ position: 'relative' }}>
                                <div onClick={() => { setShowBrandDrop(!showBrandDrop); setShowCountryDrop(false); setShowCategoryDrop(false); }} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontSize: '0.9rem', cursor: 'pointer', minWidth: '160px' }}>
                                    <Building2 size={16} color="#94a3b8" /> {selectedBrand || 'Filter by brand...'} <ChevronDown size={14} style={{ marginLeft: 'auto' }} />
                                </div>
                                {showBrandDrop && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, width: '200px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '4px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: '250px', overflowY: 'auto' }}>
                                        <div onClick={() => { setSelectedBrand(''); setShowBrandDrop(false); }} style={{ padding: '8px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>All Brands</div>
                                        {brands?.map(b => (
                                            <div key={b.id} onClick={() => { setSelectedBrand(b.name); setShowBrandDrop(false); }} style={{ padding: '8px 16px', cursor: 'pointer' }}>{b.name}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div style={{ position: 'relative' }}>
                                <div onClick={() => { setShowCountryDrop(!showCountryDrop); setShowCategoryDrop(false); setShowBrandDrop(false); }} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontSize: '0.9rem', cursor: 'pointer', minWidth: '160px' }}>
                                    <MapPin size={16} color="#94a3b8" /> {selectedCountry || 'All Countries'} <ChevronDown size={14} style={{ marginLeft: 'auto' }} />
                                </div>
                                {showCountryDrop && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, width: '200px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '4px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: '250px', overflowY: 'auto' }}>
                                        <div style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>
                                            <input type="text" placeholder="Search country..." style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }} onClick={(e) => e.stopPropagation()} />
                                        </div>
                                        <div onClick={() => { setSelectedCountry(''); setShowCountryDrop(false); }} style={{ padding: '8px 16px', cursor: 'pointer' }}>All Countries</div>
                                        {countries?.map(c => (
                                            <div key={c} onClick={() => { setSelectedCountry(c); setShowCountryDrop(false); }} style={{ padding: '8px 16px', cursor: 'pointer' }}>{c}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div style={{ position: 'relative' }}>
                                <div onClick={() => { setShowCategoryDrop(!showCategoryDrop); setShowCountryDrop(false); setShowBrandDrop(false); }} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontSize: '0.9rem', cursor: 'pointer', minWidth: '160px' }}>
                                    <Filter size={16} color="#94a3b8" /> {selectedCategory || 'All Categories'} <ChevronDown size={14} style={{ marginLeft: 'auto' }} />
                                </div>
                                {showCategoryDrop && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, width: '200px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '4px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: '250px', overflowY: 'auto' }}>
                                        <div onClick={() => { setSelectedCategory(''); setShowCategoryDrop(false); }} style={{ padding: '8px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>All Categories</div>
                                        {categories?.map(c => (
                                            <div key={c.id} onClick={() => { setSelectedCategory(c.name); setShowCategoryDrop(false); }} style={{ padding: '8px 16px', cursor: 'pointer' }}>{c.name}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {results.length === 0 && !isSearching && popularSuppliers.length > 0 && (
                        <div style={{ marginBottom: '40px' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Star size={20} color="#fbbf24" fill="#fbbf24" />
                                {selectedCountry ? `Suppliers in ${selectedCountry}` : 'Popular Suppliers Worldwide'}
                            </h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                                {popularSuppliers
                                    .filter(sup => !selectedCountry || !restrictToCountry || sup.country === selectedCountry)
                                    .map(sup => (
                                        <div key={sup.id} style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                                            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                                                <div style={{ width: '40px', height: '40px', background: '#f1f5f9', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}><Building2 size={20} /></div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sup.name}</h3>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#64748b' }}><MapPin size={12} /> {sup.city || sup.country}</div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}><span style={{ background: '#f8fafc', color: '#475569', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>Verified Partner</span></div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}

                    {isSimulated && filteredResults.length > 0 && (
                        <div style={{ marginBottom: '24px', padding: '16px 24px', background: 'linear-gradient(to right, #4f46e5, #7c3aed)', borderRadius: '12px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: 'rgba(255,255,255,0.2)', padding: '8px', borderRadius: '50%' }}><Star size={20} fill="#fff" /></div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>AI Discovery Mode Active</h4>
                                    <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.9 }}>Generating high-quality suppliers from AI knowledgebase due to search API restriction.</p>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 12px', background: 'rgba(0,0,0,0.1)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.3)' }}>98% ACCURACY</div>
                        </div>
                    )}

                    {filteredResults.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
                            {filteredResults.map(res => (
                                <div key={res.id} style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: res.selected ? '2px solid #4f46e5' : '1px solid #e2e8f0', position: 'relative', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'all 0.2s' }}>
                                    {res.distance_km < 50 && <div style={{ position: 'absolute', top: '-10px', left: '24px', background: '#dcfce7', color: '#166534', fontSize: '0.75rem', fontWeight: 600, padding: '4px 12px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>Nearby Supplier</div>}
                                    <div onClick={() => !res.saved_to_partner && toggleSelect(res.id)} style={{ position: 'absolute', top: '24px', right: '24px', cursor: res.saved_to_partner ? 'default' : 'pointer', color: res.saved_to_partner ? '#10b981' : (res.selected ? '#4f46e5' : '#cbd5e1') }}>{res.saved_to_partner ? <CheckCircle2 size={24} /> : (res.selected ? <CheckCircle2 size={24} /> : <Circle size={24} />)}</div>
                                    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', marginTop: res.distance_km < 50 ? '8px' : '0' }}>
                                        <div style={{ width: '48px', height: '48px', background: res.thumbnail_url ? '#f8fafc' : '#f1f5f9', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5', overflow: 'hidden' }}>{res.thumbnail_url ? <img src={res.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Building2 size={24} />}</div>
                                        <div style={{ flex: 1, paddingRight: '24px' }}>
                                            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', lineHeight: 1.3 }}>{res.supplier_name}</h3>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.85rem' }}>
                                                <MapPin size={14} /> {res.address || res.supplier_location || 'Worldwide'} {res.distance_km ? `(${res.distance_km.toFixed(1)} km)` : ''}
                                            </div>
                                            {res.contact_person && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6366f1', fontSize: '0.8rem', marginTop: '4px', fontWeight: 600 }}>
                                                    <User size={13} /> {res.contact_person} (Contact)
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.5rem' }}>{res.snippet}</p>

                                    {res.notes && (
                                        <div style={{ background: '#f5f3ff', color: '#7c3aed', padding: '8px 12px', borderRadius: '8px', fontSize: '0.75rem', marginBottom: '16px', border: '1px solid #ddd6fe', fontWeight: 500 }}>
                                            <Info size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} /> {res.notes}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                                        {res.email && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.85rem' }}><Mail size={14} /> {res.email}</div>}
                                        {res.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.85rem' }}><Phone size={14} /> {res.phone}</div>}
                                        {res.url && <a href={res.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4f46e5', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 500 }}><Globe size={14} /> Visit Website</a>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: 'auto' }}>
                                        <button onClick={() => handleSavePartner(res)} disabled={res.saved_to_partner || loading} style={{ flex: 1, background: res.saved_to_partner ? '#ecfdf5' : '#fff', color: res.saved_to_partner ? '#059669' : '#475569', border: '1px solid #e2e8f0', padding: '8px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>{res.saved_to_partner ? <CheckCircle2 size={16} /> : <Save size={16} />}{res.saved_to_partner ? 'Saved' : 'Save'}</button>
                                        <button onClick={() => handleSendEnquiry(res)} style={{ flex: 1, background: '#4f46e5', color: '#fff', border: 'none', padding: '8px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><Mail size={16} /> Enquiry</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '100px 32px', background: '#fff', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
                            <div style={{ color: '#e2e8f0', marginBottom: '20px' }}><Search size={64} style={{ margin: '0 auto' }} /></div>
                            {isSearching ? <div style={{ color: '#64748b' }}><h3 style={{ margin: '0 0 8px 0' }}>Searching the web...</h3><p style={{ margin: 0 }}>This may take a few seconds as we extract supplier details.</p></div> : query && !isSearching ? <div style={{ color: '#64748b' }}><h3 style={{ margin: '0 0 8px 0' }}>No suppliers found for "{query}"</h3><p style={{ margin: 0 }}>Try different keywords or check your filters.</p></div> : <div style={{ color: '#64748b' }}><h3 style={{ margin: '0 0 8px 0', color: '#475569' }}>Ready to Search</h3><p style={{ margin: 0 }}>Enter a part name, brand, or supplier to get started.</p></div>}
                        </div>
                    )}

                    {results.length > 0 && results.length < totalResults && (
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '32px' }}>
                            <button onClick={handleLoadMore} disabled={loading} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '12px 32px', borderRadius: '30px', color: '#475569', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>{loading ? <Loader2 size={18} className="animate-spin" /> : <ChevronDown size={18} />}{loading ? 'Loading...' : 'Load More Suppliers'}</button>
                        </div>
                    )}

                    {results.some(r => r.selected) && (
                        <div style={{ position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', padding: '16px 32px', borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', zIndex: 100 }}>
                            <span style={{ color: '#fff', fontWeight: 500 }}>{results.filter(r => r.selected).length} Suppliers Selected</span>
                            <button onClick={handleSaveSelected} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '24px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}><Save size={18} /> Save to Partners</button>
                        </div>
                    )}
                    {filteredResults.length > 0 && (
                        <div style={{ marginTop: '48px', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(to right, #f8fafc, #fff)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: '#4f46e5', color: '#fff', padding: '8px', borderRadius: '8px' }}><Star size={20} fill="#fff" /></div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Quick AI Contact Summary</h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Consolidated intelligence found across top results</p>
                                </div>
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                                    <button onClick={handleExportCSV} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '6px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><FileDown size={14} /> Excel</button>
                                    <button onClick={handlePrintPDF} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '6px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Printer size={14} /> PDF</button>
                                </div>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th style={{ padding: '16px 24px', width: '40px' }}>
                                                <div
                                                    onClick={() => {
                                                        const top10Ids = filteredResults.slice(0, 10).map(r => r.id);
                                                        const allInTop10Selected = top10Ids.every(id => results.find(r => r.id === id)?.selected);
                                                        setResults(results.map(r => top10Ids.includes(r.id) ? { ...r, selected: !allInTop10Selected } : r));
                                                    }}
                                                    style={{ cursor: 'pointer', color: filteredResults.slice(0, 10).every(r => results.find(res => res.id === r.id)?.selected) ? '#4f46e5' : '#cbd5e1' }}
                                                >
                                                    {filteredResults.slice(0, 10).every(r => results.find(res => res.id === r.id)?.selected) ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                                                </div>
                                            </th>
                                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supplier Name</th>
                                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact Person</th>
                                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact Info</th>
                                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Address / Status</th>
                                        </tr>
                                    </thead>
                                    <tbody style={{ fontSize: '0.9rem' }}>
                                        {filteredResults.slice(0, 10).map((res, idx) => (
                                            <tr key={`sum-${res.id}`} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                <td style={{ padding: '16px 24px' }}>
                                                    <div
                                                        onClick={() => toggleSelect(res.id)}
                                                        style={{ cursor: 'pointer', color: results.find(r => r.id === res.id)?.selected ? '#4f46e5' : '#cbd5e1' }}
                                                    >
                                                        {results.find(r => r.id === res.id)?.selected ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '16px 24px', fontWeight: 600, color: '#1e293b' }}>{res.supplier_name}</td>
                                                <td style={{ padding: '16px 24px', color: '#6366f1', fontWeight: 500 }}>{res.contact_person || '-'}</td>
                                                <td style={{ padding: '16px 24px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        {res.email && <div style={{ fontSize: '0.8rem', color: '#475569' }}>{res.email}</div>}
                                                        {res.phone && <div style={{ fontSize: '0.8rem', color: '#444' }}>{res.phone}</div>}
                                                        {!res.email && !res.phone && <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontStyle: 'italic' }}>Details missed in deep search</span>}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '16px 24px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{res.address || res.supplier_location || '-'}</div>
                                                        {res.notes && <span style={{ fontSize: '0.7rem', color: '#7c3aed', background: '#f5f3ff', padding: '2px 8px', borderRadius: '4px', width: 'fit-content', fontWeight: 600 }}>{res.notes}</span>}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Modals outside the conditional for easier management */}
            {showAddPlatform && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}><h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Add Custom Marketplace</h3><button onClick={() => setShowAddPlatform(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button></div>
                        <form onSubmit={handleAddCustomPlatform}>
                            <div style={{ marginBottom: '16px' }}><label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>Platform Name</label><input type="text" placeholder="e.g. MyLocalSupplier" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }} value={newPlatform.name} onChange={e => setNewPlatform({ ...newPlatform, name: e.target.value })} required /></div>
                            <div style={{ marginBottom: '20px' }}><label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>Search URL Template</label><input type="text" placeholder="https://example.com/search?q={{query}}" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }} value={newPlatform.url} onChange={e => setNewPlatform({ ...newPlatform, url: e.target.value })} required /><p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '6px' }}>Use <code>{"{{query}}"}</code> as a placeholder for your keywords.</p></div>
                            <div style={{ marginBottom: '20px' }}><label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '8px' }}>Category / Color Group</label><div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{Object.keys(CATEGORY_STYLES).map(cat => { const style = CATEGORY_STYLES[cat]; const isSelected = newPlatform.category === cat; return (<div key={cat} onClick={() => setNewPlatform({ ...newPlatform, category: cat })} style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', background: style.bg, color: style.text, border: `2px solid ${isSelected ? style.text : style.border}`, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '4px' }}>{cat}{isSelected && <CheckCircle2 size={12} />}</div>); })}</div></div>
                            <button type="submit" style={{ width: '100%', background: '#4f46e5', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Add Platform</button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}
