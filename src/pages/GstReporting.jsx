import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { 
    Calculator, Calendar, Download, Filter, 
    ArrowUpRight, ArrowDownLeft, Receipt, 
    FileText, Search, ChevronRight, Briefcase,
    Plus, Upload, ExternalLink, X, FileCheck, Check, Loader2, Info,
    ArrowLeft, Folder, Link as LinkIcon, Copy, AlertCircle, FileSpreadsheet, Eye
} from 'lucide-react';
import { getPartners, uploadFile, getDocumentSettings } from '../lib/store';
import { Modal, QuickExpenseAdd } from '../components/workflow/QuickAddForms';
import { saveJobExpense } from '../lib/jobExpenseService';
import GstF5Form from '../components/workflow/GstF5Form';
import Papa from 'papaparse';

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

    // Google Drive Workout & Audit Reference state
    const [gdriveUrl, setGdriveUrl] = useState('');
    const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
    const [tempDriveUrl, setTempDriveUrl] = useState('');
    const [copiedClaudeSummary, setCopiedClaudeSummary] = useState(false);

    useEffect(() => {
        if (profile?.company_id) {
            fetchGstData();
            fetchPartners();
            fetchSettings();
        }
    }, [profile?.company_id, selectedYear, selectedQuarter]);

    // Load saved Google Drive link for this year & quarter
    useEffect(() => {
        const companyKey = profile?.company_id || 'celron';
        const storageKey = `gst_gdrive_folder_${companyKey}_${selectedYear}_Q${selectedQuarter}`;
        const saved = localStorage.getItem(storageKey) || '';
        setGdriveUrl(saved);
        setTempDriveUrl(saved);
    }, [profile?.company_id, selectedYear, selectedQuarter]);

    const handleSaveDriveLink = (url) => {
        const companyKey = profile?.company_id || 'celron';
        const storageKey = `gst_gdrive_folder_${companyKey}_${selectedYear}_Q${selectedQuarter}`;
        const cleanUrl = url.trim();
        localStorage.setItem(storageKey, cleanUrl);
        setGdriveUrl(cleanUrl);
        setIsDriveModalOpen(false);
    };

    const handleOpenDriveFolder = () => {
        if (!gdriveUrl) {
            setIsDriveModalOpen(true);
            return;
        }
        let url = gdriveUrl.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = `https://drive.google.com/drive/folders/${url}`;
        }
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const fetchSettings = async () => {
        const data = await getDocumentSettings(profile.company_id);
        if (data) setSettings(data);
    };

    const fetchPartners = async () => {
        const data = await getPartners(profile);
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
                    .select('id, document_no, drive_folder_id, gdrive_folder_id')
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

    const generateClaudeSummaryText = () => {
        return `=====================================================
CEL-RON ENTERPRISES PTE LTD
GST RETURN WORKOUT & AUDIT SUMMARY (IRAS FORM F5)
=====================================================
Period Covered: ${irasPeriodData.start} to ${irasPeriodData.end}
Year: ${selectedYear} | Quarter: Q${selectedQuarter}
GST Reg No (UEN): ${settings?.gst_uen || '201436227C'}
IRAS Due Date: ${irasPeriodData.dueDate}

--- SUPPLIES (SALES RECONCILIATION) ---
[Box 1] Total value of standard-rated supplies: SGD ${box1.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
[Box 2] Total value of zero-rated supplies:     SGD ${box2.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
[Box 3] Total value of exempt supplies:         SGD ${box3.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
[Box 4] Total value of (1) + (2) + (3):         SGD ${box4.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Total Sales Transactions: ${salesDocs.length}

--- PURCHASES (INPUT TAX RECONCILIATION) ---
[Box 5] Total value of taxable purchases:       SGD ${box5.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Total Purchase Transactions: ${purchaseDocs.length}

--- TAXES TO BE PAID / CLAIMED ---
[Box 6] Output tax due:                         SGD ${box6.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
[Box 7] Less: Input tax and refunds claimed:    SGD ${box7.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
[Box 8] Equals: Net GST to be paid to IRAS:     SGD ${box8.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

--- ATTACHED WORKOUT FILES IN GOOGLE DRIVE ---
1. GST Sales CSV: GST_sales_${selectedYear}_Q${selectedQuarter}.csv
2. Bank Statements (DBS/OCBC/UOB): Reconciled against total inflows.
3. Supplier Bills & Taxable Purchases.
4. Claude Workout & Audit Details Notes.
Google Drive Link: ${gdriveUrl || '(Google Drive link can be attached directly in CelronHub)'}
Prepared with Claude & CelronHub GST Reporting Engine.`;
    };

    const handleCopyClaudeSummary = () => {
        const text = generateClaudeSummaryText();
        navigator.clipboard.writeText(text);
        setCopiedClaudeSummary(true);
        setTimeout(() => setCopiedClaudeSummary(false), 2500);
    };

    const handleDownloadClaudeSummary = () => {
        const text = generateClaudeSummaryText();
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Claude_GST_Workout_${selectedYear}_Q${selectedQuarter}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.data && results.data.length > 0) {
                    setImportData(results.data);
                } else {
                    alert('No records found in CSV file.');
                }
            },
            error: (err) => {
                console.error('CSV parse error:', err);
                alert('Failed to parse CSV file: ' + err.message);
            }
        });
    };

    const processImport = async () => {
        if (importData.length === 0) return;
        setLoading(true);
        try {
            const toInsert = importData.map(row => {
                const rawSupplier = (row['Supplier'] || row['Supplier Name'] || row['Partner'] || row['supplier'] || 'Unknown').trim();
                const matchedPartner = partners?.find(p => 
                    p.name?.toLowerCase().trim() === rawSupplier.toLowerCase() ||
                    (p.registration_no && rawSupplier.toLowerCase().includes(p.registration_no.toLowerCase()))
                );

                const cleanNum = (val) => {
                    if (!val) return 0;
                    const cleaned = String(val).replace(/[^0-9.-]+/g, '');
                    return parseFloat(cleaned) || 0;
                };

                const subtotal = cleanNum(row['Subtotal'] || row['Amount'] || row['subtotal']);
                const gst = cleanNum(row['GST'] || row['Tax'] || row['gst']);
                const total = cleanNum(row['Total'] || row['Grand Total'] || row['total']) || (subtotal + gst);
                
                const docNo = (row['Doc No'] || row['Invoice No'] || row['DocNo'] || row['doc_no'] || '').trim();
                const jobNo = (row['Job No'] || row['JobNo'] || row['job_no'] || '').trim();
                const matchedJobId = jobNo && jobMap ? jobMap[jobNo] : null;

                // Match exact columns of job_expenses table in Supabase
                return {
                    company_id: profile?.company_id,
                    invoice_date: row['Date'] || row['Invoice Date'] || new Date().toISOString().split('T')[0],
                    supplier_id: matchedPartner?.id || null,
                    supplier_name: rawSupplier,
                    invoice_no: docNo,
                    job_id: matchedJobId || null,
                    description: [
                        row['Description'] || row['Type'] || `Purchase Bill - ${docNo || rawSupplier}`,
                        jobNo ? `Job ${jobNo}` : ''
                    ].filter(Boolean).join(' - ').trim(),
                    amount: subtotal,
                    gst_rate: subtotal > 0 && gst > 0 ? Math.round((gst / subtotal) * 100) : 9,
                    gst_amount: gst,
                    grand_total: total,
                    status: 'Paid'
                };
            });

            // Batch insert in chunks of 50 to ensure reliable network transfer
            const chunkSize = 50;
            for (let i = 0; i < toInsert.length; i += chunkSize) {
                const chunk = toInsert.slice(i, i + chunkSize);
                const { error } = await supabase.from('job_expenses').insert(chunk);
                if (error) {
                    console.error('Supabase insert error:', error);
                    throw new Error(error.message + (error.details ? ` (${error.details})` : ''));
                }
            }
            
            alert(`Imported ${toInsert.length} purchase records successfully.`);
            setIsImportModalOpen(false);
            setImportData([]);
            setActiveTab('purchases');
            await fetchGstData();
        } catch (err) {
            console.error('Import error:', err);
            alert(`Failed to import CSV: ${err?.message || err}${err?.details ? ' – ' + err.details : ''}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
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
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button 
                        className="btn" 
                        onClick={() => setIsDriveModalOpen(true)}
                        style={{
                            background: gdriveUrl ? '#ecfdf5' : '#f8fafc',
                            border: `1px solid ${gdriveUrl ? '#a7f3d0' : '#cbd5e1'}`,
                            color: gdriveUrl ? '#065f46' : '#334155',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 14px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                        }}
                        title={gdriveUrl ? "Open Google Drive Workout & Reference Folder" : "Link Google Drive Workout Folder"}
                    >
                        <Folder size={18} color={gdriveUrl ? '#059669' : '#64748b'} />
                        <span>{gdriveUrl ? 'GDrive Workout' : 'Link GDrive Workout'}</span>
                        {gdriveUrl && <ExternalLink size={14} color="#059669" />}
                    </button>
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

            {/* Google Drive Audit Reference Banner */}
            <div style={{ 
                background: '#ffffff', 
                border: '1px solid #e2e8f0', 
                borderRadius: '14px', 
                padding: '14px 20px', 
                marginBottom: '28px', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '14px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ 
                        background: gdriveUrl ? '#ecfdf5' : '#f8fafc', 
                        padding: '10px', 
                        borderRadius: '12px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        border: `1px solid ${gdriveUrl ? '#a7f3d0' : '#e2e8f0'}`
                    }}>
                        <Folder size={22} color={gdriveUrl ? '#059669' : '#64748b'} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                                Google Drive Workout & Audit Reference ({selectedYear} Q{selectedQuarter})
                            </h4>
                            {gdriveUrl ? (
                                <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px' }}>
                                    ✓ Linked
                                </span>
                            ) : (
                                <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px' }}>
                                    Not Linked
                                </span>
                            )}
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                            {gdriveUrl 
                                ? `Folder reference connected for Q${selectedQuarter}. Click to open or update attached workout files.` 
                                : 'Store your bank statements, CSV workouts, and Claude calculations in Google Drive for full IRAS audit compliance.'}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {gdriveUrl && (
                        <button 
                            onClick={handleOpenDriveFolder} 
                            className="btn btn-secondary"
                            style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', borderColor: '#a7f3d0', background: '#ecfdf5', fontWeight: 600 }}
                        >
                            <ExternalLink size={15} /> Open Drive Folder
                        </button>
                    )}
                    <button 
                        onClick={() => setIsDriveModalOpen(true)} 
                        className="btn btn-secondary"
                        style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <LinkIcon size={15} /> {gdriveUrl ? 'Manage Reference' : 'Link Google Drive Folder'}
                    </button>
                </div>
            </div>

            {/* Quick Summary Cards with Key Breakdown Highlights */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '32px' }}>
                
                {/* 1. OUTPUT GST (SALES) CARD */}
                <div className={`glass-panel ${activeTab === 'sales' ? 'active-card' : ''}`} 
                    onClick={() => setActiveTab('sales')}
                    style={{ 
                        background: '#f0f9ff', 
                        border: '1px solid #bae6fd', 
                        cursor: 'pointer', 
                        transition: 'all 0.2s', 
                        boxShadow: activeTab === 'sales' ? '0 8px 30px rgba(2, 132, 199, 0.18)' : '0 1px 3px rgba(0,0,0,0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                    }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <p style={{ color: '#0369a1', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                                    Output GST (Sales)
                                </p>
                                <h2 style={{ fontSize: '1.9rem', fontWeight: 800, color: '#0c4a6e', margin: 0 }}>
                                    SGD {outputGst.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </h2>
                                <p style={{ fontSize: '0.8rem', color: '#0284c7', marginTop: '4px', fontWeight: 500 }}>
                                    Output Tax Due (Box 6) • {salesDocs.length} Transactions
                                </p>
                            </div>
                            <div style={{ background: '#e0f2fe', padding: '10px', borderRadius: '12px' }}>
                                <ArrowUpRight size={24} color="#0284c7" />
                            </div>
                        </div>

                        {/* Highlighted Key Amounts Breakdown */}
                        <div style={{ marginTop: '16px', background: '#ffffff', borderRadius: '12px', padding: '12px 14px', border: '1px solid #e0f2fe', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ background: '#0284c7', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>Box 1</span>
                                    Standard-rated supplies:
                                </span>
                                <strong style={{ color: '#0c4a6e', fontSize: '0.92rem' }}>
                                    SGD {box1.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </strong>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ background: '#0d9488', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>Box 2</span>
                                    Zero-rated supplies:
                                </span>
                                <strong style={{ color: '#0f766e', fontSize: '0.92rem' }}>
                                    SGD {box2.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </strong>
                            </div>

                            <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '8px', marginTop: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.86rem' }}>
                                <span style={{ color: '#1e293b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ background: '#ca8a04', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>Box 4</span>
                                    Total supplies value:
                                </span>
                                <strong style={{ color: '#854d0e', fontSize: '0.96rem', fontWeight: 800 }}>
                                    SGD {box4.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </strong>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. INPUT GST (PURCHASES) CARD */}
                <div className={`glass-panel ${activeTab === 'purchases' ? 'active-card' : ''}`} 
                    onClick={() => setActiveTab('purchases')}
                    style={{ 
                        background: '#fff7ed', 
                        border: '1px solid #fed7aa', 
                        cursor: 'pointer', 
                        transition: 'all 0.2s', 
                        boxShadow: activeTab === 'purchases' ? '0 8px 30px rgba(234, 88, 12, 0.18)' : '0 1px 3px rgba(0,0,0,0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                    }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <p style={{ color: '#9a3412', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                                    Input GST (Purchases)
                                </p>
                                <h2 style={{ fontSize: '1.9rem', fontWeight: 800, color: '#7c2d12', margin: 0 }}>
                                    SGD {inputGst.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </h2>
                                <p style={{ fontSize: '0.8rem', color: '#ea580c', marginTop: '4px', fontWeight: 500 }}>
                                    Input Tax Claimed (Box 7) • {purchaseDocs.length} Transactions
                                </p>
                            </div>
                            <div style={{ background: '#ffedd5', padding: '10px', borderRadius: '12px' }}>
                                <ArrowDownLeft size={24} color="#ea580c" />
                            </div>
                        </div>

                        {/* Highlighted Key Amounts Breakdown */}
                        <div style={{ marginTop: '16px', background: '#ffffff', borderRadius: '12px', padding: '12px 14px', border: '1px solid #fed7aa', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ background: '#ea580c', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>Box 5</span>
                                    Taxable purchases value:
                                </span>
                                <strong style={{ color: '#7c2d12', fontSize: '0.92rem' }}>
                                    SGD {box5.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </strong>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ background: '#d97706', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>Box 7</span>
                                    Input tax claimed:
                                </span>
                                <strong style={{ color: '#9a3412', fontSize: '0.92rem' }}>
                                    SGD {box7.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </strong>
                            </div>

                            <div style={{ borderTop: '1px dashed #fed7aa', paddingTop: '8px', marginTop: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                                <span style={{ color: box5 === 0 ? '#b45309' : '#15803d', fontWeight: 500 }}>
                                    {box5 === 0 ? '⚠️ No taxable purchases recorded' : 'All eligible input taxes logged'}
                                </span>
                                <span style={{ color: '#ea580c', fontWeight: 700 }}>
                                    {box5 === 0 ? '+ Add Bills' : `${purchaseDocs.length} bills`}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. NET GST PAYABLE CARD */}
                <div className={`glass-panel ${activeTab === 'filing' ? 'active-card' : ''}`}
                    onClick={() => setActiveTab('filing')}
                    style={{ 
                        background: netPayable >= 0 ? '#f0fdf4' : '#fef2f2', 
                        border: `1px solid ${netPayable >= 0 ? '#bbf7d0' : '#fecaca'}`,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: activeTab === 'filing' ? '0 8px 30px rgba(22, 163, 74, 0.18)' : '0 1px 3px rgba(0,0,0,0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                    }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <p style={{ color: netPayable >= 0 ? '#15803d' : '#991b1b', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                                    {netPayable >= 0 ? 'Net GST Payable' : 'GST Claimable'}
                                </p>
                                <h2 style={{ fontSize: '1.9rem', fontWeight: 800, color: netPayable >= 0 ? '#14532d' : '#7f1d1d', margin: 0 }}>
                                    SGD {Math.abs(netPayable).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </h2>
                                <p style={{ fontSize: '0.8rem', color: netPayable >= 0 ? '#16a34a' : '#ef4444', marginTop: '4px', fontWeight: 500 }}>
                                    Net GST to be paid to IRAS (Box 8)
                                </p>
                            </div>
                            <div style={{ background: netPayable >= 0 ? '#dcfce7' : '#fee2e2', padding: '10px', borderRadius: '12px' }}>
                                <Calculator size={24} color={netPayable >= 0 ? '#16a34a' : '#dc2626'} />
                            </div>
                        </div>

                        {/* Status and Action */}
                        <div style={{ marginTop: '16px', background: '#ffffff', borderRadius: '12px', padding: '12px 14px', border: `1px solid ${netPayable >= 0 ? '#dcfce7' : '#fee2e2'}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Calendar size={14} color="#64748b" />
                                    IRAS Due Date:
                                </span>
                                <strong style={{ color: '#15803d', fontSize: '0.88rem' }}>
                                    {irasPeriodData.dueDate}
                                </strong>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <FileText size={14} color="#64748b" />
                                    IRAS Return Form:
                                </span>
                                <strong style={{ color: '#0369a1', fontSize: '0.88rem' }}>
                                    Form F5 Ready
                                </strong>
                            </div>

                            <div style={{ borderTop: '1px dashed #bbf7d0', paddingTop: '8px', marginTop: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                                <span style={{ color: '#16a34a', fontWeight: 600 }}>Click to review IRAS Form F5</span>
                                <ChevronRight size={16} color="#16a34a" />
                            </div>
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
                                                <a href={activeTab === 'sales' ? (d.document_type === 'Enquiry' ? `/workflows/enquiry/${d.id}` : `/workflows/editor/${d.document_type}/${d.id}`) : d.link} 
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

            {/* Google Drive Workout & Audit Reference Modal */}
            <Modal 
                isOpen={isDriveModalOpen} 
                onClose={() => setIsDriveModalOpen(false)} 
                title={`Google Drive Workout & Audit Reference (${selectedYear} Q${selectedQuarter})`} 
                icon={Folder}
            >
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Link Setup Box */}
                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                            Google Drive Folder URL or Folder ID
                        </label>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 10px 0' }}>
                            Paste the shareable link of your Google Drive folder for <strong>{selectedYear} Q{selectedQuarter}</strong> (e.g. <code>https://drive.google.com/drive/folders/...</code>).
                        </p>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input 
                                type="text" 
                                value={tempDriveUrl} 
                                onChange={(e) => setTempDriveUrl(e.target.value)}
                                placeholder="https://drive.google.com/drive/folders/..." 
                                style={{
                                    flex: 1,
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '0.88rem'
                                }}
                            />
                            <button 
                                className="btn btn-primary"
                                onClick={() => handleSaveDriveLink(tempDriveUrl)}
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                Save Link
                            </button>
                        </div>

                        {gdriveUrl && (
                            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                                <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Check size={14} /> Currently linked and ready
                                </span>
                                <button 
                                    onClick={handleOpenDriveFolder}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', color: '#0284c7' }}
                                >
                                    <ExternalLink size={14} /> Open in Google Drive
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Claude Workout Detail & IRAS Reconciliation Export */}
                    <div style={{ background: '#f0f9ff', padding: '16px', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#0c4a6e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <FileText size={16} color="#0284c7" /> Claude Workout Detail & Reconciliation Note
                                </h4>
                                <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: '#0369a1' }}>
                                    Standard rates, zero rates, taxable purchases & net tax breakdown ready for audit folder.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button 
                                    onClick={handleCopyClaudeSummary}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', background: '#fff' }}
                                >
                                    {copiedClaudeSummary ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                                    {copiedClaudeSummary ? 'Copied!' : 'Copy Summary'}
                                </button>
                                <button 
                                    onClick={handleDownloadClaudeSummary}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', background: '#fff' }}
                                >
                                    <Download size={14} /> Download .txt
                                </button>
                            </div>
                        </div>

                        {/* Preview of workout summary */}
                        <div style={{ background: '#ffffff', borderRadius: '8px', padding: '12px', border: '1px solid #bae6fd', maxHeight: '160px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.78rem', color: '#334155', whiteSpace: 'pre-wrap' }}>
                            {generateClaudeSummaryText()}
                        </div>
                    </div>

                    {/* Folder Checklist for Audit Compliance */}
                    <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FileSpreadsheet size={16} color="#059669" /> Recommended Workout Files to Store in this Drive Folder
                        </h4>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.82rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <li>
                                <strong>GST Sales Listing CSV:</strong> <code>GST_sales_{selectedYear}_Q{selectedQuarter}.csv</code> (exported above)
                            </li>
                            <li>
                                <strong>Company Bank Statements:</strong> <code>CEL-RON ACCT 0549047473_SGD_...</code> (XLS / PDF)
                            </li>
                            <li>
                                <strong>Bank Reconciliation History:</strong> <code>NR.KUMAR ...</code> & <code>Anitha ...</code> statements
                            </li>
                            <li>
                                <strong>Claude Workout Breakdown:</strong> <code>Claude_GST_Workout_{selectedYear}_Q{selectedQuarter}.txt</code> (downloaded above)
                            </li>
                            <li>
                                <strong>IRAS Form F5 Submission Receipt:</strong> Acknowledgement PDF once submitted via CorpPass
                            </li>
                        </ul>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button className="btn btn-secondary" onClick={() => setIsDriveModalOpen(false)}>
                            Close
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
