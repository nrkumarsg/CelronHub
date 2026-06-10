import React, { useState, useEffect } from 'react';
import { ShieldCheck, UserCheck, Shield, Disc, Check, X, Search, Building2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getAllProfiles, updateProfile } from '../lib/userService';

import { ALL_MODULES } from '../lib/constants';

const UserManagement = () => {
    const { profile: currentUserProfile, activeCompany } = useAuth();
    
    // For Company Admins, only allow allotting modules that are enabled for their company
    const availableModules = currentUserProfile?.role === 'superadmin' 
        ? ALL_MODULES 
        : ALL_MODULES.filter(m => activeCompany?.enabled_modules?.includes(m.id));

    const [users, setUsers] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [saveStatus, setSaveStatus] = useState({ id: null, status: '' });
    const [viewMode, setViewMode] = useState('users'); // 'users' or 'companies'
    const [showCompanyModal, setShowCompanyModal] = useState(null); // stores user object
    const [userCompanyRoles, setUserCompanyRoles] = useState([]);
    const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false); // for Create/Edit Company
    const [editingCompany, setEditingCompany] = useState(null);
    const [companyForm, setCompanyForm] = useState({ name: '', slug: '', logo_url: '' });

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        setLoading(true);
        await Promise.all([fetchUsers(), fetchCompanies()]);
        setLoading(false);
    };

    const fetchCompanies = async () => {
        if (currentUserProfile?.role === 'superadmin') {
            const { getAllCompanies } = await import('../lib/companyService');
            const { data } = await getAllCompanies();
            if (data) setCompanies(data);
        }
    };

    const fetchUsers = async () => {
        const { getAllProfiles } = await import('../lib/userService');
        const { data, error } = await getAllProfiles();
        if (data) {
            let filteredUserList = data;
            if (currentUserProfile?.role === 'admin') {
                filteredUserList = data.filter(u =>
                    u.company_id === currentUserProfile.company_id &&
                    u.role !== 'superadmin'
                );
            }
            setUsers(filteredUserList);
        }
    };

    const handleUpdate = async (userId, field, value) => {
        setSaveStatus({ id: userId, status: 'saving' });

        const updates = { [field]: value };
        const { error } = await updateProfile(userId, updates);

        if (error) {
            console.error(error);
            setSaveStatus({ id: userId, status: 'error' });
            alert("Failed to update user.");
        } else {
            setUsers(users.map(u => u.id === userId ? { ...u, ...updates } : u));
            setSaveStatus({ id: userId, status: 'success' });
            setTimeout(() => setSaveStatus({ id: null, status: '' }), 2000);
        }
    };

    const handleModuleToggle = async (userId, moduleId, currentModules) => {
        const modules = currentModules || [];
        const isActive = modules.includes(moduleId);

        const newModules = isActive
            ? modules.filter(m => m !== moduleId)
            : [...modules, moduleId];

        await handleUpdate(userId, 'accessible_modules', newModules);
    };

    const handleFetchUserCompanies = async (userId) => {
        const { supabase } = await import('../lib/supabase');
        const { data } = await supabase
            .from('company_users')
            .select(`*, company:companies(name)`)
            .eq('user_id', userId);
        setUserCompanyRoles(data || []);
    };

    const handleAssignToCompany = async (userId, companyId, role) => {
        const { assignUserToCompany } = await import('../lib/companyService');
        const { error } = await assignUserToCompany(userId, companyId, role);
        if (error) alert("Failed to assign company");
        else handleFetchUserCompanies(userId);
    };

    const handleRemoveFromCompany = async (userId, companyId) => {
        const { removeUserFromCompany } = await import('../lib/companyService');
        const { error } = await removeUserFromCompany(userId, companyId);
        if (error) alert("Failed to remove company");
        else handleFetchUserCompanies(userId);
    };

    const handleCompanySubmit = async (e) => {
        e.preventDefault();
        const { createCompany, updateCompany } = await import('../lib/companyService');

        let res;
        if (editingCompany) {
            // Remove slug if it's empty to prevent saving an empty string
            const payload = { ...companyForm };
            if (!payload.slug) delete payload.slug;
            res = await updateCompany(editingCompany.id, payload);
        } else {
            res = await createCompany(companyForm.name, companyForm.slug);
        }

        if (res.error) {
            if (res.error.code === '23505') {
                alert("Conflict: A company with this Name or Link (Slug) already exists. Please try a slightly different name or manually change the 'Slug' field.");
            } else {
                alert("Error: " + res.error.message);
            }
        } else {
            // If we created a new company, provision a Google Drive folder and Document Settings
            if (!editingCompany && res.data) {
                const newCompany = res.data;
                try {
                    const token = localStorage.getItem('google_access_token');
                    let newFolderId = null;
                    
                    if (token) {
                        const { getDocumentSettings } = await import('../lib/store');
                        const { getOrCreateFolder } = await import('../lib/driveService');
                        
                        let parentFolderId = null;
                        if (currentUserProfile?.company_id) {
                            const currentSettings = await getDocumentSettings(currentUserProfile.company_id);
                            const rawParent = currentSettings?.gdrive_celron_root_id || currentSettings?.google_drive_folder_id;
                            if (rawParent) {
                                parentFolderId = rawParent;
                                if (parentFolderId.includes('drive.google.com')) {
                                    const match = parentFolderId.match(/\/d\/([^/]+)/) || parentFolderId.match(/\/folders\/([^/?]+)/);
                                    parentFolderId = match ? match[1] : parentFolderId;
                                }
                            }
                        }
                        
                        if (!parentFolderId) {
                            alert(`Notice: No Google Drive root folder is configured. The folder "${newCompany.name}" will be created in your main Google Drive root directory.`);
                        }
                        
                        newFolderId = await getOrCreateFolder(token, newCompany.name, parentFolderId || 'root');
                    } else {
                        alert(`Notice: Google Drive is not connected. The company "${newCompany.name}" was created, but no Google Drive folder was provisioned.`);
                    }
                    
                    const { saveDocumentSettings } = await import('../lib/store');
                    await saveDocumentSettings({
                        company_id: newCompany.id,
                        company_name: newCompany.name,
                        google_drive_folder_id: newFolderId ? `https://drive.google.com/drive/folders/${newFolderId}` : null,
                        allow_signup: true,
                        base_currency: 'SGD'
                    });
                } catch (driveErr) {
                    console.error('Failed to provision GDrive folder or Document Settings:', driveErr);
                    alert(`Company created, but Google Drive/Document Settings provisioning failed: ${driveErr.message || driveErr}`);
                }
            }

            setIsCompanyModalOpen(false);
            setEditingCompany(null);
            setCompanyForm({ name: '', slug: '', logo_url: '' });
            fetchCompanies();
        }
    };

    const handleDeleteCompany = async (companyId) => {
        if (!window.confirm("Are you sure you want to delete this company? This may fail if it has active users or data.")) return;

        const { deleteCompany } = await import('../lib/companyService');
        const { error } = await deleteCompany(companyId);

        if (error) {
            alert("Delete failed: " + error.message + "\n\nTip: You might need to remove all users from this company first.");
        } else {
            fetchCompanies();
        }
    };

    const isAdminOrSuper = currentUserProfile?.role === 'superadmin' || currentUserProfile?.role === 'admin';

    if (!isAdminOrSuper) {
        return <div>Access Denied</div>;
    }

    const filteredUsers = users.filter(u => u.email?.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="animate-fade-in">
            <div className="page-header" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%' }}>
                    <div>
                        <h1 className="page-title">{viewMode === 'users' ? 'User Control & Access' : 'Company Management'}</h1>
                        <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
                            {viewMode === 'users'
                                ? 'Manage roles, permissions, and module access across your organization.'
                                : 'Create and manage multiple system tenants and company identities.'}
                        </p>
                    </div>
                    {currentUserProfile?.role === 'superadmin' && (
                        <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', gap: '4px' }}>
                            <button
                                onClick={() => setViewMode('users')}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                    background: viewMode === 'users' ? '#fff' : 'transparent',
                                    color: viewMode === 'users' ? '#4f46e5' : '#64748b',
                                    boxShadow: viewMode === 'users' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                    fontWeight: 600, transition: '0.2s'
                                }}
                            >
                                <UserCheck size={16} style={{ marginBottom: '-3px', marginRight: '6px' }} /> Users
                            </button>
                            <button
                                onClick={() => setViewMode('companies')}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                    background: viewMode === 'companies' ? '#fff' : 'transparent',
                                    color: viewMode === 'companies' ? '#4f46e5' : '#64748b',
                                    boxShadow: viewMode === 'companies' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                    fontWeight: 600, transition: '0.2s'
                                }}
                            >
                                <Building2 size={16} style={{ marginBottom: '-3px', marginRight: '6px' }} /> Companies
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <div className="search-bar" style={{ maxWidth: '300px' }}>
                        <Search size={18} style={{ color: 'var(--text-secondary)' }} />
                        <input
                            type="text"
                            placeholder={viewMode === 'users' ? "Search by email..." : "Search companies..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    {viewMode === 'companies' && (
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                setEditingCompany(null);
                                setCompanyForm({ name: '', slug: '', logo_url: '', enabled_modules: ALL_MODULES.map(m => m.id) });
                                setIsCompanyModalOpen(true);
                            }}
                        >
                            <Building2 size={18} /> Create New Company
                        </button>
                    )}
                </div>

                {viewMode === 'users' ? (
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Tenant Access</th>
                                    <th>Module Access</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', padding: '24px' }}>Loading users...</td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', padding: '48px 24px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                                                <div style={{ color: 'var(--text-secondary)' }}>No users found in the database.</div>
                                                {currentUserProfile?.role === 'superadmin' && (
                                                    <button 
                                                        className="btn btn-primary"
                                                        onClick={async () => {
                                                            const { createProfileManually } = await import('../lib/userService');
                                                            const { error } = await createProfileManually(currentUserProfile);
                                                            if (error) alert("Sync failed: " + error.message);
                                                            else {
                                                                alert("Profile synchronized successfully!");
                                                                fetchUsers();
                                                            }
                                                        }}
                                                    >
                                                        <ShieldCheck size={18} /> Register My Profile
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map(user => (
                                        <tr key={user.id} className="table-row">
                                            <td className="font-medium">
                                                {user.email}
                                                {user.company && (
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        {user.company.name}
                                                    </div>
                                                )}
                                            </td>

                                            <td>
                                                <select
                                                    className="form-select"
                                                    style={{ width: '140px', padding: '6px 12px' }}
                                                    value={user.role}
                                                    onChange={(e) => handleUpdate(user.id, 'role', e.target.value)}
                                                    disabled={user.role === 'superadmin' && currentUserProfile?.id !== user.id} // Don't let others demote superadmins
                                                >
                                                    <option value="user">User</option>
                                                    <option value="admin">Admin</option>
                                                    {user.role === 'superadmin' && (
                                                        <option value="superadmin">Superadmin</option>
                                                    )}
                                                </select>
                                            </td>

                                            <td>
                                                <select
                                                    className="form-select"
                                                    style={{
                                                        width: '120px', padding: '6px 12px',
                                                        color: user.status === 'active' ? '#15803d' : user.status === 'blocked' ? '#b91c1c' : '#b45309',
                                                        background: user.status === 'active' ? '#dcfce7' : user.status === 'blocked' ? '#fee2e2' : '#fef3c7',
                                                        borderColor: 'transparent'
                                                    }}
                                                    value={user.status}
                                                    onChange={(e) => handleUpdate(user.id, 'status', e.target.value)}
                                                    disabled={user.role === 'superadmin' && currentUserProfile?.id !== user.id}
                                                >
                                                    <option value="active">Active</option>
                                                    <option value="pending">Pending</option>
                                                    <option value="blocked">Blocked</option>
                                                </select>
                                            </td>

                                            <td>
                                                {currentUserProfile?.role === 'superadmin' ? (
                                                    <button
                                                        onClick={() => {
                                                            setShowCompanyModal(user);
                                                            handleFetchUserCompanies(user.id);
                                                        }}
                                                        className="btn btn-secondary"
                                                        style={{ padding: '6px 10px', fontSize: '0.8rem', gap: '6px' }}
                                                    >
                                                        <Building2 size={14} /> My Companies
                                                    </button>
                                                ) : (
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{user.company?.name || 'Restricted'}</span>
                                                )}
                                            </td>

                                            <td style={{ maxWidth: '300px' }}>
                                                {user.role === 'superadmin' ? (
                                                    <span className="tag" style={{ background: '#dcfce7', color: '#15803d' }}>
                                                        <ShieldCheck size={14} /> Full Access Override
                                                    </span>
                                                ) : (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                        {availableModules.map(mod => {
                                                            const isChecked = (user.accessible_modules || []).includes(mod.id);
                                                            return (
                                                                <button
                                                                    key={mod.id}
                                                                    onClick={() => handleModuleToggle(user.id, mod.id, user.accessible_modules)}
                                                                    className="tag"
                                                                    style={{
                                                                        border: 'none',
                                                                        cursor: 'pointer',
                                                                        background: isChecked ? 'rgba(59, 130, 246, 0.15)' : '#f1f5f9',
                                                                        color: isChecked ? '#1d4ed8' : 'var(--text-secondary)',
                                                                        transition: 'all 0.2s'
                                                                    }}
                                                                >
                                                                    {isChecked && <Check size={12} />} {mod.label}
                                                                </button>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </td>

                                            <td style={{ width: '100px', textAlign: 'center' }}>
                                                {saveStatus.id === user.id && saveStatus.status === 'saving' && (
                                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Saving...</span>
                                                )}
                                                {saveStatus.id === user.id && saveStatus.status === 'success' && (
                                                    <span style={{ color: '#10b981', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Check size={14} /> Saved
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Logo</th>
                                    <th>Company Name</th>
                                    <th>Slug</th>
                                    <th>ID</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {companies.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).map(comp => (
                                    <tr key={comp.id} className="table-row">
                                        <td>
                                            <div style={{ width: '32px', height: '32px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {comp.logo_url ? <img src={comp.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Building2 size={16} color="#94a3b8" />}
                                            </div>
                                        </td>
                                        <td className="font-bold">{comp.name}</td>
                                        <td><code>{comp.slug}</code></td>
                                        <td style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{comp.id}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button
                                                    onClick={() => {
                                                        setEditingCompany(comp);
                                                        setCompanyForm({ 
                                                            name: comp.name, 
                                                            slug: comp.slug || '', 
                                                            logo_url: comp.logo_url || '',
                                                            enabled_modules: comp.enabled_modules || ALL_MODULES.map(m => m.id)
                                                        });
                                                        setIsCompanyModalOpen(true);
                                                    }}
                                                    className="btn btn-secondary"
                                                    style={{ padding: '6px 10px' }}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteCompany(comp.id)}
                                                    className="btn btn-secondary"
                                                    style={{ padding: '6px 10px', color: '#ef4444' }}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Company Access Modal */}
            {showCompanyModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)'
                }}>
                    <div className="glass-panel" style={{ width: '500px', padding: '32px', position: 'relative' }}>
                        <button
                            onClick={() => setShowCompanyModal(null)}
                            style={{ position: 'absolute', top: '16px', right: '16px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                        >
                            <X size={20} />
                        </button>

                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>Manage Tenancy</h2>
                        <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '24px' }}>Assign <b>{showCompanyModal.email}</b> to specialized companies.</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="form-group">
                                <label className="form-label">Add to Company</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <select
                                        id="new-company-select"
                                        className="form-select"
                                        defaultValue=""
                                    >
                                        <option value="" disabled>Select Company...</option>
                                        {companies.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => {
                                            const sel = document.getElementById('new-company-select');
                                            if (sel.value) handleAssignToCompany(showCompanyModal.id, sel.value, 'staff');
                                        }}
                                        className="btn btn-primary"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>

                            <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', maxHeight: '300px', overflowY: 'auto' }}>
                                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '12px' }}>Active Memberships</h3>
                                {userCompanyRoles.length === 0 ? (
                                    <p style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>No company assignments found.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {userCompanyRoles.map(ur => (
                                            <div key={ur.company_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{ur.company?.name}</div>
                                                    <select
                                                        style={{ border: 'none', fontSize: '0.75rem', color: '#6366f1', background: 'transparent', padding: 0, fontWeight: 700, cursor: 'pointer' }}
                                                        value={ur.role}
                                                        onChange={(e) => handleAssignToCompany(showCompanyModal.id, ur.company_id, e.target.value)}
                                                    >
                                                        <option value="staff">Role: Staff</option>
                                                        <option value="manager">Role: Manager</option>
                                                        <option value="admin">Role: Admin</option>
                                                    </select>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveFromCompany(showCompanyModal.id, ur.company_id)}
                                                    style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}
                                                    title="Remove from Company"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ marginTop: '24px', textAlign: 'right' }}>
                            <button onClick={() => setShowCompanyModal(null)} className="btn btn-primary" style={{ minWidth: '120px' }}>Done</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create/Edit Company Modal */}
            {isCompanyModalOpen && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)'
                }}>
                    <div className="glass-panel" style={{ width: '450px', padding: '32px', position: 'relative' }}>
                        <button
                            onClick={() => setIsCompanyModalOpen(false)}
                            style={{ position: 'absolute', top: '16px', right: '16px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                        >
                            <X size={20} />
                        </button>

                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '24px' }}>
                            {editingCompany ? 'Edit Company' : 'Create New Company'}
                        </h2>

                        <form onSubmit={handleCompanySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div className="form-group">
                                <label className="form-label">Company Name *</label>
                                <input
                                    required
                                    type="text"
                                    className="form-input"
                                    value={companyForm.name}
                                    onChange={e => setCompanyForm({ ...companyForm, name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Slug (URL friendly)</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="auto-generated if empty"
                                    value={companyForm.slug}
                                    onChange={e => setCompanyForm({ ...companyForm, slug: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Logo URL</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={companyForm.logo_url}
                                    onChange={e => setCompanyForm({ ...companyForm, logo_url: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Enabled Modules (Mission Control)</label>
                                <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: '1fr 1fr', 
                                    gap: '8px',
                                    padding: '12px',
                                    background: '#f8fafc',
                                    borderRadius: '12px',
                                    border: '1px solid #e2e8f0',
                                    maxHeight: '200px',
                                    overflowY: 'auto'
                                }}>
                                    {ALL_MODULES.map(mod => {
                                        const isChecked = companyForm.enabled_modules?.includes(mod.id);
                                        return (
                                            <label key={mod.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={e => {
                                                        const newModules = e.target.checked 
                                                            ? [...(companyForm.enabled_modules || []), mod.id]
                                                            : (companyForm.enabled_modules || []).filter(id => id !== mod.id);
                                                        setCompanyForm({ ...companyForm, enabled_modules: newModules });
                                                    }}
                                                />
                                                {mod.label}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
                                <button type="button" onClick={() => setIsCompanyModalOpen(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                                    {editingCompany ? 'Save Changes' : 'Create Company'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
