import React, { useState, useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import { getStatementData, saveWorkflowDocument, generateDocNumber } from '../../lib/workflowV2Service';
import RichTextEditor from '../common/RichTextEditor';
import Tesseract from 'tesseract.js';
import { getEncryptedApiKey, getDecryptedApiKey } from '../../lib/ai/configService';
import { executeOpenAICompatibleRequest } from '../../lib/ai/providerRunners';
import { callServerAiProxy } from '../../lib/ai/serverProxyClient';

export default function ReceivePaymentModalExpanded({ prefill, onClose, onSuccess, partners, company_id }) {
  // ------------ Form State (left column) ------------
  const [formData, setFormData] = useState({
    id: prefill?.id || null,
    partner_id: prefill?.partner_id || '',
    issue_date: prefill?.issue_date || new Date().toISOString().split('T')[0],
    total_amount: prefill?.amount || 0,
    payment_method: prefill?.payment_method || 'Bank Transfer',
    payment_ref: prefill?.payment_ref || '',
    related_document_id: prefill?.related_document_id || prefill?.id || '',
    invoice_no: prefill?.document_no || '',
    subject: prefill?.subject || (prefill?.document_no ? `Payment for Invoice ${prefill.document_no}` : 'General Payment Received'),
    notes: prefill?.notes || '',
    // fields that will be auto‑filled by AI
    company_name: prefill?.company_name || '',
    issue_date_auto: prefill?.issue_date || '',
    description: prefill?.subject || '',
    amount: prefill?.amount || '',
    gst: prefill?.gst || '',
    total_amount_auto: prefill?.total_amount || ''
  });

  const [saving, setSaving] = useState(false);
  const [outstandingInvoices, setOutstandingInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // ------------ Scan Pane State (right column) ------------
  const [imageFile, setImageFile] = useState(null);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [scanError, setScanError] = useState('');

  // Fetch invoices when partner changes – unchanged from original modal
  useEffect(() => {
    const fetchInvoices = async () => {
      if (!formData.partner_id) { setOutstandingInvoices([]); return; }
      setLoadingInvoices(true);
      try {
        const { data } = await getStatementData(company_id, formData.partner_id, '2000-01-01', '2099-12-31');
        if (data) {
          const invoices = [];
          const payments = new Map();
          data.forEach(doc => {
            if ((doc.document_type || '').includes('Invoice')) invoices.push(doc);
            else if (doc.document_type === 'Payment Received' && doc.internal_notes) {
              try { const notes = JSON.parse(doc.internal_notes); if (notes.related_document_id) payments.set(notes.related_document_id, (payments.get(notes.related_document_id) || 0) + parseFloat(doc.total_amount || 0)); }
              catch {}
            }
          });
          const outstanding = invoices.map(inv => {
            const paid = payments.get(inv.id) || 0;
            return { ...inv, outstanding: (parseFloat(inv.total_amount || 0) - paid) };
          }).filter(inv => inv.outstanding > 0.01);
          setOutstandingInvoices(outstanding);
        }
      } catch (err) { console.error('Error fetching invoices', err); }
      finally { setLoadingInvoices(false); }
    };
    fetchInvoices();
  }, [formData.partner_id, company_id]);

  // ------------ OCR + AI extraction ------------
  const handleProcess = async () => {
    if (!imageFile) return;
    setScanError('');
    setOcrRunning(true);
    try {
      const { data: { text } } = await Tesseract.recognize(imageFile, 'eng', { logger: m => console.log(m) });
      setOcrRunning(false);
      setAiRunning(true);

      const invoicePrompt = `Extract the fields from the following OCR text and return a JSON object with keys: company_name, invoice_number, issue_date (YYYY-MM-DD), description, amount (numeric), gst (numeric), total_amount (numeric). If a field cannot be found, set it to null.\n\n${text}`;
      const history = [{ role: 'system', content: 'You are an invoice parser.' }];
      const modelName = 'gpt-3.5-turbo';

      const hasCustomKey = Boolean(getEncryptedApiKey('OpenAI'));
      const raw = hasCustomKey
        ? await executeOpenAICompatibleRequest(
            { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', modelName, temperature: 0, maxTokens: 1024 },
            await getDecryptedApiKey('OpenAI'),
            invoicePrompt,
            history,
            true
          )
        : await callServerAiProxy('openai', invoicePrompt, history, true, null, modelName);

      const parsed = raw && !raw.error ? raw : {};

      // Update formData with any values that exist
      setFormData(prev => ({
        ...prev,
        company_name: parsed.company_name || prev.company_name,
        invoice_no: parsed.invoice_number || prev.invoice_no,
        issue_date: parsed.issue_date || prev.issue_date,
        description: parsed.description || prev.subject,
        total_amount: parsed.total_amount !== undefined ? parsed.total_amount : prev.total_amount,
        gst: parsed.gst !== undefined ? parsed.gst : prev.gst,
        // total amount may be amount + gst – keep as provided
      }));
    } catch (err) {
      console.error('Scanning error', err);
      setScanError('Failed to process the image. Please try again.');
    } finally {
      setOcrRunning(false);
      setAiRunning(false);
    }
  };

  const handleFileSelect = e => {
    const file = e.target.files[0];
    if (file) setImageFile(file);
  };

  const selectedInv = outstandingInvoices.find(i => i.id === formData.related_document_id);
  const remainingBalance = selectedInv ? selectedInv.outstanding - (parseFloat(formData.total_amount) || 0) : 0;

  const handleSave = async () => {
    if (!formData.partner_id || !formData.total_amount) { alert('Partner and Amount are required.'); return; }
    setSaving(true);
    try {
      const docNo = formData.id ? prefill?.document_no : await generateDocNumber(company_id || partners.find(p => p.id === formData.partner_id)?.company_id, 'Payment Received');
      const payload = {
        id: formData.id,
        partner_id: formData.partner_id,
        issue_date: formData.issue_date,
        total_amount: formData.total_amount,
        subject: formData.invoice_no ? `Payment for ${formData.invoice_no}` : formData.subject,
        notes: formData.notes,
        document_type: 'Payment Received',
        document_no: docNo || `PAY-${new Date().getTime()}`,
        company_id: company_id || partners.find(p => p.id === formData.partner_id)?.company_id,
        status: 'Confirmed',
        internal_notes: JSON.stringify({
          payment_method: formData.payment_method,
          payment_ref: formData.payment_ref,
          related_document_id: formData.related_document_id === 'other_custom' ? null : formData.related_document_id,
          // optional auto‑filled fields for audit
          extracted: {
            company_name: formData.company_name,
            invoice_number: formData.invoice_no,
            issue_date: formData.issue_date,
            description: formData.description,
            amount: formData.amount,
            gst: formData.gst,
            total_amount: formData.total_amount
          }
        })
      };
      const { error } = await saveWorkflowDocument(payload, []);
      if (error) throw error;
      onSuccess();
    } catch (err) {
      console.error('Save Payment Error:', err);
      alert(`Failed to record payment: ${err.message || 'Unknown error'}`);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: '24px', backdropFilter: 'blur(4px)' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '80vw', maxWidth: '1200px', background: '#fff', borderRadius: '20px', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '24px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Record Customer Payment</h3>
          <p style={{ margin: '4px 0 0 0', opacity: 0.9, fontSize: '0.85rem' }}>Instantly log payment and update SOA balance.</p>
        </div>
        {/* Content Grid */}
        <div className="payable-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', padding: '24px' }}>
          {/* ---------- Left Column – Form ---------- */}
          <div>
            <div className="form-item" style={{ margin: 0 }}>
              <label>Customer</label>
              <select className="form-input" value={formData.partner_id} onChange={e => setFormData({ ...formData, partner_id: e.target.value })} disabled={!!prefill?.partner_id}>
                <option value="">-- Select Customer --</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <div className="form-item" style={{ margin: 0 }}>
                <label>Payment Date</label>
                <input type="date" className="form-input" value={formData.issue_date} onChange={e => setFormData({ ...formData, issue_date: e.target.value })} />
              </div>
              <div className="form-item" style={{ margin: 0 }}>
                <label>Amount Received (SGD)</label>
                <input type="number" className="form-input" value={formData.total_amount} onChange={e => setFormData({ ...formData, total_amount: e.target.value })} />
              </div>
            </div>
            {selectedInv && (
              <div style={{ background: '#ecfdf5', padding: '14px 20px', borderRadius: '12px', border: '1px solid #a7f3d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(16,185,129,0.05)', marginTop: '12px' }}>
                <div>
                  <span style={{ color: '#065f46', fontWeight: 600, fontSize: '0.85rem' }}>Current Outstanding Balance: </span>
                  <span style={{ fontWeight: 800, color: '#047857', fontSize: '0.95rem', fontFamily: "'Inter', sans-serif" }}>SGD {selectedInv.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ borderLeft: '1px solid #d1fae5', height: '24px' }} />
                <div>
                  <span style={{ color: '#065f46', fontWeight: 600, fontSize: '0.85rem' }}>Remaining Balance: </span>
                  <span style={{ fontWeight: 900, color: remainingBalance <= 0 ? '#10b981' : '#f59e0b', fontSize: '1rem', fontFamily: "'Inter', sans-serif" }}>SGD {Math.max(0, remainingBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <div className="form-item" style={{ margin: 0 }}>
                <label>Payment Method</label>
                <select className="form-input" value={formData.payment_method} onChange={e => setFormData({ ...formData, payment_method: e.target.value })}>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="PayNow">PayNow</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>
              <div className="form-item" style={{ margin: 0 }}>
                <label>Transaction Ref</label>
                <input type="text" className="form-input" value={formData.payment_ref} onChange={e => setFormData({ ...formData, payment_ref: e.target.value })} placeholder="e.g. TXN-12345" />
              </div>
            </div>
            {/* Invoice selection / custom reference */}
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <div className="form-item" style={{ margin: 0 }}>
                <label>
                  Invoice No / Job No Reference {loadingInvoices && <Loader2 size={12} className="animate-spin" style={{ display: 'inline-block', marginLeft: '6px' }} />}
                </label>
                {formData.related_document_id === 'other_custom' ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" className="form-input" style={{ flex: 1 }} value={formData.invoice_no} onChange={e => setFormData({ ...formData, invoice_no: e.target.value })} placeholder="Enter manual reference..." />
                    <button type="button" className="btn btn-secondary" style={{ padding: '0 12px' }} onClick={() => setFormData({ ...formData, related_document_id: '' })}>Back</button>
                  </div>
                ) : (
                  <select className="form-input" value={formData.related_document_id} onChange={e => {
                    const selectedId = e.target.value;
                    if (selectedId === 'other_custom') {
                      setFormData({ ...formData, related_document_id: 'other_custom', invoice_no: '' });
                    } else {
                      const selectedInv = outstandingInvoices.find(i => i.id === selectedId);
                      if (selectedInv) {
                        setFormData({ ...formData, related_document_id: selectedId, invoice_no: selectedInv.document_no, total_amount: selectedInv.outstanding > 0 ? selectedInv.outstanding : formData.total_amount });
                      } else {
                        setFormData({ ...formData, related_document_id: '', invoice_no: '' });
                      }
                    }
                  }}>
                    <option value="">-- Select Outstanding Invoice --</option>
                    {outstandingInvoices.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.document_no} {inv.assigned_job_no ? `(Job: ${inv.assigned_job_no})` : ''} - Bal: SGD {inv.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </option>
                    ))}
                    <option value="other_custom">Custom Reference...</option>
                  </select>
                )}
              </div>
              <div className="form-item" style={{ margin: 0 }}>
                <label>Description / Allocation</label>
                <input type="text" className="form-input" value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })} />
              </div>
            </div>
            <div className="form-item" style={{ margin: 0 }}>
              <label>NOTES WITH RICH TEXT (TABLES & IMAGES SUPPORTED):</label>
              <RichTextEditor value={formData.notes} onChange={val => setFormData({ ...formData, notes: val })} placeholder="Add internal notes, insert tables or upload images for reconciliation..." height="250px" />
            </div>
          </div>

          {/* ---------- Right Column – Scan Pane ---------- */}
          <div className="scan-pane" style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '24px' }}>
            <h4 style={{ marginBottom: '12px' }}>Bill Scanning (AI Auto‑Fill)</h4>
            <div className="dropzone" onClick={() => document.getElementById('fileInput').click()} style={{ marginBottom: '12px' }}>
              {imageFile ? (<img src={URL.createObjectURL(imageFile)} alt="preview" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px' }} />) : 'Click or drag an invoice image here'}
            </div>
            <input id="fileInput" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelect} />
            <button className="btn btn-primary" onClick={handleProcess} disabled={!imageFile || ocrRunning || aiRunning} style={{ marginBottom: '12px' }}>
              {ocrRunning || aiRunning ? <Loader2 size={16} className="animate-spin" /> : 'Process'}
            </button>
            {scanError && <p style={{ color: '#ef4444' }}>{scanError}</p>}
          </div>
        </div>
        {/* Footer */}
        <div style={{ padding: '24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ background: '#10b981', borderColor: '#10b981' }} onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : 'Record Payment Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
