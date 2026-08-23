import React, { useState, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { X, Printer, Package, Truck, Check, AlertCircle, ShieldAlert, Sparkles } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';

export default function DeliveryOrderLabelModal({ 
    isOpen, 
    onClose, 
    doc, 
    settings 
}) {
    if (!isOpen || !doc) return null;

    const [labelSize, setLabelSize] = useState('4x6'); // '4x6', 'a6', 'half-a4', 'a4'
    const [packageNo, setPackageNo] = useState(1);
    const [totalPackages, setTotalPackages] = useState(1);
    const [packageWeight, setPackageWeight] = useState('');
    const [packageDimensions, setPackageDimensions] = useState('');
    const [isSparesInTransit, setIsSparesInTransit] = useState(true);
    const [isFragile, setIsFragile] = useState(false);
    const [isUrgent, setIsUrgent] = useState(true);
    const [customNote, setCustomNote] = useState('');

    const labelPrintRef = useRef(null);

    const handlePrint = useReactToPrint({
        contentRef: labelPrintRef,
        documentTitle: `DO_LABEL_${doc.document_no || 'DELIVERY'}_PKG_${packageNo}_OF_${totalPackages}`
    });

    const companyLogo = settings?.logo_url || 'https://celron.net/wp-content/uploads/2023/12/celronlogowithtranslogorotating.gif';
    const companyName = (settings?.company_name || 'CEL-RON ENTERPRISES PTE LTD').replace('CELRON', 'CEL-RON');
    const companyAddress = settings?.address || '10, Jln, Besar, "Sim Lim Tower", #03-05, Singapore 208787';
    const companyUen = settings?.gst_uen || '201436227C';
    const companyPhone = settings?.phone || '+65 8196 2270';
    const companyEmail = settings?.sales_email || 'sales@celron.net';

    const cleanVesselName = doc.vessels?.vessel_name?.trim() || doc.vessels?.name?.trim();
    const hasVessel = !!cleanVesselName && 
        !['', 'N/A', 'N.A', 'N.A.', 'N/A.', 'NONE', 'NIL', '[VESSEL]', 'NOT APPLICABLE'].includes(cleanVesselName.toUpperCase());
    const vesselName = hasVessel ? cleanVesselName : '';
    const locationName = doc.work_locations?.location_name || doc.work_locations?.name;
    const hasLocation = !!locationName && locationName !== 'N/A';

    let vesselDisplay = "N/A";
    if (hasVessel && hasLocation) vesselDisplay = `${vesselName} (${locationName})`;
    else if (hasLocation) vesselDisplay = locationName;
    else if (hasVessel) vesselDisplay = vesselName;

    const deliveryAddress = doc.delivery_verification?.delivery_address || (hasLocation ? locationName : (doc.partners?.address || ''));
    const deliveryPic = doc.delivery_verification?.delivery_pic || `${doc.contacts?.name || ''} ${doc.contacts?.handphone ? `(${doc.contacts.handphone})` : ''} ${doc.contacts?.email ? `| ${doc.contacts.email}` : ''}`.trim();

    // Size dimensions mapping
    const sizeConfig = {
        '4x6': {
            name: '4" × 6" Thermal Sticker',
            widthMm: '100mm',
            minHeightMm: '150mm',
            containerWidth: '400px',
            scale: 1,
            qrSize: 52,
            barcodeWidth: 1.3,
            barcodeHeight: 32,
            pageStyle: '@page { size: 100mm 150mm; margin: 0; }'
        },
        'a6': {
            name: 'A6 Pocket Label',
            widthMm: '105mm',
            minHeightMm: '148mm',
            containerWidth: '420px',
            scale: 1,
            qrSize: 50,
            barcodeWidth: 1.3,
            barcodeHeight: 30,
            pageStyle: '@page { size: 105mm 148mm; margin: 0; }'
        },
        'half-a4': {
            name: 'Half A4 (A5 Landscape/Box)',
            widthMm: '210mm',
            minHeightMm: '148mm',
            containerWidth: '650px',
            scale: 1,
            qrSize: 64,
            barcodeWidth: 1.6,
            barcodeHeight: 38,
            pageStyle: '@page { size: 210mm 148mm; margin: 0; }'
        },
        'a4': {
            name: 'Full A4 Placard (Pallet / Crate)',
            widthMm: '210mm',
            minHeightMm: '297mm',
            containerWidth: '700px',
            scale: 1,
            qrSize: 85,
            barcodeWidth: 2.0,
            barcodeHeight: 50,
            pageStyle: '@page { size: A4 portrait; margin: 0; }'
        }
    };

    const currentConfig = sizeConfig[labelSize] || sizeConfig['4x6'];

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                width: '95%',
                maxWidth: '1100px',
                maxHeight: '94vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                border: '1px solid #cbd5e1',
                overflow: 'hidden'
            }}>
                {/* Modal Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 24px',
                    borderBottom: '1px solid #e2e8f0',
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                    color: '#ffffff'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            background: '#3b82f6',
                            color: '#fff',
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Truck size={20} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                DO Delivery Shipping Label
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, background: '#10b981', color: '#fff', padding: '2px 8px', borderRadius: '12px' }}>
                                    {doc.document_no}
                                </span>
                            </h2>
                            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                                Generate crisp, high-visibility box/crate stickers with dispatch instructions
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: 'none',
                            color: '#cbd5e1',
                            borderRadius: '8px',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                        onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Modal Body: Left Controls, Right Preview */}
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: '#f8fafc' }}>
                    {/* Controls Sidebar */}
                    <div style={{
                        width: '340px',
                        borderRight: '1px solid #e2e8f0',
                        background: '#ffffff',
                        padding: '20px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px'
                    }}>
                        {/* Size Selector */}
                        <div>
                            <label style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.04em', display: 'block', marginBottom: '8px' }}>
                                Label / Paper Size
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                {[
                                    { id: '4x6', label: '4" × 6" Sticker', desc: 'Thermal roll / Box' },
                                    { id: 'a6', label: 'A6 Pocket', desc: '105 × 148 mm' },
                                    { id: 'half-a4', label: 'Half-A4 (A5)', desc: 'Medium crate' },
                                    { id: 'a4', label: 'Full A4', desc: 'Large pallet placard' },
                                ].map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => setLabelSize(s.id)}
                                        style={{
                                            padding: '8px 10px',
                                            borderRadius: '8px',
                                            border: `2px solid ${labelSize === s.id ? '#3b82f6' : '#e2e8f0'}`,
                                            background: labelSize === s.id ? '#eff6ff' : '#ffffff',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: labelSize === s.id ? '#1d4ed8' : '#1e293b' }}>
                                            {s.label}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                            {s.desc}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Package Counter */}
                        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                            <label style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: '#475569', display: 'block', marginBottom: '8px' }}>
                                Package Counter
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Package #</span>
                                    <input 
                                        type="number" 
                                        min="1"
                                        value={packageNo}
                                        onChange={e => setPackageNo(Math.max(1, parseInt(e.target.value) || 1))}
                                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: 700 }}
                                    />
                                </div>
                                <span style={{ alignSelf: 'flex-end', paddingBottom: '8px', fontWeight: 800, color: '#94a3b8' }}>OF</span>
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Total Pkgs</span>
                                    <input 
                                        type="number" 
                                        min="1"
                                        value={totalPackages}
                                        onChange={e => setTotalPackages(Math.max(1, parseInt(e.target.value) || 1))}
                                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: 700 }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Weight & Dimensions */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Gross Wt (kg)</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. 15.5 kg"
                                    value={packageWeight}
                                    onChange={e => setPackageWeight(e.target.value)}
                                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Dimensions (mm)</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. 400x300x200"
                                    value={packageDimensions}
                                    onChange={e => setPackageDimensions(e.target.value)}
                                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                />
                            </div>
                        </div>

                        {/* Handling Badges */}
                        <div>
                            <label style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: '#475569', display: 'block', marginBottom: '8px' }}>
                                Highlight Badges
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={isSparesInTransit}
                                        onChange={e => setIsSparesInTransit(e.target.checked)}
                                    />
                                    <span style={{ fontWeight: 600, color: '#0f172a' }}>SHIP SPARES IN TRANSIT</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={isUrgent}
                                        onChange={e => setIsUrgent(e.target.checked)}
                                    />
                                    <span style={{ fontWeight: 600, color: '#dc2626' }}>URGENT DELIVERY TO VESSEL</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={isFragile}
                                        onChange={e => setIsFragile(e.target.checked)}
                                    />
                                    <span style={{ fontWeight: 600, color: '#ea580c' }}>FRAGILE / HANDLE WITH CARE</span>
                                </label>
                            </div>
                        </div>

                        {/* Custom Instruction */}
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Additional Dispatch Note</label>
                            <textarea 
                                rows={2}
                                placeholder="e.g. Deliver directly to Gate 2, Captain Choo"
                                value={customNote}
                                onChange={e => setCustomNote(e.target.value)}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', resize: 'vertical' }}
                            />
                        </div>

                        {/* Print Button */}
                        <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
                            <button
                                onClick={handlePrint}
                                style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    color: '#ffffff',
                                    fontSize: '0.95rem',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
                                    transition: 'all 0.15s'
                                }}
                                onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                                onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                <Printer size={18} /> Print {currentConfig.name}
                            </button>
                        </div>
                    </div>

                    {/* Live Preview Area */}
                    <div style={{
                        flex: 1,
                        padding: '24px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        background: '#e2e8f0'
                    }}>
                        <div style={{ marginBottom: '12px', fontSize: '0.78rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Live Label Preview ({currentConfig.name})
                        </div>

                        {/* PRINTABLE COMPONENT REF */}
                        <div 
                            ref={labelPrintRef}
                            className="do-shipping-label-root"
                            style={{
                                width: currentConfig.widthMm,
                                minHeight: currentConfig.minHeightMm,
                                background: '#ffffff',
                                color: '#000000',
                                border: '2px solid #000000',
                                borderRadius: '4px',
                                padding: labelSize === 'a4' ? '20mm' : labelSize === 'half-a4' ? '12mm' : '8mm',
                                boxSizing: 'border-box',
                                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                                display: 'flex',
                                flexDirection: 'column',
                                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                                position: 'relative'
                            }}
                        >
                            {/* 1. Header: Shipper Info */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000000', paddingBottom: '6px', marginBottom: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <img src={companyLogo} alt="Logo" style={{ maxHeight: labelSize === 'a4' ? '60px' : '40px', maxWidth: '140px', objectFit: 'contain' }} />
                                    <div>
                                        <div style={{ fontSize: labelSize === 'a4' ? '16pt' : '11pt', fontWeight: 900, color: '#000000', letterSpacing: '-0.02em', lineHeight: '1.1' }}>
                                            {companyName}
                                        </div>
                                        <div style={{ fontSize: labelSize === 'a4' ? '9pt' : '7pt', fontWeight: 700, color: '#333' }}>
                                            UEN: {companyUen} | Tel: {companyPhone}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ 
                                        display: 'inline-block', 
                                        background: '#000000', 
                                        color: '#ffffff', 
                                        fontSize: labelSize === 'a4' ? '14pt' : '9.5pt', 
                                        fontWeight: 900, 
                                        padding: '3px 8px', 
                                        borderRadius: '3px',
                                        letterSpacing: '0.05em' 
                                    }}>
                                        DELIVERY LABEL
                                    </span>
                                </div>
                            </div>

                            {/* 2. DO Number & Barcode Block (High Contrast) */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000000', paddingBottom: '6px', marginBottom: '8px', gap: '10px' }}>
                                <div>
                                    <div style={{ fontSize: labelSize === 'a4' ? '10pt' : '7.5pt', fontWeight: 800, color: '#444', textTransform: 'uppercase' }}>DELIVERY ORDER NO:</div>
                                    <div style={{ fontSize: labelSize === 'a4' ? '22pt' : '16pt', fontWeight: 900, color: '#000000', letterSpacing: '0.02em' }}>
                                        {doc.document_no || 'DO-XXXX-XXXX'}
                                    </div>
                                    <div style={{ fontSize: labelSize === 'a4' ? '10pt' : '8pt', fontWeight: 700, color: '#222', marginTop: '2px' }}>
                                        JOB NO: <span style={{ color: '#000000', fontWeight: 900 }}>{doc.assigned_job_no || doc.document_no}</span> &nbsp;|&nbsp; DATE: {new Date(doc.issue_date || new Date()).toLocaleDateString('en-GB')}
                                    </div>
                                    {doc.customer_ref && (
                                        <div style={{ fontSize: labelSize === 'a4' ? '9pt' : '7.5pt', fontWeight: 700, color: '#444' }}>
                                            REF / PO: {doc.customer_ref}
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                                    <div style={{ background: '#fff', padding: '2px', border: '1px solid #000' }}>
                                        <QRCodeSVG 
                                            value={`CELRON-DO:${doc.document_no || ''}|JOB:${doc.assigned_job_no || ''}|VESSEL:${cleanVesselName || ''}`} 
                                            size={currentConfig.qrSize} 
                                            level="M" 
                                        />
                                    </div>
                                    <div style={{ fontSize: '6.5pt', fontWeight: 800, marginTop: '2px' }}>
                                        PKG {packageNo} / {totalPackages}
                                    </div>
                                </div>
                            </div>

                            {/* 3. Handling Badges */}
                            {(isSparesInTransit || isUrgent || isFragile) && (
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                    {isSparesInTransit && (
                                        <span style={{ background: '#000000', color: '#ffffff', fontSize: labelSize === 'a4' ? '10pt' : '7.5pt', fontWeight: 900, padding: '2px 6px', borderRadius: '2px', textTransform: 'uppercase' }}>
                                            ⚓ SHIP SPARES IN TRANSIT
                                        </span>
                                    )}
                                    {isUrgent && (
                                        <span style={{ border: '2px solid #000000', color: '#000000', fontSize: labelSize === 'a4' ? '10pt' : '7.5pt', fontWeight: 900, padding: '1px 5px', borderRadius: '2px', textTransform: 'uppercase' }}>
                                            ⚡ URGENT DELIVERY
                                        </span>
                                    )}
                                    {isFragile && (
                                        <span style={{ border: '2px solid #000000', color: '#000000', fontSize: labelSize === 'a4' ? '10pt' : '7.5pt', fontWeight: 900, padding: '1px 5px', borderRadius: '2px', textTransform: 'uppercase' }}>
                                            ⚠️ FRAGILE / HANDLE WITH CARE
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* 4. Consignee / Deliver To */}
                            <div style={{ border: '2px solid #000000', borderRadius: '4px', padding: '6px 8px', marginBottom: '8px', background: '#f8fafc' }}>
                                <div style={{ fontSize: labelSize === 'a4' ? '10pt' : '7pt', fontWeight: 900, textTransform: 'uppercase', color: '#333', borderBottom: '1px solid #ccc', paddingBottom: '2px', marginBottom: '4px' }}>
                                    DELIVER TO / CONSIGNEE:
                                </div>
                                <div style={{ fontSize: labelSize === 'a4' ? '13pt' : '9.5pt', fontWeight: 900, color: '#000000' }}>
                                    {hasVessel ? `MASTER AND OWNER OF ${vesselName.toUpperCase()}` : (doc.partners?.name || 'Customer')}
                                </div>
                                {hasVessel && doc.partners?.name && (
                                    <div style={{ fontSize: labelSize === 'a4' ? '10pt' : '8pt', fontWeight: 700, color: '#222' }}>
                                        C/O {doc.partners.name}
                                    </div>
                                )}
                                {vesselDisplay !== 'N/A' && (
                                    <div style={{ fontSize: labelSize === 'a4' ? '11pt' : '8.5pt', fontWeight: 800, color: '#000', marginTop: '2px' }}>
                                        VESSEL / LOCATION: <span style={{ textDecoration: 'underline' }}>{vesselDisplay}</span>
                                    </div>
                                )}
                                {(doc.contacts?.name || doc.contacts?.handphone) && (
                                    <div style={{ fontSize: labelSize === 'a4' ? '9pt' : '7.5pt', fontWeight: 600, color: '#333', marginTop: '2px' }}>
                                        ATTN: {doc.contacts?.name} {doc.contacts?.handphone ? `(Tel: ${doc.contacts.handphone})` : ''}
                                    </div>
                                )}
                            </div>

                            {/* 5. Destination & Delivery Instructions (Crucial Box) */}
                            <div style={{ border: '2px solid #000000', borderRadius: '4px', padding: '6px 8px', marginBottom: '8px', background: '#fff' }}>
                                <div style={{ fontSize: labelSize === 'a4' ? '10pt' : '7.5pt', fontWeight: 900, textTransform: 'uppercase', color: '#000000', borderBottom: '1px solid #000', paddingBottom: '2px', marginBottom: '4px' }}>
                                    📍 DELIVERY ADDRESS & DISPATCH INSTRUCTIONS:
                                </div>
                                <div style={{ fontSize: labelSize === 'a4' ? '12pt' : '9pt', fontWeight: 800, color: '#000000', whiteSpace: 'pre-wrap', lineHeight: '1.3' }}>
                                    {deliveryAddress || 'To be advised upon dispatch'}
                                </div>
                                {deliveryPic && (
                                    <div style={{ fontSize: labelSize === 'a4' ? '10pt' : '8pt', fontWeight: 700, color: '#000000', marginTop: '4px', borderTop: '1px dashed #999', paddingTop: '3px' }}>
                                        PIC / CONTACT: {deliveryPic}
                                    </div>
                                )}
                                {customNote && (
                                    <div style={{ fontSize: labelSize === 'a4' ? '10pt' : '8pt', fontWeight: 700, color: '#000000', marginTop: '4px', fontStyle: 'italic' }}>
                                        NOTE: {customNote}
                                    </div>
                                )}
                            </div>

                            {/* 6. Package Specs & Line Items Summary */}
                            <div style={{ border: '1px solid #000000', borderRadius: '4px', padding: '6px 8px', marginBottom: '8px', fontSize: labelSize === 'a4' ? '9pt' : '7pt', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '4px', fontWeight: 800 }}>
                                    <span>PACKAGE: <strong>{packageNo} OF {totalPackages}</strong></span>
                                    {packageWeight && <span>WEIGHT: <strong>{packageWeight}</strong></span>}
                                    {packageDimensions && <span>DIM: <strong>{packageDimensions}</strong></span>}
                                    <span>ORIGIN: <strong>SINGAPORE</strong></span>
                                </div>

                                <div style={{ fontWeight: 800, marginBottom: '2px', textTransform: 'uppercase', color: '#444' }}>CONTENTS SUMMARY:</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: labelSize === '4x6' ? '80px' : '150px', overflow: 'hidden' }}>
                                    {(doc.items || []).filter(i => !i.is_section && !i.is_note).slice(0, 4).map((item, idx) => (
                                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: labelSize === 'a4' ? '8.5pt' : '6.8pt', fontWeight: 600 }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                                                {idx + 1}. {item.description}
                                            </span>
                                            <span style={{ fontWeight: 800 }}>{item.quantity} {item.uom || 'PC(S)'}</span>
                                        </div>
                                    ))}
                                    {(doc.items || []).filter(i => !i.is_section && !i.is_note).length > 4 && (
                                        <div style={{ fontSize: '6.5pt', fontStyle: 'italic', color: '#666' }}>
                                            + {(doc.items || []).filter(i => !i.is_section && !i.is_note).length - 4} more items (Refer to DO document)
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 7. Footer Barcode & Shipper Seal */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '2px solid #000000', paddingTop: '4px', marginTop: 'auto' }}>
                                <div>
                                    <Barcode 
                                        value={doc.document_no || 'DO-CELRON'} 
                                        width={currentConfig.barcodeWidth} 
                                        height={currentConfig.barcodeHeight} 
                                        fontSize={labelSize === 'a4' ? 10 : 8}
                                        margin={0}
                                        displayValue={true}
                                    />
                                </div>
                                <div style={{ textAlign: 'right', fontSize: labelSize === 'a4' ? '8pt' : '6pt', fontWeight: 700 }}>
                                    CEL-RON ENTERPRISES PTE LTD<br/>
                                    WWW.CELRON.NET
                                </div>
                            </div>
                        </div>

                        {/* Print Styles for flawless thermal/laser printing */}
                        <style dangerouslySetInnerHTML={{
                            __html: `
                            @media print {
                                ${currentConfig.pageStyle}
                                body, html {
                                    margin: 0 !important;
                                    padding: 0 !important;
                                    background: #fff !important;
                                    -webkit-print-color-adjust: exact !important;
                                    print-color-adjust: exact !important;
                                }
                                .do-shipping-label-root {
                                    box-shadow: none !important;
                                    border: 2px solid #000000 !important;
                                    margin: 0 auto !important;
                                    page-break-inside: avoid !important;
                                }
                            }
                            `
                        }} />
                    </div>
                </div>
            </div>
        </div>
    );
}
