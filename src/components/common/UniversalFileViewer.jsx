import React, { useState } from 'react';
import { 
    FileText, ExternalLink, Download, Trash2, Eye, X, Check, 
    FileSpreadsheet, Image as ImageIcon, FileCode, Presentation, 
    Maximize2, File, Sparkles
} from 'lucide-react';

/**
 * UniversalFileViewer Component
 * A universal file & document preview box supporting Images, PDFs, Word, Excel, PowerPoint, Text, and generic files.
 */
export default function UniversalFileViewer({
    file = null,              // File name string or File object
    fileUrl = '',             // URL string (http, blob, data URL, Google Drive link)
    title = 'Loaded File / Scan Preview',
    emptyTitle = 'No File Loaded Yet',
    emptySubtitle = 'Upload a paper scan on the left to preview loaded files here.',
    onRemove = null,          // Optional remove callback function
    badgeText = null,         // Custom badge text e.g. "✓ File Attached"
    minHeight = '220px',
    maxHeight = '420px',
    readOnly = false
}) {
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);

    // Extract file name text
    const fileName = typeof file === 'string' 
        ? file 
        : file?.name || (fileUrl ? fileUrl.split('/').pop().split('?')[0] : '');

    // Determine Category
    const getFileTypeCategory = (name = '', url = '') => {
        const combined = (name + ' ' + url).toLowerCase();
        
        if (/\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i.test(combined) || url.startsWith('blob:') || url.startsWith('data:image/')) {
            return 'IMAGE';
        }
        if (/\.pdf($|\?)/i.test(combined) || url.includes('drive.google.com') || url.includes('application/pdf')) {
            return 'PDF';
        }
        if (/\.(doc|docx)($|\?)/i.test(combined) || combined.includes('word')) {
            return 'WORD';
        }
        if (/\.(xls|xlsx|csv)($|\?)/i.test(combined) || combined.includes('excel') || combined.includes('spreadsheet')) {
            return 'EXCEL';
        }
        if (/\.(ppt|pptx)($|\?)/i.test(combined) || combined.includes('powerpoint') || combined.includes('presentation')) {
            return 'POWERPOINT';
        }
        if (/\.(txt|json|md|log|xml|html)($|\?)/i.test(combined)) {
            return 'TEXT';
        }
        return 'OTHER';
    };

    const category = getFileTypeCategory(fileName, fileUrl);
    const hasFile = Boolean(fileName || fileUrl);

    // Render file icon based on category
    const renderCategoryIcon = (cat, size = 20) => {
        switch (cat) {
            case 'IMAGE': return <ImageIcon size={size} color="#ec4899" />;
            case 'PDF': return <FileText size={size} color="#ef4444" />;
            case 'WORD': return <FileText size={size} color="#2563eb" />;
            case 'EXCEL': return <FileSpreadsheet size={size} color="#166534" />;
            case 'POWERPOINT': return <Presentation size={size} color="#ea580c" />;
            case 'TEXT': return <FileCode size={size} color="#8b5cf6" />;
            default: return <File size={size} color="#6366f1" />;
        }
    };

    // Render category badge tag
    const renderCategoryBadge = (cat) => {
        const badges = {
            IMAGE: { label: 'IMAGE', bg: '#fce7f3', color: '#9d174d' },
            PDF: { label: 'PDF DOCUMENT', bg: '#fee2e2', color: '#991b1b' },
            WORD: { label: 'WORD DOCUMENT', bg: '#dbeafe', color: '#1e40af' },
            EXCEL: { label: 'EXCEL SPREADSHEET', bg: '#dcfce7', color: '#166534' },
            POWERPOINT: { label: 'PRESENTATION', bg: '#ffedd5', color: '#9a3412' },
            TEXT: { label: 'TEXT / CODE', bg: '#f3e8ff', color: '#6b21a8' },
            OTHER: { label: 'FILE ATTACHMENT', bg: '#e0e7ff', color: '#3730a3' }
        };
        const b = badges[cat] || badges.OTHER;
        return (
            <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: b.bg, color: b.color, textTransform: 'uppercase' }}>
                {b.label}
            </span>
        );
    };

    // Format Drive Embed URL
    const getEmbedUrl = (url) => {
        if (!url) return '';
        if (url.includes('drive.google.com')) {
            return url.replace(/\/view(\?.*)?$/, '/preview');
        }
        if (url.startsWith('http') && (category === 'WORD' || category === 'EXCEL' || category === 'POWERPOINT')) {
            return `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
        }
        return url;
    };

    return (
        <div style={{
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '18px',
            background: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: hasFile ? 'flex-start' : 'center',
            alignItems: hasFile ? 'stretch' : 'center',
            minHeight: minHeight,
            maxHeight: maxHeight,
            boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
            overflow: 'hidden',
            position: 'relative'
        }}>
            {/* Header Area */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 800, color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {renderCategoryIcon(hasFile ? category : 'OTHER', 16)} {title}
                </h4>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {hasFile && (badgeText || (
                        <span style={{ fontSize: '0.7rem', background: '#dcfce7', color: '#15803d', padding: '3px 9px', borderRadius: '12px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Check size={12} /> {badgeText || 'File Attached'}
                        </span>
                    ))}

                    {hasFile && fileUrl && (
                        <a
                            href={fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Open file in new browser window"
                        >
                            <ExternalLink size={12} /> Open ↗
                        </a>
                    )}
                </div>
            </div>

            {/* Content Body */}
            {hasFile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflow: 'hidden' }}>
                    {/* File Meta Info Bar */}
                    <div style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', flex: 1 }}>
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '8px', borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {renderCategoryIcon(category, 20)}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {fileName || 'Attached Document'}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                                    {renderCategoryBadge(category)}
                                    {file?.size && (
                                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                                            {(file.size / (1024 * 1024)).toFixed(2)} MB
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            {category === 'IMAGE' && fileUrl && (
                                <button
                                    type="button"
                                    onClick={() => setIsLightboxOpen(true)}
                                    style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe', borderRadius: '6px', padding: '5px 8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    title="View full image popup"
                                >
                                    <Maximize2 size={13} /> Zoom
                                </button>
                            )}

                            {!readOnly && onRemove && (
                                <button
                                    type="button"
                                    onClick={onRemove}
                                    style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', padding: '5px 8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    title="Remove file attachment"
                                >
                                    <Trash2 size={13} /> Remove
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Interactive Viewer Render Area */}
                    <div style={{
                        flex: 1,
                        border: '1px solid #cbd5e1',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        background: '#0f172a',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        minHeight: '160px'
                    }}>
                        {/* 1. IMAGE VIEWER */}
                        {category === 'IMAGE' && fileUrl && (
                            <div 
                                onClick={() => setIsLightboxOpen(true)}
                                style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'zoom-in', padding: '8px' }}
                                title="Click to open full resolution image"
                            >
                                <img
                                    src={fileUrl}
                                    alt={fileName || 'Loaded Scan'}
                                    style={{ maxWidth: '100%', maxHeight: '280px', objectFit: 'contain', borderRadius: '8px' }}
                                />
                            </div>
                        )}

                        {/* 2. PDF VIEWER */}
                        {category === 'PDF' && fileUrl && (
                            <iframe
                                src={getEmbedUrl(fileUrl)}
                                title={fileName || 'PDF Document Preview'}
                                style={{ width: '100%', height: '100%', border: 'none', minHeight: '220px' }}
                            />
                        )}

                        {/* 3. WORD / EXCEL / POWERPOINT ONLINE VIEWER */}
                        {(category === 'WORD' || category === 'EXCEL' || category === 'POWERPOINT') && fileUrl && fileUrl.startsWith('http') && (
                            <iframe
                                src={getEmbedUrl(fileUrl)}
                                title={fileName || 'Office Document Preview'}
                                style={{ width: '100%', height: '100%', border: 'none', minHeight: '220px', background: '#fff' }}
                            />
                        )}

                        {/* Fallback Summary Card if iframe cannot load or file is local non-image */}
                        {((category !== 'IMAGE' && category !== 'PDF' && !fileUrl.startsWith('http')) || !fileUrl) && (
                            <div style={{ background: '#1e293b', color: '#f8fafc', width: '100%', height: '100%', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '10px' }}>
                                {renderCategoryIcon(category, 42)}
                                <div style={{ fontSize: '0.9rem', fontWeight: 800 }}>{fileName}</div>
                                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                                    Loaded document ready for processing &amp; drive archiving
                                </span>
                                {fileUrl && (
                                    <a
                                        href={fileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ background: '#3b82f6', color: '#fff', borderRadius: '8px', padding: '8px 16px', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}
                                    >
                                        <ExternalLink size={14} /> Open Full Document ↗
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* EMPTY STATE (Matching user's Image 1 exactly) */
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '30px 20px',
                    textAlign: 'center',
                    color: '#64748b'
                }}>
                    <div style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '50%',
                        background: '#f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '12px',
                        color: '#94a3b8'
                    }}>
                        <FileText size={26} />
                    </div>
                    <h5 style={{ margin: '0 0 4px 0', fontSize: '0.92rem', fontWeight: 800, color: '#334155' }}>
                        {emptyTitle}
                    </h5>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8', maxWidth: '280px', lineHeight: '1.4' }}>
                        {emptySubtitle}
                    </p>
                </div>
            )}

            {/* Fullscreen Image Lightbox Modal */}
            {isLightboxOpen && fileUrl && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.92)', backdropFilter: 'blur(6px)',
                    zIndex: 99999, display: 'flex', flexDirection: 'column', padding: '20px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', marginBottom: '12px' }}>
                        <div style={{ fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {renderCategoryIcon(category, 20)} {fileName}
                        </div>
                        <button
                            onClick={() => setIsLightboxOpen(false)}
                            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <X size={20} />
                        </button>
                    </div>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'auto' }}>
                        <img
                            src={fileUrl}
                            alt={fileName}
                            style={{ maxWidth: '95vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
