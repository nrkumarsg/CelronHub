import React, { useState, useEffect } from 'react';
import { 
    X, Sparkles, Upload, Loader2, Search, Building2, User, 
    Plus, Trash2, CheckCircle2, ExternalLink, FileText, Image, AlertCircle
} from 'lucide-react';
import { performOCR } from '../../lib/googleAuthService';
import { extractEnquiryDocument } from '../../lib/geminiService';
import { extractEnquiryWithOpenAI } from '../../lib/openAiVisionService';
import toast from 'react-hot-toast';

const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
    });
};


export default function SmartEnquiryParserModal({ isOpen, onClose, onApply, partners = [] }) {
    const [file, setFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isOCRLoading, setIsOCRLoading] = useState(false);
    const [ocrStep, setOcrStep] = useState(0); // 0: Idle, 1: OCR, 2: AI Parsing, 3: Completed
    
    // Extracted Fields State
    const [headers, setHeaders] = useState({
        customer_name: '',
        contact_person: '',
        contact_email: '',
        contact_phone: '',
        customer_ref: '',
        project_number: '',
        enquiry_date: '',
        due_date: '',
        subject: ''
    });
    const [items, setItems] = useState([]);
    const [matchedPartner, setMatchedPartner] = useState(null);

    useEffect(() => {
        if (!isOpen) {
            // Reset state
            setFile(null);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
            setIsOCRLoading(false);
            setOcrStep(0);
            setHeaders({
                customer_name: '',
                contact_person: '',
                contact_email: '',
                contact_phone: '',
                customer_ref: '',
                project_number: '',
                enquiry_date: '',
                due_date: '',
                subject: ''
            });
            setItems([]);
            setMatchedPartner(null);
        }
    }, [isOpen]);

    const handleFileChange = async (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        
        // Generate preview URL if it's an image
        if (selectedFile.type.startsWith('image/')) {
            setPreviewUrl(URL.createObjectURL(selectedFile));
        } else {
            setPreviewUrl(null);
        }

        await processDocument(selectedFile);
    };

    const processDocument = async (selectedFile) => {
        setIsOCRLoading(true);
        setOcrStep(1); // Preparing and reading document
        
        try {
            let extracted = null;

            if (selectedFile.type.startsWith('image/')) {
                // Convert image file to base64 Data URI
                const base64Data = await fileToBase64(selectedFile);
                
                setOcrStep(2); // AI Visual Document Parsing
                extracted = await extractEnquiryWithOpenAI(base64Data);
            } else {
                // Fallback for PDF/text files
                const rawText = await performOCR(selectedFile);
                if (!rawText || !rawText.trim()) {
                    toast.error("No readable text found in document. Please try a clearer copy.");
                    setIsOCRLoading(false);
                    setOcrStep(0);
                    return;
                }

                setOcrStep(2); // AI Enquiry Document Parsing
                extracted = await extractEnquiryDocument(rawText);
            }
            
            if (extracted) {
                // Set headers
                const newHeaders = {
                    customer_name: extracted.header?.customer_name || '',
                    contact_person: extracted.header?.contact_person || '',
                    contact_email: extracted.header?.contact_email || '',
                    contact_phone: extracted.header?.contact_phone || '',
                    customer_ref: extracted.header?.customer_ref || '',
                    project_number: extracted.header?.project_number || '',
                    enquiry_date: extracted.header?.enquiry_date || new Date().toISOString().split('T')[0],
                    due_date: extracted.header?.due_date || new Date(new Date().getTime() + 86400000).toISOString().split('T')[0],
                    subject: extracted.header?.subject || ''
                };
                setHeaders(newHeaders);

                // Set items
                const parsedItems = (extracted.items || []).map((it, idx) => ({
                    id: `parsed-${Date.now()}-${idx}-${Math.random()}`,
                    name: it.name || '',
                    specification: it.specification || '',
                    quantity: it.quantity || 1,
                    uom: it.uom || 'UNIT(S)',
                    unit_price: 0,
                    amount: 0
                }));
                setItems(parsedItems);

                // Perform Partner Resolution
                resolvePartner(newHeaders.customer_name);
                
                setOcrStep(3); // Parsing complete
                toast.success("Document successfully parsed!");
            } else {
                toast.error("AI failed to extract fields. Please check the document layout.");
                setOcrStep(0);
            }
        } catch (err) {
            console.error("Document Parsing Error:", err);
            toast.error("Failed to parse document: " + err.message);
            setOcrStep(0);
        } finally {
            setIsOCRLoading(false);
        }
    };

    const resolvePartner = (name) => {
        if (!name || partners.length === 0) return;
        const normalized = name.toLowerCase().trim();
        
        // Find best match in database
        const match = partners.find(p => 
            p.name.toLowerCase().includes(normalized) || 
            normalized.includes(p.name.toLowerCase())
        );

        if (match) {
            setMatchedPartner(match);
            toast.success(`Matched with Partner: ${match.name}`, { icon: '🤝' });
        } else {
            setMatchedPartner(null);
        }
    };

    const handleHeaderChange = (field, value) => {
        setHeaders(prev => {
            const next = { ...prev, [field]: value };
            if (field === 'customer_name') {
                resolvePartner(value);
            }
            return next;
        });
    };

    const handleItemChange = (itemId, field, value) => {
        setItems(prev => prev.map(it => {
            if (it.id === itemId) {
                return { ...it, [field]: value };
            }
            return it;
        }));
    };

    const deleteItem = (itemId) => {
        setItems(prev => prev.filter(it => it.id !== itemId));
    };

    const addManualRow = () => {
        setItems(prev => [
            ...prev,
            {
                id: `parsed-${Date.now()}-${Math.random()}`,
                name: '',
                specification: '',
                quantity: 1,
                uom: 'UNIT(S)',
                unit_price: 0,
                amount: 0
            }
        ]);
    };

    const handleApply = () => {
        if (!headers.customer_name) {
            toast.error("Please fill in or select a Customer Name.");
            return;
        }

        onApply({
            header: {
                ...headers,
                customer_id: matchedPartner?.id || ''
            },
            items: items.map(it => ({
                id: Date.now() + Math.random(),
                name: it.name,
                description: it.name,
                specification: it.specification,
                details: it.specification,
                quantity: parseFloat(it.quantity) || 1,
                qty: parseFloat(it.quantity) || 1,
                uom: it.uom || 'UNIT(S)',
                unit: it.uom || 'UNIT(S)',
                unit_price: 0,
                amount: 0,
                tax_enabled: true,
                tax_rate: 9
            })),
            file: file
        });

        toast.success("Successfully applied extracted data!");
        onClose();
    };

    if (!isOpen) return null;

    // Search Query Helper for Google & SG Business verification
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(headers.customer_name)}`;
    const sgBusinessSearchUrl = `https://www.sgpbusiness.com/search?q=${encodeURIComponent(headers.customer_name)}`;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div style={{ background: '#fff', borderRadius: '24px', width: '100%', maxWidth: '1200px', height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.2)' }}>
                
                {/* Header */}
                <div style={{ padding: '20px 32px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', background: '#f5f3ff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5cf6' }}>
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>Intelligent Enquiry Document Parser</h2>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Upload scanned enquiries or RFQs to extract header details and items with zero data loss.</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: '8px', borderRadius: '50%' }} className="hover:bg-slate-100">
                        <X size={20} />
                    </button>
                </div>

                {/* Progress Indicators */}
                {isOCRLoading && (
                    <div style={{ background: '#f5f3ff', padding: '12px 32px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <Loader2 size={18} className="animate-spin" color="#8b5cf6" />
                        <div style={{ display: 'flex', gap: '24px', fontSize: '0.85rem' }}>
                            <span style={{ fontWeight: ocrStep === 1 ? 700 : 500, color: ocrStep === 1 ? '#8b5cf6' : '#64748b' }}>
                                Phase 1: Running High-Performance OCR {ocrStep > 1 && '✅'}
                            </span>
                            <span style={{ fontWeight: ocrStep === 2 ? 700 : 500, color: ocrStep === 2 ? '#8b5cf6' : '#64748b' }}>
                                Phase 2: Live AI Document Extraction {ocrStep > 2 && '✅'}
                            </span>
                            <span style={{ fontWeight: ocrStep === 3 ? 700 : 500, color: ocrStep === 3 ? '#8b5cf6' : '#64748b' }}>
                                Phase 3: Partner Database Match
                            </span>
                        </div>
                    </div>
                )}

                {/* Main Workspace Split */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    
                    {/* Left Pane: Document Upload / Viewer */}
                    <div style={{ width: '40%', borderRight: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexDirection: 'column', height: '100%' }}>
                        {!file ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center' }}>
                                <div style={{ border: '2px dashed #cbd5e1', borderRadius: '20px', width: '100%', height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff', cursor: 'pointer' }}>
                                    <input 
                                        type="file" 
                                        accept="image/*,application/pdf"
                                        id="enquiry-ocr-file"
                                        onChange={handleFileChange}
                                        style={{ display: 'none' }}
                                    />
                                    <label htmlFor="enquiry-ocr-file" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                                        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                                            <Upload size={28} />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>Select Scanned Enquiry File</div>
                                            <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>Supports JPEG, PNG, PDF formats</div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        ) : (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                {/* File details header */}
                                <div style={{ padding: '12px 24px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                        {file.type === 'application/pdf' ? <FileText size={18} color="#ef4444" /> : <Image size={18} color="#3b82f6" />}
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                                    </div>
                                    <button 
                                        onClick={() => { setFile(null); setPreviewUrl(null); }}
                                        style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}
                                    >
                                        Change File
                                    </button>
                                </div>
                                
                                {/* Document Viewer panel */}
                                <div style={{ flex: 1, padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
                                    {previewUrl ? (
                                        <img 
                                            src={previewUrl} 
                                            alt="Scanned Enquiry Preview" 
                                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                                        />
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', maxWidth: '80%' }}>
                                            <FileText size={48} color="#94a3b8" style={{ margin: '0 auto 16px' }} />
                                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>PDF Document Loaded</div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>AI parsed client-side PDF layers natively.</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Pane: Parsed Form & Grid review */}
                    <div style={{ width: '60%', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '32px' }}>
                        {!file ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', textAlign: 'center', gap: '12px' }}>
                                <AlertCircle size={40} />
                                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>No Document Uploaded Yet</div>
                                <p style={{ fontSize: '0.85rem', maxWidth: '300px', margin: 0 }}>Please select or drag-and-drop your enquiry sheet in the left pane to begin automatic extraction.</p>
                            </div>
                        ) : isOCRLoading ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                                <Loader2 size={48} className="animate-spin" color="#8b5cf6" />
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '1rem' }}>Extracting Structured Data</div>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px', maxWidth: '320px' }}>Gemini is organizing raw text into correct Enquiry headers and item lists. This takes just a few seconds.</p>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                                
                                {/* Section 1: Header Fields */}
                                <div>
                                    <h3 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Header Details Review
                                    </h3>
                                    
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        
                                        {/* Customer Name */}
                                        <div style={{ gridColumn: 'span 2' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Customer / Company *</label>
                                                
                                                {/* DUAL COMPANY VERIFICATION LINKS */}
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <a 
                                                        href={googleSearchUrl} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none' }}
                                                    >
                                                        Google <ExternalLink size={10} />
                                                    </a>
                                                    <a 
                                                        href={sgBusinessSearchUrl} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none' }}
                                                    >
                                                        SG Business <ExternalLink size={10} />
                                                    </a>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <div style={{ position: 'relative', flex: 1 }}>
                                                    <Building2 size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                                    <input 
                                                        type="text"
                                                        required
                                                        placeholder="e.g. Colombo Dockyard PLC"
                                                        style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }}
                                                        value={headers.customer_name}
                                                        onChange={(e) => handleHeaderChange('customer_name', e.target.value)}
                                                    />
                                                </div>
                                                
                                                {/* Match Indicator */}
                                                {matchedPartner ? (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                        <CheckCircle2 size={14} color="#16a34a" /> database link
                                                    </span>
                                                ) : (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                        ⚠️ new customer
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Contact Person */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Contact Person</label>
                                            <div style={{ position: 'relative' }}>
                                                <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                                <input 
                                                    type="text"
                                                    placeholder="e.g. K.H.S.SUJEEWA"
                                                    style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }}
                                                    value={headers.contact_person}
                                                    onChange={(e) => handleHeaderChange('contact_person', e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        {/* RFQ / Enquiry Reference */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Enquiry / RFQ Ref No</label>
                                            <input 
                                                type="text"
                                                placeholder="e.g. SR-4457-L26-1832"
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }}
                                                value={headers.customer_ref}
                                                onChange={(e) => handleHeaderChange('customer_ref', e.target.value)}
                                            />
                                        </div>

                                        {/* Project Number */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Project Number</label>
                                            <input 
                                                type="text"
                                                placeholder="e.g. SR/4457"
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }}
                                                value={headers.project_number}
                                                onChange={(e) => handleHeaderChange('project_number', e.target.value)}
                                            />
                                        </div>

                                        {/* Subject Summary */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Subject Summary</label>
                                            <input 
                                                type="text"
                                                placeholder="e.g. Purchasing Enquiry (Import)"
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }}
                                                value={headers.subject}
                                                onChange={(e) => handleHeaderChange('subject', e.target.value)}
                                            />
                                        </div>

                                        {/* Enquiry Date */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Date of Enquiry</label>
                                            <input 
                                                type="date"
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }}
                                                value={headers.enquiry_date}
                                                onChange={(e) => handleHeaderChange('enquiry_date', e.target.value)}
                                            />
                                        </div>

                                        {/* Due Date */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Quotation Due Date</label>
                                            <input 
                                                type="date"
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }}
                                                value={headers.due_date}
                                                onChange={(e) => handleHeaderChange('due_date', e.target.value)}
                                            />
                                        </div>

                                    </div>
                                </div>

                                {/* Section 2: Items Table Grid */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Line Items Grid ({items.length})
                                        </h3>
                                        <button 
                                            onClick={addManualRow}
                                            style={{ border: 'none', background: 'none', color: '#3b82f6', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <Plus size={14} /> Add Manual Row
                                        </button>
                                    </div>

                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontWeight: 700, color: '#475569' }}>
                                                    <th style={{ padding: '12px 16px', width: '60%' }}>Item Description / Technical Specifications</th>
                                                    <th style={{ padding: '12px 16px', width: '15%', textAlign: 'center' }}>Qty</th>
                                                    <th style={{ padding: '12px 16px', width: '15%' }}>UOM</th>
                                                    <th style={{ padding: '12px 16px', width: '10%', textAlign: 'center' }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {items.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                                            No line items extracted. Click "Add Manual Row" or re-scans.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    items.map((it) => (
                                                        <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
                                                            <td style={{ padding: '12px 16px' }}>
                                                                <input 
                                                                    type="text"
                                                                    placeholder="Item Name (e.g. Flexible Cable)"
                                                                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, outline: 'none' }}
                                                                    value={it.name}
                                                                    onChange={(e) => handleItemChange(it.id, 'name', e.target.value)}
                                                                />
                                                                <textarea 
                                                                    placeholder="Add technical specifications, remarks, length, etc."
                                                                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.75rem', outline: 'none', marginTop: '6px', resize: 'vertical', minHeight: '40px', fontFamily: 'inherit' }}
                                                                    value={it.specification}
                                                                    onChange={(e) => handleItemChange(it.id, 'specification', e.target.value)}
                                                                />
                                                            </td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                                <input 
                                                                    type="number"
                                                                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', textAlign: 'center', outline: 'none' }}
                                                                    value={it.quantity}
                                                                    onChange={(e) => handleItemChange(it.id, 'quantity', e.target.value)}
                                                                />
                                                            </td>
                                                            <td style={{ padding: '12px 16px' }}>
                                                                <input 
                                                                    type="text"
                                                                    placeholder="e.g. MTS, PCS"
                                                                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', outline: 'none' }}
                                                                    value={it.uom}
                                                                    onChange={(e) => handleItemChange(it.id, 'uom', e.target.value)}
                                                                />
                                                            </td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                                <button 
                                                                    onClick={() => deleteItem(it.id)}
                                                                    style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Import Actions */}
                                <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                                    <button 
                                        onClick={onClose} 
                                        className="btn btn-outline"
                                        style={{ padding: '12px 24px', borderRadius: '12px', fontWeight: 600 }}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={handleApply} 
                                        className="btn btn-primary"
                                        style={{ padding: '12px 32px', borderRadius: '12px', fontWeight: 700, background: '#8b5cf6', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                                    >
                                        <CheckCircle2 size={18} /> Apply Extracted Data
                                    </button>
                                </div>

                            </div>
                        )}
                    </div>

                </div>

            </div>
        </div>
    );
}
