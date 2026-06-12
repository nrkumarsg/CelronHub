import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { 
    Calculator, Calendar, Download, Filter, 
    ArrowUpRight, ArrowDownLeft, Receipt, 
    FileText, Search, ChevronRight, Briefcase,
    Plus, Upload, ExternalLink, X, FileCheck, Check, Loader2, Info,
    ArrowLeft
} from 'lucide-react';
import { getPartners, uploadFile, getDocumentSettings } from '../lib/store';
import { Modal, QuickExpenseAdd } from '../components/workflow/QuickAddForms';
import { saveJobExpense } from '../lib/jobExpenseService';
import GstF5Form from '../components/workflow/GstF5Form';

export default function GstReporting() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('sales'); // 'sales' | 'purchases' | 'filing'
    const [documents, setDocuments] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [partners, setPartners] = useState([]);
    const [jobMap, setJobMap] = useState({}); // mapping of job_no -> doc_id
    const [jobs, setJobs] = useState([]);
    const [settings, setSettings] = useState(null);
    
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedQuarter, setSelectedQuarter] = useState(() => {
        const month = new Date().getMonth();
        if (month < 3) return 1;
        if (month < 6) return 2;
        if (month < 9) return 3;
        return 4;
    });

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importData, setImportData] = useState([]);

    useEffect(() => {
        if (profile?.company_id) {
            fetchGstData();
            fetchPartners();
            fetchSettings();
        }
    }, [profile, selectedYear, selectedQuarter]);

    const fetchSettings = async () => {
        const data = await getDocumentSettings(profile.company_id);
        if (data) setSettings(data);
    };

    const fetchPartners = async () => {
        const { data } = await getPartners(profile.company_id);
        if (data) setPartners(data);
    };

    const fetchGstData = async () => {
        setLoading(true);
        try {
            // Fetch all workflow documents
            const [docsRes, expRes, jobsRes] = await Promise.all([
                supabase
                    .from('workflow_documents')
                    .select('*')
                    .eq('company_id', profile.company_id)
                    .in('document_type', ['Tax Invoice', 'Proforma Invoice', 'Purchase Order'])
                    .order('issue_date', { ascending: false }),
                supabase
                    .from('job_expenses')
                    .select('*')
                    .eq('company_id', profile.company_id)
                    .order('invoice_date', { ascending: false }),
                supabase
                    .from('workflow_documents')
                    .select('id, document_no')
                    .eq('company_id', profile.company_id)
                    .eq('document_type', 'Job')
            ]);

            if (docsRes.error) throw docsRes.error;
            if (expRes.error) throw expRes.error;

            const docs = docsRes.data || [];
            const expenses = expRes.data || [];

            // Combine all partner IDs from both documents and expenses to fetch in a single query
            const allPartnerIds = [
                ...new Set([
                    ...docs.map(d => d.partner_id),
                    ...expenses.map(e => e.supplier_id)
                ].filter(Boolean))
            ];

            if (allPartnerIds.length > 0) {
                const { data: partnersData, error: pError } = await supabase
                    .from('partners')
                    .select('id, name')
                    .in('id', allPartnerIds);

                if (!pError && partnersData) {
                    const partnerMap = Object.fromEntries(partnersData.map(p => [p.id, p]));
                    
                    docs.forEach(d => {
                        if (d.partner_id) {
                            d.partners = partnerMap[d.partner_id];
                        }
                    });

                    expenses.forEach(e => {
                        if (e.supplier_id) {
                            e.partner = partnerMap[e.supplier_id];
                        }
                    });
                }
            }

            setDocuments(docs);
            setExpenses(expenses);
            setJobs(jobsRes.data || []);
            
            // Create job number -> ID map
            const jm = {};
            jobsRes.data?.forEach(j => {
                jm[j.document_no] = j.id;
            });
            setJobMap(jm);

        } catch (err) {
            console.error('Error fetching GST data:', err);
        } finally {
            setLoading(false);
        }
    };

    const getQuarterRange = (year, quarter) => {
        const startMonths = [null, '01-01', '04-01', '07-01', '10-01'];
        const endMonths = [null, '03-31', '06-30', '09-30', '12-31'];
        return {
            start: `${year}-${startMonths[quarter]}`,
            end: `${year}-${endMonths[quarter]}`
        };
    };

    const range = getQuarterRange(selectedYear, selectedQuarter);

    // Sales: Tax Invoices + Proforma Invoices (if no Tax Invoice exists for that job)
    const salesDocs = (documents || []).filter(doc => {
        if (!doc || !doc.issue_date) return false;
        
        // Timezone-safe year and quarter check
        const parts = doc.issue_date.split('T')[0].split('-');
        if (parts.length < 3) return false;
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const quarter = Math.floor(month / 3) + 1;
        
        const inRange = year === selectedYear && quarter === selectedQuarter;
        if (!inRange) return false;

        if (doc.document_type === 'Tax Invoice') {
            return !!doc.document_no;
        }

        if (doc.document_type === 'Proforma Invoice') {
            // Only include Proforma if there is NO Tax Invoice for this job in the entire documents list
            // (or if it's a direct Proforma Invoice with no job)
            const hasTaxInvoice = doc.assigned_job_no ? documents.some(d => 
                d.document_type === 'Tax Invoice' && 
                d.assigned_job_no === doc.assigned_job_no
            ) : false;
            return doc.document_no && !hasTaxInvoice;
        }

        return false;
    });

    // Purchases: Only from Account payable module (job_expenses)
    const purchaseDocs = (expenses || [])
        .filter(e => e.status !== 'Pending Approval')
        .map(e => ({
            id: e.id,
            type: 'Bill/Expense',
            doc_no: e.invoice_no || 'Bill',
            job_no: e.job_no || '', 
            date: e.invoice_date,
            partner_name: e.partner?.name || e.supplier_name || 'Unknown',
            subtotal: e.amount || 0,
            tax: e.gst_amount || 0,
            total: e.grand_total || 0,
            currency: 'SGD',
            link: e.job_id ? `/workflows/editor/Job/${e.job_id}` : null
        }))
        .filter(d => {
            if (!d || !d.date) return false;
            // Parse in a timezone-safe way by splitting YYYY-MM-DD
            const parts = d.date.split('T')[0].split('-');
            if (parts.length < 3) return false;
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const quarter = Math.floor(month / 3) + 1;
            return year === selectedYear && quarter === selectedQuarter;
        });

    const outputGst = salesDocs.reduce((sum, d) => sum + (parseFloat(d.tax_amount) || 0), 0);
    const inputGst = purchaseDocs.reduce((sum, d) => sum + (parseFloat(d.tax) || 0), 0);
    const netPayable = outputGst - inputGst;

    // IRAS F5 Form Calculations
    const box1 = salesDocs.filter(d => (parseFloat(d.tax_amount) || 0) > 0).reduce((sum, d) => sum + (parseFloat(d.subtotal) || 0), 0);
    const box2 = salesDocs.filter(d => (parseFloat(d.tax_amount) || 0) === 0).reduce((sum, d) => sum + (parseFloat(d.subtotal) || 0), 0);
    const box3 = 0; // Assume 0 for exempt unless specified
    const box4 = box1 + box2 + box3;
    const box5 = purchaseDocs.reduce((sum, d) => sum + (parseFloat(d.subtotal) || 0), 0);
    const box6 = outputGst;
    const box7 = inputGst;
    const box8 = netPayable;
    const box13 = box4;

    const irasCalculations = {
        box1, box2, box3, box4, box5, box6, box7, box8, box9: 0, box13
    };

    const getDueDate = (year, quarter) => {
        const dueDates = [null, 'Apr 30', 'Jul 31', 'Oct 31', 'Jan 31'];
        const dueYear = quarter === 4 ? year + 1 : year;
        return `${dueDates[quarter]}, ${dueYear}`;
    };

    const irasPeriodData = {
        start: range.start,
        end: range.end,
        dueDate: getDueDate(selectedYear, selectedQuarter)
    };

    const handleBillUpload = async (file) => {
        try {
            const url = await uploadFile('company_assets', 'vouchers', file, { maxWidth: 1200 });
            return url;
        } catch (err) {
            console.error('Bill upload failed:', err);
            throw err;
        }
    };

    const handleExportCSV = () => {
        const isSales = activeTab === 'sales';
        const data = isSales ? salesDocs : purchaseDocs;
        
        const headers = isSales 
            ? ['Type', 'Doc No', 'Job No', 'Date', 'Customer', 'Currency', 'Subtotal', 'GST', 'Total']
            : ['Type', 'Doc No', 'Job No', 'Date', 'Supplier', 'Currency', 'Subtotal', 'GST', 'Total'];

        const rows = data.map(d => isSales ? [
            d.document_type, d.document_no, d.assigned_job_no, d.issue_date, d.partners?.name, d.currency, d.subtotal, d.tax_amount, d.total_amount
        ] : [
            d.type, d.doc_no, d.job_no, d.date, d.partner_name, d.currency, d.subtotal, d.tax, d.total
        ]);

        const csvContent = [headers, ...rows].map(e => e.map(val => `"${(val || '').toString().replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `GST_${activeTab}_${selectedYear}_Q${selectedQuarter}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const content = evt.target.result;
            const lines = content.split('\n').filter(l => l.trim());
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            
            const parsed = lines.slice(1).map(line => {
                const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
                const obj = {};
                headers.forEach((h, i) => obj[h] = values[i]);
                return obj;
            });
            setImportData(parsed);
        };
        reader.readAsText(file);
    };

    const processImport = async () => {
        if (importData.length === 0) return;
        setLoading(true);
        try {
            const toInsert = importData.map(row => {
                // Heuristic mapping for job_expenses
                // Expected headers: Date, Supplier, Invoice No, Job No, Subtotal, GST, Total
                const supplier = partners.find(p => p.name.toLowerCase() === (row.Supplier || row.Partner || '').toLowerCase());
                
                return {
                    company_id: profile.company_id,
                    invoice_date: row.Date || new Date().toISOString().split('T')[0],
                    supplier_id: supplier?.id || null,
                    invoice_no: row['Invoice No'] || row['Doc No'] || '',
                    job_no: row['Job No'] || '',
                    description: row.Description || 'Imported Expense',
                    unit_price: parseFloat(row.Subtotal || row.Amount || 0),
                    quantity: 1,
                    gst_rate: 9,
                    gst_amount: parseFloat(row.GST || row.Tax || 0),
                    grand_total: parseFloat(row.Total || row.Amount || 0),
                    category: 'Imported'
                };
            });

            const { error } = await supabase.from('job_expenses').insert(toInsert);
            if (error) throw error;
            
            alert(`Imported ${toInsert.length} records successfully.`);
            setIsImportModalOpen(false);
            setImportData([]);
            fetchGstData();
        } catch (err) {
            console.error('Import error:', err);
            alert('Failed to import CSV. Check console for details.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button 
                        onClick={() => navigate('/accounts/bills')} 
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            padding: '10px', 
                            background: '#fff', 
                            border: '1px solid #e2e8f0', 
                            borderRadius: '12px', 
                            color: '#64748b', 
                            cursor: 'pointer', 
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)', 
                            transition: 'all 0.2s' 
                        }}
                        onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseOut={e => e.currentTarget.style.background = '#fff'}
                        title="Back to Accounts Payable"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 className="page-title" style={{ margin: 0 }}>GST Reporting Dashboard</h1>
                        <p style={{ color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
                            Quarterly GST summary for IRAS compliance and company finance.
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-secondary" onClick={() => setIsImportModalOpen(true)}>
                        <Upload size={18} /> Import CSV
                    </button>
                    <button className="btn btn-secondary" onClick={handleExportCSV}>
                        <Download size={18} /> Export CSV
                    </button>
                    {activeTab === 'purchases' && (
                        <button className="btn btn-primary" onClick={() => setIsAddModalOpen(true)}>
                            <Plus size={18} /> Add Bill/Voucher
                        </button>
                    )}
                </div>
            </header>

            {/* Quick Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '32px' }}>
                <div className={`glass-panel ${activeTab === 'sales' ? 'active-card' : ''}`} 
                    onClick={() => setActiveTab('sales')}
                    style={{ background: '#f0f9ff', border: '1px solid #bae6fd', cursor: 'pointer', transition: 'all 0.2s', boxShadow: activeTab === 'sales' ? '0 8px 30px rgba(2, 132, 199, 0.15)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <p style={{ color: '#0369a1', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Output GST (Sales)</p>
                            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0c4a6e', margin: 0 }}>SGD {outputGst.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h2>
                            <p style={{ fontSize: '0.8rem', color: '#0ea5e9', marginTop: '4px' }}>{salesDocs.length} Transactions</p>
                        </div>
                        <div style={{ background: '#e0f2fe', padding: '10px', borderRadius: '12px' }}>
                            <ArrowUpRight size={24} color="#0284c7" />
                        </div>
                    </div>
                </div>

                <div className={`glass-panel ${activeTab === 'purchases' ? 'active-card' : ''}`} 
                    onClick={() => setActiveTab('purchases')}
                    style={{ background: '#fff7ed', border: '1px solid #fed7aa', cursor: 'pointer', transition: 'all 0.2s', boxShadow: activeTab === 'purchases' ? '0 8px 30px rgba(234, 88, 12, 0.15)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <p style={{ color: '#9a3412', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Input GST (Purchases)</p>
                            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#7c2d12', margin: 0 }}>SGD {inputGst.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h2>
                            <p style={{ fontSize: '0.8rem', color: '#f97316', marginTop: '4px' }}>{purchaseDocs.length} Transactions</p>
                        </div>
                        <div style={{ background: '#ffedd5', padding: '10px', borderRadius: '12px' }}>
                            <ArrowDownLeft size={24} color="#ea580c" />
                        </div>
                    </div>
                </div>

                <div className="glass-panel" style={{ 
                    background: netPayable >= 0 ? '#f0fdf4' : '#fef2f2', 
                    border: `1px solid ${netPayable >= 0 ? '#bbf7d0' : '#fecaca'}` 
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <p style={{ color: netPayable >= 0 ? '#15803d' : '#991b1b', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>
                                {netPayable >= 0 ? 'Net GST Payable' : 'GST Claimable'}
                            </p>
                            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: netPayable >= 0 ? '#14532d' : '#7f1d1d', margin: 0 }}>
                                SGD {Math.abs(netPayable).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </h2>
                            <p style={{ fontSize: '0.8rem', color: netPayable >= 0 ? '#22c55e' : '#ef4444', marginTop: '4px' }}>
                                Estimated IRAS Filing
                            </p>
                        </div>
                        <div style={{ background: netPayable >= 0 ? '#dcfce7' : '#fee2e2', padding: '10px', borderRadius: '12px' }}>
                            <Calculator size={24} color={netPayable >= 0 ? '#16a34a' : '#dc2626'} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs & Filters */}
            <div className="glass-panel" style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '32px' }}>
                        <button 
                            className={`tab-btn ${activeTab === 'sales' ? 'active' : ''}`}
                            onClick={() => setActiveTab('sales')}
                        >
                            Sales (Output)
                        </button>
                        <button 
                            className={`tab-btn ${activeTab === 'purchases' ? 'active' : ''}`}
                            onClick={() => setActiveTab('purchases')}
                        >
                            Purchases (Input)
                        </button>
                        <button 
                            className={`tab-btn ${activeTab === 'filing' ? 'active' : ''}`}
                            onClick={() => setActiveTab('filing')}
                        >
                            Filing Form
                        </button>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <select 
                            className="form-select-sm" 
                            value={selectedYear} 
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        >
                            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
                            {[1, 2, 3, 4].map(q => (
                                <button 
                                    key={q}
                                    className={`q-btn ${selectedQuarter === q ? 'active' : ''}`}
                                    onClick={() => setSelectedQuarter(q)}
                                >
                                    Q{q}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {activeTab === 'filing' ? (
                    <div className="animate-fade-in" style={{ padding: '20px 0' }}>
                        <GstF5Form 
                            companyData={settings}
                            periodData={irasPeriodData}
                            calculations={irasCalculations}
                            onSave={() => alert('Filing draft saved successfully.')}
                            onSubmit={() => alert('Filing submitted to simulation. In production this would connect to IRAS CorpPass API.')}
                        />
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Doc No</th>
                                    <th>Job No</th>
                                    <th>Date</th>
                                    <th>{activeTab === 'sales' ? 'Customer' : 'Supplier'}</th>
                                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                                    <th style={{ textAlign: 'right' }}>GST</th>
                                    <th style={{ textAlign: 'right' }}>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px' }}>Syncing GST records...</td></tr>
                                ) : (activeTab === 'sales' ? salesDocs : purchaseDocs).length === 0 ? (
                                    <tr>
                                        <td colSpan="8" style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>
                                            <Receipt size={48} style={{ margin: '0 auto 16px', opacity: 0.1 }} />
                                            <p>No records found for this period.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    (activeTab === 'sales' ? salesDocs : purchaseDocs).map(d => (
                                        <tr key={d.id} className="table-row">
                                            <td>
                                                <span style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: '6px', 
                                                    fontSize: '0.7rem', 
                                                    fontWeight: 800,
                                                    color: activeTab === 'sales' ? '#0284c7' : '#ea580c'
                                                }}>
                                                    {activeTab === 'sales' ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                                                    {(activeTab === 'sales' ? d.document_type : d.type).toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="font-bold">
                                                <a href={activeTab === 'sales' ? `/workflows/editor/${d.document_type}/${d.id}` : d.link} 
                                                   className="doc-link">
                                                    {activeTab === 'sales' ? d.document_no : d.doc_no}
                                                    <ExternalLink size={12} style={{ marginLeft: '4px', opacity: 0.5 }} />
                                                </a>
                                            </td>
                                            <td>
                                                {activeTab === 'sales' ? (
                                                    d.assigned_job_no ? (
                                                        <a href={jobMap[d.assigned_job_no] ? `/workflows/editor/Job/${jobMap[d.assigned_job_no]}` : '#'} 
                                                           className="job-link">
                                                            <Briefcase size={12} /> {d.assigned_job_no}
                                                        </a>
                                                    ) : '-'
                                                ) : (
                                                    d.job_no ? (
                                                        <a href={jobMap[d.job_no] ? `/workflows/editor/Job/${jobMap[d.job_no]}` : '#'} 
                                                           className="job-link">
                                                            <Briefcase size={12} /> {d.job_no}
                                                        </a>
                                                    ) : '-'
                                                )}
                                            </td>
                                            <td>{activeTab === 'sales' ? d.issue_date : d.date}</td>
                                            <td style={{ fontWeight: 500 }}>{activeTab === 'sales' ? (d.partners?.name || 'Walk-in') : d.partner_name}</td>
                                            <td style={{ textAlign: 'right' }}>{(activeTab === 'sales' ? d.currency : d.currency)} {(activeTab === 'sales' ? d.subtotal : d.subtotal)?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            <td style={{ textAlign: 'right', color: activeTab === 'sales' ? '#0369a1' : '#9a3412', fontWeight: 600 }}>
                                                {(activeTab === 'sales' ? d.currency : d.currency)} {(activeTab === 'sales' ? d.tax_amount : d.tax)?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 800 }}>{(activeTab === 'sales' ? d.currency : d.currency)} {(activeTab === 'sales' ? d.total_amount : d.total)?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Quick Add Modal */}
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Quick Add Bill/Voucher" icon={Plus} size="xl">
                <QuickExpenseAdd 
                    company_id={profile?.company_id}
                    partners={partners}
                    jobs={jobs}
                    onSuccess={() => {
                        setIsAddModalOpen(false);
                        fetchGstData();
                    }}
                    onCancel={() => setIsAddModalOpen(false)}
                    onUploadBill={handleBillUpload}
                />
            </Modal>

            {/* Import Modal */}
            <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Import GST Data (CSV)" icon={Upload}>
                <div style={{ padding: '20px' }}>
                    <p style={{ marginBottom: '20px', color: '#64748b', fontSize: '0.9rem' }}>
                        Upload a CSV file to bulk import purchase records. Required headers: <strong>Date, Supplier, Doc No, Job No, Subtotal, GST, Total</strong>.
                    </p>
                    <input type="file" accept=".csv" onChange={handleFileUpload} style={{ marginBottom: '20px', display: 'block' }} />
                    
                    {importData.length > 0 && (
                        <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '20px' }}>
                            <table style={{ width: '100%', fontSize: '0.8rem' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#f8fafc' }}>
                                    <tr>{Object.keys(importData[0]).map(k => <th key={k}>{k}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {importData.map((r, i) => (
                                        <tr key={i}>{Object.values(r).map((v, j) => <td key={j}>{v}</td>)}</tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="quick-form-actions">
                        <button className="btn btn-secondary" onClick={() => { setIsImportModalOpen(false); setImportData([]); }}>Cancel</button>
                        <button className="btn btn-primary" onClick={processImport} disabled={loading || importData.length === 0}>
                            {loading ? <Loader2 className="animate-spin" /> : <FileCheck size={18} />} Import {importData.length} Records
                        </button>
                    </div>
                </div>
            </Modal>

            <style>{`
                .tab-btn {
                    background: transparent;
                    border: none;
                    padding: 8px 0;
                    font-weight: 700;
                    color: #94a3b8;
                    cursor: pointer;
                    position: relative;
                    font-size: 0.95rem;
                    transition: all 0.2s;
                }
                .tab-btn.active {
                    color: var(--accent);
                }
                .tab-btn.active::after {
                    content: '';
                    position: absolute;
                    bottom: -16px;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: var(--accent);
                    border-radius: 3px;
                }
                .q-btn {
                    background: transparent;
                    border: none;
                    padding: 6px 16px;
                    border-radius: 8px;
                    font-weight: 700;
                    color: #64748b;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-size: 0.85rem;
                }
                .q-btn.active {
                    background: #fff;
                    color: var(--accent);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }
                .doc-link, .job-link {
                    color: var(--accent);
                    text-decoration: none;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-weight: 600;
                }
                .job-link {
                    color: #4f46e5;
                }
                .doc-link:hover, .job-link:hover {
                    text-decoration: underline;
                }
                .form-select-sm {
                    padding: 8px 12px;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                    font-weight: 600;
                    font-size: 0.85rem;
                    background: #fff;
                }
            `}</style>
        </div>
    );
}
