import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Search,
    Download,
    Printer,
    Upload,
    Filter,
    ChevronLeft,
    ChevronRight,
    Package,
    Wrench,
    QrCode,
    ArrowUpDown
} from 'lucide-react';
import ScannerModal from '../components/ScannerModal';
import { getCatalogItems, getAllCatalogItemsForExport, createCatalogItem } from '../lib/catalogService';
import Papa from 'papaparse';
import { useAuth } from '../contexts/AuthContext';
import * as html2pdf from 'html2pdf.js';

const CatalogDirectory = () => {
    const navigate = useNavigate();
    const { profile } = useAuth();
    const [items, setItems] = useState([]);
    const fileInputRef = React.useRef(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [sortDirection, setSortDirection] = useState('desc'); // 'asc' | 'desc'

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [showScanner, setShowScanner] = useState(false);
    const itemsPerPage = 50;

    const fetchItems = async () => {
        setLoading(true);
        const { data, count, error } = await getCatalogItems(
            currentPage,
            itemsPerPage,
            { type: typeFilter },
            searchQuery,
            sortBy,
            sortDirection
        );

        if (error) {
            console.error('Error fetching catalog items:', error);
            // Fallback for demo if no DB connection
            setItems([]);
            setTotalItems(0);
            setTotalPages(1);
        } else {
            setItems(data || []);
            setTotalItems(count || 0);
            setTotalPages(Math.ceil((count || 0) / itemsPerPage));
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchItems();
    }, [currentPage, searchQuery, typeFilter, sortBy, sortDirection]);


    const handleSearch = (e) => {
        if (e) e.preventDefault();
        setCurrentPage(1); // Reset to first page on search
        fetchItems();
    };

    const handleScanSuccess = (decodedText) => {
        setSearchQuery(decodedText);
        setShowScanner(false);
        // fetchItems is called automatically by useEffect due to searchQuery change
    };

    const handleExportCSV = async () => {
        const { data, error } = await getAllCatalogItemsForExport();
        if (error || !data) {
            alert("Failed to export data");
            return;
        }

        const exportData = data.map(item => ({
            'Type': item.type,
            'Name': item.name,
            'Specification': item.specification,
            'Quantity Available': item.quantity,
            'Selling Price': item.selling_price,
            'Stored Location': item.stored_location,
            'Barcode': item.barcode
        }));

        const csv = Papa.unparse(exportData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `catalog_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handlePrint = () => {
        window.print();
    };

    const handleImportCSV = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async function (results) {
                let imported = 0;
                for (const row of results.data) {
                    const itemName = row['Item Name'] || row['Name'] || row['item_name'];
                    if (!itemName) continue;

                    try {
                        const payload = {
                            name: itemName.trim(),
                            type: row['Type'] || row['type'] || 'Supply Part',
                            specification: row['Specification'] || row['specification'] || '',
                            quantity: row['Qty'] || row['Quantity Available'] || row['quantity'] ? parseInt(row['Qty'] || row['Quantity Available'] || row['quantity'], 10) : 0,
                            selling_price: row['Price'] || row['Selling Price'] || row['selling_price'] ? parseFloat(row['Price'] || row['Selling Price'] || row['selling_price']) : 0,
                            stored_location: row['Location'] || row['Stored Location'] || row['stored_location'] || '',
                            barcode: row['Barcode'] || row['barcode'] || '',
                            company_id: profile?.company_id || 'd0000000-0000-0000-0000-000000000001'
                        };
                        await createCatalogItem(payload);
                        imported++;
                    } catch (err) {
                        console.error("Error saving catalog row", err);
                    }
                }
                alert(`Successfully imported ${imported} catalog items`);
                fetchItems();
            },
            error: function () {
                alert('Error parsing CSV file');
                setLoading(false);
            }
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                        onClick={() => navigate(-1)}
                        className="btn btn-secondary hide-on-print"
                        style={{ padding: '8px', minWidth: 'auto', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px' }}
                        title="Go Back"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div>
                        <h1 className="page-title">Products & Services Catalog</h1>
                        <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>Manage your supply parts and services</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }} className="hide-on-print">
                    <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} style={{ display: 'none' }} />
                    <button className="btn btn-secondary" onClick={() => fileInputRef.current.click()}>
                        <Upload size={18} /> Import CSV
                    </button>
                    <button className="btn btn-secondary" onClick={handleExportCSV}>
                        <Download size={18} /> Export CSV
                    </button>
                    <button className="btn btn-secondary" onClick={handlePrint}>
                        <Printer size={18} /> Print
                    </button>
                    <button className="btn btn-secondary" onClick={() => navigate('/catalog/labels')}>
                        <Printer size={18} /> Print Labels
                    </button>
                    <button className="btn btn-primary" onClick={() => navigate('/catalog/new')}>
                        <Plus size={18} /> Add New Item
                    </button>
                </div>
            </div>

            <div className="glass-panel" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }} className="hide-on-print">
                    <form onSubmit={handleSearch} className="search-bar">
                        <Search size={20} style={{ color: 'var(--text-secondary)' }} />
                        <input
                            type="text"
                            placeholder="Scan or Search catalog..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', background: showScanner ? 'var(--accent)' : '', color: showScanner ? '#fff' : '' }}
                            onClick={() => setShowScanner(true)}
                        >
                            <QrCode size={16} /> Scan
                        </button>
                        <button type="submit" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>Search</button>
                    </form>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}>
                            <Filter size={16} /> Filter:
                        </div>
                        <select
                            className="form-select"
                            style={{ width: '180px', padding: '8px 12px' }}
                            value={typeFilter}
                            onChange={(e) => {
                                setTypeFilter(e.target.value);
                                setCurrentPage(1);
                            }}
                        >
                            <option value="">All Types</option>
                            <option value="Supply Part">Supply Parts</option>
                            <option value="Service">Services</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}>
                            <ArrowUpDown size={16} /> Sort:
                        </div>
                        <select
                            className="form-select"
                            style={{ width: '220px', padding: '8px 12px' }}
                            value={`${sortBy}-${sortDirection}`}
                            onChange={(e) => {
                                const [key, dir] = e.target.value.split('-');
                                setSortBy(key);
                                setSortDirection(dir);
                                setCurrentPage(1);
                            }}
                        >
                            <option value="name-desc">Item Name (Z-A)</option>
                            <option value="name-asc">Item Name (A-Z)</option>
                            <option value="quantity-desc">Quantity (High-Low)</option>
                            <option value="quantity-asc">Quantity (Low-High)</option>
                            <option value="selling_price-desc">Price (High-Low)</option>
                            <option value="selling_price-asc">Price (Low-High)</option>
                            <option value="created_at-desc">Date Added (Newest)</option>
                            <option value="created_at-asc">Date Added (Oldest)</option>
                        </select>
                    </div>
                </div>

                <div className="table-container printable-area">
                    <table>
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Item Name</th>
                                <th>Location</th>
                                <th>Qty</th>
                                <th>Price</th>
                                <th>Barcode</th>
                                <th>Specification</th>
                                <th className="no-print">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="text-center py-8">Loading catalog...</td>
                                </tr>
                            ) : items.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="text-center py-8">
                                        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
                                            <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                                            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>No items found</h3>
                                            <p style={{ marginBottom: '24px' }}>Get started by adding a new product or service.</p>
                                            <button className="btn btn-primary hide-on-print" onClick={() => navigate('/catalog/new')}>
                                                <Plus size={18} /> Add Item
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => (
                                    <tr key={item.id} className="table-row">
                                        <td>
                                            <span className="tag" style={{ background: item.type === 'Service' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: item.type === 'Service' ? '#059669' : '#2563eb' }}>
                                                {item.type === 'Service' ? <Wrench size={12} /> : <Package size={12} />}
                                                {item.type}
                                            </span>
                                        </td>
                                        <td className="font-medium">{item.name}</td>
                                        <td>{item.stored_location || '-'}</td>
                                        <td>{item.quantity !== null && item.quantity !== undefined ? item.quantity : '-'}</td>
                                        <td>{item.selling_price ? `$${item.selling_price}` : '-'}</td>
                                        <td>
                                            {item.barcode ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)', fontSize: '0.85rem' }}>
                                                    <QrCode size={14} /> {item.barcode}
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.specification}>{item.specification || '-'}</td>
                                        <td className="hide-on-print">
                                            <button
                                                className="btn btn-sm btn-secondary"
                                                onClick={() => navigate(`/catalog/${item.id}`)}
                                            >
                                                View / Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {!loading && totalPages > 1 && (
                    <div className="pagination-container hide-on-print">
                        <div className="pagination-info">
                            Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} items
                        </div>
                        <div className="pagination-controls">
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px' }}
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => prev - 1)}
                            >
                                <ChevronLeft size={16} /> Prev
                            </button>
                            <div className="pagination-pages">
                                {Array.from({ length: totalPages }, (_, i) => i + 1)
                                    .filter(num => num === 1 || num === totalPages || Math.abs(num - currentPage) <= 1)
                                    .map((num, i, arr) => (
                                        <React.Fragment key={num}>
                                            {i > 0 && num - arr[i - 1] > 1 && <span style={{ padding: '0 8px', color: 'var(--text-secondary)' }}>...</span>}
                                            <button
                                                className={`pagination-page ${currentPage === num ? 'active' : ''}`}
                                                onClick={() => setCurrentPage(num)}
                                            >
                                                {num}
                                            </button>
                                        </React.Fragment>
                                    ))}
                            </div>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px' }}
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(prev => prev + 1)}
                            >
                                Next <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <ScannerModal
                isOpen={showScanner}
                onClose={() => setShowScanner(false)}
                onScanSuccess={handleScanSuccess}
            />
        </div>
    );
};

export default CatalogDirectory;
