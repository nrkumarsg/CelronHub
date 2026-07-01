import React, { useState, useEffect } from 'react';
import { X, Send, Mail, Search, Paperclip, Trash2, Plus, Eye, Edit2, Upload, AlertCircle, CheckCircle2, FolderOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function EmailPreviewModal({ isOpen, onClose, onSent, data }) {
    if (!isOpen) return null;

    const { profile } = useAuth();

    // Form inputs state
    const [to, setTo] = useState(data.to || '');
    const [cc, setCc] = useState(data.cc || 'accounts@celron.net; acct.celron.sg@gmail.com');
    const [bcc, setBcc] = useState(data.bcc || 'celron.simlim0305@gmail.com');
    const [subject, setSubject] = useState(data.subject || '');
    const [body, setBody] = useState(data.body || '');
    const [attachments, setAttachments] = useState([]);
    
    // Contact list state
    const [companySearch, setCompanySearch] = useState('');
    const [officeSearch, setOfficeSearch] = useState('');
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
    const [showOfficeDropdown, setShowOfficeDropdown] = useState(false);
    const [customVisibleContacts, setCustomVisibleContacts] = useState([]);
    const [customOfficeContacts, setCustomOfficeContacts] = useState([]);
    const [saving, setSaving] = useState(false);

    // Hardcoded office contact defaults
    const defaultOfficeContacts = [
        { name: 'Our Office', email: 'accounts@celron.net', post: 'Billing / Finance' },
        { name: 'N.R.KUMAR', email: 'kumar@celron.net', post: 'Director', handphone: '+65 97685891' },
        { name: 'Sales Office', email: 'sales@celron.net', post: 'General Sales' }
    ];

    // Build contacts for selected suppliers
    const getCompanyContacts = () => {
        const combined = [];
        
        // Accumulate contacts from selected suppliers passed via data
        if (data.selectedSuppliers && data.supplierContacts) {
            data.selectedSuppliers.forEach(supplier => {
                const contactsList = data.supplierContacts[supplier.id] || [];
                contactsList.forEach(c => {
                    if (c.email && !combined.some(x => x.email.toLowerCase() === c.email.toLowerCase())) {
                        combined.push({
                            ...c,
                            supplierName: supplier.name
                        });
                    }
                });
                
                // Fallback: Add the supplier's main email itself as a contact if no contacts exist
                if (supplier.email1 && !combined.some(x => x.email.toLowerCase() === supplier.email1.toLowerCase())) {
                    combined.push({
                        name: supplier.name,
                        email: supplier.email1,
                        post: 'Main Contact',
                        supplierName: supplier.name
                    });
                }
            });
        }

        // Add custom added ones
        customVisibleContacts.forEach(c => {
            if (c.email && !combined.some(x => x.email.toLowerCase() === c.email.toLowerCase())) {
                combined.push(c);
            }
        });

        return combined;
    };

    // Get office contacts (default + custom)
    const getOfficeContacts = () => {
        const combined = [...defaultOfficeContacts];
        customOfficeContacts.forEach(c => {
            if (c.email && !combined.some(x => x.email.toLowerCase() === c.email.toLowerCase())) {
                combined.push(c);
            }
        });
        return combined;
    };

    // Filter contacts based on search query
    const filteredCompanyContacts = getCompanyContacts().filter(c => 
        (c.name || '').toLowerCase().includes(companySearch.toLowerCase()) || 
        (c.email || '').toLowerCase().includes(companySearch.toLowerCase()) ||
        (c.supplierName || '').toLowerCase().includes(companySearch.toLowerCase())
    );

    const filteredOfficeContacts = getOfficeContacts().filter(c => 
        (c.name || '').toLowerCase().includes(officeSearch.toLowerCase()) || 
        (c.email || '').toLowerCase().includes(officeSearch.toLowerCase())
    );

    // Toggle emails helper
    const toggleEmailInField = (field, email) => {
        if (!email) return;
        const currentVal = field === 'to' ? to : field === 'cc' ? cc : bcc;
        let emails = currentVal.split(';').map(e => e.trim()).filter(Boolean);
        const lowerEmail = email.trim().toLowerCase();
        
        const matched = emails.find(e => e.toLowerCase() === lowerEmail);
        if (matched) {
            emails = emails.filter(e => e.toLowerCase() !== lowerEmail);
        } else {
            emails.push(email);
        }

        const finalVal = emails.join('; ');
        if (field === 'to') setTo(finalVal);
        else if (field === 'cc') setCc(finalVal);
        else setBcc(finalVal);
    };

    // Local file attachment handler
    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            setAttachments(prev => [...prev, ...files]);
        }
        e.target.value = null; // reset
    };

    const removeAttachment = (index) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    // Send Email now
    const handleSendEmail = async () => {
        const recipientTo = to.trim();
        if (!recipientTo) {
            toast.error('Please enter a recipient email address in the "To" field before sending.');
            return;
        }

        setSaving(true);
        const apiUrl = `${import.meta.env.VITE_API_URL || ''}/api/send-email`;
        console.log('[Email] Sending RFQ email to:', recipientTo);

        try {
            // Convert attachments to base64 payload
            const customAttachments = await Promise.all(attachments.map(async (file) => {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve({ name: file.name, type: file.type, content: e.target.result });
                    reader.readAsDataURL(file);
                });
            }));

            // Fallback from email from settings/auth
            const fromEmail = 'sales@celron.net';

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 35000);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    company_id: profile?.company_id,
                    from_email: fromEmail,
                    to: recipientTo,
                    cc: cc,
                    bcc: bcc,
                    subject: subject,
                    body: body,
                    attachments: customAttachments
                })
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || `Server returned ${response.status}`);
            }

            toast.success('RFQ email sent successfully!');
            
            // Trigger tracking RFQ Floated status update
            if (onSent) {
                await onSent();
            }
            onClose();
        } catch (err) {
            console.error('[Send RFQ Email Error]:', err);
            toast.error('Failed to send RFQ email: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                background: '#fff',
                width: '100%',
                maxWidth: '900px',
                borderRadius: '24px',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '95vh',
                border: '1px solid #e2e8f0'
            }}>
                {/* Modal Header */}
                <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: '#eef2ff', padding: '10px', borderRadius: '12px' }}>
                            <Mail size={20} color="#6366f1" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Confirm Email Draft</h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Review the RFQ content and attachments before sending to suppliers</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '8px' }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Modal Body */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* To/Cc/Bcc inputs */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>To (Suppliers)</label>
                            <input
                                type="text"
                                style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                placeholder="supplier1@example.com; supplier2@example.com"
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cc</label>
                                <input
                                    type="text"
                                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                    value={cc}
                                    onChange={(e) => setCc(e.target.value)}
                                    placeholder="accounts@celron.net; office@celron.net"
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bcc</label>
                                <input
                                    type="text"
                                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                    value={bcc}
                                    onChange={(e) => setBcc(e.target.value)}
                                    placeholder="manager@celron.net"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Dual column contact picker */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        
                        {/* Company Contacts */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Company Contacts</label>
                                <span style={{ fontSize: '10px', color: '#94a3b8' }}>{filteredCompanyContacts.length} available</span>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <input 
                                    type="text"
                                    placeholder="Search company contacts..."
                                    value={companySearch}
                                    onChange={(e) => setCompanySearch(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px 8px 30px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                                />
                                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '11px' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '140px', overflowY: 'auto', paddingRight: '4px' }}>
                                {filteredCompanyContacts.length === 0 ? (
                                    <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#fff' }}>
                                        No contacts found
                                    </div>
                                ) : (
                                    filteredCompanyContacts.map((contact, idx) => (
                                        <ContactCard 
                                            key={idx}
                                            contact={contact}
                                            to={to}
                                            cc={cc}
                                            toggleEmailInField={toggleEmailInField}
                                        />
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Our Office Contacts */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '1px solid #e2e8f0', paddingLeft: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Our Office Contacts</label>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <input 
                                    type="text"
                                    placeholder="Search office contacts..."
                                    value={officeSearch}
                                    onChange={(e) => setOfficeSearch(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px 8px 30px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                                />
                                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '11px' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '140px', overflowY: 'auto', paddingRight: '4px' }}>
                                {filteredOfficeContacts.map((contact, idx) => (
                                    <ContactCard 
                                        key={idx}
                                        contact={contact}
                                        to={to}
                                        cc={cc}
                                        toggleEmailInField={toggleEmailInField}
                                    />
                                ))}
                            </div>
                        </div>

                    </div>

                    {/* Subject field */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subject</label>
                        <input
                            type="text"
                            style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                        />
                    </div>

                    {/* Message Body */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Message Body</label>
                        <textarea
                            style={{ width: '100%', minHeight: '160px', padding: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', resize: 'vertical', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.5', boxSizing: 'border-box' }}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                        />
                    </div>

                    {/* Attachments Section */}
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Paperclip size={18} color="#6366f1" />
                                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>Attach Files</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => window.open(data.gdriveLink || 'https://drive.google.com/drive/folders/1Hr9-SFbjS-1pPIYu1kY57cRdc-1PVRij?usp=sharing', '_blank')}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                            >
                                <FolderOpen size={12} />
                                Open Enquiry Drive
                            </button>
                        </div>

                        {/* Local File Upload button */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Upload Local Files</span>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', background: '#6366f1', color: '#fff', padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                <Upload size={13} /> + Add File
                                <input
                                    type="file"
                                    multiple
                                    onChange={handleFileChange}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        </div>

                        {/* Attached list */}
                        {attachments.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Currently Attached ({attachments.length})
                                </label>
                                {attachments.map((file, idx) => (
                                    <div key={idx} style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                            <Paperclip size={15} color="#64748b" />
                                            <span style={{ fontSize: '12px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>({Math.round(file.size / 1024)} KB)</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeAttachment(idx)}
                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                                            title="Remove attachment"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                </div>

                {/* Modal Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc' }}>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSendEmail}
                        disabled={saving}
                        style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600, color: '#fff', background: '#6366f1', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: saving ? 0.7 : 1 }}
                    >
                        <Send size={16} /> {saving ? 'Sending...' : 'Send Email Now'}
                    </button>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
            `}} />
        </div>
    );
}

// Inner helper component for Contact Card
function ContactCard({ contact, to, cc, toggleEmailInField }) {
    const contactEmail = (contact.email || '').trim().toLowerCase();
    const isToActive = contactEmail ? to.split(';').map(e => e.trim().toLowerCase()).includes(contactEmail) : false;
    const isCcActive = contactEmail ? cc.split(';').map(e => e.trim().toLowerCase()).includes(contactEmail) : false;

    return (
        <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            minWidth: '220px'
        }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={contact.name}>
                    {contact.name}
                </span>
                <span style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={contact.email || 'No email registered'}>
                    {contact.email || 'No email registered'}
                </span>
                {contact.supplierName && (
                    <span style={{ fontSize: '9px', fontWeight: 600, color: '#6366f1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {contact.supplierName}
                    </span>
                )}
            </div>
            
            <div style={{ display: 'flex', gap: '5px', borderLeft: '1px solid #f1f5f9', paddingLeft: '8px', alignItems: 'center' }}>
                {contact.email && (
                    <>
                        <button 
                            type="button"
                            onClick={() => toggleEmailInField('to', contact.email)}
                            style={{ 
                                background: isToActive ? '#eef2ff' : '#f8fafc', 
                                color: isToActive ? '#4f46e5' : '#64748b', 
                                border: `1px solid ${isToActive ? '#c7d2fe' : '#e2e8f0'}`, 
                                borderRadius: '4px', 
                                padding: '2px 8px', 
                                fontSize: '10px', 
                                fontWeight: 800, 
                                cursor: 'pointer',
                                transition: 'all 0.15s ease-in-out'
                            }}
                        >
                            To
                        </button>
                        
                        <button 
                            type="button"
                            onClick={() => toggleEmailInField('cc', contact.email)}
                            style={{ 
                                background: isCcActive ? '#f0fdf4' : '#f8fafc', 
                                color: isCcActive ? '#16a34a' : '#64748b', 
                                border: `1px solid ${isCcActive ? '#bbf7d0' : '#e2e8f0'}`, 
                                borderRadius: '4px', 
                                padding: '2px 8px', 
                                fontSize: '10px', 
                                fontWeight: 800, 
                                cursor: 'pointer',
                                transition: 'all 0.15s ease-in-out'
                            }}
                        >
                            Cc
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
