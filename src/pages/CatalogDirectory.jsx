import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus, Search, Download, Printer, Upload, Filter, ChevronLeft, ChevronRight,
    Package, Wrench, QrCode, ArrowUpDown, Layers, Settings, Folder, Tag,
    ChevronDown, BookOpen, Boxes, FileCheck, Eye, Edit2, Database, Trash2, Building2, List, Grid, RefreshCw, AlertCircle, X, Globe
} from 'lucide-react';
import ScannerModal from '../components/ScannerModal';
import { getCatalogItems, getAllCatalogItemsForExport, createCatalogItem, deleteCatalogItem } from '../lib/catalogService';
import { 
    getDepartments, createDepartment, 
    getEquipmentGroups, createEquipmentGroup,
    getMakers, createMaker,
    getModels, createModel,
    getAssemblies, createAssembly,
    getWarehouses, createWarehouse,
    getUnits, createUnit,
    getSystems, deleteSystem
} from '../lib/marineCatalogService';
import Papa from 'papaparse';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const CatalogDirectory = () => {
    const navigate = useNavigate();
    const { profile } = useAuth();
    const fileInputRef = React.useRef(null);

    // Tab States: 'parts', 'systems', 'explorer', 'master_data'
    const [activeDirectoryTab, setActiveDirectoryTab] = useState('parts');

    // Shared States
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    
    // Master lists for filters and tree
    const [departments, setDepartments] = useState([]);
    const [equipmentGroups, setEquipmentGroups] = useState([]);
    const [makers, setMakers] = useState([]);
    const [models, setModels] = useState([]);
    const [assemblies, setAssemblies] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [units, setUnits] = useState([]);
    const [allSystemsList, setAllSystemsList] = useState([]);
    
    // Global Parts & Specs search states
    const [globalSearchTerm, setGlobalSearchTerm] = useState('');
    const [globalSearchTarget, setGlobalSearchTarget] = useState('google');

    const handleGlobalSearch = () => {
        if (!globalSearchTerm.trim()) {
            alert('Please enter a search query.');
            return;
        }
        
        let url = '';
        const query = encodeURIComponent(globalSearchTerm.trim());
        
        switch (globalSearchTarget) {
            case 'google':
                url = `https://www.google.com/search?q=${query}`;
                break;
            case 'images':
                url = `https://www.google.com/search?tbm=isch&q=${query}`;
                break;
            case 'pdf':
                url = `https://www.google.com/search?q=${query}+filetype%3Apdf`;
                break;
            case 'shipserv':
                url = `https://www.shipserv.com/search?q=${query}`;
                break;
            case 'sinor':
                url = `https://www.google.com/search?q=${query}+site%3Asinormarine.com`;
                break;
            default:
                url = `https://www.google.com/search?q=${query}`;
        }
        
        window.open(url, '_blank');
    };

    // 1. Spare Parts Tab States
    const [parts, setParts] = useState([]);
    const [typeFilter, setTypeFilter] = useState('');
    const [partsFilter, setPartsFilter] = useState({
        department_id: '',
        equipment_group_id: '',
        system_id: '',
        maker_id: '',
        stock_status: '' // 'in_stock', 'low_stock', 'out_of_stock', 'obsolete'
    });
    const [sortBy, setSortBy] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');
    const [partsPage, setPartsPage] = useState(1);
    const [totalPartsPages, setTotalPartsPages] = useState(1);
    const [totalParts, setTotalParts] = useState(0);
    const itemsPerPage = 50;

    // 2. Systems Tab States
    const [systems, setSystems] = useState([]);
    const [systemsFilter, setSystemsFilter] = useState({
        department_id: '',
        equipment_group_id: '',
        maker_id: ''
    });
    const [systemsPage, setSystemsPage] = useState(1);
    const [totalSystemsPages, setTotalSystemsPages] = useState(1);
    const [totalSystems, setTotalSystems] = useState(0);

    // 3. Tree Explorer States
    const [expandedNodes, setExpandedNodes] = useState({}); // { 'dep_id': true, 'dep_id-grp_id': true }
    const [treeData, setTreeData] = useState([]); // Hierarchical data

    // 4. Master Data Manager States
    const [activeMasterSubTab, setActiveMasterSubTab] = useState('departments');
    const [masterInput, setMasterInput] = useState({ name: '', location: '', symbol: '', parent_id: '' });
    const [masterSaving, setMasterSaving] = useState(false);

    // Fetch Master Data lists once
    const fetchMasterDataLists = async () => {
        const companyId = profile?.company_id;
        const [depsRes, grpsRes, makersRes, modelsRes, assembliesRes, whRes, unitsRes, systemsRes] = await Promise.all([
            getDepartments(companyId),
            getEquipmentGroups(companyId),
            getMakers(companyId),
            getModels(companyId),
            getAssemblies(companyId),
            getWarehouses(companyId),
            getUnits(companyId),
            getSystems(1, 1000, '', {}, companyId)
        ]);

        setDepartments(depsRes.data || []);
        setEquipmentGroups(grpsRes.data || []);
        setMakers(makersRes.data || []);
        setModels(modelsRes.data || []);
        setAssemblies(assembliesRes.data || []);
        setWarehouses(whRes.data || []);
        setUnits(unitsRes.data || []);
        setAllSystemsList(systemsRes.data || []);
    };

    // Load spare parts items
    const fetchSpareParts = async () => {
        setLoading(true);
        const { data, count, error } = await getCatalogItems(
            partsPage,
            itemsPerPage,
            { 
                type: typeFilter,
                ...partsFilter
            },
            searchQuery,
            sortBy,
            sortDirection
        );

        if (!error) {
            setParts(data || []);
            setTotalParts(count || 0);
            setTotalPartsPages(Math.ceil((count || 0) / itemsPerPage));
        } else {
            setParts([]);
            setTotalParts(0);
            setTotalPartsPages(1);
        }
        setLoading(false);
    };

    // Load systems list
    const fetchSystemsData = async () => {
        setLoading(true);
        const { data, count, error } = await getSystems(
            systemsPage,
            itemsPerPage,
            searchQuery,
            systemsFilter,
            profile?.company_id
        );

        if (!error) {
            setSystems(data || []);
            setTotalSystems(count || 0);
            setTotalSystemsPages(Math.ceil((count || 0) / itemsPerPage));
        } else {
            setSystems([]);
            setTotalSystems(0);
            setTotalSystemsPages(1);
        }
        setLoading(false);
    };

    // Build the hierarchical tree data model
    // Hierarchy: Department -> Equipment Group -> System -> Assembly -> Spare Parts
    const buildHierarchyTree = async () => {
        setLoading(true);
        try {
            // Build Department-level nodes
            const list = departments.map(dep => {
                // Find equipment groups active in this department
                // (For simplicity, we show all groups under each department, and nest systems under groups)
                const grps = equipmentGroups.map(grp => {
                    // Find systems belonging to this department and equipment group
                    const sysList = allSystemsList.filter(sys => sys.department_id === dep.id && sys.equipment_group_id === grp.id);
                    return {
                        id: `${dep.id}-${grp.id}`,
                        name: grp.name,
                        type: 'group',
                        children: sysList.map(sys => {
                            // Find assemblies or parts directly under this System
                            // For tree leaf items, parts belonging to this system
                            const systemParts = parts.filter(p => p.system_id === sys.id);
                            return {
                                id: sys.id,
                                name: `${sys.name} (${sys.system_no || 'SYS'})`,
                                type: 'system',
                                rawSystem: sys,
                                children: systemParts.map(part => ({
                                    id: part.id,
                                    name: `${part.name} - Part #${part.spare_number || 'N/A'} (OEM: ${part.oem_part_no || '-'})`,
                                    type: 'part',
                                    rawPart: part
                                }))
                            };
                        })
                    };
                }).filter(g => g.children.length > 0); // Only show groups that have systems linked

                return {
                    id: dep.id,
                    name: dep.name,
                    type: 'department',
                    children: grps
                };
            }).filter(d => d.children.length > 0); // Only show departments with linked groups/systems

            setTreeData(list);
        } catch (err) {
            console.error('Error building hierarchy tree:', err);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchMasterDataLists();
    }, [profile?.company_id]);

    useEffect(() => {
        if (activeDirectoryTab === 'parts') {
            fetchSpareParts();
        } else if (activeDirectoryTab === 'systems') {
            fetchSystemsData();
        } else if (activeDirectoryTab === 'explorer') {
            buildHierarchyTree();
        }
    }, [activeDirectoryTab, partsPage, systemsPage, searchQuery, typeFilter, partsFilter, systemsFilter, sortBy, sortDirection, departments, equipmentGroups, allSystemsList]);

    // Handle Quick Scanners
    const handleScanSuccess = (decodedText) => {
        setSearchQuery(decodedText);
        setShowScanner(false);
    };

    // Toggle expand in tree
    const toggleNode = (nodeId) => {
        setExpandedNodes(prev => ({
            ...prev,
            [nodeId]: !prev[nodeId]
        }));
    };

    // Create master list records
    const handleAddMasterRecord = async (e) => {
        e.preventDefault();
        if (!masterInput.name) return toast.error('Name is required');

        setMasterSaving(true);
        const companyId = profile?.company_id;
        let res;

        switch (activeMasterSubTab) {
            case 'departments':
                res = await createDepartment(masterInput.name, companyId);
                break;
            case 'equipment_groups':
                res = await createEquipmentGroup(masterInput.name, companyId);
                break;
            case 'makers':
                res = await createMaker(masterInput.name, companyId);
                break;
            case 'models':
                if (!masterInput.parent_id) {
                    toast.error('Please select a Maker first.');
                    setMasterSaving(false);
                    return;
                }
                res = await createModel(masterInput.name, masterInput.parent_id, companyId);
                break;
            case 'assemblies':
                if (!masterInput.parent_id) {
                    toast.error('Please select a Model first.');
                    setMasterSaving(false);
                    return;
                }
                res = await createAssembly(masterInput.name, masterInput.parent_id, companyId);
                break;
            case 'warehouses':
                res = await createWarehouse(masterInput.name, masterInput.location, companyId);
                break;
            case 'units':
                if (!masterInput.symbol) {
                    toast.error('UOM Symbol is required (e.g. Pcs).');
                    setMasterSaving(false);
                    return;
                }
                res = await createUnit(masterInput.name, masterInput.symbol, companyId);
                break;
            default:
                break;
        }

        if (res && !res.error) {
            toast.success('Record added successfully!');
            setMasterInput({ name: '', location: '', symbol: '', parent_id: '' });
            fetchMasterDataLists();
        } else {
            toast.error('Failed to save record.');
        }
        setMasterSaving(false);
    };

    // Delete Systems
    const handleDeleteSystemRecord = async (sysId) => {
        if (window.confirm('Delete this system? This will unlink spare parts.')) {
            const { error } = await deleteSystem(sysId);
            if (!error) {
                toast.success('System deleted successfully');
                fetchSystemsData();
                fetchMasterDataLists();
            } else {
                toast.error('Failed to delete system');
            }
        }
    };

    // Delete Parts
    const handleDeletePartRecord = async (partId) => {
        if (window.confirm('Delete this spare part record?')) {
            const { error } = await deleteCatalogItem(partId);
            if (!error) {
                toast.success('Spare part deleted');
                fetchSpareParts();
            } else {
                toast.error('Delete failed');
            }
        }
    };

    // Print & Export Handlers
    const handleExportCSV = async () => {
        const { data, error } = await getAllCatalogItemsForExport();
        if (error || !data) {
            toast.error("Failed to export catalog");
            return;
        }

        const exportData = data.map(item => ({
            'Spare Number': item.spare_number || '',
            'Barcode': item.barcode || '',
            'OEM Part No': item.oem_part_no || '',
            'Mfr Part No': item.manufacturer_part_no || '',
            'Name': item.name,
            'Brand': item.brand || '',
            'Type': item.type,
            'Qty': item.quantity || 0,
            'Purchase Price': item.purchase_price || 0,
            'Selling Price': item.selling_price || 0,
            'Currency': item.currency || 'USD',
            'Warehouse Loc': item.stored_location || '',
            'Specification': item.specification || ''
        }));

        const csv = Papa.unparse(exportData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `spare_parts_catalog_${new Date().toISOString().split('T')[0]}.csv`);
        link.click();
    };

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
            {/* Redesigned Premium Glassmorphism Header */}
            <div className="page-header" style={{
                background: 'linear-gradient(135deg, rgba(26, 60, 99, 0.08) 0%, rgba(59, 130, 246, 0.04) 100%)',
                padding: '24px 32px',
                borderRadius: '20px',
                border: '1px solid rgba(226, 232, 240, 0.8)',
                marginBottom: '32px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                        onClick={() => navigate(-1)}
                        className="btn btn-secondary hide-on-print"
                        style={{ padding: '8px', minWidth: 'auto', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px' }}
                        title="Go Back"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div>
                        <h1 className="page-title" style={{ fontSize: '1.65rem', fontWeight: 850, color: '#1e293b', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Boxes size={28} color="#1a3c63" /> Marine Equipment & Spare Parts Hub
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px', fontWeight: 500 }}>
                            Hierarchical spare parts, vessel machinery systems, and master catalog inventory
                        </p>
                    </div>
                </div>
                
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }} className="hide-on-print">
                    <button className="btn btn-secondary" onClick={handleExportCSV} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                        <Download size={16} /> Export CSV
                    </button>
                    <button className="btn btn-secondary" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                        <Printer size={16} /> Print
                    </button>
                    <button className="btn btn-secondary" onClick={() => navigate('/catalog/labels')} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                        <QrCode size={16} /> Print Labels
                    </button>
                    
                    <button 
                        className="btn btn-primary" 
                        onClick={() => navigate('/catalog/system/new')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1e293b', borderColor: '#1e293b', fontWeight: 600 }}
                    >
                        <Plus size={18} /> New System
                    </button>
                    <button 
                        className="btn btn-primary" 
                        onClick={() => navigate('/catalog/new')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1a3c63', borderColor: '#1a3c63', fontWeight: 600 }}
                    >
                        <Plus size={18} /> New Spare Part
                    </button>
                </div>
            </div>

            {/* Global Parts Finder Banner */}
            <div style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                borderRadius: '16px',
                padding: '24px',
                color: '#fff',
                marginBottom: '32px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
                border: '1px solid rgba(255,255,255,0.05)'
            }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Globe size={18} color="#38bdf8" /> Global Marine Parts &amp; Intelligence Search
                </h3>
                <p style={{ margin: '0 0 16px 0', fontSize: '0.825rem', color: '#94a3b8' }}>
                    Search across external databases, suppliers, and Google to fetch datasheets, diagrams, and manufacturer specs.
                </p>
                
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
                        <input 
                            type="text" 
                            placeholder="Enter model, part name, or brand (e.g. Yanmar 6EY18AL piston)..."
                            value={globalSearchTerm}
                            onChange={(e) => setGlobalSearchTerm(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleGlobalSearch(); }}
                            style={{
                                width: '100%',
                                padding: '12px 16px',
                                borderRadius: '10px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(255,255,255,0.05)',
                                color: '#fff',
                                outline: 'none',
                                fontSize: '0.9rem',
                                transition: 'all 0.2s',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>
                    
                    <select 
                        value={globalSearchTarget}
                        onChange={(e) => setGlobalSearchTarget(e.target.value)}
                        style={{
                            padding: '12px 16px',
                            borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: '#1e293b',
                            color: '#fff',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            outline: 'none'
                        }}
                    >
                        <option value="google">Google Web</option>
                        <option value="images">Google Images</option>
                        <option value="pdf">PDF Manuals Only</option>
                        <option value="shipserv">ShipServ Directory</option>
                        <option value="sinor">Sinor Marine</option>
                    </select>
                    
                    <button 
                        onClick={handleGlobalSearch}
                        className="btn btn-primary"
                        style={{
                            padding: '12px 24px',
                            borderRadius: '10px',
                            background: '#38bdf8',
                            color: '#0f172a',
                            fontWeight: 700,
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Search size={16} /> Search Engine
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ borderBottom: '1px solid #e2e8f0', marginBottom: '32px' }} className="hide-on-print">
                <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                        { id: 'parts', label: 'Spare Parts & Services', icon: <Package size={18} /> },
                        { id: 'systems', label: 'Machinery Systems', icon: <Layers size={18} /> },
                        { id: 'explorer', label: 'Hierarchy Tree Explorer', icon: <BookOpen size={18} /> },
                        { id: 'master_data', label: 'Master Data Setup', icon: <Database size={18} /> }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            style={{
                                padding: '14px 28px',
                                background: activeDirectoryTab === tab.id ? '#ffffff' : 'transparent',
                                border: '1px solid',
                                borderColor: activeDirectoryTab === tab.id ? '#e2e8f0 #e2e8f0 transparent' : 'transparent',
                                borderRadius: '12px 12px 0 0',
                                fontWeight: 700,
                                fontSize: '0.92rem',
                                color: activeDirectoryTab === tab.id ? '#1a3c63' : '#64748b',
                                marginBottom: '-1px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'all 0.15s ease'
                            }}
                            className={activeDirectoryTab === tab.id ? 'active-tab-nav' : ''}
                            onClick={() => {
                                setActiveDirectoryTab(tab.id);
                                setSearchQuery('');
                            }}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Tabs Content */}
            {activeDirectoryTab === 'parts' && (
                <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '32px' }}>
                    {/* Advanced Sidebar Filter Panel */}
                    <div className="glass-panel hide-on-print" style={{ padding: '24px', alignSelf: 'start', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>
                            <Filter size={18} color="#1a3c63" /> Advanced Filters
                        </h3>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            {/* Search Form */}
                            <form onSubmit={(e) => { e.preventDefault(); setPartsPage(1); fetchSpareParts(); }} style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Search part name, OEM..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{ paddingRight: '36px', borderRadius: '10px', fontSize: '0.85rem' }}
                                />
                                <Search size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            </form>

                            <div>
                                <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Part Type</label>
                                <select className="form-select" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPartsPage(1); }} style={{ borderRadius: '10px', fontSize: '0.85rem' }}>
                                    <option value="">All Types</option>
                                    <option value="Supply Part">Supply Parts</option>
                                    <option value="Service">Services</option>
                                </select>
                            </div>

                            <div>
                                <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Department</label>
                                <select className="form-select" value={partsFilter.department_id} onChange={e => { setPartsFilter(prev => ({ ...prev, department_id: e.target.value })); setPartsPage(1); }} style={{ borderRadius: '10px', fontSize: '0.85rem' }}>
                                    <option value="">All Departments</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Equipment Group</label>
                                <select className="form-select" value={partsFilter.equipment_group_id} onChange={e => { setPartsFilter(prev => ({ ...prev, equipment_group_id: e.target.value })); setPartsPage(1); }} style={{ borderRadius: '10px', fontSize: '0.85rem' }}>
                                    <option value="">All Groups</option>
                                    {equipmentGroups.map(eg => <option key={eg.id} value={eg.id}>{eg.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Machinery System</label>
                                <select className="form-select" value={partsFilter.system_id} onChange={e => { setPartsFilter(prev => ({ ...prev, system_id: e.target.value })); setPartsPage(1); }} style={{ borderRadius: '10px', fontSize: '0.85rem' }}>
                                    <option value="">All Systems</option>
                                    {allSystemsList.map(s => <option key={s.id} value={s.id}>{s.name} ({s.system_no})</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Original Maker (Make)</label>
                                <select className="form-select" value={partsFilter.maker_id} onChange={e => { setPartsFilter(prev => ({ ...prev, maker_id: e.target.value })); setPartsPage(1); }} style={{ borderRadius: '10px', fontSize: '0.85rem' }}>
                                    <option value="">All Makers</option>
                                    {makers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Stock Alert</label>
                                <select className="form-select" value={partsFilter.stock_status} onChange={e => { setPartsFilter(prev => ({ ...prev, stock_status: e.target.value })); setPartsPage(1); }} style={{ borderRadius: '10px', fontSize: '0.85rem' }}>
                                    <option value="">All Stock Levels</option>
                                    <option value="in_stock">In Stock</option>
                                    <option value="low_stock">Low Stock Alerts</option>
                                    <option value="out_of_stock">Out of Stock</option>
                                    <option value="obsolete">Obsolete Parts</option>
                                </select>
                            </div>

                            <button 
                                className="btn btn-secondary btn-sm"
                                style={{ marginTop: '10px', width: '100%', borderRadius: '10px', fontWeight: 700 }}
                                onClick={() => {
                                    setPartsFilter({ department_id: '', equipment_group_id: '', system_id: '', maker_id: '', stock_status: '' });
                                    setTypeFilter('');
                                    setSearchQuery('');
                                }}
                            >
                                Reset Filters
                            </button>
                        </div>
                    </div>

                    {/* Spare Parts Grid / Table */}
                    <div className="glass-panel" style={{ padding: '24px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px' }}>
                            <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600, flexShrink: 0 }}>
                                Found {totalParts} spare parts / services
                            </div>
                            
                            <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Search by name, OEM, brand, barcode..."
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        setPartsPage(1);
                                    }}
                                    style={{
                                        paddingLeft: '36px',
                                        paddingRight: '36px',
                                        borderRadius: '10px',
                                        fontSize: '0.85rem',
                                        height: '38px',
                                        margin: 0,
                                        width: '100%',
                                        border: '1px solid #cbd5e1'
                                    }}
                                />
                                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                {searchQuery && (
                                    <button 
                                        type="button" 
                                        onClick={() => { setSearchQuery(''); setPartsPage(1); }} 
                                        style={{ 
                                            position: 'absolute', 
                                            right: '12px', 
                                            top: '50%', 
                                            transform: 'translateY(-50%)', 
                                            border: 'none', 
                                            background: 'transparent', 
                                            cursor: 'pointer',
                                            color: '#94a3b8',
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: 0
                                        }}
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Sort by:</span>
                                <select className="form-select" style={{ padding: '6px 12px', width: '180px', borderRadius: '8px', fontSize: '0.85rem' }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
                                    <option value="name">Part Name</option>
                                    <option value="spare_number">Spare Number</option>
                                    <option value="quantity">Stock Qty</option>
                                    <option value="selling_price">Selling Price</option>
                                    <option value="created_at">Date Added</option>
                                </select>
                            </div>
                        </div>

                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Spare No.</th>
                                        <th>Part Name</th>
                                        <th>OEM / Maker Part No.</th>
                                        <th>Brand</th>
                                        <th>System Location</th>
                                        <th>Qty</th>
                                        <th>Price</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan="9" style={{ textAlign: 'center', padding: '32px 0' }}><RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto' }} /></td>
                                        </tr>
                                    ) : parts.length === 0 ? (
                                        <tr>
                                            <td colSpan="9" style={{ textAlign: 'center', padding: '48px 0', color: '#64748b' }}>
                                                <AlertCircle size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                                                <div style={{ fontWeight: 600 }}>No Spare Parts Found</div>
                                                <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>Try adjusting your filter settings or search query.</div>
                                            </td>
                                        </tr>
                                    ) : (
                                        parts.map(part => (
                                            <tr key={part.id} className="table-row">
                                                <td style={{ fontWeight: 800, color: '#1a3c63' }}>#{part.spare_number || 'N/A'}</td>
                                                <td>
                                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{part.name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{part.specification?.substring(0, 50)}...</div>
                                                </td>
                                                <td>
                                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>OEM: {part.oem_part_no || '-'}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Mfr: {part.manufacturer_part_no || '-'}</div>
                                                </td>
                                                <td>
                                                    <span style={{ fontSize: '0.8rem', background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>
                                                        {part.brand || 'Original'}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '0.82rem' }}>
                                                    {part.stored_location ? (
                                                        <div>📍 {part.stored_location}</div>
                                                    ) : (
                                                        <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>Not specified</span>
                                                    )}
                                                </td>
                                                <td style={{ fontWeight: 700, color: part.quantity <= part.min_stock ? '#ef4444' : '#1e293b' }}>
                                                    {part.quantity || 0}
                                                </td>
                                                <td style={{ fontWeight: 600 }}>{part.selling_price ? `$${part.selling_price}` : '-'}</td>
                                                <td>
                                                    <span style={{ 
                                                        fontSize: '0.75rem', 
                                                        padding: '3px 8px', 
                                                        borderRadius: '20px', 
                                                        fontWeight: 700,
                                                        background: part.status === 'Active' ? '#ecfdf5' : part.status === 'Critical' ? '#fff1f2' : '#f1f5f9',
                                                        color: part.status === 'Active' ? '#15803d' : part.status === 'Critical' ? '#be123c' : '#475569'
                                                    }}>
                                                        {part.status || 'Active'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button className="btn btn-secondary btn-sm" style={{ padding: '6px' }} onClick={() => navigate(`/catalog/${part.id}`)} title="View / Edit Details">
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button className="btn btn-danger btn-sm" style={{ padding: '6px', background: '#fef2f2', color: '#ef4444', borderColor: '#fee2e2' }} onClick={() => handleDeletePartRecord(part.id)} title="Delete Part">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {!loading && totalPartsPages > 1 && (
                            <div className="pagination-container hide-on-print" style={{ marginTop: '20px' }}>
                                <div className="pagination-info" style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                    Showing {(partsPage - 1) * itemsPerPage + 1} to {Math.min(partsPage * itemsPerPage, totalParts)} of {totalParts} parts
                                </div>
                                <div className="pagination-controls">
                                    <button className="btn btn-secondary" style={{ padding: '6px 12px' }} disabled={partsPage === 1} onClick={() => setPartsPage(prev => prev - 1)}>
                                        <ChevronLeft size={16} /> Prev
                                    </button>
                                    <button className="btn btn-secondary" style={{ padding: '6px 12px' }} disabled={partsPage === totalPartsPages} onClick={() => setPartsPage(prev => prev + 1)}>
                                        Next <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeDirectoryTab === 'systems' && (
                <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '32px' }}>
                    {/* Systems Sidebar Filter Panel */}
                    <div className="glass-panel hide-on-print" style={{ padding: '24px', alignSelf: 'start', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>
                            <Filter size={18} color="#1a3c63" /> System Filters
                        </h3>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            <form onSubmit={(e) => { e.preventDefault(); setSystemsPage(1); fetchSystemsData(); }} style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Search System Name / No..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{ paddingRight: '36px', borderRadius: '10px', fontSize: '0.85rem' }}
                                />
                                <Search size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            </form>

                            <div>
                                <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Department</label>
                                <select className="form-select" value={systemsFilter.department_id} onChange={e => { setSystemsFilter(prev => ({ ...prev, department_id: e.target.value })); setSystemsPage(1); }} style={{ borderRadius: '10px', fontSize: '0.85rem' }}>
                                    <option value="">All Departments</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Equipment Group</label>
                                <select className="form-select" value={systemsFilter.equipment_group_id} onChange={e => { setSystemsFilter(prev => ({ ...prev, equipment_group_id: e.target.value })); setSystemsPage(1); }} style={{ borderRadius: '10px', fontSize: '0.85rem' }}>
                                    <option value="">All Groups</option>
                                    {equipmentGroups.map(eg => <option key={eg.id} value={eg.id}>{eg.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Maker (Manufacturer)</label>
                                <select className="form-select" value={systemsFilter.maker_id} onChange={e => { setSystemsFilter(prev => ({ ...prev, maker_id: e.target.value })); setSystemsPage(1); }} style={{ borderRadius: '10px', fontSize: '0.85rem' }}>
                                    <option value="">All Makers</option>
                                    {makers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </div>

                            <button 
                                className="btn btn-secondary btn-sm"
                                style={{ marginTop: '10px', width: '100%', borderRadius: '10px', fontWeight: 700 }}
                                onClick={() => {
                                    setSystemsFilter({ department_id: '', equipment_group_id: '', maker_id: '' });
                                    setSearchQuery('');
                                }}
                            >
                                Reset Filters
                            </button>
                        </div>
                    </div>

                    {/* Systems Grid List */}
                    <div className="glass-panel" style={{ padding: '24px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                        <div style={{ marginBottom: '20px', fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>
                            Found {totalSystems} machinery systems
                        </div>

                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>System ID</th>
                                        <th>System Name</th>
                                        <th>Department</th>
                                        <th>Equipment Group</th>
                                        <th>Maker / Make</th>
                                        <th>Model</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan="7" style={{ textAlign: 'center', padding: '32px 0' }}><RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto' }} /></td>
                                        </tr>
                                    ) : systems.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" style={{ textAlign: 'center', padding: '48px 0', color: '#64748b' }}>
                                                <AlertCircle size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                                                <div style={{ fontWeight: 600 }}>No Systems Configured</div>
                                                <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>Configure new machinery systems to map spare parts and manuals.</div>
                                            </td>
                                        </tr>
                                    ) : (
                                        systems.map(sys => (
                                            <tr key={sys.id} className="table-row">
                                                <td style={{ fontWeight: 800, color: '#1a3c63' }}>{sys.system_no || 'N/A'}</td>
                                                <td style={{ fontWeight: 700, color: '#1e293b' }}>{sys.name}</td>
                                                <td>{sys.department?.name || '-'}</td>
                                                <td>{sys.equipment_group?.name || '-'}</td>
                                                <td>
                                                    <span style={{ fontSize: '0.8rem', background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>
                                                        {sys.maker?.name || '-'}
                                                    </span>
                                                </td>
                                                <td style={{ fontWeight: 600 }}>{sys.model?.name || '-'}</td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button className="btn btn-secondary btn-sm" style={{ padding: '6px' }} onClick={() => navigate(`/catalog/system/${sys.id}`)} title="View System Details">
                                                            <Eye size={14} />
                                                        </button>
                                                        <button className="btn btn-danger btn-sm" style={{ padding: '6px', background: '#fef2f2', color: '#ef4444', borderColor: '#fee2e2' }} onClick={() => handleDeleteSystemRecord(sys.id)} title="Delete System">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeDirectoryTab === 'explorer' && (
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                    <div style={{ marginBottom: '24px' }}>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1a3c63', margin: 0 }}>Vessel Machinery Hierarchy Tree</h2>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>Department → Equipment Group → Machinery System → Assembly → Spare Parts</p>
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px' }}><RefreshCw className="animate-spin" size={32} style={{ margin: '0 auto' }} /></div>
                    ) : treeData.length === 0 ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                            <AlertCircle size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                            <div style={{ fontWeight: 600 }}>Hierarchy Data Missing</div>
                            <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>Ensure you have created Departments, Groups, Systems, and Spare Parts linked to those systems.</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {treeData.map(dep => (
                                <div key={dep.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                    {/* Department Node Header */}
                                    <div 
                                        onClick={() => toggleNode(dep.id)}
                                        style={{ background: '#f8fafc', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        {expandedNodes[dep.id] ? <ChevronDown size={18} color="#475569" /> : <ChevronRight size={18} color="#475569" />}
                                        <Building2 size={18} color="#1a3c63" />
                                        <span style={{ fontWeight: 800, color: '#1e293b' }}>{dep.name}</span>
                                        <span style={{ fontSize: '0.75rem', background: '#e2e8f0', padding: '2px 8px', borderRadius: '20px', fontWeight: 600, color: '#475569', marginLeft: 'auto' }}>
                                            {dep.children.length} Categories
                                        </span>
                                    </div>

                                    {/* Equipment Groups under Department */}
                                    {expandedNodes[dep.id] && (
                                        <div style={{ padding: '8px 24px', display: 'flex', flexDirection: 'column', gap: '8px', background: '#fff' }}>
                                            {dep.children.map(grp => (
                                                <div key={grp.id} style={{ borderLeft: '2px solid #cbd5e1', paddingLeft: '16px', margin: '4px 0' }}>
                                                    <div 
                                                        onClick={() => toggleNode(grp.id)}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', cursor: 'pointer', userSelect: 'none' }}
                                                    >
                                                        {expandedNodes[grp.id] ? <ChevronDown size={16} color="#64748b" /> : <ChevronRight size={16} color="#64748b" />}
                                                        <Folder size={16} color="#0369a1" />
                                                        <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.9rem' }}>{grp.name}</span>
                                                    </div>

                                                    {/* Systems under Group */}
                                                    {expandedNodes[grp.id] && (
                                                        <div style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                                                            {grp.children.map(sys => (
                                                                <div key={sys.id} style={{ borderLeft: '2px dashed #cbd5e1', paddingLeft: '16px', margin: '4px 0' }}>
                                                                    <div 
                                                                        onClick={() => toggleNode(sys.id)}
                                                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', cursor: 'pointer', userSelect: 'none' }}
                                                                    >
                                                                        {expandedNodes[sys.id] ? <ChevronDown size={14} color="#64748b" /> : <ChevronRight size={14} color="#64748b" />}
                                                                        <Layers size={14} color="#059669" />
                                                                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.85rem', textDecoration: 'underline' }} onClick={(e) => { e.stopPropagation(); navigate(`/catalog/system/${sys.id}`); }}>
                                                                            {sys.name}
                                                                        </span>
                                                                    </div>

                                                                    {/* Spare Parts under System */}
                                                                    {expandedNodes[sys.id] && (
                                                                        <div style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                                                            {sys.children.map(part => (
                                                                                <div 
                                                                                    key={part.id} 
                                                                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', fontSize: '0.8rem', color: '#475569', cursor: 'pointer' }}
                                                                                    onClick={() => navigate(`/catalog/${part.id}`)}
                                                                                >
                                                                                    <Tag size={12} color="#f59e0b" />
                                                                                    <span className="hover-underline">{part.name}</span>
                                                                                </div>
                                                                            ))}
                                                                            {sys.children.length === 0 && (
                                                                                <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic', padding: '4px 0' }}>No spare parts listed</span>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeDirectoryTab === 'master_data' && (
                <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '32px' }}>
                    {/* Master Tables Menu Navigation */}
                    <div className="glass-panel" style={{ padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0', alignSelf: 'start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {[
                                { id: 'departments', label: 'Departments', icon: <Building2 size={16} /> },
                                { id: 'equipment_groups', label: 'Equipment Groups', icon: <Folder size={16} /> },
                                { id: 'makers', label: 'Makers (Makes)', icon: <Layers size={16} /> },
                                { id: 'models', label: 'Models', icon: <BookOpen size={16} /> },
                                { id: 'assemblies', label: 'Assemblies', icon: <Tag size={16} /> },
                                { id: 'warehouses', label: 'Warehouses', icon: <WarehouseIcon size={16} /> },
                                { id: 'units', label: 'Units of Measure', icon: <FileCheck size={16} /> }
                            ].map(item => (
                                <button
                                    key={item.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        width: '100%',
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: activeMasterSubTab === item.id ? '#1a3c63' : 'transparent',
                                        color: activeMasterSubTab === item.id ? '#ffffff' : '#475569',
                                        fontWeight: 700,
                                        fontSize: '0.85rem',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'all 0.15s ease'
                                    }}
                                    onClick={() => {
                                        setActiveMasterSubTab(item.id);
                                        setMasterInput({ name: '', location: '', symbol: '', parent_id: '' });
                                    }}
                                >
                                    {item.icon} {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Master Form and Grid */}
                    <div className="glass-panel" style={{ padding: '28px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ textTransform: 'capitalize', fontSize: '1.25rem', fontWeight: 800, color: '#1a3c63', margin: '0 0 20px' }}>
                            {activeMasterSubTab.replace('_', ' ')} Registry
                        </h3>

                        {/* Inline Adding Form */}
                        <form onSubmit={handleAddMasterRecord} style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '28px' }}>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div className="form-group" style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}>
                                    <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>Name / Title *</label>
                                    <input 
                                        type="text" 
                                        className="form-input" 
                                        value={masterInput.name} 
                                        onChange={e => setMasterInput(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder={`e.g. New ${activeMasterSubTab.slice(0, -1)}`}
                                        required 
                                    />
                                </div>

                                {activeMasterSubTab === 'models' && (
                                    <div className="form-group" style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}>
                                        <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>Maker *</label>
                                        <select 
                                            className="form-select" 
                                            value={masterInput.parent_id} 
                                            onChange={e => setMasterInput(prev => ({ ...prev, parent_id: e.target.value }))}
                                            required
                                        >
                                            <option value="">Select Maker...</option>
                                            {makers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                    </div>
                                )}

                                {activeMasterSubTab === 'assemblies' && (
                                    <div className="form-group" style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}>
                                        <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>Equipment Model *</label>
                                        <select 
                                            className="form-select" 
                                            value={masterInput.parent_id} 
                                            onChange={e => setMasterInput(prev => ({ ...prev, parent_id: e.target.value }))}
                                            required
                                        >
                                            <option value="">Select Model...</option>
                                            {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.maker?.name})</option>)}
                                        </select>
                                    </div>
                                )}

                                {activeMasterSubTab === 'warehouses' && (
                                    <div className="form-group" style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}>
                                        <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>Address / Location</label>
                                        <input 
                                            type="text" 
                                            className="form-input" 
                                            value={masterInput.location} 
                                            onChange={e => setMasterInput(prev => ({ ...prev, location: e.target.value }))}
                                            placeholder="e.g. Tuas South, Singapore" 
                                        />
                                    </div>
                                )}

                                {activeMasterSubTab === 'units' && (
                                    <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                                        <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>UOM Symbol *</label>
                                        <input 
                                            type="text" 
                                            className="form-input" 
                                            value={masterInput.symbol} 
                                            onChange={e => setMasterInput(prev => ({ ...prev, symbol: e.target.value }))}
                                            placeholder="e.g. Pcs, Set, Box" 
                                            required
                                        />
                                    </div>
                                )}

                                <button type="submit" className="btn btn-primary" style={{ padding: '10px 24px', background: '#1a3c63', borderColor: '#1a3c63' }} disabled={masterSaving}>
                                    {masterSaving ? 'Saving...' : 'Add Record'}
                                </button>
                            </div>
                        </form>

                        {/* List Grid View */}
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        {activeMasterSubTab === 'models' && <th>Maker (Make)</th>}
                                        {activeMasterSubTab === 'assemblies' && <th>Model Link</th>}
                                        {activeMasterSubTab === 'warehouses' && <th>Location</th>}
                                        {activeMasterSubTab === 'units' && <th>UOM Symbol</th>}
                                        <th>Registered Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeMasterSubTab === 'departments' && departments.map(d => (
                                        <tr key={d.id}><td><strong>{d.name}</strong></td><td>{new Date(d.created_at).toLocaleDateString()}</td></tr>
                                    ))}
                                    {activeMasterSubTab === 'equipment_groups' && equipmentGroups.map(eg => (
                                        <tr key={eg.id}><td><strong>{eg.name}</strong></td><td>{new Date(eg.created_at).toLocaleDateString()}</td></tr>
                                    ))}
                                    {activeMasterSubTab === 'makers' && makers.map(m => (
                                        <tr key={m.id}><td><strong>{m.name}</strong></td><td>{new Date(m.created_at).toLocaleDateString()}</td></tr>
                                    ))}
                                    {activeMasterSubTab === 'models' && models.map(md => (
                                        <tr key={md.id}><td><strong>{md.name}</strong></td><td>{md.maker?.name || '-'}</td><td>{new Date(md.created_at).toLocaleDateString()}</td></tr>
                                    ))}
                                    {activeMasterSubTab === 'assemblies' && assemblies.map(a => (
                                        <tr key={a.id}><td><strong>{a.name}</strong></td><td>{a.model?.name || '-'}</td><td>{new Date(a.created_at).toLocaleDateString()}</td></tr>
                                    ))}
                                    {activeMasterSubTab === 'warehouses' && warehouses.map(w => (
                                        <tr key={w.id}><td><strong>{w.name}</strong></td><td>{w.location || '-'}</td><td>{new Date(w.created_at).toLocaleDateString()}</td></tr>
                                    ))}
                                    {activeMasterSubTab === 'units' && units.map(u => (
                                        <tr key={u.id}><td><strong>{u.name}</strong></td><td><span style={{ fontWeight: 600, color: 'var(--accent)' }}>{u.symbol}</span></td><td>{new Date(u.created_at).toLocaleDateString()}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            <ScannerModal
                isOpen={showScanner}
                onClose={() => setShowScanner(false)}
                onScanSuccess={handleScanSuccess}
            />
        </div>
    );
};

// Fallback warehouse icon
const WarehouseIcon = ({ size }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-warehouse">
        <path d="M22 22H2" />
        <path d="M6 22V9a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v13" />
        <path d="M10 22v-5a2 2 0 0 1 4 0v5" />
    </svg>
);

export default CatalogDirectory;
