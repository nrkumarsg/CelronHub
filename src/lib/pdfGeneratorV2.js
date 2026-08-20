import React from 'react';
import { createRoot } from 'react-dom/client';
import html2pdf from 'html2pdf.js';
import { getStoredToken } from './googleAuthService';
import WorkflowDocumentLayout from '../components/workflow/WorkflowDocumentLayout';

// Helper to convert image URL to base64 for reliable rendering
const getBase64Image = async (url) => {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    
    // Handle Google Drive links
    if (url.includes('drive.google.com')) {
        try {
            const fileIdMatch = url.match(/d\/([a-zA-Z0-9_-]+)/);
            if (fileIdMatch && fileIdMatch[1]) {
                const token = getStoredToken();
                const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileIdMatch[1]}?alt=media`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });
                const blob = await response.blob();
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            }
        } catch (err) {
            console.error('Failed to fetch GDrive image for PDF:', err);
            return '';
        }
    }

    try {
        const response = await fetch(url, { mode: 'cors' });
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error('Failed to convert image to base64:', e);
        return url; // Fallback to original URL
    }
};

/**
 * Generates a standardized PDF matching Item 3 / WorkflowDocumentLayout exactly.
 * Supports download, blob (for Google Drive and Email attachment), or URL.
 */
export const generateSleekPDF = async (documentData, settings, action = 'download') => {
    const companyLogo = settings?.logo_url || 'https://celron.net/wp-content/uploads/2023/12/celronlogowithtranslogorotating.gif';
    const companySignature = settings?.signature_url || '/nrkumarsign.png';
    const companyPaynow = settings?.paynow_url;

    // Convert assets to base64
    const [logoB64, signatureB64, paynowB64] = await Promise.all([
        getBase64Image(companyLogo),
        getBase64Image(companySignature),
        getBase64Image(companyPaynow)
    ]);

    // Offscreen mount point
    const parent = document.createElement('div');
    parent.id = 'pdf-render-parent-wrapper';
    Object.assign(parent.style, {
        position: 'fixed',
        left: '-9999px',
        top: '0',
        width: '210mm',
        minHeight: '297mm',
        overflow: 'visible',
        zIndex: '-9999',
        background: '#ffffff'
    });

    const container = document.createElement('div');
    container.id = 'pdf-render-content';
    container.style.width = '210mm';
    container.style.backgroundColor = '#ffffff';
    parent.appendChild(container);
    document.body.appendChild(parent);

    const root = createRoot(container);
    
    // Render the exact same WorkflowDocumentLayout component used by Print Preview
    root.render(
        React.createElement(
            'div',
            { style: { background: '#ffffff', colorScheme: 'light', WebkitPrintColorAdjust: 'exact', width: '210mm' } },
            React.createElement(WorkflowDocumentLayout, {
                doc: documentData,
                settings: settings,
                logoBase64: logoB64,
                signatureBase64: signatureB64,
                paynowBase64: paynowB64,
                showSignature: true
            })
        )
    );

    // Build descriptive filename: Type_No - Customer
    const customerName = (documentData.partners?.name || 'Customer').substring(0, 30);
    const docNo = documentData.document_no || 'Draft';
    const type = documentData.document_type || 'Document';
    const safeFilename = `${type}_${docNo}_${customerName}`.replace(/[/\\?%*:|"<>]/g, '-').trim() + '.pdf';

    const opt = {
        margin: [0, 0, 0, 0],
        filename: safeFilename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            scrollX: 0,
            scrollY: 0,
            logging: false,
            backgroundColor: '#ffffff'
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        if (document.fonts) await document.fonts.ready;

        const waitForImages = () => {
            const imgs = container.getElementsByTagName('img');
            return Promise.all(Array.from(imgs).map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                    img.onload = resolve;
                    img.onerror = resolve;
                });
            }));
        };
        await waitForImages();

        // Stabilization wait for layout styles to settle
        await new Promise(r => setTimeout(r, 600));

        // Generate PDF and add standard footer page numbers (Page X of Y)
        const pdfBlob = await html2pdf()
            .from(container)
            .set(opt)
            .toPdf()
            .get('pdf')
            .then((pdf) => {
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
            });

        if (pdfBlob.size < 1000) {
            throw new Error("Generated PDF is too small, likely empty.");
        }

        // Cleanup DOM
        root.unmount();
        if (document.body.contains(parent)) {
            document.body.removeChild(parent);
        }

        if (action === 'download') {
            const url = URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = safeFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            return;
        } else if (action === 'blob') {
            return pdfBlob;
        } else {
            return URL.createObjectURL(pdfBlob);
        }

    } catch (err) {
        console.error("CRITICAL PDF ERROR in generateSleekPDF:", err);
        try {
            root.unmount();
        } catch (e) {}
        if (document.body.contains(parent)) {
            document.body.removeChild(parent);
        }
        throw err;
    }
};
