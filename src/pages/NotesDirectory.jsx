import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, StickyNote, Calendar, Clock, Pin, MoreVertical, Trash2, Edit, ChevronRight, ArrowUpDown, ChevronDown } from 'lucide-react';
import { getNotes, deleteNote, updateNote } from '../lib/notesService';

export default function NotesDirectory() {
    const navigate = useNavigate();
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortKey, setSortKey] = useState('updated_at');
    const [sortDirection, setSortDirection] = useState('desc'); // 'asc' | 'desc'

    const fetchNotes = async () => {
        setLoading(true);
        const { data } = await getNotes();
        if (data) setNotes(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchNotes();
    }, []);


    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (window.confirm('Delete this note?')) {
            const { error } = await deleteNote(id);
            if (!error) fetchNotes();
        }
    };

    const togglePin = async (e, note) => {
        e.stopPropagation();
        const { error } = await updateNote(note.id, { is_pinned: !note.is_pinned });
        if (!error) fetchNotes();
    };

    const filteredNotes = notes.filter(note =>
        note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (note.content && note.content.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const sortedNotes = [...filteredNotes].sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;

        let valA, valB;
        if (sortKey === 'updated_at') {
            valA = a.updated_at ? new Date(a.updated_at) : 0;
            valB = b.updated_at ? new Date(b.updated_at) : 0;
            return sortDirection === 'desc' ? valB - valA : valA - valB;
        } else if (sortKey === 'title') {
            valA = a.title || '';
            valB = b.title || '';
            return sortDirection === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
        }
        return 0;
    });

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const stripHtml = (html) => {
        const tmp = document.createElement('DIV');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || "";
    };

    return (
        <div style={{ background: '#f8fafc', minHeight: '100%', padding: '32px', color: '#334155', borderRadius: '16px' }}>
            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}>
                        <StickyNote size={24} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>My Notes</h1>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>Organize your thoughts and documentation</p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ display: 'flex', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '0 12px', alignItems: 'center', width: '300px' }}>
                        <Search size={18} color="#94a3b8" />
                        <input
                            type="text"
                            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '10px', fontSize: '0.9rem' }}
                            placeholder="Search notes..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div style={{ display: 'flex', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '0 12px', alignItems: 'center', position: 'relative' }}>
                        <ArrowUpDown size={18} color="#94a3b8" style={{ marginRight: '8px' }} />
                        <select
                            style={{ appearance: 'none', border: 'none', outline: 'none', background: 'transparent', padding: '10px 24px 10px 0', fontSize: '0.9rem', color: '#475569', fontWeight: 500, cursor: 'pointer', minWidth: '150px' }}
                            value={`${sortKey}-${sortDirection}`}
                            onChange={(e) => {
                                const [key, dir] = e.target.value.split('-');
                                setSortKey(key);
                                setSortDirection(dir);
                            }}
                        >
                            <option value="updated_at-desc">Modified (Newest)</option>
                            <option value="updated_at-asc">Modified (Oldest)</option>
                            <option value="title-desc">Title (Z-A)</option>
                            <option value="title-asc">Title (A-Z)</option>
                        </select>
                        <ChevronDown size={14} color="#94a3b8" style={{ position: 'absolute', right: '12px', pointerEvents: 'none' }} />
                    </div>
                    <button
                        onClick={() => navigate('/notes/new')}
                        style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.2)' }}
                    >
                        <Plus size={18} /> <span>Create Note</span>
                    </button>
                </div>
            </header>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
                    <div className="loading-spinner"></div>
                </div>
            ) : sortedNotes.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '100px 20px' }}>
                    <StickyNote size={48} color="var(--text-secondary)" style={{ opacity: 0.2, marginBottom: '16px' }} />
                    <h3 style={{ color: 'var(--text-secondary)' }}>No notes found</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Create your first note to get started.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                    {sortedNotes.map(note => (
                        <div
                            key={note.id}
                            onClick={() => navigate(`/notes/${note.id}`)}
                            className="glass-panel"
                            style={{
                                cursor: 'pointer',
                                position: 'relative',
                                transition: 'transform 0.2s, box-shadow 0.2s',
                                border: note.is_pinned ? '1px solid #6366f1' : '1px solid var(--border-color)',
                                background: note.is_pinned ? 'rgba(99, 102, 241, 0.02)' : 'var(--bg-card)'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.transform = 'translateY(-4px)';
                                e.currentTarget.style.boxShadow = '0 12px 20px -5px rgba(0,0,0,0.1)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            {note.is_pinned && (
                                <div style={{ position: 'absolute', top: '12px', right: '12px', color: '#6366f1' }}>
                                    <Pin size={16} fill="#6366f1" />
                                </div>
                            )}
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px', paddingRight: note.is_pinned ? '24px' : '0' }}>{note.title}</h3>
                            <p style={{
                                color: 'var(--text-secondary)',
                                fontSize: '0.9rem',
                                lineHeight: '1.5',
                                display: '-webkit-box',
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                marginBottom: '20px',
                                minHeight: '4.5em'
                            }}>
                                {stripHtml(note.content || 'No content')}
                            </p>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: 'auto' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                    <Clock size={14} />
                                    <span>{formatDate(note.updated_at)}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        className="action-btn"
                                        onClick={(e) => togglePin(e, note)}
                                        title={note.is_pinned ? 'Unpin' : 'Pin'}
                                    >
                                        <Pin size={14} fill={note.is_pinned ? "currentColor" : "none"} />
                                    </button>
                                    <button
                                        className="action-btn delete"
                                        onClick={(e) => handleDelete(e, note.id)}
                                        title="Delete"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
