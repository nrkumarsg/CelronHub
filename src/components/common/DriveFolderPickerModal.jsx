import React, { useState, useEffect } from 'react';
import { Folder, ChevronRight, ArrowLeft, Search, Loader2, X, CheckCircle2, HardDrive } from 'lucide-react';

export default function DriveFolderPickerModal({
  isOpen,
  onClose,
  onSelectFolder,
  title = 'Select Google Drive Folder',
  initialFolderId = null,
  accessToken = null
}) {
  const [loading, setLoading] = useState(false);
  const [path, setPath] = useState([]); // [{ id, name }]
  const [folders, setFolders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);

  const token = accessToken || localStorage.getItem('google_access_token');

  useEffect(() => {
    if (isOpen && token) {
      const rootId = initialFolderId || 'root';
      setPath([{ id: rootId, name: initialFolderId ? 'Selected Root' : 'My Drive' }]);
      fetchSubfolders(rootId);
    }
  }, [isOpen, initialFolderId, token]);

  const fetchSubfolders = async (folderId) => {
    if (!token) {
      setError('Google Drive token missing. Please connect Google account.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const query = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)&pageSize=100`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error(`Drive API returned status ${res.status}`);
      }

      const data = await res.json();
      setFolders(data.files || []);
    } catch (err) {
      console.error('Failed to load subfolders:', err);
      setError(err.message || 'Failed to list Drive folders');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateTo = (folder) => {
    setPath(prev => [...prev, { id: folder.id, name: folder.name }]);
    setSearchQuery('');
    fetchSubfolders(folder.id);
  };

  const handleGoBack = () => {
    if (path.length <= 1) return;
    const newPath = path.slice(0, -1);
    const parent = newPath[newPath.length - 1];
    setPath(newPath);
    setSearchQuery('');
    fetchSubfolders(parent.id);
  };

  const currentFolder = path[path.length - 1] || { id: 'root', name: 'My Drive' };
  const filteredFolders = folders.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '24px'
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '640px', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '8px', borderRadius: '10px', display: 'flex' }}>
              <HardDrive size={20} />
            </span>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>{title}</h3>
              <p style={{ margin: '2px 0 0 0', color: '#64748b', fontSize: '0.8rem' }}>Browse your Google Drive folder hierarchy</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Breadcrumb & Navigation Bar */}
        <div style={{ background: '#f8fafc', padding: '12px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', fontSize: '0.85rem' }}>
            {path.length > 1 && (
              <button
                onClick={handleGoBack}
                style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <ArrowLeft size={14} /> Back
              </button>
            )}
            {path.map((item, idx) => (
              <React.Fragment key={item.id}>
                {idx > 0 && <ChevronRight size={14} color="#94a3b8" />}
                <span style={{ fontWeight: idx === path.length - 1 ? 700 : 500, color: idx === path.length - 1 ? '#7c3aed' : '#64748b' }}>
                  {item.name}
                </span>
              </React.Fragment>
            ))}
          </div>

          <div style={{ position: 'relative', width: '180px' }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '6px 8px 6px 30px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', outline: 'none' }}
            />
          </div>
        </div>

        {/* Folder List Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', minHeight: '260px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748b' }}>
              <Loader2 size={32} className="animate-spin text-purple-600" style={{ margin: '0 auto 8px auto' }} />
              <span>Fetching Drive directories...</span>
            </div>
          ) : error ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#ef4444', background: '#fef2f2', borderRadius: '12px' }}>
              {error}
            </div>
          ) : filteredFolders.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8' }}>
              <Folder size={40} style={{ margin: '0 auto 8px auto', display: 'block', opacity: 0.5 }} />
              <span>No subfolders found inside "{currentFolder.name}"</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
              {filteredFolders.map((folder) => (
                <div
                  key={folder.id}
                  onClick={() => handleNavigateTo(folder)}
                  style={{
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.borderColor = '#7c3aed';
                    e.currentTarget.style.background = '#faf5ff';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.background = '#fff';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <Folder size={20} color="#7c3aed" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {folder.name}
                    </span>
                  </div>
                  <ChevronRight size={16} color="#94a3b8" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Current Target: <strong style={{ color: '#1e293b' }}>{currentFolder.name}</strong>
          </span>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onClose}
              style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onSelectFolder({ id: currentFolder.id, name: currentFolder.name });
                onClose();
              }}
              style={{
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '8px', fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <CheckCircle2 size={16} /> Select Current Folder
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
