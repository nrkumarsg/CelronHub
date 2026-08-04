import React, { useState, useEffect } from 'react';
import { X, Save, Edit3, Building2, Ship, MapPin, DollarSign, ExternalLink, RefreshCcw } from 'lucide-react';
import SearchableSelect from '../common/SearchableSelect';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

export default function EditWorkflowDocumentModal({
    isOpen,
    onClose,
    documentData,
    partners = [],
    vessels = [],
    workLocations = [],
    onRefreshRepository
}) {
    const [docType, setDocType] = useState('Enquiry');
    const [docNo, setDocNo] = useState('');
    const [partnerId, setPartnerId] = useState('');
    const [vesselId, setVesselId] = useState('');
    const [workLocationId, setWorkLocationId] = useState('');
    const [subject, setSubject] = useState('');
    const [status, setStatus] = useState('Active');
    const [totalAmount, setTotalAmount] = useState(0);
    const [gdriveFolderId, setGdriveFolderId] = useState('');
    const [gdriveFileLink, setGdriveFileLink] = useState('');
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (documentData) {
            setDocType(documentData.document_type || 'Enquiry');
            setDocNo(documentData.document_no || '');
            setPartnerId(documentData.partner_id || '');
            setVesselId(documentData.vessel_id || '');
            setWorkLocationId(documentData.work_location_id || '');
            setSubject(documentData.subject || '');
            setStatus(documentData.status || 'Active');
            setTotalAmount(documentData.total_amount || 0);
            setGdriveFolderId(documentData.gdrive_folder_id || '');
            setGdriveFileLink(documentData.gdrive_file_link || '');
            setNotes(documentData.notes || '');
        }
    }, [documentData]);

    if (!isOpen || !documentData) return null;

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('workflow_documents')
                .update({
                    document_type: docType,
                    document_no: docNo,
                    partner_id: partnerId || null,
                    vessel_id: vesselId || null,
                    work_location_id: workLocationId || null,
                    subject: subject,
                    status: status,
                    total_amount: parseFloat(totalAmount) || 0,
                    gdrive_folder_id: gdriveFolderId || null,
                    gdrive_file_link: gdriveFileLink || null,
                    notes: notes || null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', documentData.id);

            if (error) throw error;

            toast.success(`Updated ${docNo || 'Document'} successfully!`);
            if (onRefreshRepository) onRefreshRepository();
            onClose();
        } catch (err) {
            console.error('Error updating document record:', err);
            toast.error('Failed to update document: ' + (err.message || 'Database error'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(5px)',
            zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px'
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: '20px',
                maxWidth: '600px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#0f172a',
                    color: '#ffffff',
                    borderTopLeftRadius: '20px',
                    borderTopRightRadius: '20px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ background: '#3b82f6', color: '#fff', padding: '8px', borderRadius: '10px' }}>
                            <Edit3 size={20} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Edit Document Details</h3>
                            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                                Ref No: {docNo || documentData.id}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSave} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                Document Type
                            </label>
                            <select
                                value={docType}
                                onChange={(e) => setDocType(e.target.value)}
                                style={{
                                    width: '100%', padding: '9px 12px', borderRadius: '8px',
                                    border: '1px solid #cbd5e1', fontSize: '0.86rem'
                                }}
                            >
                                <option value="Enquiry">Enquiry</option>
                                <option value="Job">Job</option>
                                <option value="Quotation">Quotation</option>
                                <option value="Purchase Order">Purchase Order</option>
                                <option value="Delivery Order">Delivery Order</option>
                                <option value="Tax Invoice">Tax Invoice</option>
                                <option value="Payment Received">Payment Received</option>
                            </select>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                Document Number
                            </label>
                            <input
                                type="text"
                                value={docNo}
                                onChange={(e) => setDocNo(e.target.value)}
                                style={{
                                    width: '100%', padding: '9px 12px', borderRadius: '8px',
                                    border: '1px solid #cbd5e1', fontSize: '0.86rem', fontWeight: 700
                                }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                Customer / Partner
                            </label>
                            <SearchableSelect
                                options={partners.map(p => ({
                                    value: p.id,
                                    label: p.name || p.company_name || 'Unnamed Partner'
                                }))}
                                value={partnerId}
                                onChange={setPartnerId}
                                placeholder="Select Partner..."
                                icon={Building2}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                Vessel
                            </label>
                            <SearchableSelect
                                options={vessels.map(v => ({
                                    value: v.id,
                                    label: v.vessel_name || 'Unnamed Vessel'
                                }))}
                                value={vesselId}
                                onChange={setVesselId}
                                placeholder="Select Vessel..."
                                icon={Ship}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                            Subject / Work Scope
                        </label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            style={{
                                width: '100%', padding: '9px 12px', borderRadius: '8px',
                                border: '1px solid #cbd5e1', fontSize: '0.86rem'
                            }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                Status
                            </label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                style={{
                                    width: '100%', padding: '9px 12px', borderRadius: '8px',
                                    border: '1px solid #cbd5e1', fontSize: '0.86rem', fontWeight: 700
                                }}
                            >
                                <option value="Active">Active</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Quoted">Quoted</option>
                                <option value="Confirmed">Confirmed</option>
                                <option value="Completed">Completed</option>
                                <option value="Paid">Paid</option>
                                <option value="Cancelled">Cancelled</option>
                            </select>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                Total Amount ($)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={totalAmount}
                                onChange={(e) => setTotalAmount(e.target.value)}
                                style={{
                                    width: '100%', padding: '9px 12px', borderRadius: '8px',
                                    border: '1px solid #cbd5e1', fontSize: '0.86rem', fontWeight: 700
                                }}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                            Google Drive Folder ID
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. 1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w"
                            value={gdriveFolderId}
                            onChange={(e) => setGdriveFolderId(e.target.value)}
                            style={{
                                width: '100%', padding: '9px 12px', borderRadius: '8px',
                                border: '1px solid #cbd5e1', fontSize: '0.84rem'
                            }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                            Notes
                        </label>
                        <textarea
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            style={{
                                width: '100%', padding: '9px 12px', borderRadius: '8px',
                                border: '1px solid #cbd5e1', fontSize: '0.84rem'
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                background: '#ffffff', border: '1px solid #cbd5e1', color: '#475569',
                                borderRadius: '8px', padding: '8px 16px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            disabled={isSaving}
                            style={{
                                background: '#2563eb', border: 'none', color: '#ffffff',
                                borderRadius: '8px', padding: '8px 20px', fontSize: '0.82rem', fontWeight: 800,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                        >
                            {isSaving ? <RefreshCcw size={15} className="animate-spin" /> : <Save size={15} />}
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
