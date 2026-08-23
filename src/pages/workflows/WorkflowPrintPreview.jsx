import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getWorkflowDocumentById } from '../../lib/workflowV2Service';
import { getDocumentSettings } from '../../lib/store';
import { useAuth } from '../../contexts/AuthContext';
import { Printer, ArrowLeft, Download, Pencil, Truck } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import WorkflowDocumentLayout from '../../components/workflow/WorkflowDocumentLayout';
import DeliveryOrderLabelModal from '../../components/workflow/DeliveryOrderLabelModal';

export default function WorkflowPrintPreview() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { profile } = useAuth();
    const [doc, setDoc] = useState(null);
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [logoBase64, setLogoBase64] = useState('');
    const [signatureBase64, setSignatureBase64] = useState('');
    const [paynowBase64, setPaynowBase64] = useState('');
    const [showSignature, setShowSignature] = useState(true);
    const [showLabelModal, setShowLabelModal] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const sigParam = params.get('showSignature');
        if (sigParam === 'false') setShowSignature(false);
    }, []);

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

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const autoDownload = searchParams.get('autoDownload');
        
        // Wait until document, settings and essential images are loaded
        const logoReady = !settings?.logo_url || logoBase64;
        const sigReady = !settings?.signature_url || signatureBase64;
        const paynowReady = !settings?.paynow_url || paynowBase64;

        if (autoDownload === 'true' && doc && settings && !loading && logoReady && sigReady && paynowReady) {
            const timer = setTimeout(() => {
                handleDownload();
                // Close the tab after download starts to keep user experience clean
                setTimeout(() => {
                    window.close();
                }, 2000);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [doc, settings, loading, logoBase64, signatureBase64, paynowBase64]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [docRes, settingsRes] = await Promise.all([
                getWorkflowDocumentById(id),
                getDocumentSettings(profile?.company_id)
            ]);

            if (docRes.data) {
                setDoc(docRes.data);
            }
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
        if (!element) {
            alert("Error: Content not found");
            return;
        }
        
        // Build descriptive filename: Type_No - Customer
        const customerName = (doc.partners?.name || 'Customer').substring(0, 30);
        const docNo = doc.document_no || 'Draft';
        const type = doc.document_type || 'Document';
        
        // Sanitize filename to remove invalid characters and ensure .pdf extension
        const safeFilename = `${type}_${docNo}_${customerName}`.replace(/[/\\?%*:|"<>]/g, '-').trim();
        const finalFilename = `${safeFilename}.pdf`;

        const opt = {
            margin: [0, 0, 0, 0],
            filename: finalFilename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, allowTaint: false, scrollX: 0, scrollY: 0, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        
        // Add page numbers and save
        html2pdf().from(element).set(opt).toPdf().get('pdf').then((pdf) => {
            const totalPages = pdf.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                pdf.setPage(i);
                pdf.setFontSize(8);
                pdf.setTextColor(150);
                pdf.text(
                    `Page ${i} of ${totalPages}`, 
                    pdf.internal.pageSize.getWidth() - 25, 
                    pdf.internal.pageSize.getHeight() - 10
                );
            }
            return pdf.output('blob');
        }).then((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = finalFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        });
    };

    if (loading) return <div className="text-center py-20">Loading Document Preview...</div>;
    if (!doc) return <div className="text-center py-20 text-red-500">Document not found</div>;

    return (
        <div style={{ background: '#e2e8f0', minHeight: '100vh', padding: '20px', fontFamily: 'Inter, sans-serif' }}>
            {/* Screen Actions (Hidden in Print) */}
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
                        onClick={() => {
                            const element = document.getElementById('print-paper-content');
                            const customerName = doc.partners?.name || 'Customer';
                            const projectOrVessel = doc.vessels?.name || doc.subject || 'Project';
                            const effectiveType = (doc.document_type === 'Quotation' && (doc.document_no || '').startsWith('ORA')) ? 'Order Acknowledgment' : (doc.document_type || 'Document');
                            const rawFilename = `${effectiveType}_${doc.document_no || 'Draft'} - ${customerName} - ${projectOrVessel}`;
                            const safeFilename = rawFilename.replace(/[/\\?%*:|"<>]/g, '-').trim();

                            const opt = {
                                margin: 0,
                                filename: `${safeFilename}.pdf`,
                                image: { type: 'jpeg', quality: 0.98 },
                                html2canvas: { scale: 2, useCORS: true, allowTaint: false, scrollX: 0, scrollY: 0, logging: false },
                                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                            };
                            
                            html2pdf().set(opt).from(element).toPdf().get('pdf').then((pdf) => {
                                const totalPages = pdf.internal.getNumberOfPages();
                                for (let i = 1; i <= totalPages; i++) {
                                    pdf.setPage(i);
                                    pdf.setFontSize(8);
                                    pdf.setTextColor(150);
                                    pdf.text(`Page ${i} of ${totalPages}`, pdf.internal.pageSize.getWidth() - 25, pdf.internal.pageSize.getHeight() - 10);
                                }
                            }).output('blob').then(blob => {
                                const pdfFile = new File([blob], `${safeFilename}.pdf`, { type: 'application/pdf' });
                                navigate('/tools/converter', { state: { pdfFile } });
                            });
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                    >
                        <Pencil size={18} /> Sign & Annotate
                    </button>
                    {(doc?.document_type === 'Delivery Order' || doc?.document_type === 'Packing List' || doc?.is_job) && (
                        <button
                            onClick={() => setShowLabelModal(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                            title="Print DO Shipping Sticker / Label (4x6, A6, Half-A4, A4)"
                        >
                            <Truck size={18} /> Print DO Label
                        </button>
                    )}
                    <button
                        onClick={() => window.print()}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                    >
                        <Printer size={18} /> Print Document
                    </button>
                </div>
            </div>

            {/* A4 Paper Container using Unified Layout */}
            <div id="print-paper-content">
                <WorkflowDocumentLayout 
                    doc={doc} 
                    settings={settings}
                    logoBase64={logoBase64}
                    signatureBase64={signatureBase64}
                    paynowBase64={paynowBase64}
                    showSignature={showSignature}
                />
                <div className="page-footer"></div>
            </div>

            {/* DO Shipping Label Modal */}
            {showLabelModal && doc && (
                <DeliveryOrderLabelModal 
                    isOpen={showLabelModal}
                    onClose={() => setShowLabelModal(false)}
                    doc={doc}
                    settings={settings}
                />
            )}

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
                    .page-footer {
                        display: none;
                    }
                    @media print {
                        .page-footer {
                            display: block;
                            position: fixed;
                            bottom: 10mm;
                            right: 10mm;
                            font-size: 8pt;
                            color: #94a3b8;
                        }
                        .page-footer::after {
                            content: "Page " counter(page);
                        }
                    }
                }
                `
            }} />
        </div>
    );
}

