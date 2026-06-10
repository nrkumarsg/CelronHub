import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Upload, Download, Trash2, Edit, MapPin, Printer, ArrowUpDown, ChevronDown } from 'lucide-react';
import { useWorkLocationsStore } from '../lib/workLocationsStore';
import Papa from 'papaparse';
import Pagination from '../components/Pagination';

export default function WorkLocationsDirectory() {
    const navigate = useNavigate();
    const { workLocations, loading, fetchWorkLocations, deleteWorkLocation, addWorkLocation } = useWorkLocationsStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortKey, setSortKey] = useState('name');
    const [sortDirection, setSortDirection] = useState('desc'); // 'asc' | 'desc'
    const itemsPerPage = 10;
    const [isImporting, setIsImporting] = useState(false);

    useEffect(() => {
        fetchWorkLocations();
    }, [fetchWorkLocations]);

    const filteredLocations = workLocations.filter(loc => {
        const searchStr = searchTerm.toLowerCase();
        return (
            (loc.location_name || '').toLowerCase().includes(searchStr) ||
            (loc.pincode || '').toLowerCase().includes(searchStr)
        );
    });

    const sortedLocations = [...filteredLocations].sort((a, b) => {
        let valA, valB;
        if (sortKey === 'name') {
            valA = a.location_name || '';
            valB = b.location_name || '';
            return sortDirection === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
        } else if (sortKey === 'pincode') {
            valA = a.pincode || '';
            valB = b.pincode || '';
            return sortDirection === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
        } else if (sortKey === 'created_at') {
            valA = a.created_at ? new Date(a.created_at) : 0;
            valB = b.created_at ? new Date(b.created_at) : 0;
            return sortDirection === 'desc' ? valB - valA : valA - valB;
        }
        return 0;
    });

    const paginatedLocations = sortedLocations.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset pagination when searching
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const handleExportCSV = () => {
        if (workLocations.length === 0) {
            alert("No locations to export");
            return;
        }

        const csvData = workLocations.map(loc => ({
            'Location Name': loc.location_name,
            'Pincode': loc.pincode || '',
            'Other Details': loc.other_details ? loc.other_details.replace(/<[^>]*>?/gm, '') : '' // Strip HTML
        }));

        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `work_locations_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportCSV = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsImporting(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                let successCount = 0;
                let errorCount = 0;

                for (const row of results.data) {
                    if (!row['Location Name']) {
                        errorCount++;
                        continue;
                    }

                    const newLoc = {
                        location_name: row['Location Name'].trim(),
                        pincode: row['Pincode'] ? row['Pincode'].trim() : null,
                        other_details: row['Other Details'] ? `<p>${row['Other Details'].trim()}</p>` : null,
                    };

                    const result = await addWorkLocation(newLoc);
                    if (result.success) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                }

                setIsImporting(false);
                alert(`Import complete.\nSuccessfully added: ${successCount}\nFailed/Skipped: ${errorCount}`);
                // Refresh list
                fetchWorkLocations();
            },
            error: (error) => {
                console.error("Error parsing CSV:", error);
                alert("Error reading CSV file. Ensure it is formatted correctly.");
                setIsImporting(false);
            }
        });
        // Reset file input
        e.target.value = null;
    };

    const handleDelete = async (id, name) => {
        if (window.confirm(`Are you sure you want to delete ${name}?`)) {
            await deleteWorkLocation(id);
        }
    };

    return (
        <div style={{ background: '#f8fafc', minHeight: '100%', padding: '32px', color: '#334155', borderRadius: '16px' }}>
            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', background: '#e0e7ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}>
                        <MapPin size={24} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>Work Locations</h1>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>Manage global branches and operational centers</p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                        type="file"
                        accept=".csv"
                        id="csvImport"
                        style={{ display: 'none' }}
                        onChange={handleImportCSV}
                        disabled={isImporting}
                    />
                    <button className="btn btn-secondary" onClick={() => document.getElementById('csvImport').click()} disabled={isImporting}>
                        <Upload size={18} /> <span className="hide-on-mobile">{isImporting ? 'Importing...' : 'Import CSV'}</span>
                    </button>

                    <button className="btn btn-secondary" onClick={handleExportCSV}>
                        <Download size={18} /> <span className="hide-on-mobile">Export CSV</span>
                    </button>

                    <button className="btn btn-secondary" onClick={() => window.print()}>
                        <Printer size={18} /> <span className="hide-on-mobile">Print</span>
                    </button>

                    <button onClick={() => navigate('/work-locations/new')} style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.2)' }}>
                        <Plus size={18} /> <span>Add Location</span>
                    </button>
                </div>
            </header>

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flex: 1, minWidth: '400px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', color: '#94a3b8' }}>
                        <Search size={18} />
                    </div>
                    <input
                        type="text"
                        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '8px 0', fontSize: '0.95rem', color: '#334155' }}
                        placeholder="Search locations or pincodes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 16px', gap: '8px', minWidth: '200px' }}>
                    <ArrowUpDown size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
                    <select
                        value={`${sortKey}-${sortDirection}`}
                        onChange={(e) => {
                            const [key, dir] = e.target.value.split('-');
                            setSortKey(key);
                            setSortDirection(dir);
                        }}
                        style={{ appearance: 'none', background: 'transparent', border: 'none', outline: 'none', color: '#475569', fontSize: '0.9rem', fontWeight: 500, padding: '10px 24px 10px 0', cursor: 'pointer', width: '100%' }}
                    >
                        <option value="name-desc">Location Name (Z-A)</option>
                        <option value="name-asc">Location Name (A-Z)</option>
                        <option value="pincode-desc">Pincode (Z-A)</option>
                        <option value="pincode-asc">Pincode (A-Z)</option>
                        <option value="created_at-desc">Date Added (Newest)</option>
                        <option value="created_at-asc">Date Added (Oldest)</option>
                    </select>
                    <ChevronDown size={14} color="#94a3b8" style={{ position: 'absolute', right: '16px', pointerEvents: 'none' }} />
                </div>
            </div>

            <div className="glass-panel" style={{ padding: 0 }}>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Location Name</th>
                                <th>Pincode</th>
                                <th>Details</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="4" style={{ textAlign: 'center', padding: '40px' }}>
                                        <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
                                        <p style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>Loading locations...</p>
                                    </td>
                                </tr>
                            ) : filteredLocations.length === 0 ? (
                                <tr>
                                    <td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                                        No work locations found. Try adjusting your search or add a new one.
                                    </td>
                                </tr>
                            ) : (
                                paginatedLocations.map(loc => (
                                    <tr key={loc.id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(234, 179, 8, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#eab308' }}>
                                                    <MapPin size={16} />
                                                </div>
                                                <div style={{ fontWeight: 500 }}>{loc.location_name}</div>
                                            </div>
                                        </td>
                                        <td>{loc.pincode || '-'}</td>
                                        <td>
                                            {loc.other_details ? (
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                    {loc.other_details.replace(/<[^>]*>?/gm, '')}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="hide-on-print">
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                <button
                                                    className="action-btn"
                                                    onClick={() => navigate(`/work-locations/${loc.id}`)}
                                                    title="Edit Location"
                                                >
                                                    <Edit size={16} />
                                                </button>
                                                <button
                                                    className="action-btn delete"
                                                    onClick={() => handleDelete(loc.id, loc.location_name)}
                                                    title="Delete Location"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {!loading && filteredLocations.length > 0 && (
                    <Pagination
                        currentPage={currentPage}
                        totalItems={filteredLocations.length}
                        itemsPerPage={itemsPerPage}
                        onPageChange={setCurrentPage}
                    />
                )}
            </div>
        </div>
    );
}
