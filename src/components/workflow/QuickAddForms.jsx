import React, { useState, useEffect } from 'react';
import { Ship, User, Users, MapPin, X, Save, Globe, Mail, Phone, Map, ExternalLink, Plus, Sparkles, Loader2, RefreshCw, Upload, ChevronDown, Paperclip, FileCheck, Calculator, FileText, Search, Check, RotateCcw, Pencil, Camera, Archive, Trash2, Receipt, Smartphone, Image, HardDrive, Info, Folder, FolderOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { savePartner, saveContact, deleteContact, saveJobMajorCategory, getJobMajorCategories, deleteJobMajorCategory } from '../../lib/store';
import { saveJobExpense } from '../../lib/jobExpenseService';
import BusinessCardUpload from '../common/BusinessCardUpload';
import { COUNTRIES, PARTNER_CATEGORIES } from '../../lib/constants';
import { smartSearchCompany, researchContactWithGemini, researchVesselWithGemini, parseOCRBusinessCard, extractDualPartnerContact } from '../../lib/geminiService';
import { performOCR } from '../../lib/googleAuthService';
import { runUniversalSearch } from '../../lib/universalFinder';
import { parseSupplierBillWithAi } from '../../lib/BillOcrService';
import RichTextEditor from '../common/RichTextEditor';
import CompanyAutocomplete from '../common/CompanyAutocomplete';
import PartnerDocuments from '../partners/PartnerDocuments';
import SmartOCRModal from '../common/SmartOCRModal';
import toast from 'react-hot-toast';
import DriveScannerLinker from '../workflows/DriveScannerLinker';
import GDriveConnectionModal from '../common/GDriveConnectionModal';
import { listFolderContent, getOrCreateFolder } from '../../lib/driveService';
import { isTokenValid, getStoredToken } from '../../lib/googleAuthService';


// Generic Modal Base
export const Modal = ({ isOpen, onClose, title, children, icon: Icon, size = 'md' }) => {
    if (!isOpen) return null;
    const maxWidth = size === 'xl' ? '1300px' : size === 'lg' ? '1000px' : '700px';

    return (
        <div className="quick-modal-overlay">
            <div className="quick-modal-content" style={{ maxWidth }}>
                <div className="quick-modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {Icon && <Icon size={20} className="text-accent" />}
                        <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{title}</h3>
                    </div>
                    <button className="icon-btn-close" onClick={onClose}><X size={20} /></button>
                </div>
                <div className="quick-modal-body">
                    {children}
                </div>
            </div>
            <style dangerouslySetInnerHTML={{
                __html: `
                .quick-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    backdrop-filter: blur(4px);
                    padding: 20px;
                }
                .quick-modal-content {
                    background: #fff;
                    width: 100%;
                    max-height: 90vh;
                    border-radius: 12px;
                    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    animation: modal-slide-up 0.3s ease-out;
                }
                @keyframes modal-slide-up {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .quick-modal-header {
                    padding: 16px 24px;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #fff;
                    z-index: 10;
                }
                .quick-modal-body {
                    padding: 24px;
                    overflow-y: auto;
                    flex: 1;
                }
                .icon-btn-close {
                    background: transparent;
                    border: none;
                    color: #64748b;
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 6px;
                }
                .icon-btn-close:hover { background: #f1f5f9; color: #1e293b; }
                .text-accent { color: #6366f1; }
                .quick-form-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    margin-top: 24px;
                    padding-top: 16px;
                    border-top: 1px solid #e2e8f0;
                    background: #fff;
                }
                .grid-2 {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                }
                .full-width {
                    grid-column: 1 / -1;
                }
                .ai-pulse {
                    animation: ai-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
                @keyframes ai-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: .5; }
                }
            `}} />
        </div>
    );
};

// Quick Partner Add
export const QuickPartnerAdd = ({ company_id, initialData, onSuccess, onCancel, hideActions = false, onDataChange, title: propTitle, defaultType = 'Supplier', aiDisabled = false, onImportDraft }) => {
    const [formData, setFormData] = useState(initialData || {
        name: '',
        uen: '',
        types: [defaultType],
        address: '',
        country: '',
        email1: '',
        phone1: '',
        weblink: '',
        customerCredit: '',
        supplierCredit: '',
        customerCreditTime: '',
        supplierCreditTime: '',
        city: '',
        pincode: '',
        brand: '',
        activity_summary: '',
        notes: '',
        business_card_url: '',
        business_card_back_url: ''
    });
    const [customCategory, setCustomCategory] = useState('');
    const [isAiResearching, setIsAiResearching] = useState(false);
    const [showOCRModal, setShowOCRModal] = useState(false);
    const [aiPreview, setAiPreview] = useState(null);
    const [aiStatus, setAiStatus] = useState('');
    const [isMapsResearching, setIsMapsResearching] = useState(false);
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
                console.error('Failed to search drafts:', err);
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
        if (onDataChange) onDataChange(updated);
        
        if (onImportDraft) {
            onImportDraft(draft);
        } else {
            toast.success(`Imported and approved draft: ${draft.name}`);
        }
        setDraftMatches([]);
    };

    useEffect(() => {
        if (initialData) {
            setFormData(prev => ({ ...prev, ...initialData }));
        }
    }, [initialData]);

    const handleCompanySelect = (place) => {
        const address = place.formatted_address || '';
        const name = place.name || '';
        const weblink = place.website || '';
        const phone = place.formatted_phone_number || '';

        let country = '';
        let city = '';
        let pincode = '';
        place.address_components?.forEach(c => {
            if (c.types.includes('country')) country = c.long_name;
            if (c.types.includes('locality')) city = c.long_name;
            if (c.types.includes('postal_code')) pincode = c.long_name;
        });

        const updated = {
            ...formData,
            name,
            address: address || formData.address,
            city: city || formData.city,
            pincode: pincode || formData.pincode,
            country: country || formData.country,
            weblink: weblink || formData.weblink,
            phone1: phone || formData.phone1
        };
        setFormData(updated);
        if (onDataChange) onDataChange(updated);
    };

    const handleGoogleMapsResearch = async () => {
        if (!formData.name) return alert('Please enter a Company Name first.');
        
        setIsMapsResearching(true);
        setAiStatus('🛰️ Connecting to Google Maps...');
        
        // Timeout handling
        const timeoutId = setTimeout(() => {
            if (isMapsResearching) {
                setIsMapsResearching(false);
                setAiStatus('');
                alert('Google Maps research timed out. Please try again or check your connection.');
            }
        }, 15000);

        try {
            if (!window.google || !window.google.maps || !window.google.maps.places) {
                throw new Error('Google Maps SDK not loaded');
            }

            const service = new window.google.maps.places.PlacesService(document.createElement('div'));
            
            service.findPlaceFromQuery({
                query: formData.name,
                fields: ['name', 'formatted_address', 'place_id', 'website', 'formatted_phone_number', 'address_components', 'types']
            }, (results, status) => {
                clearTimeout(timeoutId);
                if (status === window.google.maps.places.PlacesServiceStatus.OK && results && results[0]) {
                    setAiStatus('📍 Retrieving location intelligence...');
                    service.getDetails({ 
                        placeId: results[0].place_id, 
                        fields: ['name', 'formatted_address', 'website', 'formatted_phone_number', 'address_components', 'types'] 
                    }, async (place, detailsStatus) => {
                        if (detailsStatus === window.google.maps.places.PlacesServiceStatus.OK) {
                            const mapsData = {
                                uen: '',
                                address: place.formatted_address || '',
                                phone1: place.formatted_phone_number || '',
                                website: place.website || '',
                                country: '',
                                city: '',
                                pincode: ''
                            };

                            place.address_components?.forEach(c => {
                                if (c.types.includes('country')) mapsData.country = c.long_name;
                                if (c.types.includes('locality')) mapsData.city = c.long_name;
                                if (c.types.includes('postal_code')) mapsData.pincode = c.long_name;
                            });

                            const previewData = {
                                ...mapsData,
                                categories: place.types || [],
                                brands: '',
                                activity_summary: `Found via Google Maps: ${place.name}`,
                                confidence: 95,
                                manual_verification_required: false,
                                source: 'Google Maps (Verified Location)'
                            };

                            setAiPreview(previewData);
                            
                            setFormData(prev => ({
                                ...prev,
                                address: mapsData.address || prev.address,
                                phone1: mapsData.phone1 || prev.phone1,
                                weblink: mapsData.website || prev.weblink,
                                country: mapsData.country || prev.country,
                                city: mapsData.city || prev.city,
                                pincode: mapsData.pincode || prev.pincode
                            }));

                            if (place.website || formData.name) {
                                setAiStatus('🤖 AI background enrichment for UEN & Brands...');
                                smartSearchCompany(formData.name, place.website, `Verified Website: ${place.website}`)
                                    .then(aiResult => {
                                        if (aiResult && aiResult.uen) {
                                            setAiPreview(prev => ({
                                                ...prev,
                                                uen: aiResult.uen || prev.uen,
                                                brands: aiResult.brands || prev.brands,
                                                activity_summary: aiResult.activity_summary || prev.activity_summary,
                                                email1: aiResult.email || prev.email1,
                                                confidence: 100,
                                                source: 'Google Maps + AI Intelligence'
                                            }));
                                        }
                                        setIsMapsResearching(false);
                                        setAiStatus('');
                                    })
                                    .catch(aiErr => {
                                        console.warn('Background AI enrichment failed:', aiErr);
                                        setIsMapsResearching(false);
                                        setAiStatus('');
                                    });
                            } else {
                                setIsMapsResearching(false);
                                setAiStatus('');
                            }
                        } else {
                            alert('No details found for this company on Google Maps.');
                            setIsMapsResearching(false);
                            setAiStatus('');
                        }
                    });
                } else {
                    alert('Company not found on Google Maps.');
                    setIsMapsResearching(false);
                    setAiStatus('');
                }
            });
        } catch (err) {
            clearTimeout(timeoutId);
            console.error('Maps Research Error:', err);
            alert(`Maps Research failed: ${err.message}`);
            setIsMapsResearching(false);
            setAiStatus('');
        }
    };


    const handleOCR = async (text) => {
        if (!text) return;
        setIsAiResearching(true);
        try {
            const result = await parseOCRBusinessCard(text);
            if (result) {
                setFormData(prev => ({
                    ...prev,
                    name: prev.name || result.company_name || '',
                    email1: prev.email1 || result.email || '',
                    phone1: prev.phone1 || result.phone || '',
                    weblink: prev.weblink || result.website || '',
                    address: prev.address || result.address || '',
                    activity_summary: prev.activity_summary || result.services || '',
                    brand: prev.brand || result.brands || '',
                    notes: (prev.notes || '') + `\n\n--- OCR EXTRACTED TEXT ---\n${text}`
                }));
            }
        } catch (err) {
            console.error('OCR Parsing failed', err);
        } finally {
            setIsAiResearching(false);
        }
    };

    const handleAiAutofill = async () => {
        if (!formData.name) return alert('Please enter a Company Name first.');
        
        setIsAiResearching(true);
        setAiStatus('🔍 Deep web search for UEN & Registries...');
        try {
            // 1. Gather live context with better queries
            const queries = [
                formData.name,
                `${formData.name} Singapore UEN`,
                `${formData.name} official website contact`
            ];
            
            let searchContext = '';
            try {
                const { data: { user } } = await supabase.auth.getUser();
                // Perform multiple searches or at least one very good one
                const searchId = await runUniversalSearch({ 
                    query: queries[1], // Focus on UEN search
                    userId: user?.id || '00000000-0000-0000-0000-000000000000',
                    skipAi: true
                });
                
                const { data: results } = await supabase
                    .from('search_results')
                    .select('title, snippet, url')
                    .eq('search_id', searchId)
                    .limit(5);
                
                if (results && results.length > 0) {
                    searchContext = results.map(r => `[Web Data] ${r.title} (${r.url}): ${r.snippet}`).join('\n');
                }
            } catch (searchErr) {
                console.warn('[AI] Live search unavailable.');
            }

            setAiStatus('📊 Extracting company intelligence...');
            
            // 2. Use the new Smart Search with the gathered context
            const result = await smartSearchCompany(formData.name, formData.weblink, searchContext);

            if (result.confidence < 50 || !result.uen) {
                setAiStatus('🛡️ Low confidence detected. Attempting Google Maps fallback...');
                // Automatically try Google Maps if AI is uncertain
                try {
                    const service = new window.google.maps.places.PlacesService(document.createElement('div'));
                    service.findPlaceFromQuery({
                        query: formData.name,
                        fields: ['name', 'formatted_address', 'place_id', 'website', 'formatted_phone_number', 'address_components', 'types']
                    }, (results, status) => {
                        if (status === window.google.maps.places.PlacesServiceStatus.OK && results && results[0]) {
                            service.getDetails({ 
                                placeId: results[0].place_id, 
                                fields: ['name', 'formatted_address', 'website', 'formatted_phone_number', 'address_components', 'types'] 
                            }, (place, detailsStatus) => {
                                if (detailsStatus === window.google.maps.places.PlacesServiceStatus.OK) {
                                    // Merge AI result with Maps result
                                    const merged = {
                                        ...result,
                                        address: result.address || place.formatted_address || '',
                                        phone: result.phone || place.formatted_phone_number || '',
                                        website: result.website || place.website || '',
                                        source: 'AI + Google Maps'
                                    };
                                    
                                    // Fill in address components from Maps if missing
                                    place.address_components?.forEach(c => {
                                        if (c.types.includes('country') && !merged.country) merged.country = c.long_name;
                                        if (c.types.includes('locality') && !merged.postal_code) merged.city = c.long_name;
                                        if (c.types.includes('postal_code') && !merged.postal_code) merged.postal_code = c.long_name;
                                    });

                                    setAiPreview({
                                        uen: merged.uen || '',
                                        address: merged.address || '',
                                        country: merged.country || '',
                                        city: merged.city || '',
                                        pincode: merged.postal_code || '',
                                        email1: merged.email || '',
                                        phone1: merged.phone || '',
                                        website: merged.website || '',
                                        categories: merged.categories || [],
                                        brands: merged.brands || '',
                                        activity_summary: merged.activity_summary || `Verified via Google Maps: ${place.name}`,
                                        confidence: Math.max(merged.confidence, 85),
                                        manual_verification_required: merged.manual_verification_required,
                                        source: merged.source
                                    });
                                }
                            });
                        }
                    });
                } catch (mapsErr) {
                    console.warn('Maps fallback failed:', mapsErr);
                }
            }

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
                    confidence: result.confidence,
                    manual_verification_required: result.manual_verification_required,
                    extraInfo: `Categories: ${result.categories?.join(', ') || 'N/A'}. Brands: ${result.brands || 'N/A'}.`
                });
            }
        } catch (err) {
            console.error('AI Research Error:', err);
            setAiPreview({
                error: err.message || 'Unknown Research Error',
                confidence: 0,
                manual_verification_required: true
            });
        } finally {
            setIsAiResearching(false);
            setAiStatus('');
        }
    };

    const applyAiResults = () => {
        if (!aiPreview) return;
        const updated = {
            ...formData,
            uen: aiPreview.uen || formData.uen,
            address: aiPreview.address || formData.address,
            country: aiPreview.country || formData.country,
            city: aiPreview.city || formData.city,
            pincode: aiPreview.pincode || formData.pincode,
            email1: aiPreview.email1 || formData.email1,
            phone1: aiPreview.phone1 || formData.phone1,
            weblink: aiPreview.website || formData.weblink,
            brand: aiPreview.brands || formData.brand,
            activity_summary: aiPreview.activity_summary || formData.activity_summary,
            notes: aiPreview.activity_summary ? `${formData.notes || ''}\n\n--- AI ACTIVITY SUMMARY ---\n${aiPreview.activity_summary}` : (formData.notes || '')
        };
        setFormData(updated);
        if (onDataChange) onDataChange(updated);
        setAiPreview(null);
    };

    const handleCategoryToggle = (cat) => {
        setFormData(prev => ({
            ...prev,
            types: prev.types.includes(cat)
                ? prev.types.filter(t => t !== cat)
                : [...prev.types, cat]
        }));
    };

    const handleAddCustomCategory = () => {
        if (customCategory.trim() && !formData.types.includes(customCategory.trim())) {
            setFormData(prev => ({
                ...prev,
                types: [...prev.types, customCategory.trim()]
            }));
            setCustomCategory('');
        }
    };
    const openWebsite = () => {
        const url = formData.weblink;
        if (url) {
            const path = url.startsWith('http') ? url : `https://${url}`;
            window.open(path, '_blank');
        } else {
            window.open('https://www.google.com', '_blank');
        }
    };

    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        const updated = { ...formData, [name]: value };
        setFormData(updated);
        if (onDataChange) onDataChange(updated);
    };

    const handleSave = async () => {
        if (!formData.name) return alert('Name is required');
        setLoading(true);
        try {
            const isExisting = !!formData.id;
            const dataToSave = {
                ...formData,
                company_id
            };
            // Sanitize payload to remove joined columns and generated columns that don't belong to the 'partners' table update
            delete dataToSave.contacts;
            Object.keys(dataToSave).forEach(key => {
                if (key.startsWith('norm_')) delete dataToSave[key];
            });

            const { data, error } = isExisting 
                ? await supabase.from('partners').update(dataToSave).eq('id', formData.id).select()
                : await supabase.from('partners').insert([dataToSave]).select();
            if (error) throw error;
            onSuccess(data[0]);
        } catch (err) {
            console.error(err);
            alert(`Failed to save partner: ${err.message || 'Check connection.'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: '24px', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #6366f1, #10b981)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)' }}>
                    <Users size={20} />
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', fontFamily: "'Outfit', sans-serif", margin: 0 }}>{propTitle || (initialData ? 'Edit Customer Details' : 'Add New Customer')}</h2>
            </div>

            {/* AI Research Section */}
            {!aiDisabled && (
                <div className="glass-panel" style={{ marginBottom: '24px', padding: '16px', background: 'linear-gradient(to right, #f8fafc, #f1f5f9)', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ position: 'relative' }}>
                                <Sparkles size={18} color="#6366f1" />
                                {isAiResearching && <div className="ai-pulse" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: '50%' }} />}
                            </div>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#4338ca', letterSpacing: '0.02em' }}>Intelligent Auto-fill</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={handleAiAutofill}
                                disabled={isAiResearching || isMapsResearching || !formData.name}
                                className="btn"
                                style={{
                                    background: isAiResearching ? '#f1f5f9' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                    color: 'white',
                                    padding: '8px 16px',
                                    borderRadius: '12px',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: isAiResearching ? 'none' : '0 4px 12px rgba(99, 102, 241, 0.2)'
                                }}
                            >
                                {isAiResearching ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                                {isAiResearching ? 'AI Researching...' : 'Research with AI'}
                            </button>
                            <button
                                onClick={handleGoogleMapsResearch}
                                disabled={isAiResearching || isMapsResearching || !formData.name}
                                className="btn"
                                style={{
                                    background: isMapsResearching ? '#f1f5f9' : '#fff',
                                    color: '#1e293b',
                                    padding: '8px 16px',
                                    borderRadius: '12px',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    border: '1px solid #e2e8f0',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease'
                                }}
                            >
                                {isMapsResearching ? <Loader2 className="animate-spin" size={16} /> : <MapPin size={16} color="#ef4444" />}
                                {isMapsResearching ? 'Mapping...' : 'Search Google Maps'}
                            </button>
                        </div>
                    </div>

                    {/* AI Research Findings Card */}
                    {(aiPreview || isAiResearching) && (
                        <div className="ai-card-premium animate-fade-in" style={{ padding: '20px', borderRadius: '16px', marginBottom: '20px' }}>
                            {isAiResearching && <div className="ai-scanning-line" />}
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ padding: '4px 10px', background: aiPreview?.error ? '#fee2e2' : 'rgba(16, 185, 129, 0.1)', color: aiPreview?.error ? '#ef4444' : '#059669', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {aiPreview?.error ? 'Failure' : (aiPreview?.source || 'Research Findings')}
                                    </div>
                                    {aiPreview && !aiPreview.error && !isAiResearching && (
                                        <div style={{ 
                                            padding: '4px 10px', 
                                            background: aiPreview.confidence > 80 ? '#dcfce7' : aiPreview.confidence > 50 ? '#fef3c7' : '#fee2e2', 
                                            color: aiPreview.confidence > 80 ? '#15803d' : aiPreview.confidence > 50 ? '#92400e' : '#ef4444', 
                                            borderRadius: '20px', 
                                            fontSize: '0.7rem', 
                                            fontWeight: 800, 
                                            textTransform: 'uppercase', 
                                            letterSpacing: '0.05em' 
                                        }}>
                                            {aiPreview.confidence}% Confidence
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => setAiPreview(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={16} /></button>
                            </div>

                            {isAiResearching ? (
                                <div style={{ textAlign: 'center', padding: '20px' }}>
                                    <div style={{ fontSize: '1rem', color: '#6366f1', fontWeight: 700, marginBottom: '8px' }}>{aiStatus}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Traversing SGP registries and global industrial data...</div>
                                </div>
                            ) : aiPreview?.error ? (
                                <div style={{ padding: '12px', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.85rem' }}>
                                    <strong>Research Loop Terminated:</strong><br/>
                                    {aiPreview.error}
                                    <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#b91c1c' }}>
                                        Check your Google Cloud credentials or quota.
                                    </div>
                                </div>
                            ) : aiPreview && (
                                <div style={{ fontSize: '0.85rem', color: '#334155', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '12px' }}><strong>UEN:</strong> <span style={{ color: '#0f172a', fontWeight: 600 }}>{aiPreview.uen || '-'}</span></div>
                                    <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '12px' }}><strong>Pincode:</strong> <span style={{ color: '#0f172a', fontWeight: 600 }}>{aiPreview.pincode || '-'}</span></div>
                                    <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '12px' }}><strong>Email:</strong> <span style={{ color: '#0f172a', fontWeight: 600 }}>{aiPreview.email1 || '-'}</span></div>
                                    <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '12px' }}><strong>Phone:</strong> <span style={{ color: '#0f172a', fontWeight: 600 }}>{aiPreview.phone1 || '-'}</span></div>
                                    <div style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '10px', borderRadius: '12px' }}><strong>Website:</strong> <span style={{ color: '#4338ca', fontWeight: 600, textDecoration: 'underline' }}>{aiPreview.website || '-'}</span></div>
                                    <div style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '10px', borderRadius: '12px' }}><strong>Address:</strong> <span style={{ color: '#0f172a', fontWeight: 600 }}>{aiPreview.address || '-'}</span></div>
                                    <div style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '10px', borderRadius: '12px' }}><strong>Brands Represented:</strong> <span style={{ color: '#0f172a', fontWeight: 600 }}>{aiPreview.brands || '-'}</span></div>
                                    
                                    {aiPreview.activity_summary && (
                                        <div style={{ gridColumn: 'span 2', background: 'linear-gradient(to right, #f5f3ff, #ede9fe)', padding: '14px', borderRadius: '12px', border: '1px dashed #c7d2fe' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', marginBottom: '4px' }}>Business Activity Insight</div>
                                            <span style={{ fontSize: '0.85rem', color: '#4338ca', fontStyle: 'italic', lineHeight: 1.6 }}>"{aiPreview.activity_summary}"</span>
                                        </div>
                                    )}

                                    <div style={{ gridColumn: 'span 2', display: 'flex', gap: '10px', marginTop: '4px' }}>
                                        <button onClick={applyAiResults} className="btn" style={{ flex: 1, background: '#10b981', color: 'white', fontWeight: 600 }}><Check size={16} /> Apply Results to Form</button>
                                        <button onClick={() => setAiPreview(null)} className="btn" style={{ background: '#f1f5f9', color: '#64748b' }}><RotateCcw size={16} /> Reject</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {draftMatches.length > 0 && (
                <div style={{
                    marginBottom: '20px',
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

            <div style={{ display: 'grid', gridTemplateColumns: '7fr 3fr', gap: '20px', marginBottom: '20px' }}>
                <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label className="form-label" style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', margin: 0 }}>Company Name *</label>
                        {formData.name && (
                            <a 
                                href={`https://www.google.com/search?q=${encodeURIComponent(formData.name)}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                style={{ color: '#6366f1', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                Search <Search size={12} />
                            </a>
                        )}
                    </div>
                    <CompanyAutocomplete
                        value={formData.name}
                        onChange={(val) => {
                            const updated = { ...formData, name: val };
                            setFormData(updated);
                            if (onDataChange) onDataChange(updated);
                        }}
                        onSelect={handleCompanySelect}
                        placeholder="Enter company name..."
                        aiDisabled={aiDisabled}
                    />
                </div>
                <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>UEN / Registration No</label>
                    <input
                        type="text"
                        className="premium-input"
                        name="uen"
                        value={formData.uen}
                        onChange={handleChange}
                        placeholder="e.g. 201436227C"
                        style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', outline: 'none' }}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>HQ Address</label>
                    <textarea
                        className="premium-input"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        placeholder="Full primary address"
                        style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', outline: 'none', height: '60px', resize: 'vertical' }}
                    />
                </div>

                <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Country *</label>
                    <select
                        className="premium-input"
                        name="country"
                        value={formData.country}
                        onChange={handleChange}
                        style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', outline: 'none' }}
                        required
                    >
                        <option value="">Select Country</option>
                        {COUNTRIES.map(country => (
                            <option key={country} value={country}>{country}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>City</label>
                    <input
                        type="text"
                        className="premium-input"
                        name="city"
                        value={formData.city}
                        onChange={handleChange}
                        placeholder="City name"
                        style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', outline: 'none' }}
                    />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Pincode / Postal Code</label>
                    <input
                        type="text"
                        className="premium-input"
                        name="pincode"
                        value={formData.pincode}
                        onChange={handleChange}
                        placeholder="6-digit code"
                        style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', outline: 'none' }}
                    />
                </div>

                <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Phone</label>
                    <input
                        type="text"
                        className="premium-input"
                        name="phone1"
                        value={formData.phone1}
                        onChange={handleChange}
                        placeholder="+65 6297 1011"
                        style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', outline: 'none' }}
                    />
                </div>
                <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Email *</label>
                    <input
                        type="email"
                        className="premium-input"
                        name="email1"
                        value={formData.email1}
                        onChange={handleChange}
                        placeholder="sales@company.com"
                        style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', outline: 'none' }}
                        required
                    />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.02em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Company Website</span>
                        <a 
                            href={`https://www.google.com/search?q=${encodeURIComponent(formData.weblink || formData.name || '')}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            style={{ color: '#6366f1', textTransform: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                            Search <Search size={12} />
                        </a>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <input
                            type="text"
                            className="premium-input"
                            value={formData.weblink}
                            onChange={(e) => {
                                const updated = { ...formData, weblink: e.target.value };
                                setFormData(updated);
                                if (onDataChange) onDataChange(updated);
                            }}
                            placeholder="https://company.com"
                            style={{ width: '100%', padding: '10px 14px', paddingRight: '60px', borderRadius: '8px', border: '1.5px solid #e2e8f0', outline: 'none' }}
                        />
                        {formData.weblink && (
                            <a href={formData.weblink} target="_blank" rel="noopener noreferrer" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6366f1', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                Visit <ExternalLink size={12} />
                            </a>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: '32px' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', marginBottom: '12px' }}>Categories</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {['Principal', 'International Supplier', 'Local Supplier', 'Freelancer', 'Service Company', 'Spare Parts', 'Service', 'Calibration', 'Automation', 'Electrical', 'Mechanical', 'Instrumentation', 'Safety Equipment', 'Industrial Supplies', 'Supplier', 'Customer'].map(cat => (
                        <div
                            key={cat}
                            className={`category-chip ${formData.types.includes(cat) ? 'active' : ''}`}
                            onClick={() => handleCategoryToggle(cat)}
                        >
                            {cat}
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', marginBottom: '24px' }}>
                <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', marginBottom: '8px' }}>Company Services / Activity</label>
                    <textarea
                        className="premium-input"
                        name="activity_summary"
                        value={formData.activity_summary}
                        onChange={handleChange}
                        placeholder="Describe services provided by the company"
                        style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1.5px solid #e2e8f0', outline: 'none', height: '100px', resize: 'vertical' }}
                    />
                </div>
                <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', marginBottom: '8px' }}>Dealing Brands</label>
                    <textarea
                        className="premium-input"
                        name="brand"
                        value={formData.brand}
                        onChange={handleChange}
                        placeholder="List brands represented or handled"
                        style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1.5px solid #e2e8f0', outline: 'none', height: '80px', resize: 'vertical' }}
                    />
                </div>
            </div>

            {/* Conditional Credit Sections */}
            {(formData.types.includes('Customer') || formData.types.includes('Supplier')) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px', padding: '20px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    {formData.types.includes('Customer') && (
                        <>
                            <div className="form-group">
                                <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 800, color: '#4338ca' }}>Customer Credit Limit (SGD)</label>
                                <input className="premium-input" name="customerCredit" value={formData.customerCredit} onChange={handleChange} placeholder="e.g. 5000" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #e2e8f0' }} />
                            </div>
                            <div className="form-group">
                                <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 800, color: '#4338ca' }}>Customer Credit Terms (Days)</label>
                                <input className="premium-input" name="customerCreditTime" type="number" value={formData.customerCreditTime} onChange={handleChange} placeholder="e.g. 30" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #e2e8f0' }} />
                            </div>
                        </>
                    )}
                    {formData.types.includes('Supplier') && (
                        <>
                            <div className="form-group">
                                <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 800, color: '#059669' }}>Supplier Credit Limit (SGD)</label>
                                <input className="premium-input" name="supplierCredit" value={formData.supplierCredit} onChange={handleChange} placeholder="e.g. 10000" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #e2e8f0' }} />
                            </div>
                            <div className="form-group">
                                <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 800, color: '#059669' }}>Supplier Credit Terms (Days)</label>
                                <input className="premium-input" name="supplierCreditTime" type="number" value={formData.supplierCreditTime} onChange={handleChange} placeholder="e.g. 60" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #e2e8f0' }} />
                            </div>
                        </>
                    )}
                </div>
            )}

            {!aiDisabled && (
                <div style={{ marginBottom: '24px', padding: '20px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <BusinessCardUpload
                        frontValue={formData.business_card_url}
                        backValue={formData.business_card_back_url}
                        onFrontChange={(url) => setFormData(prev => ({ ...prev, business_card_url: url }))}
                        onBackChange={(url) => setFormData(prev => ({ ...prev, business_card_back_url: url }))}
                        onOCR={handleOCR}
                        onSmartOCR={() => setShowOCRModal(true)}
                        label="Business Card Scan (Auto-fills Form)"
                    />
                    
                    <SmartOCRModal 
                        isOpen={showOCRModal}
                        onClose={() => setShowOCRModal(false)}
                        onApply={(res) => {
                            if (res.structured) {
                                setFormData(prev => ({
                                    ...prev,
                                    name: prev.name || res.structured.company_name || '',
                                    uen: prev.uen || res.structured.uen || '',
                                    email1: prev.email1 || res.structured.email || '',
                                    phone1: prev.phone1 || res.structured.phone || res.structured.mobile || '',
                                    address: prev.address || res.structured.address || '',
                                    weblink: prev.weblink || res.structured.website || '',
                                    notes: (prev.notes || '') + '\n\n' + (res.rawText || '')
                                }));
                            } else if (res.rawText) {
                                handleOCR(res.rawText);
                            }
                        }}
                    />
                </div>
            )}

            <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', marginBottom: '8px' }}>Notes & Business Profile</label>
                <RichTextEditor 
                    value={formData.notes || ''} 
                    onChange={(val) => setFormData(prev => ({ ...prev, notes: val }))} 
                    placeholder="Enter additional profile details, research notes, etc..."
                    height="150px"
                />
            </div>

            {!hideActions && (
                <div style={{ display: 'flex', gap: '12px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="btn btn-primary"
                        style={{ flex: 1, height: '48px', borderRadius: '14px', fontSize: '1rem', fontWeight: 600, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none' }}
                    >
                        {loading ? <Loader2 className="animate-spin" /> : (initialData ? `Update ${defaultType} Profile` : `Create ${defaultType} Profile`)}
                    </button>
                    <button
                        onClick={onCancel}
                        className="btn"
                        style={{ height: '48px', width: '48px', borderRadius: '14px', background: '#f1f5f9', color: '#64748b', padding: 0, border: 'none' }}
                    >
                        <X size={20} />
                    </button>
                </div>
            )}
        </div>
    );
};

export const QuickContactAdd = ({ company_id, partner_id, partners, initialData, onSuccess, onCancel, hideActions = false, onDataChange, aiDisabled = false }) => {
    const [formData, setFormData] = useState(initialData || {
        name: '',
        email: '',
        partnerId: partner_id || '',
        post: '',
        phone: '',
        handphone: '',
        address: '',
        business_card_url: '',
        business_card_back_url: '',
        department: ''
    });
    const [loading, setLoading] = useState(false);
    const [isAiResearching, setIsAiResearching] = useState(false);
    const [showOCRModal, setShowOCRModal] = useState(false);

    useEffect(() => {
        if (initialData) {
            setFormData(prev => ({ ...prev, ...initialData }));
        }
    }, [initialData]);

    useEffect(() => {
        if (partner_id) {
            setFormData(prev => {
                const updated = { ...prev, partnerId: partner_id };
                if (onDataChange) onDataChange(updated);
                return updated;
            });
        }
    }, [partner_id, onDataChange]);

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
            }
        } catch (err) {
            console.error('OCR Parsing failed', err);
        } finally {
            setIsAiResearching(false);
        }
    };

    const handleAiAutofill = async () => {
        if (!formData.name) return alert('Please enter a Contact Name first.');
        
        setIsAiResearching(true);
        try {
            let researchData;
            try {
                const partner = partners.find(p => p.id === formData.partnerId);
                researchData = await researchContactWithGemini(formData.name, partner?.name);
            } catch (geminiErr) {
                console.warn('Gemini Contact Research failed, falling back to edge function...', geminiErr);
                const { data, error } = await supabase.functions.invoke('research-contact', {
                    body: { name: formData.name, partnerId: formData.partnerId }
                });
                if (error) throw error;
                researchData = data;
            }

            if (researchData) {
                setFormData(prev => ({
                    ...prev,
                    ...researchData.fields
                }));
            }
        } catch (err) {
            console.error('AI Research Error:', err);
            alert('AI Research failed. Please fill manually or check contact name.');
        } finally {
            setIsAiResearching(false);
        }
    };


    const handleChange = (e) => {
        const { name, value } = e.target;
        const updated = { ...formData, [name]: value };
        setFormData(updated);
        if (onDataChange) onDataChange(updated);
    };

    const handleSave = async () => {
        if (!formData.name || !formData.partnerId) return alert('Name and Partner are required');
        setLoading(true);
        try {
            const saved = await saveContact({
                ...formData,
                company_id: formData.company_id || company_id
            });
            if (onSuccess) onSuccess(saved);
        } catch (err) {
            console.error('Failed to save contact:', err);
            alert(`Failed to save contact: ${err.message || 'Check console'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* AI Research Banner */}
            {!aiDisabled && (
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '12px 20px', 
                    background: 'linear-gradient(90deg, #f0f9ff 0%, #e0f2fe 100%)', 
                    borderRadius: '12px',
                    border: '1px solid #bae6fd'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Sparkles size={18} className={isAiResearching ? 'ai-pulse text-accent' : 'text-accent'} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0369a1' }}>
                            {isAiResearching ? 'AI is profiling contact...' : 'Contact Intelligence'}
                        </span>
                    </div>
                    <button 
                        type="button" 
                        onClick={handleAiAutofill}
                        disabled={isAiResearching || !formData.name}
                        style={{ 
                            padding: '6px 12px', 
                            borderRadius: '8px', 
                            background: '#fff', 
                            border: '1px solid #bae6fd', 
                            color: '#0ea5e9', 
                            fontSize: '0.85rem', 
                            fontWeight: 600, 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                    >
                        {isAiResearching ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        Profile with AI
                    </button>
                </div>
            )}

            <div className="grid-2">
                <div className="form-item full-width">
                    <label>Customer / Partner *</label>
                    <select
                        className="form-select"
                        name="partnerId"
                        value={formData.partnerId}
                        onChange={handleChange}
                    >
                        <option value="">Select Partner...</option>
                        {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>

                <div className="form-item">
                    <label>Contact Name *</label>
                    <input
                        className="form-input"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="e.g. John Doe"
                        autoFocus
                    />
                </div>

                <div className="form-item">
                    <label>Department</label>
                    <input
                        className="form-input"
                        name="department"
                        value={formData.department || ''}
                        onChange={handleChange}
                        placeholder="e.g. Sales, Technical"
                    />
                </div>

                <div className="form-item">
                    <label>Post / Designation</label>
                    <input
                        className="form-input"
                        name="post"
                        value={formData.post}
                        onChange={handleChange}
                        placeholder="e.g. Purchasing Manager"
                    />
                </div>

                <div className="form-item">
                    <label><Mail size={14} /> Email Address</label>
                    <input
                        className="form-input"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="john@example.com"
                    />
                </div>

                <div className="form-item">
                    <label><Phone size={14} /> Office Phone</label>
                    <input
                        className="form-input"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="+65 ...."
                    />
                </div>

                <div className="form-item">
                    <label><Phone size={14} /> Handphone / Mobile</label>
                    <input
                        className="form-input"
                        name="handphone"
                        value={formData.handphone}
                        onChange={handleChange}
                        placeholder="+65 ...."
                    />
                </div>

                <div className="form-item full-width">
                    <label>Contact Address (if different)</label>
                    <textarea
                        className="form-textarea"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        placeholder="Enter specific address if any..."
                        rows={2}
                    />
                </div>
            </div>

            {!aiDisabled && (
                <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px' }}>
                    <BusinessCardUpload
                        frontValue={formData.business_card_url}
                        backValue={formData.business_card_back_url}
                        onFrontChange={(url) => setFormData(prev => ({ ...prev, business_card_url: url }))}
                        onBackChange={(url) => setFormData(prev => ({ ...prev, business_card_back_url: url }))}
                        onOCR={handleOCR}
                        onSmartOCR={() => setShowOCRModal(true)}
                        label="Contact Business Card (Auto-fills Fields)"
                    />

                    <SmartOCRModal 
                        isOpen={showOCRModal}
                        onClose={() => setShowOCRModal(false)}
                        title="Smart Contact OCR"
                        onApply={(res) => {
                            if (res.structured) {
                                setFormData(prev => ({
                                    ...prev,
                                    name: prev.name || res.structured.person_name || '',
                                    email: prev.email || res.structured.email || '',
                                    handphone: prev.handphone || res.structured.mobile || res.structured.phone || '',
                                    post: prev.post || res.structured.designation || '',
                                    department: prev.department || res.structured.department || '',
                                    address: prev.address || res.structured.address || ''
                                }));
                            } else if (res.rawText) {
                                handleOCR(res.rawText);
                            }
                        }}
                    />
                </div>
            )}

            {!hideActions && (
                <div className="quick-form-actions">
                    <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={loading || !formData.name || !formData.partnerId}>
                        <Save size={18} /> {loading ? 'Saving...' : 'Save Contact'}
                    </button>
                </div>
            )}
        </div>
    );
};

// NEW: Combined Partner & Contact Dual Add
export const QuickPartnerContactDualAdd = ({ company_id, initialPartner, initialContact, partners, onSuccess, onCancel, title, defaultType = 'Supplier' }) => {
    const [activeTab, setActiveTab] = useState('details'); // 'details' | 'documents'
    const [smartPasteEnabled, setSmartPasteEnabled] = useState(false);
    const [partnerData, setPartnerData] = useState(initialPartner || {
        name: '',
        uen: '',
        types: ['Supplier'],
        address: '',
        country: '',
        email1: '',
        phone1: '',
        weblink: '',
        city: '',
        pincode: '',
        brand: '',
        activity_summary: '',
        notes: '',
        business_card_url: '',
        business_card_back_url: ''
    });
    const [contactData, setContactData] = useState(initialContact || {
        name: '', email: '', handphone: '', type: 'Main', department: '', post: ''
    });
    const [loading, setLoading] = useState(false);
    const [existingContacts, setExistingContacts] = useState([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [aiResult, setAiResult] = useState(null);
    const [showReview, setShowReview] = useState(false);
    const [showLookupModal, setShowLookupModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');


    const loadContact = (c) => {
        setContactData({
            id: c.id,
            name: c.name || '',
            email: c.email || '',
            handphone: c.handphone || '',
            phone: c.phone || '',
            post: c.post || '',
            department: c.department || '',
            address: c.address || '',
            partnerId: c.partnerId || ''
        });
    };

    const clearContact = () => {
        setContactData({
            name: '',
            email: '',
            handphone: '',
            type: 'Main',
            department: '',
            post: '',
            address: '',
            phone: ''
        });
    };

    const processExtractedData = async (data) => {
        if (!data) return;
        
        let processed = { ...data };
        
        // If UEN is missing but company name exists, perform deep research
        if (processed.partner?.name && !processed.partner?.uen) {
            console.log(`[Smart Paste] Missing UEN for ${processed.partner.name}. Triggering deep research...`);
            try {
                const research = await smartSearchCompany(processed.partner.name);
                if (research && research.uen) {
                    processed.partner = {
                        ...processed.partner,
                        uen: research.uen || processed.partner.uen,
                        address: research.address || processed.partner.address,
                        city: research.city || processed.partner.city,
                        country: research.country || processed.partner.country,
                        pincode: research.postal_code || processed.partner.pincode,
                        website: research.website || processed.partner.website
                    };
                }
            } catch (err) {
                console.warn('Smart Research failed during paste processing:', err);
            }
        }
        
        setAiResult(processed);
        setShowReview(true);
    };

    const handlePaste = async (e) => {
        if (!smartPasteEnabled) return;
        // Only allow paste on the details tab
        if (activeTab !== 'details') return;

        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                setIsExtracting(true);
                try {
                    const text = await performOCR(file);
                    if (text) {
                        const result = await extractDualPartnerContact(text);
                        await processExtractedData(result);
                    }
                } catch (err) {
                    console.error('Paste OCR Error:', err);
                } finally {
                    setIsExtracting(false);
                }
                break;
            } else if (item.type === 'text/plain') {
                item.getAsString(async (text) => {
                    setIsExtracting(true);
                    try {
                        const result = await extractDualPartnerContact(text);
                        await processExtractedData(result);
                    } catch (err) {
                        console.error('Paste AI Error:', err);
                    } finally {
                        setIsExtracting(false);
                    }
                });
                break;
            }
        }
    };


    const applyAiResult = () => {
        if (!aiResult) return;

        setPartnerData(prev => ({
            ...prev,
            name: aiResult.partner?.name || prev.name,
            uen: aiResult.partner?.uen || prev.uen,
            address: aiResult.partner?.address || prev.address,
            country: aiResult.partner?.country || prev.country,
            city: aiResult.partner?.city || prev.city,
            pincode: aiResult.partner?.pincode || prev.pincode,
            email1: aiResult.partner?.email || prev.email1,
            phone1: aiResult.partner?.phone || prev.phone1,
            weblink: aiResult.partner?.website || prev.weblink
        }));

        setContactData(prev => ({
            ...prev,
            name: aiResult.contact?.name || prev.name,
            email: aiResult.contact?.email || prev.email,
            handphone: aiResult.contact?.handphone || prev.handphone,
            phone: aiResult.contact?.phone || prev.phone,
            post: aiResult.contact?.post || prev.post,
            department: aiResult.contact?.department || prev.department
        }));

        setShowReview(false);
        setAiResult(null);
    };


    useEffect(() => {
        if (initialPartner) setPartnerData(initialPartner);
    }, [initialPartner]);

    useEffect(() => {
        if (initialContact) setContactData(initialContact);
    }, [initialContact]);

    useEffect(() => {
        if (!partnerData.name) {
            setExistingContacts([]);
            return;
        }
        const match = (partners || []).find(p => p.name.toLowerCase() === partnerData.name.trim().toLowerCase());
        if (match) {
            supabase.from('contacts').select('*').eq('partnerId', match.id)
                .then(({ data }) => setExistingContacts(data || []));
        } else {
            setExistingContacts([]);
        }
    }, [partnerData.name, partners]);

    const handleSaveAll = async () => {
        if (!partnerData.name) return alert('Partner Name is required');
        setLoading(true);
        try {
            // Validate UUID for company_id to prevent database syntax errors
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const validCompanyId = uuidRegex.test(company_id) ? company_id : null;

            // Sanitize partner payload
            const partnerPayload = { ...partnerData, company_id: validCompanyId };
            delete partnerPayload.contacts;
            delete partnerPayload.isAiResearching;
            delete partnerPayload.isMapsResearching;
            delete partnerPayload.aiStatus;
            delete partnerPayload.aiPreview;
            delete partnerPayload.cleanedQuery;
            delete partnerPayload.isCleaning;
            delete partnerPayload.isExtracting;
            delete partnerPayload.customCategory;
            Object.keys(partnerPayload).forEach(key => {
                if (key.startsWith('norm_')) delete partnerPayload[key];
            });

            // 1. Save Partner
            const isPartnerExisting = !!partnerData.id;
            const { data: pData, error: pError } = isPartnerExisting 
                ? await supabase.from('partners').update(partnerPayload).eq('id', partnerData.id).select()
                : await supabase.from('partners').insert([partnerPayload]).select();
            
            if (pError) throw pError;
            if (!pData || pData.length === 0) {
                throw new Error('No partner data returned from database operation');
            }
            const savedPartner = pData[0];

            // 2. Save Contact if name is provided
            let savedContact = null;
            if (contactData.name) {
                const contactPayload = {
                    ...contactData,
                    partnerId: savedPartner.id,
                    company_id: contactData.company_id || validCompanyId
                };
                savedContact = await saveContact(contactPayload);
            }

            onSuccess({ partner: savedPartner, contact: savedContact });
        } catch (err) {
            console.error('Dual Save Error:', err);
            alert(`Failed to save: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div onPaste={handlePaste} style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
            {isExtracting && (
                <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.85)',
                    zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)', borderRadius: '16px'
                }}>
                    <div className="ai-pulse" style={{ background: '#6366f1', padding: '16px', borderRadius: '50%', color: '#fff', marginBottom: '16px' }}>
                        <Sparkles size={32} />
                    </div>
                    <span style={{ fontWeight: 800, color: '#6366f1', fontSize: '1.1rem' }}>AI is analyzing...</span>
                    <span style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>Extracting partner and contact data from paste</span>
                </div>
            )}

            {showReview && aiResult && (
                <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.4)',
                    zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)', padding: '20px'
                }}>
                    <div style={{
                        background: '#fff', width: '100%', maxWidth: '520px', borderRadius: '24px',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.2)'
                    }}>
                        <div style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', padding: '24px', color: '#fff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ background: 'rgba(255,255,255,0.2)', padding: '8px', borderRadius: '10px' }}>
                                        <Sparkles size={20} />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>Review Extraction</div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Found Partner & Contact Info</div>
                                    </div>
                                </div>
                                <button onClick={() => setShowReview(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}><X size={20} /></button>
                            </div>
                        </div>
                        
                        <div style={{ padding: '24px', maxHeight: '450px', overflowY: 'auto' }}>
                            <div style={{ marginBottom: '24px' }}>
                                <div style={{ fontWeight: 800, fontSize: '0.75rem', color: '#6366f1', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f1f5f9', pb: '8px' }}>
                                    <Users size={14} /> 1. Partner (Company)
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <ReviewItem label="Company Name" value={aiResult.partner?.name} />
                                    <ReviewItem label="UEN / Reg No" value={aiResult.partner?.uen} />
                                    <ReviewItem label="Email" value={aiResult.partner?.email} />
                                    <ReviewItem label="Phone" value={aiResult.partner?.phone} />
                                    <ReviewItem label="Website" value={aiResult.partner?.website} fullWidth />
                                    <ReviewItem label="Address" value={aiResult.partner?.address} fullWidth />
                                </div>
                            </div>
                            
                            <div>
                                <div style={{ fontWeight: 800, fontSize: '0.75rem', color: '#10b981', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f1f5f9', pb: '8px' }}>
                                    <User size={14} /> 2. Primary Contact
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <ReviewItem label="Contact Name" value={aiResult.contact?.name} />
                                    <ReviewItem label="Designation" value={aiResult.contact?.post} />
                                    <ReviewItem label="Email" value={aiResult.contact?.email} />
                                    <ReviewItem label="Handphone" value={aiResult.contact?.handphone} />
                                </div>
                            </div>
                        </div>
                        
                        <div style={{ padding: '20px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '12px' }}>
                            <button onClick={() => setShowReview(false)} className="btn btn-secondary" style={{ flex: 1, height: '48px', borderRadius: '14px', fontWeight: 600 }}>Discard</button>
                            <button onClick={applyAiResult} className="btn btn-primary" style={{ flex: 2, height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none', fontWeight: 700, boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)' }}>
                                <Check size={18} /> Apply Information
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs Header */}
            <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid #e2e8f0', marginBottom: '24px', padding: '0 4px' }}>
                <button 
                    onClick={() => setActiveTab('details')}
                    style={{
                        padding: '12px 16px',
                        border: 'none',
                        background: 'none',
                        borderBottom: activeTab === 'details' ? '3px solid #6366f1' : '3px solid transparent',
                        color: activeTab === 'details' ? '#6366f1' : '#64748b',
                        fontWeight: activeTab === 'details' ? 700 : 500,
                        cursor: 'pointer',
                        fontSize: '0.95rem',
                        transition: 'all 0.2s'
                    }}
                >
                    1. Partner Details
                </button>
                <button 
                    onClick={() => setActiveTab('documents')}
                    disabled={!partnerData.name}
                    style={{
                        padding: '12px 16px',
                        border: 'none',
                        background: 'none',
                        borderBottom: activeTab === 'documents' ? '3px solid #6366f1' : '3px solid transparent',
                        color: activeTab === 'documents' ? '#6366f1' : '#64748b',
                        fontWeight: activeTab === 'documents' ? 700 : 500,
                        cursor: partnerData.name ? 'pointer' : 'not-allowed',
                        fontSize: '0.95rem',
                        opacity: partnerData.name ? 1 : 0.5,
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                    title={!partnerData.name ? 'Enter partner name first to enable documents' : ''}
                >
                    2. Documents & Verification
                    {partnerData.gdrive_folder_id && <Check size={14} color="#10b981" />}
                </button>
            </div>

            {activeTab === 'details' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '1.2fr 1fr', 
                        gap: '32px', 
                        alignItems: 'start'
                    }}>
                        <div style={{ borderRight: '1px solid #e2e8f0', paddingRight: '32px' }}>
                            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6366f1' }}>
                                    <div style={{ background: '#e0e7ff', padding: '6px', borderRadius: '8px' }}><Users size={18} /></div>
                                    <span style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>STEP 1: PARTNER INFORMATION</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSmartPasteEnabled(!smartPasteEnabled)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: smartPasteEnabled ? '#f5f3ff' : '#f1f5f9',
                                        padding: '4px 10px',
                                        borderRadius: '20px',
                                        border: smartPasteEnabled ? '1px solid #ddd6fe' : '1px solid #cbd5e1',
                                        color: smartPasteEnabled ? '#7c3aed' : '#64748b',
                                        fontSize: '0.65rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                        outline: 'none'
                                    }}
                                    title={smartPasteEnabled ? "Click to turn OFF Smart Paste" : "Click to turn ON Smart Paste"}
                                >
                                    <Sparkles size={12} style={{ color: smartPasteEnabled ? '#7c3aed' : '#64748b' }} />
                                    {smartPasteEnabled ? 'SMART PASTE ACTIVE' : 'SMART PASTE INACTIVE'}
                                </button>
                            </div>

                            <QuickPartnerAdd 
                                company_id={company_id} 
                                initialData={partnerData} 
                                hideActions={true} 
                                onDataChange={setPartnerData} 
                                title={title}
                                defaultType={defaultType}
                                aiDisabled={!smartPasteEnabled}
                                onImportDraft={(draft) => {
                                    const contact = draft.contacts?.[0] || {};
                                    setContactData({
                                        id: contact.id || '',
                                        name: contact.name || '',
                                        email: contact.email || '',
                                        handphone: contact.handphone || '',
                                        phone: contact.phone || '',
                                        post: contact.post || '',
                                        department: contact.department || '',
                                        address: contact.address || '',
                                        partnerId: draft.id
                                    });
                                    toast.success(`Imported and approved draft: ${draft.name}`);
                                }}
                            />
                        </div>
                        <div>
                            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#10b981' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ background: '#d1fae5', padding: '6px', borderRadius: '8px' }}><User size={18} /></div>
                                    <span style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>STEP 2: PRIMARY CONTACT (OPTIONAL)</span>
                                </div>
                                {existingContacts.length > 0 && (
                                    <button 
                                        type="button"
                                        onClick={() => setShowLookupModal(true)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            background: '#ecfdf5',
                                            border: '1px solid #a7f3d0',
                                            color: '#059669',
                                            padding: '6px 12px',
                                            borderRadius: '20px',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#d1fae5';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = '#ecfdf5';
                                        }}
                                    >
                                        <Users size={12} /> Select Contact ({existingContacts.length})
                                    </button>
                                )}
                            </div>

                            {existingContacts.length > 0 && (
                                <div style={{ 
                                    marginBottom: '20px', 
                                    padding: '12px', 
                                    background: '#f0fdf4', 
                                    border: '1px solid #bbf7d0', 
                                    borderRadius: '10px',
                                    maxHeight: '150px',
                                    overflowY: 'auto'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#166534', marginBottom: '8px', fontSize: '0.8rem' }}>
                                        <Users size={14} />
                                        <span style={{ fontWeight: 700 }}>{existingContacts.length} Contacts already linked</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {existingContacts.map(c => (
                                            <div 
                                                key={c.id} 
                                                onClick={() => loadContact(c)}
                                                style={{ 
                                                    fontSize: '0.75rem', 
                                                    color: '#14532d', 
                                                    padding: '8px 12px', 
                                                    background: '#fff', 
                                                    borderRadius: '8px', 
                                                    border: '1px solid #dcfce7',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    transition: 'all 0.2s',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = '#dcfce7';
                                                    e.currentTarget.style.transform = 'translateX(2px)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = '#fff';
                                                    e.currentTarget.style.transform = 'none';
                                                }}
                                                title="Click to load contact details"
                                            >
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 700 }}>{c.name}</span>
                                                    {c.post && <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>{c.post}</span>}
                                                </div>
                                                <span style={{ fontSize: '0.65rem', color: '#059669', fontWeight: 600 }}>Load Details →</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {contactData.id && (
                                <div style={{ 
                                    marginBottom: '16px', 
                                    padding: '12px 16px', 
                                    background: '#e0f2fe', 
                                    border: '1px solid #bae6fd', 
                                    borderRadius: '12px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Sparkles size={16} color="#0369a1" />
                                        <div style={{ fontSize: '0.8rem', color: '#0369a1', fontWeight: 500 }}>
                                            Editing contact: <strong style={{ color: '#0369a1' }}>{contactData.name}</strong>
                                        </div>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={clearContact}
                                        style={{
                                            background: '#0284c7',
                                            border: 'none',
                                            color: '#fff',
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#0369a1'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = '#0284c7'}
                                    >
                                        Add New Instead
                                    </button>
                                </div>
                            )}

                            <QuickContactAdd 
                                company_id={company_id} 
                                partner_id={partnerData.id} 
                                partners={partners} 
                                initialData={contactData} 
                                hideActions={true} 
                                onDataChange={setContactData} 
                                aiDisabled={!smartPasteEnabled}
                            />

                            {showLookupModal && (
                                <Modal 
                                    isOpen={showLookupModal} 
                                    onClose={() => {
                                        setShowLookupModal(false);
                                        setSearchTerm('');
                                    }} 
                                    title={`Select Contact for ${partnerData.name || 'Partner'}`}
                                    icon={Users}
                                    size="md"
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <Search size={16} style={{ position: 'absolute', left: '12px', color: '#94a3b8' }} />
                                            <input
                                                className="form-input premium-input"
                                                style={{ paddingLeft: '40px', width: '100%', boxSizing: 'border-box' }}
                                                placeholder="Search contacts by name, email, department..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                autoFocus
                                            />
                                            {searchTerm && (
                                                <button
                                                    onClick={() => setSearchTerm('')}
                                                    style={{
                                                        position: 'absolute',
                                                        right: '12px',
                                                        background: 'none',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        color: '#94a3b8',
                                                        padding: 0
                                                    }}
                                                >
                                                    <X size={16} />
                                                </button>
                                            )}
                                        </div>

                                        <div style={{ 
                                            maxHeight: '350px', 
                                            overflowY: 'auto', 
                                            display: 'flex', 
                                            flexDirection: 'column', 
                                            gap: '10px',
                                            paddingRight: '4px'
                                        }}>
                                            {existingContacts.filter(c => {
                                                const term = searchTerm.toLowerCase().trim();
                                                if (!term) return true;
                                                return (c.name || '').toLowerCase().includes(term) ||
                                                       (c.email || '').toLowerCase().includes(term) ||
                                                       (c.post || '').toLowerCase().includes(term) ||
                                                       (c.department || '').toLowerCase().includes(term);
                                            }).map(c => (
                                                <div 
                                                    key={c.id}
                                                    onClick={() => {
                                                        loadContact(c);
                                                        setShowLookupModal(false);
                                                        setSearchTerm('');
                                                    }}
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        padding: '12px 16px',
                                                        background: '#f8fafc',
                                                        border: '1px solid #e2e8f0',
                                                        borderRadius: '10px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = '#f0f9ff';
                                                        e.currentTarget.style.borderColor = '#bae6fd';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = '#f8fafc';
                                                        e.currentTarget.style.borderColor = '#e2e8f0';
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>{c.name}</span>
                                                            {c.post && (
                                                                <span style={{ fontSize: '0.7rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                                                                    {c.post}
                                                                </span>
                                                            )}
                                                            {c.department && (
                                                                <span style={{ fontSize: '0.7rem', background: '#f5f3ff', color: '#7c3aed', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                                                                    {c.department}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: '#64748b', marginTop: '2px', flexWrap: 'wrap' }}>
                                                            {c.email && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={12} /> {c.email}</span>}
                                                            {c.handphone && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={12} /> {c.handphone}</span>}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        style={{
                                                            padding: '6px 12px',
                                                            background: '#fff',
                                                            border: '1px solid #cbd5e1',
                                                            borderRadius: '8px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 600,
                                                            color: '#6366f1',
                                                            cursor: 'pointer',
                                                            marginLeft: '12px'
                                                        }}
                                                    >
                                                        Select
                                                    </button>
                                                </div>
                                            ))}

                                            {existingContacts.length > 0 && existingContacts.filter(c => {
                                                const term = searchTerm.toLowerCase().trim();
                                                if (!term) return true;
                                                return (c.name || '').toLowerCase().includes(term) ||
                                                       (c.email || '').toLowerCase().includes(term) ||
                                                       (c.post || '').toLowerCase().includes(term) ||
                                                       (c.department || '').toLowerCase().includes(term);
                                            }).length === 0 && (
                                                <div style={{ textAlign: 'center', padding: '32px', color: '#64748b', fontSize: '0.85rem' }}>
                                                    No contacts match your search query.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </Modal>
                            )}

                            {/* Financials Section as per Image */}
                            <div style={{ marginTop: '24px', padding: '16px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', marginBottom: '12px' }}>
                                    <Calculator size={16} />
                                    <span style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>Financials (Partner)</span>
                                </div>
                                <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '12px', fontStyle: 'italic' }}>
                                    Select 'Customer' or 'Supplier' category to enable credit fields.
                                </p>
                                {(partnerData.types?.includes('Customer') || partnerData.types?.includes('Supplier')) ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        {partnerData.types.includes('Customer') && (
                                            <div style={{ padding: '10px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#6366f1', marginBottom: '4px' }}>CUST. LIMIT</div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{partnerData.customerCredit || 'Not Set'}</div>
                                            </div>
                                        )}
                                        {partnerData.types.includes('Supplier') && (
                                            <div style={{ padding: '10px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#059669', marginBottom: '4px' }}>SUPP. LIMIT</div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{partnerData.supplierCredit || 'Not Set'}</div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ height: '40px', background: '#f1f5f9', borderRadius: '8px', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#94a3b8' }}>
                                        No Financial Categories Selected
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div style={{ 
                        display: 'flex', 
                        justifyContent: 'flex-end', 
                        gap: '12px', 
                        paddingTop: '24px', 
                        borderTop: '2px solid #f1f5f9',
                        background: '#fff',
                        position: 'sticky',
                        bottom: 0,
                        zIndex: 20
                    }}>
                        <button className="btn btn-secondary" onClick={onCancel} style={{ padding: '12px 24px', borderRadius: '12px' }}>Cancel</button>
                        <button 
                            className="btn btn-primary" 
                            onClick={handleSaveAll} 
                            disabled={loading || !partnerData.name}
                            style={{ 
                                padding: '12px 32px', 
                                background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                                border: 'none',
                                fontWeight: 700,
                                borderRadius: '12px'
                            }}
                        >
                            {loading ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                            {loading ? 'Saving Everything...' : (partnerData.id ? 'Update Partner & Contact' : 'Create Partner & Contact')}
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ minHeight: '400px' }}>
                    <PartnerDocuments
                        partnerId={partnerData.id}
                        partnerName={partnerData.name}
                        initialFolderId={partnerData.gdrive_folder_id}
                        initialDriveLink={partnerData.google_drive_link}
                        onUpdate={(res) => setPartnerData(prev => ({ 
                            ...prev, 
                            gdrive_folder_id: res.id, 
                            google_drive_link: res.link 
                        }))}
                    />
                </div>
            )}
        </div>
    );
};

// Quick Vessel Add
export const QuickVesselAdd = ({ company_id, initialData, onSuccess, onCancel }) => {
    const [formData, setFormData] = useState(initialData || {
        vessel_name: '',
        imo_number: '',
        vessel_type: '',
        vessel_management: '',
        vessel_owner: '',
        mmsi: ''
    });
    const [loading, setLoading] = useState(false);
    const [isAiResearching, setIsAiResearching] = useState(false);

    const handleAiAutofill = async () => {
        if (!formData.vessel_name) return alert('Please enter a Vessel Name first.');
        
        setIsAiResearching(true);
        try {
            let researchData;
            try {
                researchData = await researchVesselWithGemini(formData.vessel_name);
            } catch (geminiErr) {
                console.warn('Gemini Vessel Research failed, falling back to edge function...', geminiErr);
                const { data, error } = await supabase.functions.invoke('research-vessel', {
                    body: { vesselName: formData.vessel_name }
                });
                if (error) throw error;
                researchData = data;
            }

            if (researchData?.fields) {
                const hasData = Object.values(researchData.fields).some(v => v && v.trim && v.trim());
                if (hasData) {
                    setFormData(prev => ({
                        ...prev,
                        ...researchData.fields
                    }));
                    toast.success(`AI filled vessel details (confidence: ${researchData.confidence || 'medium'}). Please verify before saving.`);
                } else {
                    toast.error('AI could not find vessel data. Please fill manually or check the vessel name.');
                }
            }
        } catch (err) {
            console.error('AI Research Error:', err);
            toast.error('AI Research failed: ' + (err.message || 'Unknown error. Please fill manually.'));
        } finally {
            setIsAiResearching(false);
        }
    };


    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        if (!formData.vessel_name) return alert('Vessel Name is required');
        setLoading(true);
        try {
            const isExisting = !!formData.id;
            
            // Sanitize payload to only include valid columns
            const payload = {
                vessel_name: formData.vessel_name,
                imo_number: formData.imo_number,
                vessel_type: formData.vessel_type,
                vessel_management: formData.vessel_management,
                vessel_owner: formData.vessel_owner,
                mmsi: formData.mmsi,
                company_id: company_id
            };

            const { data, error } = isExisting
                ? await supabase.from('vessels').update(payload).eq('id', formData.id).select()
                : await supabase.from('vessels').insert([payload]).select();
            if (error) throw error;
            onSuccess(data[0]);
        } catch (err) {
            console.error(err);
            alert('Failed to save vessel');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* AI Research Banner */}
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '12px 20px', 
                background: 'linear-gradient(90deg, #f0fdf4 0%, #dcfce7 100%)', 
                borderRadius: '12px',
                border: '1px solid #bbf7d0'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Sparkles size={18} className={isAiResearching ? 'ai-pulse text-accent' : 'text-accent'} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#15803d' }}>
                        {isAiResearching ? 'AI is sourcing maritime data...' : 'Vessel Intelligence'}
                    </span>
                </div>
                <button 
                    type="button" 
                    onClick={handleAiAutofill}
                    disabled={isAiResearching || !formData.vessel_name}
                    style={{ 
                        padding: '6px 12px', 
                        borderRadius: '8px', 
                        background: '#fff', 
                        border: '1px solid #bbf7d0', 
                        color: '#16a34a', 
                        fontSize: '0.85rem', 
                        fontWeight: 600, 
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                >
                    {isAiResearching ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    Source with AI
                </button>
            </div>

            <div className="form-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label>Vessel Name *</label>
                    {formData.vessel_name && (
                        <a 
                            href={`https://www.google.com/search?q=${encodeURIComponent(formData.vessel_name + ' vessel')}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ fontSize: '0.75rem', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontWeight: 600 }}
                        >
                            <Search size={12} /> Google Search
                        </a>
                    )}
                </div>
                <input
                    className="form-input"
                    name="vessel_name"
                    value={formData.vessel_name}
                    onChange={handleChange}
                    placeholder="e.g. MS Galaxy"
                    autoFocus
                />
            </div>
            <div className="grid-2">
                <div className="form-item">
                    <label>IMO Number</label>
                    <input
                        className="form-input"
                        name="imo_number"
                        value={formData.imo_number}
                        onChange={handleChange}
                        placeholder="e.g. 9123456"
                    />
                </div>
                <div className="form-item">
                    <label>MMSI Number</label>
                    <input
                        className="form-input"
                        name="mmsi"
                        value={formData.mmsi}
                        onChange={handleChange}
                        placeholder="e.g. 314658000"
                    />
                </div>
            </div>
            <div className="form-item">
                <label>Vessel Type</label>
                <input
                    className="form-input"
                    name="vessel_type"
                    value={formData.vessel_type}
                    onChange={handleChange}
                    placeholder="e.g. Bulk Carrier"
                />
            </div>
            <div className="grid-2">
                <div className="form-item">
                    <label>Management</label>
                    <input
                        className="form-input"
                        name="vessel_management"
                        value={formData.vessel_management}
                        onChange={handleChange}
                        placeholder="Management Co."
                    />
                </div>
                <div className="form-item">
                    <label>Owner</label>
                    <input
                        className="form-input"
                        name="vessel_owner"
                        value={formData.vessel_owner}
                        onChange={handleChange}
                        placeholder="Owner Co."
                    />
                </div>
            </div>
            <div className="quick-form-actions">
                <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={loading || !formData.vessel_name}>
                    <Save size={18} /> {loading ? 'Saving...' : 'Save Vessel'}
                </button>
            </div>
        </div>
    );
};

export const QuickWorkLocationAdd = ({ company_id, initialData, onSuccess, onCancel }) => {
    const [locationName, setLocationName] = useState(initialData?.location_name || '');
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        if (!locationName) return alert('Location Name is required');
        setLoading(true);
        try {
            const isExisting = !!initialData?.id;
            const { data, error } = isExisting
                ? await supabase.from('work_locations').update({ location_name: locationName }).eq('id', initialData.id).select()
                : await supabase.from('work_locations').insert([{
                    location_name: locationName,
                    company_id
                }]).select();
            if (error) throw error;
            onSuccess(data[0]);
        } catch (err) {
            console.error(err);
            alert('Failed to save location');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="form-item">
                <label>Location Name *</label>
                <input
                    className="form-input"
                    value={locationName}
                    onChange={e => setLocationName(e.target.value)}
                    placeholder="e.g. Port of Singapore"
                    autoFocus
                />
            </div>
            <div className="quick-form-actions">
                <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={loading || !locationName}>
                    <Save size={18} /> {loading ? 'Saving...' : 'Save Location'}
                </button>
            </div>
        </div>
    );
};

// Quick Expense Add
export const QuickExpenseAdd = ({ job_id, partners, jobs, expense, onSuccess, onCancel, onUploadBill, company_id, onOpenQRModal, galleryFiles }) => {
    const [formData, setFormData] = useState(expense || {
        job_id: job_id || '',
        job_no: '',
        supplier_id: '',
        invoice_no: '',
        invoice_date: new Date().toISOString().split('T')[0],
        description: '',
        unit_price: 0,
        quantity: 1,
        gst_rate: 9,
        gst_amount: 0,
        grand_total: 0,
        category: 'Material'
    });

    // Active Tab for Right Column: 'upload' or 'viewer'
    const [activeMediaTab, setActiveMediaTab] = useState(formData.bill_url ? 'viewer' : 'upload');

    // Initial job if editing or provided
    React.useEffect(() => {
        if (formData.job_id && jobs) {
            const j = jobs.find(job => job.id === formData.job_id);
            if (j) setFormData(prev => ({ ...prev, job_no: j.document_no }));
        }
    }, [formData.job_id, jobs]);

    const handleSelectJob = (job) => {
        setFormData(prev => ({ ...prev, job_id: job.id, job_no: job.document_no }));
    };

    const [supplierSearch, setSupplierSearch] = useState('');
    const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const [aiStatus, setAiStatus] = useState('');
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [showPhotoPicker, setShowPhotoPicker] = useState(false);
    const [jobBillsModal, setJobBillsModal] = useState({ isOpen: false, files: [], folderName: '', jobNo: '', isLoading: false });
    const [selectedDriveFolder, setSelectedDriveFolder] = useState('supplier_bills');
    const [driveFolderFiles, setDriveFolderFiles] = useState([]);
    const [loadingDriveFolder, setLoadingDriveFolder] = useState(false);
    const [currentFolderMeta, setCurrentFolderMeta] = useState({ id: null, name: 'Supplier Bills', jobNo: '' });

    const [localQrModal, setLocalQrModal] = useState({ isOpen: false, folderId: null, folderName: '', isLoading: false });
    const pollingIntervalRef = React.useRef(null);
    const supplierDropdownRef = React.useRef(null);

    React.useEffect(() => {
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
        };
    }, []);

    // Close supplier dropdown on outside click
    React.useEffect(() => {
        const handleClickOutside = (e) => {
            if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(e.target)) {
                setShowSupplierDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleOpenLocalQR = async () => {
        const token = sessionStorage.getItem('google_contacts_token') || localStorage.getItem('google_access_token');
        if (!token || !isTokenValid()) {
            setIsAuthModalOpen(true);
            return;
        }

        setLocalQrModal({ isOpen: true, folderId: null, folderName: '', isLoading: true });

        try {
            let targetFolderId = null;
            let folderName = 'General_Expenses';

            if (formData.job_id) {
                const selectedJob = jobs?.find(j => j.id === formData.job_id);
                const jobNo = selectedJob?.document_no || 'Job';
                const parentFolderId = selectedJob?.drive_folder_id || selectedJob?.gdrive_folder_id;

                if (parentFolderId) {
                    targetFolderId = await getOrCreateFolder(token, 'Expenses & Bills', parentFolderId);
                    folderName = `${jobNo} - Expenses & Bills`;
                } else {
                    const scansFolderId = await getOrCreateFolder(token, 'Celron_Scans');
                    const jobFolderId = await getOrCreateFolder(token, `Job_${jobNo}`, scansFolderId);
                    targetFolderId = await getOrCreateFolder(token, 'Expenses & Bills', jobFolderId);
                    folderName = `Job_${jobNo} - Expenses & Bills`;
                }
            } else {
                const scansFolderId = await getOrCreateFolder(token, 'Celron_Scans');
                targetFolderId = await getOrCreateFolder(token, 'General_Expenses', scansFolderId);
                folderName = 'General_Expenses';
            }

            setLocalQrModal({ isOpen: true, folderId: targetFolderId, folderName: folderName, isLoading: false });

            // Start Polling for new files
            const initialFiles = await listFolderContent(token, targetFolderId);
            const initialIds = new Set(initialFiles.map(f => f.id));

            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }

            pollingIntervalRef.current = setInterval(async () => {
                try {
                    const currentFiles = await listFolderContent(token, targetFolderId);
                    const newFile = currentFiles.find(f => !initialIds.has(f.id) && f.mimeType !== 'application/vnd.google-apps.folder');

                    if (newFile) {
                        // Success! A new file was detected.
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = null;

                        setFormData(prev => ({
                            ...prev,
                            bill_url: newFile.webViewLink,
                            notes: (prev.notes || '') + `\n[Linked via Mobile QR Upload: ${newFile.name}]`
                        }));
                        setActiveMediaTab('viewer');

                        setIsAiProcessing(true);
                        setAiStatus('🤖 Reading mobile upload...');

                        try {
                            const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${newFile.id}?alt=media`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                            });
                            if (fileRes.ok) {
                                const blob = await fileRes.blob();
                                const extractedText = await performOCR(blob);
                                if (extractedText) {
                                    setAiStatus('🤖 Gemini AI is parsing details...');
                                    const result = await parseSupplierBillWithAi('', extractedText);
                                    if (result) {
                                        let supplierId = formData.supplier_id;
                                        if (!supplierId && result.supplier_name) {
                                            const matched = partners?.find(p => 
                                                p.name.toLowerCase().includes(result.supplier_name.toLowerCase()) ||
                                                (result.uen && p.registration_no === result.uen)
                                            );
                                            if (matched) {
                                                supplierId = matched.id;
                                                setSupplierSearch(matched.name);
                                            } else {
                                                supplierId = '';
                                                setSupplierSearch(result.supplier_name);
                                            }
                                        }
                                        setFormData(prev => calculateTotals({
                                            ...prev,
                                            supplier_id: supplierId,
                                            invoice_no: result.invoice_no || prev.invoice_no,
                                            invoice_date: result.invoice_date || prev.invoice_date,
                                            description: result.supplier_name ? `Bill from ${result.supplier_name}` : prev.description,
                                            unit_price: result.subtotal || prev.unit_price,
                                            quantity: 1,
                                            gst_amount: result.gst_amount || prev.gst_amount,
                                            grand_total: result.total_amount || prev.grand_total,
                                            notes: (prev.notes || '') + `\nAI Extraction: ${result.supplier_name || 'Unknown'}. UEN: ${result.uen || 'N/A'}`
                                        }));
                                        setAiStatus('✅ Mobile upload parsed successfully!');
                                    }
                                }
                            }
                        } catch (ocrErr) {
                            console.error('Mobile upload OCR failed:', ocrErr);
                            setAiStatus('⚠️ Mobile upload linked, but AI extraction failed.');
                        } finally {
                            setIsAiProcessing(false);
                            setTimeout(() => setAiStatus(''), 4000);
                        }

                        setLocalQrModal(prev => ({ ...prev, isOpen: false }));
                    }
                } catch (pollErr) {
                    console.error("Polling error in local QR:", pollErr);
                }
            }, 2500);

        } catch (err) {
            console.error("Failed to set up local QR modal:", err);
            alert("Failed to initialize QR Modal: " + err.message);
            setLocalQrModal(prev => ({ ...prev, isOpen: false, isLoading: false }));
        }
    };

    const handleCloseLocalQR = () => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
        setLocalQrModal({ isOpen: false, folderId: null, folderName: '', isLoading: false });
    };

    const handlePickFromAccountPayable = async () => {
        const token = sessionStorage.getItem('google_contacts_token') || localStorage.getItem('google_access_token');
        if (!token || !isTokenValid()) {
            setIsAuthModalOpen(true);
            return;
        }
        setIsAiProcessing(true);
        setAiStatus('📂 Opening Account Payable Folder...');
        try {
            const folderId = '1MVrJO3j9xc9Ls9JpovmduW62i2YtfrRq';
            const files = await listFolderContent(token, folderId);
            const onlyFiles = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
            
            if (onlyFiles.length === 0) {
                alert("No scanned bills found in Account Payable folder.");
                setIsAiProcessing(false);
                setAiStatus('');
                return;
            }
            
            const fileNames = onlyFiles.map((f, i) => `${i + 1}. ${f.name}`).join('\n');
            const selection = window.prompt(`Enter the NUMBER of the scanned document to attach from Account Payable:\n\n${fileNames}`);
            
            if (selection && !isNaN(selection)) {
                const idx = parseInt(selection) - 1;
                const selectedFile = onlyFiles[idx];
                if (selectedFile) {
                    setFormData(prev => ({ 
                        ...prev, 
                        bill_url: selectedFile.webViewLink,
                        notes: (prev.notes || '') + `\n[Linked from Account Payable: ${selectedFile.name}]`
                    }));
                    setActiveMediaTab('viewer');
                    
                    try {
                        setAiStatus('🤖 Reading document...');
                        const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${selectedFile.id}?alt=media`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        
                        if (!fileRes.ok) {
                            throw new Error('Failed to retrieve file contents from Google Drive');
                        }
                        
                        const blob = await fileRes.blob();
                        const extractedText = await performOCR(blob);
                        
                        if (extractedText) {
                            setAiStatus('🤖 Organizing extracted text with AI...');
                            const result = await parseSupplierBillWithAi('', extractedText);
                            
                            if (result) {
                                let supplierId = formData.supplier_id;
                                if (!supplierId && result.supplier_name) {
                                    const matched = partners?.find(p => 
                                        p.name.toLowerCase().includes(result.supplier_name.toLowerCase()) ||
                                        (result.uen && p.registration_no === result.uen)
                                    );
                                    if (matched) {
                                        supplierId = matched.id;
                                        setSupplierSearch(matched.name);
                                    } else {
                                        supplierId = '';
                                        setSupplierSearch(result.supplier_name);
                                    }
                                }

                                setFormData(prev => calculateTotals({
                                    ...prev,
                                    supplier_id: supplierId,
                                    invoice_no: result.invoice_no || prev.invoice_no,
                                    invoice_date: result.invoice_date || prev.invoice_date,
                                    description: result.supplier_name ? `Bill from ${result.supplier_name}` : prev.description,
                                    unit_price: result.subtotal || prev.unit_price,
                                    quantity: 1,
                                    gst_amount: result.gst_amount || prev.gst_amount,
                                    grand_total: result.total_amount || prev.grand_total,
                                    notes: (prev.notes || '') + `\nAI Extraction: ${result.supplier_name || 'Unknown'}. UEN: ${result.uen || 'N/A'}`
                                }));
                                setAiStatus('✅ Account Payable bill parsed successfully!');
                            }
                        } else {
                            setAiStatus('⚠️ No text detected in document.');
                        }
                    } catch (aiErr) {
                        console.error('Account Payable OCR failed:', aiErr);
                        setAiStatus('⚠️ Document linked, but AI extraction failed.');
                    }
                    setTimeout(() => setAiStatus(''), 4000);
                }
            }
        } catch (err) {
            console.error("Failed to load Account Payable folder:", err);
            alert("Failed to load Account Payable folder: " + err.message);
        } finally {
            setIsAiProcessing(false);
        }
    };

    const handlePickFromJobPhotos = () => {
        if (!galleryFiles || galleryFiles.length === 0) {
            alert('No photos found in this job\'s gallery. Please upload photos under the "Photos & Media" tab first.');
            return;
        }
        setShowPhotoPicker(true);
    };

    const handleSelectPhoto = async (file) => {
        setShowPhotoPicker(false);
        setFormData(prev => ({ 
            ...prev, 
            bill_url: file.webViewLink,
            notes: (prev.notes || '') + `\n[Linked from Job Photos & Gallery: ${file.name}]`
        }));
        setActiveMediaTab('viewer');
        
        // Also trigger AI OCR if possible
        const token = sessionStorage.getItem('google_contacts_token') || localStorage.getItem('google_access_token');
        if (!token || !isTokenValid()) {
            return;
        }
        
        setIsAiProcessing(true);
        setAiStatus('🤖 Reading photo with AI...');
        try {
            const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!fileRes.ok) {
                throw new Error('Failed to retrieve file contents from Google Drive');
            }
            
            const blob = await fileRes.blob();
            const extractedText = await performOCR(blob);
            
            if (extractedText) {
                setAiStatus('🤖 Gemini AI is parsing details...');
                const result = await parseSupplierBillWithAi('', extractedText);
                
                if (result) {
                    let supplierId = formData.supplier_id;
                    if (!supplierId && result.supplier_name) {
                        const matched = partners?.find(p => 
                            p.name.toLowerCase().includes(result.supplier_name.toLowerCase()) ||
                            (result.uen && p.registration_no === result.uen)
                        );
                        if (matched) {
                            supplierId = matched.id;
                            setSupplierSearch(matched.name);
                        } else {
                            supplierId = '';
                            setSupplierSearch(result.supplier_name);
                        }
                    }

                    setFormData(prev => calculateTotals({
                        ...prev,
                        supplier_id: supplierId,
                        invoice_no: result.invoice_no || prev.invoice_no,
                        invoice_date: result.invoice_date || prev.invoice_date,
                        description: result.supplier_name ? `Bill from ${result.supplier_name}` : prev.description,
                        unit_price: result.subtotal || prev.unit_price,
                        quantity: 1,
                        gst_amount: result.gst_amount || prev.gst_amount,
                        grand_total: result.total_amount || prev.grand_total,
                        notes: (prev.notes || '') + `\nAI Extraction: ${result.supplier_name || 'Unknown'}. UEN: ${result.uen || 'N/A'}`
                    }));
                    setAiStatus('✅ Photo details parsed successfully!');
                }
            } else {
                setAiStatus('⚠️ No text detected in the photo.');
            }
        } catch (err) {
            console.error('Photo OCR failed:', err);
            setAiStatus('⚠️ AI extraction from photo failed.');
        } finally {
            setIsAiProcessing(false);
            setTimeout(() => setAiStatus(''), 4000);
        }
    };

    const handlePickFromJobSupplierBills = async () => {
        const selectedJobId = formData.job_id || job_id;
        const selectedJob = jobs?.find(j => j.id === selectedJobId);
        if (!selectedJobId || !selectedJob) {
            alert("Please select a Job No from the 'Job No' dropdown on the left first.");
            return;
        }

        const token = sessionStorage.getItem('google_contacts_token') || localStorage.getItem('google_access_token');
        if (!token || !isTokenValid()) {
            setIsAuthModalOpen(true);
            return;
        }

        const jobNo = selectedJob.document_no || 'Job';
        setJobBillsModal({ isOpen: true, files: [], folderName: 'SupplierBills&Expenses', jobNo, isLoading: true });

        try {
            let parentFolderId = selectedJob.drive_folder_id || selectedJob.gdrive_folder_id;

            if (!parentFolderId) {
                try {
                    const query = `name contains '${jobNo}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (searchRes.ok) {
                        const { files } = await searchRes.json();
                        if (files && files.length > 0) {
                            parentFolderId = files[0].id;
                        }
                    }
                } catch (searchErr) {
                    console.warn("Error searching for job folder:", searchErr);
                }
            }

            if (!parentFolderId) {
                alert(`Could not find a Google Drive folder for Job ${jobNo}. Please make sure the job folder is provisioned.`);
                setJobBillsModal(prev => ({ ...prev, isOpen: false, isLoading: false }));
                return;
            }

            const subItems = await listFolderContent(token, parentFolderId);
            let targetFolder = subItems.find(f => 
                f.mimeType === 'application/vnd.google-apps.folder' && 
                (f.name.toLowerCase().includes('supplier') || f.name.toLowerCase().includes('bill') || f.name.toLowerCase().includes('expense'))
            );

            if (!targetFolder) {
                const createdId = await getOrCreateFolder(token, 'SupplierBills&Expenses', parentFolderId);
                targetFolder = { id: createdId, name: 'SupplierBills&Expenses' };
            }

            const files = await listFolderContent(token, targetFolder.id);
            const onlyFiles = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

            setJobBillsModal({
                isOpen: true,
                files: onlyFiles,
                folderName: targetFolder.name,
                jobNo,
                isLoading: false
            });

        } catch (err) {
            console.error("Failed to load job supplier bills folder:", err);
            alert("Failed to load supplier bills folder: " + err.message);
            setJobBillsModal(prev => ({ ...prev, isOpen: false, isLoading: false }));
        }
    };

    const handleSelectJobBill = async (file) => {
        setJobBillsModal(prev => ({ ...prev, isOpen: false }));
        setFormData(prev => ({ 
            ...prev, 
            bill_url: file.webViewLink,
            notes: (prev.notes || '') + `\n[Linked from Job ${jobBillsModal.jobNo || ''} (${jobBillsModal.folderName}): ${file.name}]`
        }));
        setActiveMediaTab('viewer');

        const token = sessionStorage.getItem('google_contacts_token') || localStorage.getItem('google_access_token');
        if (!token || !isTokenValid()) return;

        setIsAiProcessing(true);
        setAiStatus(`🤖 Reading ${file.name} with AI...`);

        try {
            const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!fileRes.ok) throw new Error('Failed to retrieve file contents from Google Drive');

            const blob = await fileRes.blob();
            const extractedText = await performOCR(blob);

            if (extractedText) {
                setAiStatus('🤖 Gemini AI is parsing supplier bill details...');
                const result = await parseSupplierBillWithAi('', extractedText);

                if (result) {
                    let supplierId = formData.supplier_id;
                    if (!supplierId && result.supplier_name) {
                        const matched = partners?.find(p => 
                            p.name.toLowerCase().includes(result.supplier_name.toLowerCase()) ||
                            (result.uen && p.registration_no === result.uen)
                        );
                        if (matched) {
                            supplierId = matched.id;
                            setSupplierSearch(matched.name);
                        } else {
                            supplierId = '';
                            setSupplierSearch(result.supplier_name);
                        }
                    }

                    setFormData(prev => calculateTotals({
                        ...prev,
                        supplier_id: supplierId,
                        invoice_no: result.invoice_no || prev.invoice_no,
                        invoice_date: result.invoice_date || prev.invoice_date,
                        description: result.supplier_name ? `Bill from ${result.supplier_name}` : prev.description,
                        unit_price: result.subtotal || prev.unit_price,
                        quantity: 1,
                        gst_amount: result.gst_amount || prev.gst_amount,
                        grand_total: result.total_amount || prev.grand_total,
                        notes: (prev.notes || '') + `\nAI Extraction: ${result.supplier_name || 'Unknown'}. UEN: ${result.uen || 'N/A'}`
                    }));
                    setAiStatus('✅ Supplier bill parsed successfully!');
                }
            } else {
                setAiStatus('⚠️ No text detected in document.');
            }
        } catch (ocrErr) {
            console.error('OCR/AI extraction failed:', ocrErr);
            setAiStatus('⚠️ Document linked, but AI extraction failed.');
        } finally {
            setIsAiProcessing(false);
            setTimeout(() => setAiStatus(''), 4000);
        }
    };

    const fetchFolderStructureFiles = async (folderKey = selectedDriveFolder, targetJobId = formData.job_id || job_id) => {
        const token = sessionStorage.getItem('google_contacts_token') || localStorage.getItem('google_access_token');
        if (!token || !isTokenValid()) return;

        setLoadingDriveFolder(true);
        try {
            let targetFolderId = null;
            let folderDisplayName = 'Supplier Bills';
            const selectedJob = jobs?.find(j => j.id === targetJobId);
            const jobNo = selectedJob?.document_no || formData.job_no || 'Job';

            if (folderKey === 'supplier_bills') {
                folderDisplayName = `${jobNo} › Supplier Bills`;
                let parentFolderId = selectedJob?.drive_folder_id || selectedJob?.gdrive_folder_id;

                if (!parentFolderId && jobNo && jobNo !== 'Job') {
                    try {
                        const query = `name contains '${jobNo}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (searchRes.ok) {
                            const { files } = await searchRes.json();
                            if (files && files.length > 0) parentFolderId = files[0].id;
                        }
                    } catch (e) {
                        console.warn("Could not find job folder by query:", e);
                    }
                }

                if (parentFolderId) {
                    const subItems = await listFolderContent(token, parentFolderId);
                    const found = subItems.find(f => 
                        f.mimeType === 'application/vnd.google-apps.folder' && 
                        (f.name.toLowerCase().includes('supplier') || f.name.toLowerCase().includes('bill') || f.name.toLowerCase().includes('expense'))
                    );
                    if (found) {
                        targetFolderId = found.id;
                        folderDisplayName = `${jobNo} › ${found.name}`;
                    } else {
                        targetFolderId = await getOrCreateFolder(token, 'SupplierBills&Expenses', parentFolderId);
                        folderDisplayName = `${jobNo} › SupplierBills&Expenses`;
                    }
                }
            } else if (folderKey === 'photos') {
                folderDisplayName = `${jobNo} › Photos & Gallery`;
                let parentFolderId = selectedJob?.drive_folder_id || selectedJob?.gdrive_folder_id;
                if (parentFolderId) {
                    const subItems = await listFolderContent(token, parentFolderId);
                    const found = subItems.find(f => 
                        f.mimeType === 'application/vnd.google-apps.folder' && 
                        f.name.toLowerCase().includes('photo')
                    );
                    if (found) targetFolderId = found.id;
                }
            } else if (folderKey === 'account_payable') {
                folderDisplayName = 'Account Payable';
                targetFolderId = '1MVrJO3j9xc9Ls9JpovmduW62i2YtfrRq';
            } else if (folderKey === 'scans') {
                folderDisplayName = 'Celron Scans';
                targetFolderId = await getOrCreateFolder(token, 'Celron_Scans');
            }

            setCurrentFolderMeta({ id: targetFolderId, name: folderDisplayName, jobNo });

            if (targetFolderId) {
                const files = await listFolderContent(token, targetFolderId);
                const onlyFiles = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
                setDriveFolderFiles(onlyFiles);
            } else {
                setDriveFolderFiles([]);
            }
        } catch (err) {
            console.error("Failed to load folder structure files:", err);
            setDriveFolderFiles([]);
        } finally {
            setLoadingDriveFolder(false);
        }
    };

    React.useEffect(() => {
        fetchFolderStructureFiles(selectedDriveFolder, formData.job_id || job_id);
    }, [selectedDriveFolder, formData.job_id]);

    const handleSelectDriveFile = async (file) => {
        setFormData(prev => ({ 
            ...prev, 
            bill_url: file.webViewLink,
            notes: (prev.notes || '') + `\n[Linked from ${currentFolderMeta.name}: ${file.name}]`
        }));
        setActiveMediaTab('viewer');

        const token = sessionStorage.getItem('google_contacts_token') || localStorage.getItem('google_access_token');
        if (!token || !isTokenValid()) return;

        setIsAiProcessing(true);
        setAiStatus(`🤖 Reading ${file.name} with AI...`);

        try {
            const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!fileRes.ok) throw new Error('Failed to retrieve file contents from Google Drive');

            const blob = await fileRes.blob();
            const extractedText = await performOCR(blob);

            if (extractedText) {
                setAiStatus('🤖 Gemini AI is parsing bill details...');
                const result = await parseSupplierBillWithAi('', extractedText);

                if (result) {
                    let supplierId = formData.supplier_id;
                    if (!supplierId && result.supplier_name) {
                        const matched = partners?.find(p => 
                            p.name.toLowerCase().includes(result.supplier_name.toLowerCase()) ||
                            (result.uen && p.registration_no === result.uen)
                        );
                        if (matched) {
                            supplierId = matched.id;
                            setSupplierSearch(matched.name);
                        } else {
                            supplierId = '';
                            setSupplierSearch(result.supplier_name);
                        }
                    }

                    setFormData(prev => calculateTotals({
                        ...prev,
                        supplier_id: supplierId,
                        invoice_no: result.invoice_no || prev.invoice_no,
                        invoice_date: result.invoice_date || prev.invoice_date,
                        description: result.supplier_name ? `Bill from ${result.supplier_name}` : prev.description,
                        unit_price: result.subtotal || prev.unit_price,
                        quantity: 1,
                        gst_amount: result.gst_amount || prev.gst_amount,
                        grand_total: result.total_amount || prev.grand_total,
                        notes: (prev.notes || '') + `\nAI Extraction: ${result.supplier_name || 'Unknown'}. UEN: ${result.uen || 'N/A'}`
                    }));
                    setAiStatus('✅ Bill parsed successfully!');
                }
            } else {
                setAiStatus('⚠️ No text detected in document.');
            }
        } catch (ocrErr) {
            console.error('OCR/AI extraction failed:', ocrErr);
            setAiStatus('⚠️ Document linked, but AI extraction failed.');
        } finally {
            setIsAiProcessing(false);
            setTimeout(() => setAiStatus(''), 4000);
        }
    };

    // Initial supplier name if editing
    React.useEffect(() => {
        if (expense?.supplier_id && partners) {
            const s = partners.find(p => p.id === expense.supplier_id);
            if (s) setSupplierSearch(s.name);
        }
    }, [expense, partners]);

    const suppliers = partners?.filter(p => 
        (p.types && p.types.includes('Supplier')) || 
        (p.category === 'Supplier') ||
        (p.name && p.name.toLowerCase().includes('supplier'))
    ) || [];

    const filteredSuppliers = suppliers.filter(s => 
        s.name.toLowerCase().includes(supplierSearch.toLowerCase())
    );

    // Exact match in partners
    const matchedPartner = partners?.find(p => 
        (formData.supplier_id && p.id === formData.supplier_id) || 
        (supplierSearch.trim() && p.name.trim().toLowerCase() === supplierSearch.trim().toLowerCase())
    );

    const handleSelectSupplier = (s) => {
        setFormData(prev => ({ 
            ...prev, 
            supplier_id: s.id,
            description: prev.description || `Bill from ${s.name}`
        }));
        setSupplierSearch(s.name);
        setShowSupplierDropdown(false);
    };

    const handleDirectNewSupplier = () => {
        if (!supplierSearch.trim()) return;
        setFormData(prev => ({ 
            ...prev, 
            supplier_id: '',
            description: prev.description || `Bill from ${supplierSearch.trim()}`
        }));
        setShowSupplierDropdown(false);
    };

    const handleEditSupplier = () => {
        if (!formData.supplier_id) return;
        const s = partners?.find(p => p.id === formData.supplier_id);
        if (s) {
            setEditModal({ isOpen: true, type: 'partner_id', initialData: s });
        }
    };

    const [editModal, setEditModal] = useState({ isOpen: false, type: null, initialData: null });
    const handleEditSuccess = (updated) => {
        setEditModal({ isOpen: false, type: null, initialData: null });
        onSuccess && typeof onSuccess === 'function' ? null : window.location.reload();
    };

    const calculateTotals = (updated) => {
        const up = parseFloat(updated.unit_price) || 0;
        const qty = parseFloat(updated.quantity) || 0;
        const sub = up * qty;
        const rate = parseFloat(updated.gst_rate) || 0;
        const gst = sub * (rate / 100);
        return {
            ...updated,
            total_before_tax: sub,
            gst_amount: gst,
            grand_total: sub + gst
        };
    };

    const handleChange = (field, value) => {
        let updated = { ...formData, [field]: value };
        if (['unit_price', 'quantity', 'gst_rate'].includes(field)) {
            updated = calculateTotals(updated);
        }
        setFormData(updated);
    };

    const handleSave = async () => {
        const trimmedSupplier = supplierSearch.trim();
        if (!formData.supplier_id && !trimmedSupplier) {
            return alert('Please enter or select a supplier');
        }
        if (!formData.description) {
            return alert('Expense description is required');
        }
        
        setLoading(true);
        try {
            let finalSupplierId = formData.supplier_id;

            // If no supplier_id is linked yet, auto-resolve or auto-create the supplier
            if (!finalSupplierId && trimmedSupplier) {
                const existing = partners?.find(p => p.name.trim().toLowerCase() === trimmedSupplier.toLowerCase());
                if (existing) {
                    finalSupplierId = existing.id;
                } else {
                    // Create new partner in Supabase database
                    const newPartnerData = await savePartner({
                        name: trimmedSupplier,
                        type: 'supplier',
                        category: 'Supplier',
                        types: ['Supplier'],
                        company_id: company_id || null
                    });
                    if (newPartnerData && newPartnerData.id) {
                        finalSupplierId = newPartnerData.id;
                        if (partners && Array.isArray(partners)) {
                            partners.push(newPartnerData);
                        }
                    }
                }
            }

            if (!finalSupplierId) {
                throw new Error('Could not resolve or create supplier. Please try again.');
            }

            const payload = {
                ...formData,
                supplier_id: finalSupplierId
            };

            const { data, error } = await saveJobExpense(payload);
            if (error) throw error;
            onSuccess(data);
        } catch (err) {
            console.error(err);
            alert('Failed to save expense: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleScannerLink = (url, name) => {
        setFormData(prev => ({ 
            ...prev, 
            bill_url: url,
            notes: (prev.notes || '') + `\n[Linked from Celron Scanner: ${name}]`
        }));
        setActiveMediaTab('viewer');
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        setIsAiProcessing(true);
        setAiStatus('📤 Uploading bill to cloud...');
        try {
            const url = await onUploadBill(file);
            if (url) {
                setFormData(prev => ({ ...prev, bill_url: url }));
                setActiveMediaTab('viewer');
                
                // Trigger AI OCR
                setAiStatus('🤖 Google Vision is reading document...');
                
                const extractedText = await performOCR(file);
                if (extractedText) {
                    setAiStatus('🤖 Gemini AI is parsing bill details...');
                    const result = await parseSupplierBillWithAi('', extractedText);
                    
                    if (result) {
                        // Find supplier if possible
                        let supplierId = formData.supplier_id;
                        if (!supplierId && result.supplier_name) {
                            const matched = partners?.find(p => 
                                p.name.toLowerCase().includes(result.supplier_name.toLowerCase()) ||
                                (result.uen && p.registration_no === result.uen)
                            );
                            if (matched) {
                                supplierId = matched.id;
                                setSupplierSearch(matched.name);
                            } else {
                                supplierId = '';
                                setSupplierSearch(result.supplier_name);
                            }
                        }

                        setFormData(prev => calculateTotals({
                            ...prev,
                            supplier_id: supplierId,
                            invoice_no: result.invoice_no || prev.invoice_no,
                            invoice_date: result.invoice_date || prev.invoice_date,
                            description: result.supplier_name ? `Bill from ${result.supplier_name}` : prev.description,
                            unit_price: result.subtotal || prev.unit_price,
                            quantity: 1,
                            gst_amount: result.gst_amount || prev.gst_amount,
                            grand_total: result.total_amount || prev.grand_total,
                            notes: (prev.notes || '') + `\nAI Extraction: ${result.supplier_name || 'Unknown'}. UEN: ${result.uen || 'N/A'}`
                        }));
                        setAiStatus('✅ Bill parsed successfully!');
                    } else {
                        setAiStatus('⚠️ AI parsing returned empty data.');
                    }
                } else {
                    setAiStatus('⚠️ No text detected in the uploaded file.');
                }
                setTimeout(() => setAiStatus(''), 4000);
            }
        } catch (err) {
            console.error('Bill upload failed:', err);
            alert('Upload failed: ' + err.message);
            setAiStatus('');
        } finally {
            setIsAiProcessing(false);
            setUploading(false);
        }
    };

    const handlePickFromDrive = async () => {
        const token = sessionStorage.getItem('google_contacts_token') || localStorage.getItem('google_access_token');
        if (!token || !isTokenValid()) {
            setIsAuthModalOpen(true);
            return;
        }
        setIsAiProcessing(true);
        setAiStatus('📂 Opening Celron Scanner Folder...');
        try {
            const folderId = await getOrCreateFolder(token, 'Celron_Scans');
            if (folderId) {
                const files = await listFolderContent(token, folderId);
                const onlyFiles = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
                
                if (onlyFiles.length === 0) {
                    alert("No scanned bills found in Celron_Scans folder.");
                    setIsAiProcessing(false);
                    setAiStatus('');
                    return;
                }
                
                const fileNames = onlyFiles.map((f, i) => `${i + 1}. ${f.name}`).join('\n');
                const selection = window.prompt(`Enter the NUMBER of the scanned document to attach:\n\n${fileNames}`);
                
                if (selection && !isNaN(selection)) {
                    const idx = parseInt(selection) - 1;
                    const selectedFile = onlyFiles[idx];
                    if (selectedFile) {
                        setFormData(prev => ({ 
                            ...prev, 
                            bill_url: selectedFile.webViewLink,
                            notes: (prev.notes || '') + `\n[Linked from Celron Scanner: ${selectedFile.name}]`
                        }));
                        setActiveMediaTab('viewer');
                        
                        try {
                            setAiStatus('🤖 Reading document...');
                            const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${selectedFile.id}?alt=media`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                            });
                            
                            if (!fileRes.ok) {
                                throw new Error('Failed to retrieve file contents from Google Drive');
                            }
                            
                            const blob = await fileRes.blob();
                            // Run Google Vision OCR
                            const extractedText = await performOCR(blob);
                            
                            if (extractedText) {
                                setAiStatus('🤖 Organizing extracted text with AI...');
                                const result = await parseSupplierBillWithAi('', extractedText);
                                
                                if (result) {
                                    let supplierId = formData.supplier_id;
                                    if (!supplierId && result.supplier_name) {
                                        const matched = partners?.find(p => 
                                            p.name.toLowerCase().includes(result.supplier_name.toLowerCase()) ||
                                            (result.uen && p.registration_no === result.uen)
                                        );
                                        if (matched) {
                                            supplierId = matched.id;
                                            setSupplierSearch(matched.name);
                                        } else {
                                            supplierId = '';
                                            setSupplierSearch(result.supplier_name);
                                        }
                                    }

                                    setFormData(prev => calculateTotals({
                                        ...prev,
                                        supplier_id: supplierId,
                                        invoice_no: result.invoice_no || prev.invoice_no,
                                        invoice_date: result.invoice_date || prev.invoice_date,
                                        description: result.supplier_name ? `Bill from ${result.supplier_name}` : prev.description,
                                        unit_price: result.subtotal || prev.unit_price,
                                        quantity: 1,
                                        gst_amount: result.gst_amount || prev.gst_amount,
                                        grand_total: result.total_amount || prev.grand_total,
                                        notes: (prev.notes || '') + `\nAI Extraction: ${result.supplier_name || 'Unknown'}. UEN: ${result.uen || 'N/A'}`
                                    }));
                                    setAiStatus('✅ Scanner bill parsed successfully!');
                                }
                            } else {
                                setAiStatus('⚠️ No text detected in scanner document.');
                            }
                        } catch (aiErr) {
                            console.error('Scanner OCR failed:', aiErr);
                            setAiStatus('⚠️ Scanner document linked, but AI extraction failed.');
                        }
                        setTimeout(() => setAiStatus(''), 4000);
                    }
                }
            }
        } catch (err) {
            console.error("Failed to load scans:", err);
            alert("Failed to load scans: " + err.message);
        } finally {
            setIsAiProcessing(false);
        }
    };

    const handleManualExtraction = async () => {
        if (!formData.bill_url) {
            alert('Please attach or link a document first.');
            return;
        }
        
        setIsAiProcessing(true);
        setAiStatus('🤖 Reading document...');
        
        try {
            let blob = null;
            
            if (formData.bill_url.includes('drive.google.com')) {
                const token = sessionStorage.getItem('google_contacts_token') || localStorage.getItem('google_access_token');
                if (!token || !isTokenValid()) {
                    setIsAuthModalOpen(true);
                    setIsAiProcessing(false);
                    setAiStatus('');
                    return;
                }
                
                const fileIdMatch = formData.bill_url.match(/\/file\/d\/([^\/]+)|\/files\/([^\/?]+)|id=([^\/&]+)/);
                const fileId = fileIdMatch ? (fileIdMatch[1] || fileIdMatch[2] || fileIdMatch[3]) : null;
                
                if (!fileId) {
                    throw new Error('Could not resolve Google Drive File ID.');
                }
                
                setAiStatus('📂 Retrieving Google Drive document...');
                const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!fileRes.ok) throw new Error('Failed to retrieve file from Google Drive.');
                blob = await fileRes.blob();
            } else {
                setAiStatus('📂 Downloading attachment...');
                const fileRes = await fetch(formData.bill_url);
                if (!fileRes.ok) throw new Error('Failed to download document from server.');
                blob = await fileRes.blob();
            }
            
            if (blob) {
                setAiStatus('🤖 Running Google Vision OCR...');
                const extractedText = await performOCR(blob);
                
                if (extractedText) {
                    setAiStatus('🤖 Gemini AI is parsing details...');
                    const result = await parseSupplierBillWithAi('', extractedText);
                    
                    if (result) {
                        let supplierId = formData.supplier_id;
                        if (!supplierId && result.supplier_name) {
                            const matched = partners?.find(p => 
                                p.name.toLowerCase().includes(result.supplier_name.toLowerCase()) ||
                                (result.uen && p.registration_no === result.uen)
                            );
                            if (matched) {
                                supplierId = matched.id;
                                setSupplierSearch(matched.name);
                            } else {
                                supplierId = '';
                                setSupplierSearch(result.supplier_name);
                            }
                        }
                        
                        setFormData(prev => calculateTotals({
                            ...prev,
                            supplier_id: supplierId,
                            invoice_no: result.invoice_no || prev.invoice_no,
                            invoice_date: result.invoice_date || prev.invoice_date,
                            description: result.supplier_name ? `Bill from ${result.supplier_name}` : prev.description,
                            unit_price: result.subtotal || prev.unit_price,
                            quantity: 1,
                            gst_amount: result.gst_amount || prev.gst_amount,
                            grand_total: result.total_amount || prev.grand_total,
                            notes: (prev.notes || '') + `\nAI Extraction: ${result.supplier_name || 'Unknown'}. UEN: ${result.uen || 'N/A'}`
                        }));
                        setAiStatus('✅ Manual extraction successful!');
                    } else {
                        setAiStatus('⚠️ AI parsing returned empty data.');
                    }
                } else {
                    setAiStatus('⚠️ No text detected in document.');
                }
            }
        } catch (err) {
            console.error('Manual OCR/AI failed:', err);
            alert('Manual AI Extraction failed: ' + err.message);
            setAiStatus('');
        } finally {
            setIsAiProcessing(false);
            setTimeout(() => setAiStatus(''), 4000);
        }
    };

    // Helper to transform Google Drive Share URLs to Embeddable URLs
    const getEmbeddableUrl = (url) => {
        if (!url) return '';
        if (url.includes('drive.google.com')) {
            return url.replace(/\/view\?usp=drivesdk|\/view|\/edit/g, '/preview');
        }
        return url;
    };

    return (
        <div style={{ display: 'flex', gap: '28px', flexDirection: 'row', alignItems: 'stretch', width: '100%' }}>
            <style dangerouslySetInnerHTML={{
                __html: `
                .premium-form-label {
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: #475569;
                    margin-bottom: 6px;
                    display: block;
                    transition: color 0.2s ease;
                }
                .premium-form-item:focus-within .premium-form-label {
                    color: #6366f1;
                }
                .premium-form-input, .premium-form-select, .premium-form-textarea {
                    padding: 12px 16px;
                    font-size: 0.95rem;
                    font-weight: 500;
                    border-radius: 10px;
                    border: 1.5px solid #cbd5e1;
                    width: 100%;
                    outline: none;
                    transition: all 0.2s ease-in-out;
                    background: #fff;
                    color: #1e293b;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                    font-family: inherit;
                    box-sizing: border-box;
                }
                .premium-form-input:focus, .premium-form-select:focus, .premium-form-textarea:focus {
                    border-color: #6366f1;
                    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.12), 0 1px 2px rgba(0,0,0,0.05);
                    background: #fff;
                }
                .premium-form-input:hover, .premium-form-select:hover, .premium-form-textarea:hover {
                    border-color: #94a3b8;
                }
                .premium-form-input:hover:focus, .premium-form-select:hover:focus, .premium-form-textarea:hover:focus {
                    border-color: #6366f1;
                }
                .premium-form-input:disabled, .premium-form-input[readonly] {
                    background: #f8fafc;
                    color: #64748b;
                    cursor: not-allowed;
                    border-color: #e2e8f0;
                    box-shadow: none;
                }
                .premium-form-select {
                    appearance: none;
                    background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
                    background-repeat: no-repeat;
                    background-position: right 16px center;
                    background-size: 16px;
                    padding-right: 40px;
                    cursor: pointer;
                }
                .premium-form-textarea {
                    min-height: 90px;
                    resize: vertical;
                    line-height: 1.5;
                }
                `
            }} />
            
            {/* LEFT COLUMN: Extracted Info Form (Width 45%) */}
            <div style={{ flex: '1', minWidth: '45%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '4px' }}>
                    <h5 style={{ margin: 0, fontWeight: 700, color: '#475569', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={14} color="#6366f1" />
                        <span>AI Extracted Supplier Details</span>
                    </h5>
                </div>

                <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {/* Supplier Field with Direct Entry + Auto-Save */}
                    <div className="premium-form-item full-width" style={{ gridColumn: 'span 2', position: 'relative' }} ref={supplierDropdownRef}>
                        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>Supplier *</span>
                                {supplierSearch.trim() && !matchedPartner && (
                                    <span style={{ 
                                        background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)', 
                                        color: '#3730a3', 
                                        fontSize: '0.72rem', 
                                        padding: '2px 8px', 
                                        borderRadius: '12px', 
                                        fontWeight: 700 
                                    }}>
                                        ✨ New Supplier (Auto-creates)
                                    </span>
                                )}
                                {matchedPartner && (
                                    <span style={{ 
                                        background: '#f0fdf4', 
                                        color: '#166534', 
                                        fontSize: '0.72rem', 
                                        padding: '2px 8px', 
                                        borderRadius: '12px', 
                                        fontWeight: 700 
                                    }}>
                                        ✓ Existing Supplier
                                    </span>
                                )}
                            </span>
                            {formData.supplier_id && (
                                <button 
                                    type="button"
                                    onClick={handleEditSupplier}
                                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}
                                >
                                    <Pencil size={12} /> Edit Supplier
                                </button>
                            )}
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <input
                                    className="premium-form-input"
                                    placeholder="Type supplier name directly or search database..."
                                    value={supplierSearch}
                                    onChange={(e) => {
                                        setSupplierSearch(e.target.value);
                                        setShowSupplierDropdown(true);
                                        // Reset supplier_id if user is typing something new
                                        if (formData.supplier_id) {
                                            setFormData(prev => ({ ...prev, supplier_id: '' }));
                                        }
                                    }}
                                    onFocus={() => setShowSupplierDropdown(true)}
                                    style={{ paddingRight: '40px' }}
                                />
                                {showSupplierDropdown && (
                                    <div className="dropdown-content" style={{ 
                                        display: 'block', 
                                        width: '100%', 
                                        top: '100%', 
                                        position: 'absolute', 
                                        zIndex: 100, 
                                        background: '#fff', 
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', 
                                        borderRadius: '10px', 
                                        maxHeight: '230px', 
                                        overflowY: 'auto',
                                        border: '1px solid #e2e8f0',
                                        marginTop: '4px'
                                    }}>
                                        {/* Direct New Supplier Shortcut */}
                                        {supplierSearch.trim() && !suppliers.some(s => s.name.trim().toLowerCase() === supplierSearch.trim().toLowerCase()) && (
                                            <div 
                                                onClick={handleDirectNewSupplier}
                                                style={{
                                                    padding: '10px 14px',
                                                    background: '#eff6ff',
                                                    color: '#1d4ed8',
                                                    cursor: 'pointer',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 700,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    borderBottom: '1.5px solid #dbeafe'
                                                }}
                                                onMouseOver={(e) => e.currentTarget.style.background = '#dbeafe'}
                                                onMouseOut={(e) => e.currentTarget.style.background = '#eff6ff'}
                                            >
                                                <Plus size={15} />
                                                <span>Register "<strong>{supplierSearch}</strong>" as New Supplier</span>
                                            </div>
                                        )}

                                        {filteredSuppliers.length > 0 ? filteredSuppliers.map(s => (
                                            <button 
                                                key={s.id} 
                                                type="button"
                                                onClick={() => handleSelectSupplier(s)}
                                                style={{
                                                    width: '100%',
                                                    padding: '10px 16px',
                                                    textAlign: 'left',
                                                    background: 'none',
                                                    border: 'none',
                                                    borderBottom: '1px solid #f1f5f9',
                                                    cursor: 'pointer',
                                                    fontSize: '0.9rem',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}
                                                onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                                            >
                                                <span style={{ fontWeight: 600, color: '#1e293b' }}>{s.name}</span>
                                                {s.registration_no && (
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>UEN: {s.registration_no}</span>
                                                )}
                                            </button>
                                        )) : (
                                            !supplierSearch.trim() && (
                                                <div style={{ padding: '12px', fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center' }}>
                                                    Start typing to search or register a new supplier
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="premium-form-item" style={{ gridColumn: 'span 2' }}>
                        <label className="premium-form-label">Job No (Optional)</label>
                        <select 
                            className="premium-form-select"
                            value={formData.job_id}
                            onChange={(e) => {
                                const selected = jobs?.find(j => j.id === e.target.value);
                                handleSelectJob(selected || { id: '', document_no: '' });
                            }}
                        >
                            <option value="">No Job Linked</option>
                            {jobs?.map(j => {
                                const customer = j.partners?.name || j.customer_name || '';
                                const vesselOrLoc = j.vessels?.vessel_name || j.vessel_name || j.location_name || '';
                                const labelParts = [j.document_no];
                                if (customer) labelParts.push(customer);
                                if (vesselOrLoc) labelParts.push(vesselOrLoc);
                                return (
                                    <option key={j.id} value={j.id}>
                                        {labelParts.join(' - ')}
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    <div className="premium-form-item">
                        <label className="premium-form-label">Invoice / Reference No</label>
                        <input 
                            className="premium-form-input" 
                            value={formData.invoice_no || ''} 
                            onChange={(e) => handleChange('invoice_no', e.target.value)} 
                            placeholder="e.g. INV-2024-001" 
                        />
                    </div>
                    <div className="premium-form-item">
                        <label className="premium-form-label">Invoice Date</label>
                        <input 
                            className="premium-form-input" 
                            type="date" 
                            value={formData.invoice_date || ''} 
                            onChange={(e) => handleChange('invoice_date', e.target.value)} 
                        />
                    </div>

                    <div className="premium-form-item full-width" style={{ gridColumn: 'span 2' }}>
                        <label className="premium-form-label">Expense Description *</label>
                        <textarea 
                            className="premium-form-textarea" 
                            value={formData.description || ''} 
                            onChange={(e) => handleChange('description', e.target.value)} 
                            placeholder="Describe the material, service, or cost item..." 
                        />
                    </div>

                    <div className="premium-form-item">
                        <label className="premium-form-label">Unit Price (SGD)</label>
                        <input 
                            className="premium-form-input" 
                            type="number" 
                            step="0.01"
                            value={formData.unit_price} 
                            onChange={(e) => handleChange('unit_price', e.target.value)} 
                        />
                    </div>
                    <div className="premium-form-item">
                        <label className="premium-form-label">Quantity / Units</label>
                        <input 
                            className="premium-form-input" 
                            type="number" 
                            value={formData.quantity} 
                            onChange={(e) => handleChange('quantity', e.target.value)} 
                        />
                    </div>

                    <div className="premium-form-item">
                        <label className="premium-form-label">GST Rate (%)</label>
                        <input 
                            className="premium-form-input" 
                            type="number" 
                            value={formData.gst_rate} 
                            onChange={(e) => handleChange('gst_rate', e.target.value)} 
                        />
                    </div>
                    <div className="premium-form-item">
                        <label className="premium-form-label">GST Amount (SGD)</label>
                        <input 
                            className="premium-form-input" 
                            type="number" 
                            value={parseFloat(formData.gst_amount || 0).toFixed(2)} 
                            readOnly 
                        />
                    </div>
                </div>

                <div style={{ 
                    padding: '20px', 
                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', 
                    borderRadius: '16px', 
                    border: '1px solid #e2e8f0', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
                    marginTop: '8px'
                }}>
                    <div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Final Grand Total</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>SGD</span>
                            {formData.grand_total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                    {aiStatus && (
                        <div style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: 700, animation: 'pulse 2s infinite', textAlign: 'right', maxWidth: '200px' }}>
                            {aiStatus}
                        </div>
                    )}
                </div>

                <div className="quick-form-actions" style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
                    <button type="button" className="btn btn-secondary" onClick={onCancel} style={{ flex: 1, height: '44px' }}>Discard</button>
                    <button 
                        type="button" 
                        className="btn btn-primary" 
                        onClick={handleSave} 
                        disabled={loading || (!formData.supplier_id && !supplierSearch.trim()) || !formData.description}
                        style={{ flex: 2, background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)', border: 'none', height: '44px', fontWeight: 700 }}
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" style={{ margin: 'auto' }} /> : <Save size={18} />}
                        <span>{loading ? 'Saving Bill...' : (expense ? 'Update Supplier Bill' : 'Save Supplier Bill')}</span>
                    </button>
                </div>
            </div>

            {/* RIGHT COLUMN: 2 TABS - (1) Attach / Upload Sources & (2) Invoice / Receipt Viewer */}
            <div style={{ 
                flex: '1.2', 
                minWidth: '50%', 
                background: '#fafbfd', 
                border: '1.5px solid #e2e8f0', 
                borderRadius: '20px', 
                padding: '20px', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '16px',
                boxShadow: '0 4px 20px rgba(99, 102, 241, 0.03)'
            }}>
                {/* TAB NAVIGATION HEADER */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    background: '#f1f5f9',
                    padding: '4px',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0'
                }}>
                    <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                        <button
                            type="button"
                            onClick={() => setActiveMediaTab('upload')}
                            style={{
                                flex: 1,
                                padding: '9px 14px',
                                borderRadius: '9px',
                                border: 'none',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                background: activeMediaTab === 'upload' ? '#ffffff' : 'transparent',
                                color: activeMediaTab === 'upload' ? '#4f46e5' : '#64748b',
                                boxShadow: activeMediaTab === 'upload' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            <Upload size={15} />
                            <span>Attach / Upload Sources</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveMediaTab('viewer')}
                            style={{
                                flex: 1,
                                padding: '9px 14px',
                                borderRadius: '9px',
                                border: 'none',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                background: activeMediaTab === 'viewer' ? '#ffffff' : 'transparent',
                                color: activeMediaTab === 'viewer' ? '#4f46e5' : '#64748b',
                                boxShadow: activeMediaTab === 'viewer' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            <Receipt size={15} />
                            <span>Invoice Viewer</span>
                            {formData.bill_url ? (
                                <span style={{ 
                                    fontSize: '0.65rem', 
                                    background: '#dcfce7', 
                                    color: '#15803d', 
                                    padding: '2px 8px', 
                                    borderRadius: '12px', 
                                    fontWeight: 800,
                                    marginLeft: '4px'
                                }}>
                                    ATTACHED
                                </span>
                            ) : (
                                <span style={{ 
                                    fontSize: '0.65rem', 
                                    background: '#e2e8f0', 
                                    color: '#64748b', 
                                    padding: '2px 8px', 
                                    borderRadius: '12px', 
                                    fontWeight: 700,
                                    marginLeft: '4px'
                                }}>
                                    EMPTY
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {/* TAB 1: ATTACH / UPLOAD SOURCES */}
                {activeMediaTab === 'upload' && (
                    <div style={{ 
                        flex: 1, 
                        display: 'flex', 
                        flexDirection: 'column', 
                        justifyContent: 'center', 
                        alignItems: 'center', 
                        background: '#ffffff', 
                        border: '1px dashed #cbd5e1', 
                        borderRadius: '16px', 
                        padding: '30px 20px', 
                        textAlign: 'center', 
                        minHeight: '440px',
                        gap: '20px'
                    }}>
                        <div style={{ 
                            width: '68px', 
                            height: '68px', 
                            background: 'rgba(99, 102, 241, 0.08)', 
                            color: '#6366f1', 
                            borderRadius: '50%', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            boxShadow: '0 8px 16px rgba(99, 102, 241, 0.05)'
                        }}>
                            <Upload size={30} />
                        </div>
                        
                        <div>
                            <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 800, color: '#334155' }}>Attach Supplier Invoice / Bill</h4>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', maxWidth: '340px', lineHeight: '1.4' }}>
                                Snap a photo or link a scanned document. Gemini AI automatically reads details and pre-fills your form.
                            </p>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '330px' }}>
                            
                            {/* Local File Upload Button */}
                            <label className="btn btn-primary" style={{ 
                                cursor: 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '8px', 
                                background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)', 
                                border: 'none', 
                                height: '42px',
                                borderRadius: '10px',
                                fontWeight: 700,
                                boxShadow: '0 4px 10px rgba(99,102,241,0.2)'
                            }}>
                                <Upload size={16} />
                                <span>Upload local invoice / bill</span>
                                <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} />
                            </label>

                            {/* Snaps Camera Photo Button */}
                            <label className="btn btn-secondary" style={{ 
                                cursor: 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '8px', 
                                height: '42px',
                                borderRadius: '10px',
                                fontWeight: 700,
                                background: '#fff',
                                border: '1px solid #cbd5e1'
                            }}>
                                <Camera size={16} color="#475569" />
                                <span style={{ color: '#475569' }}>Snap Photo / Camera</span>
                                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} />
                            </label>

                            {/* Mobile Upload QR Code Button */}
                            <button 
                                type="button"
                                onClick={handleOpenLocalQR}
                                className="btn btn-secondary" 
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    gap: '8px', 
                                    height: '42px',
                                    borderRadius: '10px',
                                    fontWeight: 700,
                                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                                    border: '1px solid #bbf7d0',
                                    color: '#166534',
                                    cursor: 'pointer'
                                }}
                            >
                                <Smartphone size={16} />
                                <span>Mobile Upload (QR)</span>
                            </button>

                            {/* GOOGLE DRIVE REPOSITORY: Folder Structure with default pointing */}
                            <div style={{ width: '100%', marginTop: '6px', textAlign: 'left' }}>
                                <div style={{ display: 'flex', alignItems: 'center', margin: '4px 0 10px 0', gap: '10px' }}>
                                    <div style={{ flex: 1, height: '1px', background: '#cbd5e1' }} />
                                    <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <HardDrive size={12} /> Google Drive Folder Structure
                                    </span>
                                    <div style={{ flex: 1, height: '1px', background: '#cbd5e1' }} />
                                </div>

                                {/* Folder Breadcrumb & Navigation */}
                                <div style={{ background: '#f1f5f9', padding: '8px 10px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <FolderOpen size={13} style={{ color: '#4f46e5' }} />
                                            {currentFolderMeta.name || 'Folder'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => fetchFolderStructureFiles(selectedDriveFolder)}
                                            disabled={loadingDriveFolder}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px', padding: 0 }}
                                            title="Refresh folder files"
                                        >
                                            <RefreshCw size={11} className={loadingDriveFolder ? 'animate-spin' : ''} /> Refresh
                                        </button>
                                    </div>

                                    {/* Subfolder pills - Default pointing to Supplier Bills */}
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDriveFolder('supplier_bills')}
                                            style={{
                                                padding: '4px 9px',
                                                borderRadius: '7px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                border: selectedDriveFolder === 'supplier_bills' ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                                                background: selectedDriveFolder === 'supplier_bills' ? '#ecfdf5' : '#ffffff',
                                                color: selectedDriveFolder === 'supplier_bills' ? '#047857' : '#475569',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                            title="Default: Job's SupplierBills&Expenses folder"
                                        >
                                            <Folder size={11} style={{ color: '#10b981' }} />
                                            <span>Supplier Bills</span>
                                            <span style={{ fontSize: '0.6rem', background: selectedDriveFolder === 'supplier_bills' ? '#a7f3d0' : '#e2e8f0', color: selectedDriveFolder === 'supplier_bills' ? '#047857' : '#64748b', padding: '0 4px', borderRadius: '6px' }}>Default</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setSelectedDriveFolder('photos')}
                                            style={{
                                                padding: '4px 9px',
                                                borderRadius: '7px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                border: selectedDriveFolder === 'photos' ? '1.5px solid #3b82f6' : '1px solid #cbd5e1',
                                                background: selectedDriveFolder === 'photos' ? '#eff6ff' : '#ffffff',
                                                color: selectedDriveFolder === 'photos' ? '#1d4ed8' : '#475569',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                            title="Job's Photos & Gallery folder"
                                        >
                                            <Image size={11} style={{ color: '#3b82f6' }} />
                                            <span>Photos & Media</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setSelectedDriveFolder('account_payable')}
                                            style={{
                                                padding: '4px 9px',
                                                borderRadius: '7px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                border: selectedDriveFolder === 'account_payable' ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
                                                background: selectedDriveFolder === 'account_payable' ? '#fffbeb' : '#ffffff',
                                                color: selectedDriveFolder === 'account_payable' ? '#b45309' : '#475569',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                            title="Central Account Payable folder"
                                        >
                                            <HardDrive size={11} style={{ color: '#f59e0b' }} />
                                            <span>Account Payable</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setSelectedDriveFolder('scans')}
                                            style={{
                                                padding: '4px 9px',
                                                borderRadius: '7px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                border: selectedDriveFolder === 'scans' ? '1.5px solid #6366f1' : '1px solid #cbd5e1',
                                                background: selectedDriveFolder === 'scans' ? '#eef2ff' : '#ffffff',
                                                color: selectedDriveFolder === 'scans' ? '#4338ca' : '#475569',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                            title="Scanner inbox (Celron_Scans)"
                                        >
                                            <Archive size={11} style={{ color: '#6366f1' }} />
                                            <span>Celron Scans</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Folder Content List - Direct click to attach without window.prompt */}
                                <div style={{
                                    border: '1.5px solid #e2e8f0',
                                    borderRadius: '12px',
                                    background: '#ffffff',
                                    maxHeight: '180px',
                                    overflowY: 'auto',
                                    padding: '6px',
                                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.03)'
                                }}>
                                    {loadingDriveFolder ? (
                                        <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748b', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                            <Loader2 size={15} className="animate-spin" style={{ color: '#4f46e5' }} />
                                            <span>Loading files from Google Drive...</span>
                                        </div>
                                    ) : driveFolderFiles.length === 0 ? (
                                        <div style={{ padding: '20px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
                                            <FolderOpen size={24} style={{ color: '#cbd5e1', margin: '0 auto 6px', display: 'block' }} />
                                            <div>No documents found in <strong>{currentFolderMeta.name}</strong></div>
                                            <div style={{ fontSize: '0.7rem', color: '#cbd5e1', marginTop: '3px' }}>Drop files into this Drive folder or upload above</div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            {driveFolderFiles.map(file => (
                                                <div
                                                    key={file.id}
                                                    onClick={() => handleSelectDriveFile(file)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        padding: '6px 9px',
                                                        borderRadius: '7px',
                                                        background: '#f8fafc',
                                                        border: '1px solid #e2e8f0',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                    onMouseEnter={e => {
                                                        e.currentTarget.style.borderColor = '#10b981';
                                                        e.currentTarget.style.background = '#ecfdf5';
                                                    }}
                                                    onMouseLeave={e => {
                                                        e.currentTarget.style.borderColor = '#e2e8f0';
                                                        e.currentTarget.style.background = '#f8fafc';
                                                    }}
                                                    title={`Click to attach "${file.name}" & auto-extract with Gemini AI`}
                                                >
                                                    <FileText size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e293b', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {file.name}
                                                    </span>
                                                    {file.size && (
                                                        <span style={{ fontSize: '0.68rem', color: '#94a3b8', flexShrink: 0 }}>
                                                            {(file.size / 1024).toFixed(0)} KB
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 2: INVOICE VIEWER */}
                {activeMediaTab === 'viewer' && (
                    formData.bill_url ? (
                        /* Attached Document Preview Mode */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
                            <div style={{ flex: 1, position: 'relative', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', minHeight: '430px', background: '#f8fafc' }}>
                                {formData.bill_url.includes('drive.google.com') ? (
                                    <iframe 
                                        src={getEmbeddableUrl(formData.bill_url)} 
                                        style={{ width: '100%', height: '100%', border: 'none', minHeight: '430px' }} 
                                        title="Google Drive Preview"
                                    />
                                ) : formData.bill_url.toLowerCase().endsWith('.pdf') ? (
                                    <iframe 
                                        src={formData.bill_url} 
                                        style={{ width: '100%', height: '100%', border: 'none', minHeight: '430px' }} 
                                        title="PDF Preview"
                                    />
                                ) : (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
                                        <img 
                                            src={formData.bill_url} 
                                            alt="Supplier Bill" 
                                            style={{ maxWidth: '100%', maxHeight: '410px', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} 
                                        />
                                    </div>
                                )}
                                
                                <button
                                    type="button"
                                    onClick={() => handleChange('bill_url', '')}
                                    style={{ 
                                        position: 'absolute', 
                                        bottom: '16px', 
                                        right: '16px', 
                                        background: 'rgba(239, 68, 68, 0.95)', 
                                        color: 'white', 
                                        border: 'none', 
                                        borderRadius: '8px', 
                                        padding: '8px 14px', 
                                        fontSize: '0.8rem', 
                                        fontWeight: 700, 
                                        cursor: 'pointer', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '6px', 
                                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#ef4444'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.95)'}
                                >
                                    <Trash2 size={14} /> Detach Document
                                </button>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <a 
                                    href={formData.bill_url} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    style={{ 
                                        fontSize: '0.8rem', 
                                        color: '#6366f1', 
                                        fontWeight: 700, 
                                        textDecoration: 'none', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '4px' 
                                    }}
                                >
                                    <ExternalLink size={14} /> Open in New Tab
                                </a>

                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={handleManualExtraction}
                                        disabled={isAiProcessing || uploading}
                                        className="btn btn-sm"
                                        style={{
                                            background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                                            color: '#fff',
                                            border: 'none',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            fontWeight: 700,
                                            padding: '7px 12px',
                                            borderRadius: '8px',
                                            boxShadow: '0 4px 10px rgba(168, 85, 247, 0.2)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {isAiProcessing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                        <span>Run AI Extraction</span>
                                    </button>

                                    <label className="btn btn-sm btn-outline" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0, padding: '7px 12px', borderRadius: '8px' }}>
                                        <RefreshCw size={12} className={uploading ? 'animate-spin' : ''} />
                                        <span style={{ fontSize: '0.8rem' }}>Replace Attachment</span>
                                        <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} />
                                    </label>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Empty State when no Document is Attached */
                        <div style={{ 
                            flex: 1, 
                            display: 'flex', 
                            flexDirection: 'column', 
                            justifyContent: 'center', 
                            alignItems: 'center', 
                            background: '#ffffff', 
                            border: '1px dashed #cbd5e1', 
                            borderRadius: '16px', 
                            padding: '40px 24px', 
                            textAlign: 'center', 
                            minHeight: '440px',
                            gap: '16px'
                        }}>
                            <div style={{ 
                                width: '64px', 
                                height: '64px', 
                                borderRadius: '50%', 
                                background: '#f1f5f9', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                color: '#94a3b8' 
                            }}>
                                <Receipt size={28} />
                            </div>
                            <div>
                                <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 800, color: '#334155' }}>No Document Attached Yet</h4>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', maxWidth: '300px', lineHeight: '1.5' }}>
                                    Upload or link a scanned bill from the sources tab to view it in full and run AI OCR extraction.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActiveMediaTab('upload')}
                                className="btn btn-primary"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                                    border: 'none',
                                    padding: '10px 18px',
                                    borderRadius: '10px',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    marginTop: '8px'
                                }}
                            >
                                <Upload size={16} />
                                <span>Open Upload & Scans Tab</span>
                            </button>
                        </div>
                    )
                )}
            </div>

            {/* Nested Modal for Editing Supplier */}
            {editModal.isOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: '24px' }}>
                    <div style={{ width: '100%', maxWidth: '1000px', maxHeight: '90vh', background: 'white', borderRadius: '16px', padding: '32px', overflowY: 'auto', position: 'relative' }}>
                        <button onClick={() => setEditModal({ isOpen: false, type: null })} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} /></button>
                        <QuickPartnerContactDualAdd 
                            company_id={company_id} 
                            initialPartner={editModal.initialData} 
                            partners={partners}
                            onSuccess={handleEditSuccess} 
                            onCancel={() => setEditModal({ isOpen: false, type: null })} 
                        />
                    </div>
                </div>
            )}

            <GDriveConnectionModal 
                isOpen={isAuthModalOpen} 
                onClose={() => setIsAuthModalOpen(false)} 
                state="scanner_module"
            />

            {localQrModal.isOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justify: 'center', zIndex: 10000, padding: '20px' }}>
                    <div style={{ background: '#fff', color: '#1e293b', maxWidth: '400px', width: '100%', padding: '32px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', textAlign: 'center', position: 'relative' }}>
                        <button 
                            onClick={handleCloseLocalQR}
                            style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                            onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                        >
                            <X size={24} />
                        </button>

                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justify: 'center', margin: '0 auto 16px' }}>
                            <Smartphone size={24} />
                        </div>

                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0' }}>Mobile Upload Gateway</h3>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 24px 0', lineHeight: '1.4' }}>
                            Scan this QR code with your smartphone camera to upload files directly to your <strong>{localQrModal.folderName}</strong> folder.
                        </p>

                        {localQrModal.isLoading || !localQrModal.folderId ? (
                            <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                <Loader2 size={36} className="animate-spin text-primary" style={{ color: '#6366f1' }} />
                                <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Connecting Google Drive...</span>
                            </div>
                        ) : (
                            <div>
                                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px dashed #cbd5e1', display: 'inline-block', marginBottom: '24px' }}>
                                    <img 
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                                            `${window.location.origin}/upload-media?jobId=${formData.job_id || ''}&folderId=${localQrModal.folderId}&token=${localStorage.getItem('google_access_token')}&jobName=${encodeURIComponent((formData.job_no || 'Job') + ' - ' + localQrModal.folderName)}`
                                        )}`}
                                        alt="Upload QR Code"
                                        style={{ width: '200px', height: '200px', display: 'block' }}
                                    />
                                </div>

                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                    <Info size={14} style={{ flexShrink: 0 }} />
                                    <span>Session active. QR code is valid for temporary uploading.</span>
                                </div>
                            </div>
                        )}

                        <button 
                            className="btn btn-primary" 
                            style={{ width: '100%', marginTop: '24px', padding: '12px', borderRadius: '12px', fontWeight: 700, background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)', border: 'none', color: '#fff', cursor: 'pointer' }}
                            onClick={handleCloseLocalQR}
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}

            {showPhotoPicker && (
                <Modal
                    isOpen={showPhotoPicker}
                    onClose={() => setShowPhotoPicker(false)}
                    title="Select Photo from Job Gallery"
                    icon={Image}
                    size="lg"
                >
                    <div style={{ padding: '8px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '16px', maxHeight: '450px', overflowY: 'auto', padding: '4px' }}>
                            {galleryFiles?.map(file => (
                                <div 
                                    key={file.id} 
                                    onClick={() => handleSelectPhoto(file)}
                                    style={{ 
                                        position: 'relative', 
                                        borderRadius: '12px', 
                                        overflow: 'hidden', 
                                        background: '#fff', 
                                        border: '1.5px solid #e2e8f0', 
                                        aspectRatio: '1', 
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.05)'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                        e.currentTarget.style.borderColor = 'var(--accent)';
                                        e.currentTarget.style.boxShadow = '0 6px 12px rgba(99, 102, 241, 0.15)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.borderColor = '#e2e8f0';
                                        e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.05)';
                                    }}
                                >
                                    <img 
                                        src={file.thumbnailLink?.replace('=s220', '=s600')} 
                                        alt={file.name} 
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                    />
                                    <div style={{ 
                                        position: 'absolute', 
                                        bottom: 0, 
                                        left: 0, 
                                        right: 0, 
                                        padding: '6px', 
                                        background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', 
                                        color: '#fff', 
                                        fontSize: '0.65rem', 
                                        fontWeight: 600,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }} title={file.name}>
                                        {file.name}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button 
                                className="btn btn-secondary" 
                                onClick={() => setShowPhotoPicker(false)}
                                style={{ padding: '8px 16px' }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Job Supplier Bills Modal Picker */}
            {jobBillsModal.isOpen && (
                <Modal
                    isOpen={jobBillsModal.isOpen}
                    onClose={() => setJobBillsModal(prev => ({ ...prev, isOpen: false }))}
                    title={`Supplier Bills from Job: ${jobBillsModal.jobNo} (${jobBillsModal.folderName})`}
                    icon={FolderOpen}
                    size="lg"
                >
                    <div style={{ padding: '12px' }}>
                        {jobBillsModal.isLoading ? (
                            <div style={{ padding: '48px 0', textAlign: 'center', color: '#6366f1' }}>
                                <Loader2 size={36} className="animate-spin" style={{ margin: '0 auto 12px', display: 'block' }} />
                                <div style={{ fontSize: '0.9rem', color: '#475569', fontWeight: 600 }}>Scanning Job's Supplier Bills folder on Google Drive...</div>
                            </div>
                        ) : jobBillsModal.files.length === 0 ? (
                            <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                                <Receipt size={44} color="#94a3b8" style={{ margin: '0 auto 12px', display: 'block' }} />
                                <div style={{ fontWeight: 700, color: '#334155', fontSize: '1rem' }}>No bills found in {jobBillsModal.folderName}</div>
                                <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '6px', maxWidth: '420px', margin: '6px auto 0', lineHeight: 1.5 }}>
                                    No documents exist inside <strong>{jobBillsModal.jobNo}</strong>'s <strong>{jobBillsModal.folderName}</strong> folder yet. You can upload an invoice using "Upload local invoice / bill" or drop files into this Google Drive folder.
                                </p>
                                <div style={{ marginTop: '20px' }}>
                                    <button 
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => setJobBillsModal(prev => ({ ...prev, isOpen: false }))}
                                        style={{ padding: '8px 20px', borderRadius: '8px' }}
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
                                        Select an invoice to attach. Gemini AI will automatically extract details and populate your expense form.
                                    </p>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#047857', background: '#ecfdf5', padding: '2px 8px', borderRadius: '12px', border: '1px solid #a7f3d0' }}>
                                        {jobBillsModal.files.length} document{jobBillsModal.files.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px', maxHeight: '420px', overflowY: 'auto', padding: '2px' }}>
                                    {jobBillsModal.files.map(file => (
                                        <div
                                            key={file.id}
                                            onClick={() => handleSelectJobBill(file)}
                                            style={{
                                                border: '1.5px solid #e2e8f0',
                                                borderRadius: '12px',
                                                padding: '12px 14px',
                                                cursor: 'pointer',
                                                background: '#ffffff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                transition: 'all 0.15s ease',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                                            }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.borderColor = '#10b981';
                                                e.currentTarget.style.background = '#f0fdf4';
                                                e.currentTarget.style.transform = 'translateY(-1px)';
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.borderColor = '#e2e8f0';
                                                e.currentTarget.style.background = '#ffffff';
                                                e.currentTarget.style.transform = 'none';
                                            }}
                                        >
                                            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <Receipt size={20} />
                                            </div>
                                            <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={file.name}>
                                                    {file.name}
                                                </div>
                                                <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '2px', display: 'flex', gap: '8px' }}>
                                                    <span>{file.mimeType?.split('/')[1]?.toUpperCase() || 'FILE'}</span>
                                                    {file.size && <span>• {(file.size / 1024).toFixed(0)} KB</span>}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                                    <button 
                                        type="button"
                                        className="btn btn-secondary" 
                                        onClick={() => setJobBillsModal(prev => ({ ...prev, isOpen: false }))}
                                        style={{ padding: '8px 18px', borderRadius: '8px' }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </Modal>
            )}
        </div>
    );
};

// Quick Form Add
export const QuickFormAdd = ({ company_id, initialData, onSuccess, onCancel }) => {
    const [formData, setFormData] = useState(initialData || {
        title: '',
        form_type: 'PDF',
        author_company: '',
        info: '',
        file_url: ''
    });
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        if (!formData.title) return alert('Form Title is required');
        setLoading(true);
        try {
            const { saveForm } = await import('../../lib/formsService');
            const { data, error } = await saveForm({
                ...formData,
                company_id
            });
            if (error) throw error;
            onSuccess(data);
        } catch (err) {
            console.error(err);
            alert('Failed to save form');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="form-item">
                <label>Form Title *</label>
                <input
                    className="form-input"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. Site Audit Checklist"
                    autoFocus
                />
            </div>
            <div className="grid-2">
                <div className="form-item">
                    <label>Form Type</label>
                    <select
                        className="form-select"
                        value={formData.form_type}
                        onChange={e => setFormData({ ...formData, form_type: e.target.value })}
                    >
                        <option value="PDF">PDF Document</option>
                        <option value="DOCX">Word Document</option>
                        <option value="XLSX">Excel Spreadsheet</option>
                        <option value="LINK">External Link</option>
                    </select>
                </div>
                <div className="form-item">
                    <label>Issuer / Department</label>
                    <input
                        className="form-input"
                        value={formData.author_company}
                        onChange={e => setFormData({ ...formData, author_company: e.target.value })}
                        placeholder="e.g. Operations"
                    />
                </div>
            </div>
            <div className="form-item">
                <label>Template Link (Google Drive / Web)</label>
                <input
                    className="form-input"
                    value={formData.file_url}
                    onChange={e => setFormData({ ...formData, file_url: e.target.value })}
                    placeholder="https://drive.google.com/..."
                />
            </div>
            <div className="form-item">
                <label>Instructions / Info</label>
                <textarea
                    className="form-textarea"
                    value={formData.info}
                    onChange={e => setFormData({ ...formData, info: e.target.value })}
                    placeholder="Add brief instructions for this form..."
                    rows={3}
                />
            </div>
            <div className="quick-form-actions">
                <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={loading || !formData.title}>
                    <Save size={18} /> {loading ? 'Saving...' : 'Save Template'}
                </button>
            </div>
        </div>
    );
};

const ReviewItem = ({ label, value, fullWidth }) => {
    if (!value) return null;
    return (
        <div style={{ gridColumn: fullWidth ? '1 / span 2' : 'span 1', background: '#f1f5f9', padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
        </div>
    );
};

export const QuickJobMajorAdd = ({ company_id, onSuccess, onCancel, onRefresh }) => {
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [categories, setCategories] = useState([]);
    const [editingCategory, setEditingCategory] = useState(null); // { id, name } or null

    useEffect(() => {
        if (company_id) {
            fetchCategories();
        }
    }, [company_id]);

    const fetchCategories = async () => {
        try {
            const data = await getJobMajorCategories(company_id);
            if (data) setCategories(data);
        } catch (err) {
            console.error('Failed to load categories:', err);
        }
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (!name.trim()) return alert('Please enter a category name');
        
        setLoading(true);
        try {
            const payload = {
                company_id,
                name: name.trim()
            };
            if (editingCategory) {
                payload.id = editingCategory.id;
            }

            const data = await saveJobMajorCategory(payload);
            
            // Clean input and state
            setName('');
            setEditingCategory(null);
            
            // Reload local list
            await fetchCategories();
            
            // Trigger refresh on parent
            if (onRefresh) {
                await onRefresh();
            }

            // If it was a new add, we auto-select it via onSuccess callback
            if (!editingCategory && onSuccess) {
                onSuccess(data);
            }
        } catch (err) {
            console.error('Failed to save category:', err);
            if (err.code === 'PGRST205' || err.message?.includes('not found') || err.details?.includes('not found')) {
                const proceed = confirm(
                    "Database Table 'job_major_categories' Not Found!\n\n" +
                    "To enable dynamic categories, you must run the SQL migration script in your Supabase SQL Editor.\n\n" +
                    "Would you like to fallback to adding this category temporarily in your browser tab for this session?"
                );
                if (proceed && onSuccess) {
                    onSuccess({ id: 'local-' + Date.now(), name: name.trim() });
                }
            } else {
                alert(`Failed to save category: ${err.message || 'Check database connection.'}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleStartEdit = (cat) => {
        setEditingCategory(cat);
        setName(cat.name);
    };

    const handleCancelEdit = () => {
        setEditingCategory(null);
        setName('');
    };

    const handleDelete = async (cat) => {
        if (!confirm(`Are you sure you want to delete the category "${cat.name}"?`)) return;
        setLoading(true);
        try {
            await deleteJobMajorCategory(cat.id);
            await fetchCategories();
            if (onRefresh) {
                await onRefresh();
            }
        } catch (err) {
            console.error('Failed to delete category:', err);
            alert(`Failed to delete category: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '10px' }}>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #6366f1, #10b981)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)' }}>
                        {editingCategory ? <Pencil size={20} /> : <Plus size={20} />}
                    </div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        {editingCategory ? 'Edit Job Category' : 'Add New Job Category'}
                    </h2>
                </div>
                
                <div className="form-item">
                    <label style={{ fontWeight: 600, fontSize: '0.85rem', color: '#4b5563', marginBottom: '8px', display: 'block' }}>Category Name *</label>
                    <input
                        className="form-input"
                        type="text"
                        required
                        placeholder="e.g. Marine Engineering, Calibration Service"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', outline: 'none' }}
                        autoFocus
                    />
                </div>

                <div className="quick-form-actions" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                    {editingCategory ? (
                        <>
                            <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer' }}>Cancel Edit</button>
                            <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Save size={18} /> {loading ? 'Saving...' : 'Update Category'}
                            </button>
                        </>
                    ) : (
                        <>
                            <button type="button" className="btn btn-secondary" onClick={onCancel} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer' }}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Save size={18} /> {loading ? 'Saving...' : 'Save Category'}
                            </button>
                        </>
                    )}
                </div>
            </form>

            {categories.length > 0 && (
                <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155', marginBottom: '12px' }}>Existing Custom Categories</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                        {categories.map(cat => (
                            <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                <span style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 500 }}>{cat.name}</span>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button 
                                        type="button" 
                                        onClick={() => handleStartEdit(cat)}
                                        style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                                        title="Edit"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => handleDelete(cat)}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                                        title="Delete"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

