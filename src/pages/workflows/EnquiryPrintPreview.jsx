import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { getDocumentSettings } from '../../lib/store';
import { useAuth } from '../../contexts/AuthContext';
import { Printer, ArrowLeft, Download } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import WorkflowDocumentLayout from '../../components/workflow/WorkflowDocumentLayout';

export default function EnquiryPrintPreview() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { profile } = useAuth();
    const [doc, setDoc] = useState(null);
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [logoBase64, setLogoBase64] = useState('');
    const [signatureBase64, setSignatureBase64] = useState('');
    const [paynowBase64, setPaynowBase64] = useState('');

    const toBase64 = url => fetch(url, { mode: 'cors' })
        .then(response => response.blob())
        .then(blob => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        }));

    useEffect(() => {
        if (id && profile?.company_id) {
            fetchData();
        }
    }, [id, profile]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch V1 Enquiry with basic partner info
            const { data: enq, error: enqError } = await supabase
                .from('customer_enquiries')
                .select(`*, partners(*)`)
                .eq('id', id)
                .single();

            if (enqError) throw enqError;

            // 2. Safely Fetch Vessel & Location if IDs exist (handle missing relationships)
            let vesselData = null;
            let locationData = null;

            if (enq.vessel_id) {
                const { data: v } = await supabase.from('vessels').select('*').eq('id', enq.vessel_id).single();
                if (v) vesselData = v;
            }
            if (enq.work_location_id) {
                const { data: l } = await supabase.from('work_locations').select('*').eq('id', enq.work_location_id).single();
                if (l) locationData = l;
            }

            const stripHtml = (html) => {
                const tmp = document.createElement("DIV");
                tmp.innerHTML = html;
                return tmp.textContent || tmp.innerText || "";
            };

            // 3. Fetch Documents (Attachments)
            const { data: docs } = await supabase
                .from('documents')
                .select('*')
                .eq('company_id', profile.company_id)
                .eq('reference_type', 'Enquiry')
                .eq('reference_id', id);

            const attachments = (docs || [])
                .filter(d => d.url && (d.url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || d.url.includes('googleusercontent.com')))
                .map(d => d.url);

            // 4. Map V1 to V2-like structure for the layout
            const mappedDoc = {
                document_type: 'REQUEST FOR QUOTATION', 
                document_no: enq.enquiry_no,
                issue_date: enq.enquiry_date,
                expiry_date: enq.due_date,
                customer_ref: stripHtml(enq.customer_ref || ''),
                subject: stripHtml(enq.subject || `Ref: ${enq.enquiry_no}`),
                salesperson_name: profile?.full_name || 'ADMIN',
                partners: enq.partners,
                vessels: vesselData,
                work_locations: locationData,
                currency: 'SGD',
                items: (enq.catalog_items || []).map((item, idx) => ({
                    description: item.name || item.description,
                    details: item.specification || item.details,
                    quantity: item.qty || item.quantity || 1,
                    uom: item.unit || item.uom || 'UNIT(S)',
                    sort_order: idx
                })),
                notes: enq.description, // Use description for notes area
                attachments: attachments
            };

            setDoc(mappedDoc);

            // 5. Fetch Settings
            const settingsRes = await getDocumentSettings(profile?.company_id);
            if (settingsRes) {
                setSettings(settingsRes);
                if (settingsRes.logo_url) {
                    toBase64(settingsRes.logo_url).then(setLogoBase64).catch(e => console.error("Logo B64 error:", e));
                }
                const sigUrl = settingsRes.signature_url || '/nrkumarsign.png';
                toBase64(sigUrl).then(setSignatureBase64).catch(e => console.error("Signature B64 error:", e));
                if (settingsRes.paynow_url) {
                    toBase64(settingsRes.paynow_url).then(setPaynowBase64).catch(e => console.error("PayNow B64 error:", e));
                }
            }

        } catch (error) {
            console.error("Error fetching print data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        if (window.history.length > 2) {
            navigate(-1);
        } else {
            window.close();
            setTimeout(() => navigate('/workflows'), 100);
        }
    };

    const handleDownload = () => {
        const element = document.getElementById('print-paper-content');
        const opt = {
            margin: 10,
            filename: `RFQ_${doc.document_no || 'Draft'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, allowTaint: false, scrollX: 0, scrollY: 0, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(element).save();
    };

    if (loading) return <div className="text-center py-20">Loading Document Preview...</div>;
    if (!doc) return <div className="text-center py-20 text-red-500">Enquiry not found</div>;

    return (
        <div style={{ background: '#e2e8f0', minHeight: '100vh', padding: '20px', fontFamily: 'Inter, sans-serif' }}>
            <div className="print-hide" style={{ maxWidth: '210mm', margin: '0 auto 20px', display: 'flex', justifyContent: 'space-between' }}>
                <button
                    onClick={handleBack}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                >
                    <ArrowLeft size={16} /> Back
                </button>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={handleDownload}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                    >
                        <Download size={18} /> Download PDF
                    </button>
                    <button
                        onClick={() => window.print()}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                    >
                        <Printer size={18} /> Print Document
                    </button>
                </div>
            </div>

            <div id="print-paper-content">
                <WorkflowDocumentLayout 
                    doc={doc} 
                    settings={settings}
                    logoBase64={logoBase64}
                    signatureBase64={signatureBase64}
                    paynowBase64={paynowBase64}
                />
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    body, html { margin: 0; padding: 0; width: 100%; height: 100%; background: #fff !important; }
                    .print-hide { display: none !important; }
                    .print-paper { 
                        box-shadow: none !important; 
                        margin: 0 !important; 
                        padding: 0 !important;
                        width: 100% !important; 
                        max-width: 100% !important;
                        min-height: auto !important;
                        border: none !important;
                        border-radius: 0 !important;
                        background: transparent !important;
                        box-sizing: border-box !important;
                    }
                    @page { margin: 10mm; size: A4 portrait; }
                }
                `
            }} />
        </div>
    );
}
