import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, X, Plus } from 'lucide-react';

/**
 * A premium searchable select component for internal datasets.
 */
const SearchableSelect = ({ 
    options = [], 
    value, 
    onChange, 
    placeholder = "Select an option...", 
    className = "",
    name = "searchable_select",
    renderOption = null,
    onAddNew = null,
    addNewText = "Add New"
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const selectedOption = options.find(opt => opt.id === value);
    const filteredOptions = options.filter(opt => {
        const searchStr = (opt.name || opt.label || opt.vessel_name || opt.location_name || '').toLowerCase();
        return searchStr.includes(searchTerm.toLowerCase());
    });

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (option) => {
        onChange({ target: { name, value: option.id } });
        setIsOpen(false);
        setSearchTerm('');
    };

    return (
        <div className={`searchable-select-container ${className}`} ref={dropdownRef} style={{ position: 'relative', width: '100%', zIndex: isOpen ? 1000 : 'auto' }}>
            <div 
                className="form-select" 
                onClick={() => setIsOpen(!isOpen)}
                style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    background: '#fff',
                    minHeight: '42px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    transition: 'all 0.2s ease',
                    boxShadow: isOpen ? '0 0 0 2px rgba(99, 102, 241, 0.1)' : 'none',
                    borderColor: isOpen ? '#6366f1' : '#e2e8f0'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    {selectedOption ? (
                        <span style={{ color: '#1e293b', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {selectedOption.name || selectedOption.label || selectedOption.vessel_name || selectedOption.location_name}
                        </span>
                    ) : (
                        <span style={{ color: '#94a3b8' }}>{placeholder}</span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {value && (
                        <button 
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange({ target: { name, value: '' } });
                            }}
                            style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', color: '#94a3b8' }}
                        >
                            <X size={14} />
                        </button>
                    )}
                    <ChevronDown size={16} color={isOpen ? '#6366f1' : '#94a3b8'} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>
            </div>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    zIndex: 9999,
                    maxHeight: '300px',
                    overflowY: 'auto',
                    padding: '8px',
                    boxShadow: '0 12px 32px -4px rgba(15, 23, 42, 0.18), 0 4px 12px -2px rgba(15, 23, 42, 0.08)',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    animation: 'select-slide-down 0.2s ease-out'
                }}>
                    <div style={{ position: 'sticky', top: 0, background: '#ffffff', backgroundColor: '#ffffff', zIndex: 10, marginBottom: '8px', paddingTop: '2px', paddingBottom: '2px' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input 
                            type="text" 
                            className="form-input" 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Type to search..."
                            autoFocus
                            style={{ 
                                paddingLeft: '32px', 
                                fontSize: '0.85rem', 
                                width: '100%', 
                                border: '1px solid #f1f5f9', 
                                borderRadius: '6px',
                                background: '#f8fafc'
                            }}
                        />
                    </div>
                    
                    <div className="options-list">
                        {onAddNew && (
                            <div 
                                onClick={() => {
                                    onAddNew(searchTerm);
                                    setIsOpen(false);
                                    setSearchTerm('');
                                }}
                                style={{
                                    padding: '10px 12px',
                                    cursor: 'pointer',
                                    borderRadius: '8px',
                                    background: 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    transition: 'all 0.15s ease',
                                    marginBottom: '6px',
                                    borderBottom: '1px dashed #e2e8f0',
                                    color: '#6366f1',
                                    fontWeight: 700,
                                    fontSize: '0.9rem'
                                }}
                                className="option-item add-new-option"
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(99, 102, 241, 0.05)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                }}
                            >
                                <Plus size={16} style={{ marginRight: '8px' }} />
                                {addNewText}
                            </div>
                        )}
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map(opt => (
                                <div 
                                    key={opt.id} 
                                    onClick={() => handleSelect(opt)}
                                    style={{
                                        padding: '10px 12px',
                                        cursor: 'pointer',
                                        borderRadius: '8px',
                                        background: value === opt.id ? '#f1f5f9' : 'transparent',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        transition: 'all 0.15s ease',
                                        marginBottom: '2px'
                                    }}
                                    className="option-item"
                                    onMouseEnter={(e) => {
                                        if (value !== opt.id) e.currentTarget.style.background = '#f8fafc';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (value !== opt.id) e.currentTarget.style.background = 'transparent';
                                    }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ 
                                            fontSize: '0.9rem', 
                                            fontWeight: value === opt.id ? 700 : 500,
                                            color: value === opt.id ? '#6366f1' : '#1e293b'
                                        }}>
                                            {opt.name || opt.label || opt.vessel_name || opt.location_name}
                                        </span>
                                        {opt.category && (
                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{opt.category}</span>
                                        )}
                                    </div>
                                    {value === opt.id && <Check size={16} color="#6366f1" />}
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: '20px 8px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                <div style={{ marginBottom: '12px' }}>No matches found for "{searchTerm}"</div>
                                {onAddNew && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onAddNew();
                                            setIsOpen(false);
                                            setSearchTerm('');
                                        }}
                                        style={{
                                            background: '#6366f1',
                                            color: '#fff',
                                            border: 'none',
                                            padding: '8px 16px',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontWeight: 600,
                                            fontSize: '0.85rem',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            boxShadow: '0 2px 4px rgba(99, 102, 241, 0.2)'
                                        }}
                                    >
                                        <Plus size={14} />
                                        {addNewText}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes select-slide-down {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .options-list::-webkit-scrollbar {
                    width: 6px;
                }
                .options-list::-webkit-scrollbar-track {
                    background: transparent;
                }
                .options-list::-webkit-scrollbar-thumb {
                    background: #e2e8f0;
                    border-radius: 10px;
                }
            `}} />
        </div>
    );
};

export default SearchableSelect;
