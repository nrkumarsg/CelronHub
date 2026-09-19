import React, { useState, useEffect } from 'react';
import { Modal } from './QuickAddForms';
import { MessageSquare, Phone, Send, User, Check, Plus, X } from 'lucide-react';

export const WhatsAppShareModal = ({ isOpen, onClose, contacts, partner, documentData, onShareFile }) => {
    const [selectedNumbers, setSelectedNumbers] = useState([]);
    const [customNumber, setCustomNumber] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (isOpen && documentData) {
            const isZero = Boolean(documentData.zero_total || documentData.is_zero_total || documentData.delivery_verification?.zero_total || documentData.delivery_verification?.is_zero_total);
            const totalText = isZero ? `${documentData.currency || 'USD'} 0.00 (Customer to Pick Services)` : `${documentData.currency || 'SGD'} ${(documentData.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            const defaultMsg = `Dear Customer,\n\nPlease find the ${documentData.document_type} (${documentData.document_no}) from CEL-RON ENTERPRISES.\n\nSubject: ${documentData.subject || 'N/A'}\nTotal: ${totalText}\n\nBest Regards,\n${documentData.salesperson_name || 'CEL-RON Team'}`;
            setMessage(defaultMsg);

            // Pre-select primary contact if available
            const primaryContact = contacts.find(c => c.id === documentData.contact_id);
            if (primaryContact && (primaryContact.handphone || primaryContact.phone)) {
                const phone = primaryContact.handphone || primaryContact.phone;
                setSelectedNumbers([phone]);
            } else if (partner?.phone1) {
                setSelectedNumbers([partner.phone1]);
            } else {
                setSelectedNumbers(['+6581962270']);
            }
        }
    }, [isOpen, documentData, contacts, partner]);

    const toggleNumber = (num) => {
        if (selectedNumbers.includes(num)) {
            setSelectedNumbers(selectedNumbers.filter(n => n !== num));
        } else {
            setSelectedNumbers([...selectedNumbers, num]);
        }
    };

    const addCustomNumber = () => {
        if (customNumber && !selectedNumbers.includes(customNumber)) {
            setSelectedNumbers([...selectedNumbers, customNumber]);
            setCustomNumber('');
        }
    };

    const handleShareIndividual = (num) => {
        const cleanedPhone = num.replace(/[^\d]/g, '');
        const finalPhone = cleanedPhone.startsWith('65') ? cleanedPhone : '65' + cleanedPhone;
        // Instead of just opening the waUrl, we pass the phone to onShareFile so it can download the PDF first
        onShareFile(message, finalPhone);
    };

    const handleSharePDF = () => {
        // When sharing a PDF, the system allows multi-select in the target app (WhatsApp)
        // We pass the message and the file
        onShareFile(message);
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Share via WhatsApp" icon={MessageSquare}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Select Recipients</label>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '4px' }}>Choose which contacts to share this document with:</span>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', maxHeight: '250px', overflowY: 'auto' }}>
                        {contacts.length > 0 && (
                            <div style={{ marginBottom: '8px' }}>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>Individual Contacts</label>
                                {contacts.filter(c => c.handphone || c.phone).map(contact => (
                                    <label key={contact.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.2s' }} className="contact-row">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedNumbers.includes(contact.handphone || contact.phone)} 
                                            onChange={() => toggleNumber(contact.handphone || contact.phone)}
                                            style={{ width: '18px', height: '18px', accentColor: '#25D366' }}
                                        />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>{contact.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <MessageSquare size={12} /> {contact.handphone || contact.phone}
                                            </div>
                                        </div>
                                        <button 
                                            onClick={(e) => { e.preventDefault(); handleShareIndividual(contact.handphone || contact.phone); }}
                                            style={{ background: '#25D366', border: 'none', padding: '6px 10px', borderRadius: '6px', color: '#fff', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <Send size={12} /> Chat
                                        </button>
                                    </label>
                                ))}
                            </div>
                        )}

                        <div>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>Main Company / Alternative</label>
                            {partner?.phone1 && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={selectedNumbers.includes(partner.phone1)} 
                                        onChange={() => toggleNumber(partner.phone1)}
                                        style={{ width: '18px', height: '18px', accentColor: '#25D366' }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>{partner.name} (Main Office)</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{partner.phone1}</div>
                                    </div>
                                    <button 
                                        onClick={(e) => { e.preventDefault(); handleShareIndividual(partner.phone1); }}
                                        style={{ background: '#f1f5f9', border: 'none', padding: '6px 10px', borderRadius: '6px', color: '#475569', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        Chat
                                    </button>
                                </label>
                            )}
                            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}>
                                <input 
                                    type="checkbox" 
                                    checked={selectedNumbers.includes('+6581962270')} 
                                    onChange={() => toggleNumber('+6581962270')}
                                    style={{ width: '18px', height: '18px', accentColor: '#25D366' }}
                                />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>Base Number (Fallback)</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>+65 8196 2270</div>
                                </div>
                            </label>
                        </div>

                        <div style={{ marginTop: '12px' }}>
                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>Internal Approval</label>
                            {[
                                { name: 'N.R.Kumar', phone: '+6597685891' },
                                { name: 'S.JebaRaj', phone: '+6596160873' },
                                { name: 'ANITHA', phone: '+6591090347' }
                            ].map((contact, idx) => (
                                <label key={`internal-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.2s' }} className="contact-row">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedNumbers.includes(contact.phone)} 
                                        onChange={() => toggleNumber(contact.phone)}
                                        style={{ width: '18px', height: '18px', accentColor: '#25D366' }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>{contact.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{contact.phone.replace('+65', '+65 ')}</div>
                                    </div>
                                    <button 
                                        onClick={(e) => { e.preventDefault(); handleShareIndividual(contact.phone); }}
                                        style={{ background: '#f1f5f9', border: 'none', padding: '6px 10px', borderRadius: '6px', color: '#475569', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        Chat
                                    </button>
                                </label>
                            ))}
                        </div>

                        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '4px', paddingTop: '8px', display: 'flex', gap: '8px' }}>
                            <input 
                                type="text" 
                                placeholder="Add custom number..." 
                                value={customNumber}
                                onChange={e => setCustomNumber(e.target.value)}
                                style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                            />
                            <button 
                                onClick={addCustomNumber}
                                style={{ background: '#f1f5f9', border: 'none', padding: '6px 12px', borderRadius: '8px', color: '#64748b', cursor: 'pointer' }}
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>Message Content</label>
                    <textarea 
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', minHeight: '120px', resize: 'vertical' }}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                    <button 
                        onClick={handleSharePDF}
                        className="btn btn-primary" 
                        style={{ background: '#25D366', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}
                    >
                        <Send size={18} /> Share PDF File
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center' }}>To send to multiple people one-by-one:</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {selectedNumbers.map((num, i) => (
                                <button 
                                    key={i}
                                    onClick={() => handleShareIndividual(num)}
                                    style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', color: '#475569', cursor: 'pointer' }}
                                >
                                    Send to {num.length > 10 ? num.substring(0, 8) + '...' : num}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '12px', borderRadius: '12px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ color: '#d97706', marginTop: '2px' }}><Plus size={16} /></div>
                    <div style={{ fontSize: '0.75rem', color: '#92400e', lineHeight: 1.5 }}>
                        <strong>Tip:</strong> Use "Share PDF File" to select multiple contacts directly in WhatsApp. Browsers block opening multiple tabs at once, so message links are sent one at a time.
                    </div>
                </div>
            </div>
        </Modal>
    );
};
