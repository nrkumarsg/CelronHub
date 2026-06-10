import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';

const LabelPreview = React.forwardRef(({ items, labelType = 'qr' }, ref) => {
    return (
        <div ref={ref} className="print-labels-container" style={{
            padding: '10mm 5mm',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)', // Force 3 columns for standard A4/Letter label sheets
            gap: '2mm',
            background: '#fff',
            width: '100%',
            boxSizing: 'border-box'
        }}>
            {items.map((item, index) => (
                <div key={item.id || index} className="label-sticker" style={{
                    width: '100%', // Flexible width within the grid column
                    height: '25.4mm', // Still 1 inch height
                    border: '1px solid #ddd', // Slightly darker for better visibility on sheet
                    padding: '1.2mm 2mm 1.5mm 2mm', // Optimized padding to avoid clipping
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between', // Space between header and QR/supplier row
                    alignItems: 'center',
                    textAlign: 'center',
                    fontSize: '8pt',
                    overflow: 'hidden',
                    position: 'relative',
                    pageBreakInside: 'avoid',
                    boxSizing: 'border-box',
                    backgroundColor: '#fff'
                }}>
                    <div style={{ 
                        fontWeight: '700', 
                        marginBottom: '0.8mm', 
                        fontSize: '8.5pt', 
                        width: '100%', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        color: '#1e293b',
                        letterSpacing: '0.2px'
                    }}>
                        {item.name}
                    </div>

                    {labelType === 'qr' ? (
                        <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: '3mm', flex: 1 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: '42px' }}>
                                <div style={{ background: '#fff', padding: '0.3mm', border: '1px solid #e2e8f0', borderRadius: '3px' }}>
                                    <QRCodeSVG
                                        value={item.barcode || item.id}
                                        size={38}
                                        level="M"
                                        includeMargin={false}
                                    />
                                </div>
                                <div style={{ fontSize: '6.5pt', fontWeight: '800', marginTop: '0.5mm', color: '#000', letterSpacing: '0.2px' }}>
                                    {item.barcode || 'N/A'}
                                </div>
                            </div>
                            <div style={{ textAlign: 'left', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <div style={{ fontSize: '4.8pt', fontWeight: 'bold', color: '#000', textTransform: 'uppercase', letterSpacing: '0.1px', marginBottom: '0.2mm' }}>
                                    SUPPLIED BY:
                                </div>
                                <div style={{ fontSize: '5.2pt', fontWeight: '800', color: '#000', marginBottom: '0.4mm', lineHeight: '1.1' }}>
                                    CEL-RON ENTERPRISES PTE LTD
                                </div>
                                <div style={{ fontSize: '4.8pt', color: '#000', fontWeight: '600', lineHeight: '1.2' }}>
                                    PHONE : 81962270
                                </div>
                                <div style={{ fontSize: '4.8pt', color: '#000', fontWeight: '600', lineHeight: '1.2' }}>
                                    EMAIL: sales@celron.net
                                </div>
                                <div style={{ fontSize: '4.8pt', color: '#000', fontWeight: '600', lineHeight: '1.2' }}>
                                    WEB: www.celron.shop
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ transform: 'scale(0.8)', transformOrigin: 'center center' }}>
                                <Barcode
                                    value={item.barcode || item.id}
                                    width={1.2}
                                    height={35}
                                    fontSize={10}
                                    background="transparent"
                                    margin={0}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0 4mm', marginTop: '-2mm' }}>
                                <span style={{ color: '#666', fontSize: '6.5pt' }}>{item.type}</span>
                                <span style={{ fontSize: '6.5pt', color: '#999' }}>CEL-RON HUB</span>
                            </div>
                        </div>
                    )}

                    <style>
                        {`
                        @media print {
                            .print-labels-container {
                                padding: 5mm !important;
                                display: grid !important;
                                grid-template-columns: repeat(3, 1fr) !important;
                                gap: 2mm !important;
                                width: 210mm !important; /* Standard A4 Width */
                                height: auto !important;
                            }
                            .label-sticker {
                                border: 0.1mm solid #ccc !important;
                            }
                            body { margin: 0; padding: 0; background: white; }
                        }
                        `}
                    </style>
                </div>
            ))}
        </div>
    );
});

export default LabelPreview;
