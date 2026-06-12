import React, { useState, useEffect } from 'react';
import { Search, Globe, Plus, ExternalLink, Bookmark, Shield, User, Filter, LayoutGrid, List, Eye, EyeOff, Edit, Trash2 } from 'lucide-react';
import { getUserTools, createUserTool, updateUserTool, deleteUserTool } from '../lib/toolService';
import { useNavigate } from 'react-router-dom';

export default function Tools() {
    const [tools, setTools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedGroup, setSelectedGroup] = useState('All');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
    const [visibleNotes, setVisibleNotes] = useState({}); // { id: boolean }
    const navigate = useNavigate();

    // CRUD state
    const [showToolModal, setShowToolModal] = useState(false);
    const [editingTool, setEditingTool] = useState(null);
    const [toolForm, setToolForm] = useState({
        name: '',
        url: '',
        logo_url: '',
        group_name: '',
        notes: '',
        is_pinned: false
    });

    const toggleNoteVisibility = (id) => {
        setVisibleNotes(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const fetchTools = async () => {
        setLoading(true);
        const { data } = await getUserTools();
        if (data) setTools(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchTools();
    }, []);

    const openToolModal = (tool = null) => {
        if (tool) {
            setEditingTool(tool);
            setToolForm({
                name: tool.name,
                url: tool.url,
                logo_url: tool.logo_url || '',
                group_name: tool.group_name || '',
                notes: tool.notes || '',
                is_pinned: tool.is_pinned || false
            });
        } else {
            setEditingTool(null);
            setToolForm({
                name: '',
                url: '',
                logo_url: '',
                group_name: '',
                notes: '',
                is_pinned: false
            });
        }
        setShowToolModal(true);
    };

    const handleToolSubmit = async (e) => {
        e.preventDefault();
        try {
            let result;
            if (editingTool) {
                result = await updateUserTool(editingTool.id, toolForm);
            } else {
                result = await createUserTool(toolForm);
            }
            if (result.error) throw result.error;
            setShowToolModal(false);
            fetchTools();
        } catch (error) {
            console.error(error);
            alert('Failed to save tool: ' + (error.message || error));
        }
    };

    const handleDeleteTool = async (id) => {
        if (window.confirm('Are you sure you want to delete this tool?')) {
            const { error } = await deleteUserTool(id);
            if (error) alert('Failed to delete tool: ' + error.message);
            else fetchTools();
        }
    };

    const groups = ['All', ...new Set(tools.map(t => t.group_name || 'General'))];

    const filteredTools = tools.filter(tool => {
        const matchesSearch = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (tool.group_name && tool.group_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (tool.notes && tool.notes.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesGroup = selectedGroup === 'All' || (tool.group_name || 'General') === selectedGroup;
        return matchesSearch && matchesGroup;
    });

    return (
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100%', borderRadius: '16px' }}>
            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        Weblinks & Resources
                    </h1>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>Quick access to your frequently visited maritime and business portals.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => openToolModal()}
                        className="btn btn-primary"
                        style={{ background: '#ec4899', borderColor: '#db2777' }}
                    >
                        <Plus size={18} /> Add New Tool
                    </button>
                </div>
            </header>

            {/* Controls Bar */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
                    <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={18} />
                    <input
                        type="text"
                        placeholder="Search tools, links or credentials..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ width: '100%', padding: '12px 12px 12px 42px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', fontSize: '0.95rem' }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', padding: '10px 16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <Filter size={16} color="#64748b" />
                    <select
                        value={selectedGroup}
                        onChange={(e) => setSelectedGroup(e.target.value)}
                        style={{ border: 'none', outline: 'none', background: 'transparent', color: '#64748b', fontWeight: 500, fontSize: '0.9rem' }}
                    >
                        {groups.map(group => <option key={group} value={group}>{group}</option>)}
                    </select>
                </div>

                <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
                    <button
                        onClick={() => setViewMode('grid')}
                        style={{ padding: '8px', borderRadius: '8px', border: 'none', background: viewMode === 'grid' ? '#fff' : 'transparent', color: viewMode === 'grid' ? '#6366f1' : '#94a3b8', cursor: 'pointer', boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}
                    >
                        <LayoutGrid size={18} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        style={{ padding: '8px', borderRadius: '8px', border: 'none', background: viewMode === 'list' ? '#fff' : 'transparent', color: viewMode === 'list' ? '#6366f1' : '#94a3b8', cursor: 'pointer', boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}
                    >
                        <List size={18} />
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Loading tools...</div>
            ) : filteredTools.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px', background: '#fff', borderRadius: '24px', border: '2px dashed #e2e8f0' }}>
                    <Globe size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
                    <h3 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>No tools found</h3>
                    <p style={{ margin: 0, color: '#64748b' }}>Try adjusting your search or add a new portal.</p>
                </div>
            ) : viewMode === 'grid' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
                    {filteredTools.map(tool => (
                        <div key={tool.id} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', border: tool.is_pinned ? '2px solid #ec4899' : '1px solid #e2e8f0' }}>
                            {tool.is_pinned && (
                                <div style={{ position: 'absolute', top: '-12px', left: '20px', background: '#ec4899', color: '#fff', padding: '4px 12px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Pinned
                                </div>
                            )}

                            <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px', zIndex: 10 }}>
                                <button
                                    onClick={() => openToolModal(tool)}
                                    style={{ background: '#fff', color: '#6366f1', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                                    title="Edit Tool"
                                >
                                    <Edit size={14} />
                                </button>
                                <button
                                    onClick={() => handleDeleteTool(tool.id)}
                                    style={{ background: '#fff', color: '#ef4444', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                                    title="Delete Tool"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginRight: '60px' }}>
                                <div style={{ width: '48px', height: '48px', background: '#f1f5f9', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                    {tool.logo_url ? <img src={tool.logo_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Globe size={24} color="#94a3b8" />}
                                </div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>{tool.name}</h4>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>{tool.group_name || 'General'}</span>
                                </div>
                            </div>

                            {tool.notes && (
                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', fontSize: '0.8rem', color: '#475569', whiteSpace: 'pre-wrap', fontFamily: 'monospace', border: '1px solid #f1f5f9', position: 'relative' }}>
                                    {visibleNotes[tool.id] ? tool.notes : tool.notes.split('\n').map((line, i) => i === 0 ? line : '•'.repeat(line.length)).join('\n')}
                                    <button
                                        onClick={() => toggleNoteVisibility(tool.id)}
                                        style={{ position: 'absolute', right: '8px', top: '8px', border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}
                                    >
                                        {visibleNotes[tool.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                            )}

                            <a
                                href={tool.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                    marginTop: 'auto',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    padding: '12px',
                                    background: '#6366f1',
                                    color: '#fff',
                                    borderRadius: '10px',
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.9rem',
                                    transition: 'transform 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                Open Portal <ExternalLink size={14} />
                            </a>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="glass-panel" style={{ padding: '0' }}>
                    <div className="table-container" style={{ maxHeight: 'none' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Portal</th>
                                    <th>Group</th>
                                    <th>Link</th>
                                    <th>Credentials / Notes</th>
                                    <th style={{ textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTools.map(tool => (
                                    <tr key={tool.id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ width: '32px', height: '32px', background: '#f8fafc', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {tool.logo_url ? <img src={tool.logo_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Globe size={16} color="#94a3b8" />}
                                                </div>
                                                <span style={{ fontWeight: 600 }}>{tool.name}</span>
                                                {tool.is_pinned && <Bookmark size={14} fill="#ec4899" color="#ec4899" />}
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{tool.group_name || 'General'}</span>
                                        </td>
                                        <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            <a href={tool.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem', color: '#6366f1' }}>{tool.url}</a>
                                        </td>
                                        <td style={{ position: 'relative' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <code style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                    {tool.notes ? (visibleNotes[tool.id] ? tool.notes : tool.notes.split('\n').map((line, i) => i === 0 ? line : '••••••••').join('\n')) : '-'}
                                                </code>
                                                {tool.notes && (
                                                    <button
                                                        onClick={() => toggleNoteVisibility(tool.id)}
                                                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
                                                    >
                                                        {visibleNotes[tool.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                <button
                                                    onClick={() => openToolModal(tool)}
                                                    style={{ border: 'none', background: 'none', color: '#6366f1', cursor: 'pointer', padding: '4px' }}
                                                    title="Edit Tool"
                                                >
                                                    <Edit size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteTool(tool.id)}
                                                    style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                    title="Delete Tool"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                                <a href={tool.url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <ExternalLink size={14} /> Open Tool
                                                </a>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Tool Modal */}
            {showToolModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', backdropFilter: 'blur(2px)' }}>
                    <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                        <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#1e293b' }}>{editingTool ? 'Edit Tool' : 'Add New Tool'}</h3>
                            <button onClick={() => setShowToolModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                        </div>
                        <form onSubmit={handleToolSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>Website Name *</label>
                                <input required type="text" value={toolForm.name} onChange={e => setToolForm({ ...toolForm, name: e.target.value })} placeholder="e.g. Google" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>Website URL *</label>
                                <input required type="url" value={toolForm.url} onChange={e => setToolForm({ ...toolForm, url: e.target.value })} placeholder="https://..." style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>Logo URL (Optional)</label>
                                    <input type="text" value={toolForm.logo_url} onChange={e => setToolForm({ ...toolForm, logo_url: e.target.value })} placeholder="Icon URL" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>Group / Category</label>
                                    <input type="text" value={toolForm.group_name} onChange={e => setToolForm({ ...toolForm, group_name: e.target.value })} placeholder="e.g. Search" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>Notes (Username, Password, etc.)</label>
                                <textarea rows="3" value={toolForm.notes} onChange={e => setToolForm({ ...toolForm, notes: e.target.value })} placeholder="Username: admin&#10;Password: ****" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontFamily: 'monospace', outline: 'none', fontSize: '0.9rem' }} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="checkbox" id="pinned" checked={toolForm.is_pinned} onChange={e => setToolForm({ ...toolForm, is_pinned: e.target.checked })} />
                                <label htmlFor="pinned" style={{ fontSize: '0.85rem', fontWeight: 500, color: '#334155' }}>Pin to favorites</label>
                            </div>
                            <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
                                <button type="button" onClick={() => setShowToolModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>{editingTool ? 'Update Tool' : 'Add Tool'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
