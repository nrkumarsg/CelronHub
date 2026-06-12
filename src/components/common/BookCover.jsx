import React from 'react';
import { FileText } from 'lucide-react';

export default function BookCover({ title, group, company, size = 'large' }) {
    // Curated high-fidelity publication-style gradients
    const gradients = [
        { from: '#4f46e5', to: '#06b6d4', text: '#ffffff' }, // Indigo to Cyan
        { from: '#ec4899', to: '#8b5cf6', text: '#ffffff' }, // Pink to Violet
        { from: '#f59e0b', to: '#e11d48', text: '#ffffff' }, // Amber to Rose
        { from: '#10b981', to: '#06b6d4', text: '#ffffff' }, // Emerald to Cyan
        { from: '#3b82f6', to: '#1d4ed8', text: '#ffffff' }, // Blue to Dark Blue
        { from: '#8b5cf6', to: '#d946ef', text: '#ffffff' }, // Violet to Fuchsia
        { from: '#14b8a6', to: '#0f766e', text: '#ffffff' }, // Teal to Dark Teal
        { from: '#f43f5e', to: '#fb7185', text: '#ffffff' }, // Rose to Light Rose
    ];

    const getGradient = (str = '') => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % gradients.length;
        return gradients[index];
    };

    const hashString = group || title || 'Manual';
    const grad = getGradient(hashString);

    if (size === 'small') {
        return (
            <div style={{
                width: '48px',
                height: '48px',
                background: `linear-gradient(135deg, ${grad.from} 0%, ${grad.to} 100%)`,
                borderRadius: '6px',
                display: 'flex',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                flexShrink: 0
            }}>
                {/* Book Spine */}
                <div style={{
                    width: '4px',
                    background: 'rgba(0,0,0,0.2)',
                    height: '100%',
                    borderRight: '1px solid rgba(255,255,255,0.1)'
                }} />
                {/* Mini content icon */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: grad.text
                }}>
                    <FileText size={16} />
                </div>
            </div>
        );
    }

    return (
        <div style={{
            width: '100%',
            height: '160px',
            background: `linear-gradient(135deg, ${grad.from} 0%, ${grad.to} 100%)`,
            borderRadius: '12px',
            display: 'flex',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 8px 16px -4px rgba(0,0,0,0.15), inset 0 0 40px rgba(0,0,0,0.1)'
        }}>
            {/* Book Spine */}
            <div style={{
                width: '14px',
                background: 'linear-gradient(90deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.05) 50%, rgba(255,255,255,0.15) 100%)',
                height: '100%',
                borderRight: '1px solid rgba(0,0,0,0.15)',
                boxShadow: '1px 0 3px rgba(0,0,0,0.1)'
            }} />
            
            {/* Book Content */}
            <div style={{
                flex: 1,
                padding: '16px 14px 14px 14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                color: grad.text,
                zIndex: 1,
                textAlign: 'left'
            }}>
                {/* Top: Author / Brand */}
                <div style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    opacity: 0.85,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}>
                    {company || 'TECHNICAL LIBRARY'}
                </div>

                {/* Middle: Title */}
                <div style={{
                    fontSize: '0.95rem',
                    fontWeight: 800,
                    lineHeight: '1.25',
                    margin: '8px 0',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textShadow: '0 1px 3px rgba(0,0,0,0.3)'
                }}>
                    {title}
                </div>

                {/* Bottom: Group / Category Tag */}
                {group && (
                    <div style={{
                        alignSelf: 'flex-start',
                        fontSize: '0.6rem',
                        padding: '3px 8px',
                        background: 'rgba(255,255,255,0.2)',
                        borderRadius: '4px',
                        backdropFilter: 'blur(4px)',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        {group}
                    </div>
                )}
            </div>

            {/* Subtle Overlay Gloss Effect */}
            <div style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: '14px',
                background: 'linear-gradient(115deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 40%, rgba(0,0,0,0.05) 45%, rgba(0,0,0,0.15) 100%)',
                pointerEvents: 'none'
            }} />
        </div>
    );
}
