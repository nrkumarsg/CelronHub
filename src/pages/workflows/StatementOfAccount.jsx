import { provisionPartnerStructure, uploadFileToDrive, makeFilePublic, getOrCreateFolder, createFolderStructure } from '../../lib/driveService';
import { supabase } from '../../lib/supabase';

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { 
    Search, Printer, Send, Filter, Calendar, 
    ChevronRight, ArrowLeft, Download, Loader2,
    Building2, FileText, CreditCard, AlertCircle, Save, CornerDownRight, Edit2, Trash2,
    Mail, MessageSquare, X, ChevronDown, Plus, ExternalLink, CheckCircle, Clock
} from 'lucide-react';
import RichTextEditor from '../../components/common/RichTextEditor';
import { WhatsAppShareModal } from '../../components/workflow/WhatsAppShareModal';
import { getStoredToken } from '../../lib/googleAuthService';
import { useAuth } from '../../contexts/AuthContext';
import { getStatementData, saveWorkflowDocument, deleteWorkflowDocument } from '../../lib/workflowV2Service';
import { getPartners, getDocumentSettings } from '../../lib/store';
import XLSX from 'xlsx-js-style';

const generateExcelBlob = (statementData, dateRange, activeCompany) => {
    const wb = XLSX.utils.book_new();
    const data = [];

    const formatDateStr = (d) => {
        if (!d) return '-';
        const date = new Date(d);
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    };

    // Styling Definitions
    const fontHeader = { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } };
    const fontBold = { name: 'Calibri', sz: 11, bold: true };
    const fontRegular = { name: 'Calibri', sz: 11 };

    const borderThin = {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
    };

    const borderLightGray = {
        top: { style: 'thin', color: { rgb: 'A0A0A0' } },
        bottom: { style: 'thin', color: { rgb: 'A0A0A0' } },
        left: { style: 'thin', color: { rgb: 'A0A0A0' } },
        right: { style: 'thin', color: { rgb: 'A0A0A0' } }
    };

    const styleHeader = {
        fill: { fgColor: { rgb: '1F4E78' } }, // Deep Navy Blue
        font: fontHeader,
        alignment: { vertical: 'center', horizontal: 'left' },
        border: borderThin
    };

    const styleHeaderCenter = {
        fill: { fgColor: { rgb: '1F4E78' } }, // Deep Navy Blue
        font: fontHeader,
        alignment: { vertical: 'center', horizontal: 'center' },
        border: borderThin
    };

    const styleDataLeft = {
        font: fontRegular,
        alignment: { vertical: 'center', horizontal: 'left' },
        border: borderLightGray
    };

    const styleDataCenter = {
        font: fontRegular,
        alignment: { vertical: 'center', horizontal: 'center' },
        border: borderLightGray
    };

    const styleDataRight = {
        font: fontRegular,
        alignment: { vertical: 'center', horizontal: 'right' },
        border: borderLightGray
    };

    const styleTotalYellowLeft = {
        fill: { fgColor: { rgb: 'FFFF00' } }, // Bright Yellow
        font: fontBold,
        alignment: { vertical: 'center', horizontal: 'left' },
        border: borderThin
    };

    const styleTotalYellowCenter = {
        fill: { fgColor: { rgb: 'FFFF00' } }, // Bright Yellow
        font: fontBold,
        alignment: { vertical: 'center', horizontal: 'center' },
        border: borderThin
    };

    const styleTotalYellowRight = {
        fill: { fgColor: { rgb: 'FFFF00' } }, // Bright Yellow
        font: fontBold,
        alignment: { vertical: 'center', horizontal: 'right' },
        border: borderThin
    };

    const makeCell = (val, style = styleDataLeft) => {
        const isNum = typeof val === 'number';
        return {
            v: val === null || val === undefined ? '' : val,
            t: isNum ? 'n' : 's',
            s: style
        };
    };

    // 1. Corporate Header Block
    data.push([makeCell('CEL-RON ENTERPRISES PTE LTD', { font: { name: 'Calibri', sz: 12, bold: true } })]);
    data.push([makeCell('STATEMENT OF ACCOUNT', { font: { name: 'Calibri', sz: 12, bold: true } })]);
    data.push([makeCell(`Period: ${formatDateStr(dateRange.start)} - ${formatDateStr(dateRange.end)}`, { font: { name: 'Calibri', sz: 11, bold: true } })]);
    data.push([makeCell(`Generated on: ${new Date().toLocaleString()}`, { font: fontRegular })]);
    data.push([]); 

    // 2. Customer details Block
    const partner = statementData?.partner || {};
    data.push([makeCell('CUSTOMER DETAILS:', { font: fontBold })]);
    data.push([
        makeCell('Name:', fontBold),
        makeCell(partner.name || 'N/A', fontRegular)
    ]);
    data.push([
        makeCell('Email:', fontBold),
        makeCell(partner.email || 'N/A', fontRegular)
    ]);
    data.push([
        makeCell('Terms:', fontBold),
        makeCell(partner.terms || 'C.O.D', fontRegular)
    ]);
    data.push([]);

    // 3. Aging Summary
    const aging = statementData?.agingBuckets || { current: 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
    data.push([makeCell('AGING SUMMARY:', { font: fontBold })]);
    data.push([
        makeCell('Current (0-30 Days)', styleHeaderCenter),
        makeCell('31-60 Days', styleHeaderCenter),
        makeCell('61-90 Days', styleHeaderCenter),
        makeCell('90+ Days Due', styleHeaderCenter),
        makeCell('Total Outstanding', styleHeaderCenter)
    ]);
    data.push([
        makeCell(aging.current || 0, styleDataCenter),
        makeCell(aging['31_60'] || 0, styleDataCenter),
        makeCell(aging['61_90'] || 0, styleDataCenter),
        makeCell(aging['90_plus'] || 0, styleDataCenter),
        makeCell(statementData?.closingBalance || 0, styleDataCenter)
    ]);
    data.push([]);

    // 4. Transaction Ledger Table
    data.push([makeCell('TRANSACTION LEDGER:', { font: fontBold })]);
    data.push([
        makeCell('Date', styleHeader),
        makeCell('Document No', styleHeader),
        makeCell('Document Type', styleHeader),
        makeCell('Reference (Cust PO)', styleHeader),
        makeCell('Vessel / Workplace', styleHeader),
        makeCell('Debit (SGD)', styleHeader),
        makeCell('Credit (SGD)', styleHeader),
        makeCell('Running Balance (SGD)', styleHeader),
        makeCell('Remark', styleHeader)
    ]);

    let running = statementData?.openingBalance || 0;
    
    data.push([
        makeCell('-', styleDataCenter),
        makeCell('OPENING BALANCE', styleDataLeft),
        makeCell('-', styleDataCenter),
        makeCell('-', styleDataCenter),
        makeCell('-', styleDataCenter),
        makeCell('-', styleDataCenter),
        makeCell('-', styleDataCenter),
        makeCell(running, styleDataRight),
        makeCell('-', styleDataCenter)
    ]);

    let totalDebit = 0;
    let totalCredit = 0;

    if (statementData?.ledger) {
        statementData.ledger.forEach((doc) => {
            running += (doc.debit - doc.credit);
            totalDebit += (doc.debit || 0);
            totalCredit += (doc.credit || 0);
            
            data.push([
                makeCell(formatDateStr(doc.issue_date), styleDataLeft),
                makeCell(doc.document_no || '-', styleDataLeft),
                makeCell(doc.document_type || '-', styleDataLeft),
                makeCell(doc.customer_ref || doc.customer_po_no || doc.order_reference || '-', styleDataLeft),
                makeCell(doc.vessels?.vessel_name || doc.work_locations?.location_name || doc.vessel_name || doc.work_location || '-', styleDataLeft),
                makeCell(doc.debit || 0, styleDataRight),
                makeCell(doc.credit || 0, styleDataRight),
                makeCell(running, styleDataRight),
                makeCell(doc.remarks || doc.remark || doc.description || doc.subject || '-', styleDataLeft)
            ]);
        });
    }

    data.push([]);
    data.push([
        makeCell('TOTALS', styleTotalYellowLeft),
        makeCell('-', styleTotalYellowCenter),
        makeCell('-', styleTotalYellowCenter),
        makeCell('-', styleTotalYellowCenter),
        makeCell('-', styleTotalYellowCenter),
        makeCell(totalDebit, styleTotalYellowRight),
        makeCell(totalCredit, styleTotalYellowRight),
        makeCell(statementData?.closingBalance || 0, styleTotalYellowRight),
        makeCell('-', styleTotalYellowCenter)
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);

    const wscols = [
        { wch: 12 }, 
        { wch: 18 }, 
        { wch: 20 }, 
        { wch: 25 }, 
        { wch: 22 }, 
        { wch: 15 }, 
        { wch: 15 }, 
        { wch: 20 },
        { wch: 25 }
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, 'Statement of Account');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

const processStatementData = (rawData, partnerId, start, end, partnersList, fallbackPartner) => {
    // Deduplication logic: If Tax Invoice exists for a job/enquiry, hide Proforma
    const taxInvoicedKeys = new Set();
    rawData.forEach(d => {
        if (d.document_type === 'Tax Invoice') {
            if (d.assigned_job_no) taxInvoicedKeys.add(`job:${d.assigned_job_no}`);
            if (d.enquiry_id) taxInvoicedKeys.add(`enq:${d.enquiry_id}`);
        }
    });

    const filteredData = rawData.filter(doc => {
        if (doc.document_type === 'Proforma Invoice') {
            if (doc.assigned_job_no && taxInvoicedKeys.has(`job:${doc.assigned_job_no}`)) return false;
            if (doc.enquiry_id && taxInvoicedKeys.has(`enq:${doc.enquiry_id}`)) return false;
        }
        return true;
    });

    let openingBalance = 0;
    const openingBalanceItems = [];
    const relatedPayments = new Map(); // invoice_id -> [payments]
    const unallocatedLedger = [];

    filteredData.forEach(doc => {
        const docType = doc.document_type || '';
        const isInvoice = docType.includes('Invoice');
        const isPayment = docType === 'Payment Received';
        const amount = parseFloat(doc.total_amount) || 0;

        let relId = null;
        if (isPayment && doc.internal_notes) {
            try {
                const notes = JSON.parse(doc.internal_notes);
                relId = notes.related_document_id;
            } catch {}
        }

        const docWithAmounts = {
            ...doc,
            debit: isInvoice ? amount : 0,
            credit: isPayment ? amount : 0
        };
        
        if (new Date(doc.issue_date) < new Date(start)) {
            if (isInvoice) openingBalance += amount;
            if (isPayment) openingBalance -= amount;
            openingBalanceItems.push(docWithAmounts);
        } else {
            if (isPayment && relId) {
                if (!relatedPayments.has(relId)) relatedPayments.set(relId, []);
                relatedPayments.get(relId).push(docWithAmounts);
            } else {
                unallocatedLedger.push(docWithAmounts);
            }
        }
    });

    // Reconstruct ledger: insert related payments after their invoices
    const ledger = [];
    unallocatedLedger.forEach(doc => {
        const docPayments = relatedPayments.get(doc.id) || [];
        const paymentsSum = docPayments.reduce((sum, p) => sum + p.credit, 0);
        const isInvoice = (doc.document_type || '').includes('Invoice');
        const isSettled = isInvoice && Math.abs(doc.debit - paymentsSum) < 0.01;
        
        const mainDoc = { ...doc, isSettled, groupId: doc.id, outstanding: (doc.debit || 0) - paymentsSum };
        ledger.push(mainDoc);
        
        docPayments.forEach(p => {
            ledger.push({ ...p, isSettled, groupId: doc.id });
        });
        relatedPayments.delete(doc.id);
    });

    // Add remaining payments (e.g. those related to opening balance invoices)
    const remaining = Array.from(relatedPayments.values()).flat().sort((a, b) => new Date(a.issue_date) - new Date(b.issue_date));
    ledger.push(...remaining.map(p => {
        return { ...p, isSettled: false };
    }));

    // Final pass to ensure that if a payment is linked to an invoice, they share the SAME isSettled status
    const groupSettledStatus = new Map();
    ledger.forEach(l => {
        if (l.groupId && l.isSettled) groupSettledStatus.set(l.groupId, true);
    });
    
    const finalLedger = ledger.map(l => ({
        ...l,
        isSettled: l.groupId ? (groupSettledStatus.get(l.groupId) || l.isSettled) : l.isSettled
    }));

    // Calculate Aging with FIFO Reconciliation
    const aging = { current: 0, thirty: 0, sixty: 0, ninety: 0 };
    const today = new Date();
    
    const allInvoices = filteredData.filter(d => (d.document_type || '').includes('Invoice'))
        .sort((a, b) => new Date(a.issue_date) - new Date(b.issue_date));
    
    let unallocatedCredit = filteredData.filter(d => d.document_type === 'Payment Received')
        .reduce((sum, p) => sum + (parseFloat(p.total_amount) || 0), 0);
    
    allInvoices.forEach(inv => {
        const amount = parseFloat(inv.total_amount) || 0;
        let outstanding = amount;
        
        if (unallocatedCredit >= outstanding) {
            unallocatedCredit -= outstanding;
            outstanding = 0;
        } else {
            outstanding -= unallocatedCredit;
            unallocatedCredit = 0;
        }
        
        if (outstanding > 0.01) {
            const daysSinceIssue = Math.floor((today - new Date(inv.issue_date)) / (1000 * 60 * 60 * 24));
            
            if (daysSinceIssue <= 30) aging.current += outstanding;
            else if (daysSinceIssue <= 60) aging.thirty += outstanding;
            else if (daysSinceIssue <= 90) aging.sixty += outstanding;
            else aging.ninety += outstanding;
        }
    });

    return {
        ledger: finalLedger,
        openingBalance,
        openingBalanceItems,
        closingBalance: openingBalance + finalLedger.reduce((acc, d) => acc + (d.debit - d.credit), 0),
        partner: (partnersList || []).find(p => p.id === partnerId) || fallbackPartner,
        aging
    };
};

export default function StatementOfAccount() {
    const navigate = useNavigate();
    const { profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [partners, setPartners] = useState([]);
    const [selectedPartner, setSelectedPartner] = useState('');
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [statementData, setStatementData] = useState(null);
    const [hideSettled, setHideSettled] = useState(false);
    const [activeTab, setActiveTab] = useState('overdue');
    const [ledgerTab, setLedgerTab] = useState('overdue');
    const [openingBalanceModal, setOpeningBalanceModal] = useState({ isOpen: false, items: [] });
    const [paymentModal, setPaymentModal] = useState({ isOpen: false, prefill: null });
    const [settings, setSettings] = useState(null);
    const [companyAging, setCompanyAging] = useState([]);
    const [overallLoading, setOverallLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [contacts, setContacts] = useState([]);
    const [logoBase64, setLogoBase64] = useState('');
    const printRef = useRef();
    const printSummaryRef = useRef();
    const hiddenPrintRef = useRef();

    const [searchParams] = useSearchParams();
    const initialTab = searchParams.get('tab') || 'summary';
    const [soaView, setSoaView] = useState(initialTab); // 'summary' or 'automated'
    const [dispatchLogs, setDispatchLogs] = useState([]);
    const [selectedDispatchPartners, setSelectedDispatchPartners] = useState({});
    const [dispatchingStates, setDispatchingStates] = useState({});
    const [dispatchProgress, setDispatchProgress] = useState(null);
    const [customEmailBody, setCustomEmailBody] = useState('<p>Dear Customer,<br><br>Please find attached our outstanding Statement of Account (SOA) for your review.<br><br>Please kindly acknowledge receipt and expedite payment for any overdue balances.<br><br>Thank you for your support.<br><br>Best regards,<br>Finance & Accounts Team</p>');
    const [hiddenStatementData, setHiddenStatementData] = useState(null);

    const fetchDispatchLogs = async () => {
        try {
            const { data, error } = await supabase
                .from('soa_dispatch_logs')
                .select('*')
                .order('sent_at', { ascending: false });
            if (error) throw error;
            if (data) setDispatchLogs(data);
        } catch (err) {
            console.warn("Table public.soa_dispatch_logs does not exist or fetch failed. Caught gracefully:", err.message);
            setDispatchLogs([]);
        }
    };

    const statementCurrency = statementData?.ledger?.find(d => d.currency)?.currency || 'SGD';
    const summaryCurrency = companyAging.length > 0 ? (companyAging.find(it => it.currency)?.currency || 'SGD') : 'SGD';

    const overdueItems = companyAging.filter(item => item.outstanding > 0.01);
    const paidItems = companyAging.filter(item => item.outstanding <= 0.01);
    const displayedItems = activeTab === 'overdue' ? overdueItems : paidItems;

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const getActiveCycleInfo = () => {
        const today = new Date();
        const d = today.getDate();
        const year = today.getFullYear();
        const month = today.toLocaleString('default', { month: 'long' });
        
        let cycleNum = 5;
        let cycleLabel = '5th Billing Cycle';
        let periodStr = `1st ${month} ${year} to 5th ${month} ${year}`;
        
        if (d >= 5 && d < 15) {
            cycleNum = 15;
            cycleLabel = '15th Billing Cycle';
            periodStr = `6th ${month} ${year} to 15th ${month} ${year}`;
        } else if (d >= 15 && d < 25) {
            cycleNum = 25;
            cycleLabel = '25th Billing Cycle';
            periodStr = `16th ${month} ${year} to 25th ${month} ${year}`;
        } else if (d >= 25) {
            cycleNum = 30; // End of Month
            cycleLabel = 'End of Month Billing Cycle';
            periodStr = `26th ${month} ${year} to ${new Date(year, today.getMonth() + 1, 0).getDate()}th ${month} ${year}`;
        }
        
        return { cycleNum, cycleLabel, periodStr };
    };

    const isCycleDispatched = (cycleDay) => {
        if (!dispatchLogs || dispatchLogs.length === 0) return false;
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        return dispatchLogs.some(log => {
            const logDate = new Date(log.sent_at);
            if (logDate.getFullYear() !== year || logDate.getMonth() !== month) return false;
            const d = logDate.getDate();
            if (cycleDay === 5) return d >= 5 && d < 15;
            if (cycleDay === 15) return d >= 15 && d < 25;
            if (cycleDay === 25) return d >= 25 && d < 30;
            if (cycleDay === 30) return d >= 30 || d < 5;
            return false;
        });
    };

    const getLastSentDate = (partnerId) => {
        const logs = dispatchLogs.filter(l => l.partner_id === partnerId && l.status === 'Success');
        if (logs.length === 0) return 'Never Sent';
        const latest = new Date(logs[0].sent_at);
        return latest.toLocaleDateString() + ' ' + latest.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getRecipientsList = (item) => {
        const partnerContacts = contacts.filter(c => c.partnerId === item.id);
        const recipientList = [
            item.email,
            item.email1,
            ...partnerContacts.map(c => c.email)
        ].filter(Boolean);
        return recipientList.join(', ') || 'N/A';
    };

    const toBase64 = url => fetch(url, { mode: 'cors' })
        .then(response => response.blob())
        .then(blob => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        }));

    useEffect(() => {
        fetchInitialData();
    }, []);

    const getGlobalOldestInvoiceDate = () => {
        let oldest = null;
        companyAging.forEach(item => {
            if (item.oldest_invoice_date) {
                if (!oldest || new Date(item.oldest_invoice_date) < new Date(oldest)) {
                    oldest = item.oldest_invoice_date;
                }
            }
        });
        return oldest ? oldest.split('T')[0] : new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    };

    useEffect(() => {
        if (selectedPartner) {
            const partnerSummary = companyAging.find(item => item.id === selectedPartner);
            if (partnerSummary && partnerSummary.oldest_invoice_date) {
                setDateRange({
                    start: partnerSummary.oldest_invoice_date.split('T')[0],
                    end: new Date().toISOString().split('T')[0]
                });
            } else {
                setDateRange({
                    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
                    end: new Date().toISOString().split('T')[0]
                });
            }
        } else {
            const globalOldest = getGlobalOldestInvoiceDate();
            setDateRange({
                start: globalOldest,
                end: new Date().toISOString().split('T')[0]
            });
        }
    }, [selectedPartner, companyAging]);

    const fetchInitialData = async () => {
        const { getContacts } = await import('../../lib/store');
        const [pRes, sRes, cRes] = await Promise.all([
            getPartners(),
            getDocumentSettings(profile?.company_id),
            getContacts()
        ]);
        
        if (pRes) setPartners(pRes);
        if (sRes) {
            setSettings(sRes);
            if (sRes.logo_url) {
                toBase64(sRes.logo_url).then(setLogoBase64).catch(console.error);
            }
        }
        if (cRes) setContacts(cRes);
        fetchOverallSummary();
        fetchDispatchLogs();
    };

    const fetchOverallSummary = async () => {
        if (!profile?.company_id) return;
        setOverallLoading(true);
        try {
            const { data } = await getStatementData(profile.company_id, null, null, new Date().toISOString().split('T')[0]);
            
            if (data) {
                // Deduplication logic: If Tax Invoice exists for a job/enquiry, hide Proforma
                const taxInvoicedKeys = new Set();
                data.forEach(d => {
                    if (d.document_type === 'Tax Invoice') {
                        if (d.assigned_job_no) taxInvoicedKeys.add(`job:${d.assigned_job_no}`);
                        if (d.enquiry_id) taxInvoicedKeys.add(`enq:${d.enquiry_id}`);
                    }
                });

                const filteredData = data.filter(doc => {
                    if (doc.document_type === 'Proforma Invoice') {
                        if (doc.assigned_job_no && taxInvoicedKeys.has(`job:${doc.assigned_job_no}`)) return false;
                        if (doc.enquiry_id && taxInvoicedKeys.has(`enq:${doc.enquiry_id}`)) return false;
                    }
                    return true;
                });

                const groups = {};
                const today = new Date();
                let absoluteOldestInvoiceDate = null;
                
                filteredData.forEach(doc => {
                    const pid = doc.partner_id;
                    if (!pid) return;

                    if (!groups[pid]) {
                        groups[pid] = { 
                            id: pid,
                            name: doc.partners?.name || 'Unknown', 
                            outstanding: 0, 
                            total_invoiced: 0, 
                            total_paid: 0,
                            last_date: doc.issue_date,
                            currency: doc.currency || 'SGD',
                            aging: {
                                current: 0,
                                thirty: 0,
                                sixty: 0,
                                ninety: 0,
                                overNinety: 0
                            }
                        };
                    }
                    if (doc.currency) {
                        groups[pid].currency = doc.currency;
                    }
                    
                    const amount = parseFloat(doc.total_amount) || 0;
                    const issueDate = new Date(doc.issue_date);
                    const diffDays = Math.floor((today - issueDate) / (1000 * 60 * 60 * 24));

                    if ((doc.document_type || '').includes('Invoice')) {
                        groups[pid].outstanding += amount;
                        groups[pid].total_invoiced += amount;
                        
                        // Age from invoice issue date (Option B)
                        // Current = 0-30 days old, 31-60, 61-90, 91+
                        if (diffDays <= 30) groups[pid].aging.current += amount;
                        else if (diffDays <= 60) groups[pid].aging.thirty += amount;
                        else if (diffDays <= 90) groups[pid].aging.sixty += amount;
                        else if (diffDays <= 180) groups[pid].aging.ninety += amount;
                        else groups[pid].aging.overNinety += amount;
                        
                        // Track oldest invoice date per customer
                        if (!groups[pid].oldest_invoice_date || new Date(doc.issue_date) < new Date(groups[pid].oldest_invoice_date)) {
                            groups[pid].oldest_invoice_date = doc.issue_date;
                        }
                        
                        // Track global oldest invoice date
                        if (!absoluteOldestInvoiceDate || new Date(doc.issue_date) < new Date(absoluteOldestInvoiceDate)) {
                            absoluteOldestInvoiceDate = doc.issue_date;
                        }
                        
                    } else if (doc.document_type === 'Payment Received') {
                        groups[pid].outstanding -= amount;
                        groups[pid].total_paid += amount;
                        
                        // Deduct from oldest buckets first (simplified FIFO aging)
                        let remaining = amount;
                        const buckets = ['overNinety', 'ninety', 'sixty', 'thirty', 'current'];
                        for (const bucket of buckets) {
                            if (remaining <= 0) break;
                            const toDeduct = Math.min(remaining, groups[pid].aging[bucket]);
                            groups[pid].aging[bucket] -= toDeduct;
                            remaining -= toDeduct;
                        }
                        // If still remaining, deduct from current (negative aging)
                        if (remaining > 0) groups[pid].aging.current -= remaining;
                    }
                    
                    if (new Date(doc.issue_date) > new Date(groups[pid].last_date)) {
                        groups[pid].last_date = doc.issue_date;
                    }
                });

                const summary = Object.values(groups)
                    .filter(g => g.total_invoiced > 0 || g.total_paid > 0)
                    .sort((a, b) => b.outstanding - a.outstanding);
                
                setCompanyAging(summary);

                // Pre-select partners with outstanding balance for automated dispatch
                const preSelected = {};
                summary.forEach(item => {
                    if (item.outstanding > 0.01) {
                        preSelected[item.id] = true;
                    }
                });
                setSelectedDispatchPartners(preSelected);

                // Dynamically update default start date range to absolute oldest invoice date
                if (absoluteOldestInvoiceDate) {
                    setDateRange(prev => ({
                        ...prev,
                        start: absoluteOldestInvoiceDate.split('T')[0]
                    }));
                }
            }
        } catch (err) {
            console.error('Overall summary failed:', err);
        } finally {
            setOverallLoading(false);
        }
    };

    const handleGenerate = async (partnerOverride = null, startOverride = null, endOverride = null) => {
        const partnerId = partnerOverride || selectedPartner;
        if (!partnerId) {
            alert('Please select a customer first.');
            return;
        }
        const start = startOverride || dateRange.start;
        const end = endOverride || dateRange.end;
        setLoading(true);
        try {
            const { data, partner, error: fetchErr } = await getStatementData(
                profile?.company_id, 
                partnerId, 
                start, 
                end
            );

            if (fetchErr || !data) {
                console.error('Fetch error:', fetchErr);
                setStatementData(null);
                setLoading(false);
                return;
            }

            const processed = processStatementData(data, partnerId, start, end, partners, partner);
            setStatementData(processed);
        } catch (err) {
            console.error('Failed to generate statement:', err);
            alert('Failed to generate statement.');
        } finally {
            setLoading(false);
        }
    };

    const handleExportExcel = () => {
        if (!statementData) return toast.error('Please generate a statement first.');
        try {
            const companyName = settings?.company_name || profile?.company_name || 'CEL-RON ENTERPRISES PTE LTD';
            const blob = generateExcelBlob(statementData, dateRange, { name: companyName });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Statement_${statementData.partner?.name || 'Customer'}_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            toast.success('Excel Statement downloaded successfully!');
        } catch (err) {
            console.error('Excel Export failed:', err);
            toast.error('Failed to export Excel: ' + err.message);
        }
    };

    const handlePrint = async () => {
        const isSummary = !statementData;
        const element = isSummary ? printSummaryRef.current : printRef.current;
        if (!element) return;
        
        const { default: html2pdf } = await import('html2pdf.js');
        const opt = {
            margin: isSummary ? [10, 10, 10, 10] : 1,
            filename: isSummary ? `Aging_Summary_Report_${new Date().toISOString().split('T')[0]}.pdf` : `Statement_${statementData?.partner?.name || 'Customer'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, allowTaint: false, scrollX: 0, scrollY: 0, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: isSummary ? 'landscape' : 'portrait' }
        };
        
        await html2pdf().from(element).set(opt).save();
    };
    
    const handlePrintSummary = async () => {
        const element = printSummaryRef.current;
        if (!element) {
            alert('Print summary element not found.');
            return;
        }
        
        try {
            const { default: html2pdf } = await import('html2pdf.js');
            const opt = {
                margin: [10, 10, 10, 10],
                filename: `Aging_Summary_Report_${new Date().toISOString().split('T')[0]}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, allowTaint: false, scrollX: 0, scrollY: 0, logging: false, letterRendering: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
            };
            
            await html2pdf().from(element).set(opt).save();
        } catch (err) {
            console.error('PDF Generation Error:', err);
            alert('Failed to generate PDF. Please try again.');
        }
    };

    const handleDeleteDocument = async (id, docNo) => {
        if (!window.confirm(`Are you sure you want to delete ${docNo}? This action cannot be undone.`)) return;
        try {
            const { error } = await deleteWorkflowDocument(id);
            if (error) throw error;
            handleGenerate(); // Refresh
        } catch (err) {
            console.error('Delete Error:', err);
            toast.error(`Failed to delete: ${err.message}`);
        }
    };

    const handleQuickPaymentSuccess = () => {
        setPaymentModal({ isOpen: false, prefill: null });
        handleGenerate();
    };

    const handleShareFile = async (type = 'whatsapp', message = '', recipient = '', cc = '', bcc = '', subjectOverride = '', attachExcel = false) => {
        setLoading(true);
        try {
            const token = await getStoredToken();
            if (!token) {
                toast.error('Google Drive connection required. Please connect via Corporate Vault > Connect Google.');
                setLoading(false);
                return;
            }

            const element = printRef.current;
            if (!element) return;
            
            const { default: html2pdf } = await import('html2pdf.js');
            const opt = {
                margin: 1,
                filename: `Statement_${statementData.partner?.name}_${new Date().toISOString().split('T')[0]}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 1.5, useCORS: true, allowTaint: false, scrollX: 0, scrollY: 0 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            
            const pdfBlob = await html2pdf().from(element).set(opt).output('blob');
            
            // Upload to Drive
            let celronRootId = settings?.gdrive_celron_root_id;
            if (!celronRootId) {
                let topRootId = settings?.google_drive_folder_id || 'root';
                if (topRootId.includes('drive.google.com')) {
                    const match = topRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || topRootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (match) topRootId = match[1];
                    else topRootId = 'root';
                }
                celronRootId = await getOrCreateFolder(token, 'CELRONHUB', topRootId);
                setSettings(prev => ({ ...prev, gdrive_celron_root_id: celronRootId }));
                const { saveDocumentSettings } = await import('../../lib/store');
                await saveDocumentSettings({
                    ...settings,
                    gdrive_celron_root_id: celronRootId
                });
            }
            const currentYear = new Date().getFullYear().toString();
            const targetFolderId = await createFolderStructure(token, `SOA/${currentYear}`, celronRootId);

            const uploadRes = await uploadFileToDrive(token, pdfBlob, { 
                title: opt.filename, 
                mimeType: 'application/pdf',
                folderId: targetFolderId
            });

            if (uploadRes?.id) {
                await makeFilePublic(token, uploadRes.id);
                const link = uploadRes.webViewLink || `https://drive.google.com/file/d/${uploadRes.id}/view`;
                
                if (type === 'whatsapp') {
                    const text = `${message}\n\nView Statement: ${link}`;
                    const waUrl = recipient ? `https://wa.me/${recipient}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
                    window.open(waUrl, '_blank');
                } else {
                    const subject = subjectOverride || `Statement of Account - ${statementData.partner?.name}`;
                    const body = `${message}\n\nView/Download Statement: ${link}`;
                    
                    // Convert PDF blob to base64 for attachment
                    const reader = new FileReader();
                    const b64Pdf = await new Promise((resolve) => {
                        reader.onloadend = () => resolve(reader.result.split(',')[1]);
                        reader.readAsDataURL(pdfBlob);
                    });

                    const systemPdf = {
                        name: `Statement_${statementData.partner?.name || 'Customer'}_${new Date().toISOString().split('T')[0]}.pdf`,
                        content: `base64,${b64Pdf}`,
                        type: 'application/pdf'
                    };

                    const attachments = [systemPdf];

                    if (attachExcel) {
                        const companyName = settings?.company_name || profile?.company_name || 'CEL-RON ENTERPRISES PTE LTD';
                        const excelBlob = generateExcelBlob(statementData, dateRange, { name: companyName });
                        
                        const readerExcel = new FileReader();
                        const b64Excel = await new Promise((resolve) => {
                            readerExcel.onloadend = () => resolve(readerExcel.result.split(',')[1]);
                            readerExcel.readAsDataURL(excelBlob);
                        });

                        attachments.push({
                            name: `Statement_${statementData.partner?.name || 'Customer'}_${new Date().toISOString().split('T')[0]}.xlsx`,
                            content: `base64,${b64Excel}`,
                            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                        });
                    }

                    const fromEmail = settings?.accounts_email || 'accounts@celron.net';

                    const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/send-email`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            company_id: profile?.company_id,
                            from_email: fromEmail,
                            to: recipient,
                            cc: cc,
                            bcc: bcc,
                            subject: subject,
                            body: body,
                            attachments: attachments
                        })
                    });

                    const contentType = response.headers.get("content-type");
                    if (contentType && contentType.indexOf("application/json") !== -1) {
                        const data = await response.json();
                        if (!response.ok) throw new Error(data.error || 'Server error');
                    } else {
                        if (!response.ok) throw new Error('Failed to send email');
                    }
                    
                    toast.success(`Statement email sent successfully!`);
                }
            }
        } catch (err) {
            console.error('File sharing failed:', err);
            toast.error('Failed to share file: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleBulkDispatch = async () => {
        const selectedIds = Object.keys(selectedDispatchPartners).filter(id => selectedDispatchPartners[id]);
        if (selectedIds.length === 0) {
            toast.error("Please tick/select at least one customer to dispatch.");
            return;
        }

        if (!window.confirm(`Are you sure you want to dispatch Statement of Accounts to ${selectedIds.length} customer(s)?`)) {
            return;
        }

        const token = await getStoredToken();
        if (!token) {
            toast.error("Google Drive connection required. Please connect via Corporate Vault > Connect Google.");
            return;
        }

        setSaving(true);
        setDispatchProgress({
            total: selectedIds.length,
            current: 0,
            status: 'Processing...'
        });

        // Initialize state indicators
        const initialStates = {};
        selectedIds.forEach(id => {
            initialStates[id] = 'loading';
        });
        setDispatchingStates(prev => ({ ...prev, ...initialStates }));

        const { default: html2pdf } = await import('html2pdf.js');

        for (let i = 0; i < selectedIds.length; i++) {
            const partnerId = selectedIds[i];
            const partnerSummary = companyAging.find(item => item.id === partnerId);
            if (!partnerSummary) continue;

            setDispatchProgress(prev => ({
                ...prev,
                current: i + 1,
                status: `Generating Statement for ${partnerSummary.name}...`
            }));

            try {
                // 1. Fetch complete statement data for this partner
                const { data: rawData, partner: dbPartner } = await getStatementData(profile.company_id, partnerId, dateRange.start, dateRange.end);
                if (!rawData) throw new Error("Could not load statement data from database.");

                // Process statement data to match hiddenPrintRef's structure
                const processed = processStatementData(rawData, partnerId, dateRange.start, dateRange.end, partners, dbPartner);

                // 2. Temporarily set hidden statement state so print layout renders the correct partner
                setHiddenStatementData(processed);

                // 3. Wait for DOM render update so printRef compiles the new data
                await new Promise(r => setTimeout(r, 1500));

                const element = hiddenPrintRef.current;
                if (!element) throw new Error("Offscreen printing container not ready.");

                const opt = {
                    margin: 0,
                    filename: `Statement_${processed.partner?.name?.replace(/\s+/g, '_') || 'Customer'}_${new Date().toISOString().split('T')[0]}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { 
                        scale: 1.5, 
                        useCORS: true, 
                        allowTaint: false, 
                        scrollX: 0, 
                        scrollY: 0,
                        onclone: (clonedDoc) => {
                            const el = clonedDoc.getElementById('soa-offscreen-wrapper');
                            if (el) {
                                el.style.position = 'absolute';
                                el.style.left = '0';
                                el.style.top = '0';
                            }
                        }
                    },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };

                // 4. Compile the PDF blob on-the-fly
                const pdfBlob = await html2pdf().from(element).set(opt).output('blob');

                // 5. Upload to Google Drive for hosting
                setDispatchProgress(prev => ({ ...prev, status: `Archiving Statement for ${partnerSummary.name} to Drive...` }));
                 
                let celronRootId = settings?.gdrive_celron_root_id;
                if (!celronRootId) {
                    let topRootId = settings?.google_drive_folder_id || 'root';
                    if (topRootId.includes('drive.google.com')) {
                        const match = topRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || topRootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                        if (match) topRootId = match[1];
                        else topRootId = 'root';
                    }
                    celronRootId = await getOrCreateFolder(token, 'CELRONHUB', topRootId);
                    setSettings(prev => ({ ...prev, gdrive_celron_root_id: celronRootId }));
                    const { saveDocumentSettings } = await import('../../lib/store');
                    await saveDocumentSettings({
                        ...settings,
                        gdrive_celron_root_id: celronRootId
                    });
                }
                const currentYear = new Date().getFullYear().toString();
                const targetFolderId = await createFolderStructure(token, `SOA/${currentYear}`, celronRootId);

                const uploadRes = await uploadFileToDrive(token, pdfBlob, {
                    title: opt.filename,
                    mimeType: 'application/pdf',
                    folderId: targetFolderId
                });

                let link = '';
                if (uploadRes?.id) {
                    await makeFilePublic(token, uploadRes.id);
                    link = uploadRes.webViewLink || `https://drive.google.com/file/d/${uploadRes.id}/view`;
                }

                // 6. Convert PDF to base64 for attachment
                const reader = new FileReader();
                const b64Pdf = await new Promise((resolve) => {
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(pdfBlob);
                });

                const attachments = [{
                    name: opt.filename,
                    content: `base64,${b64Pdf}`,
                    type: 'application/pdf'
                }];

                // 7. Extract recipient emails
                const partnerContacts = contacts.filter(c => c.partnerId === partnerId);
                const recipientList = [
                    processed.partner?.email,
                    processed.partner?.email1,
                    ...partnerContacts.map(c => c.email)
                ].filter(Boolean);

                const recipient = recipientList.join(', ') || 'accounts@celron.net'; // fallback

                // 8. Build subject and customizable body
                const cleanBodyText = customEmailBody
                    .replace(/\[Customer Name\]/g, processed.partner?.name || 'Customer')
                    .replace(/\[Outstanding Balance\]/g, `${partnerSummary.currency || 'SGD'} ${partnerSummary.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)
                    .replace(/\[Start Date\]/g, formatDate(dateRange.start))
                    .replace(/\[End Date\]/g, formatDate(dateRange.end));

                const emailBodyText = `${cleanBodyText}<br><br>View/Download Statement: <a href="${link}">${link}</a>`;
                const subject = `Statement of Account - ${processed.partner?.name || 'Customer'} (Period: ${formatDate(dateRange.start)} to ${formatDate(dateRange.end)})`;

                const fromEmail = settings?.accounts_email || 'accounts@celron.net';

                // 9. Call send-email API
                setDispatchProgress(prev => ({ ...prev, status: `Sending Email to ${recipient}...` }));
                const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/send-email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        company_id: profile?.company_id,
                        from_email: fromEmail,
                        to: recipient,
                        cc: settings?.accounts_email || 'accounts@celron.net',
                        bcc: 'celron.simlim0305@gmail.com',
                        subject: subject,
                        body: emailBodyText,
                        attachments: attachments
                    })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error || 'Failed to dispatch email.');
                }

                // 10. Record Sent Date in Database
                const logPayload = {
                    company_id: profile.company_id,
                    partner_id: partnerId,
                    sent_by: profile.email || 'System Admin',
                    recipient: recipient,
                    closing_balance: partnerSummary.outstanding,
                    currency: partnerSummary.currency || 'SGD',
                    status: 'Success'
                };

                try {
                    await supabase.from('soa_dispatch_logs').insert([logPayload]);
                } catch (logErr) {
                    console.error("Failed to log dispatch:", logErr);
                }

                setDispatchingStates(prev => ({ ...prev, [partnerId]: 'success' }));
                toast.success(`SOA for ${partnerSummary.name} dispatched successfully!`);

            } catch (err) {
                console.error(`Dispatch failed for ${partnerSummary.name}:`, err);
                setDispatchingStates(prev => ({ ...prev, [partnerId]: 'failed' }));
                toast.error(`Failed to dispatch for ${partnerSummary.name}: ${err.message}`);
            }
        }

        setSaving(false);
        setDispatchProgress(null);
        setHiddenStatementData(null);
        
        // Refresh logs and overall checklist view
        fetchDispatchLogs();
        fetchOverallSummary();
    };

    const handleArchive = async () => {
        if (!statementData) return toast.error('Please generate a statement first.');
        setLoading(true);
        try {
            const token = await getStoredToken();
            if (!token) {
                toast.error('Google Drive connection required. Please connect via Corporate Vault > Connect Google.');
                setLoading(false);
                return;
            }

            const element = printRef.current;
            if (!element) return;

            const { default: html2pdf } = await import('html2pdf.js');
            const opt = {
                margin: 1,
                filename: `SOA_${statementData.partner?.name?.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}_${statementCurrency}_${statementData.closingBalance.toFixed(0)}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, allowTaint: false, scrollX: 0, scrollY: 0, letterRendering: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            const pdfBlob = await html2pdf().from(element).set(opt).output('blob');
            const file = new File([pdfBlob], opt.filename, { type: 'application/pdf' });

            // Create structured path: Financial Archive/Statements/[Customer Name]/[Year]
            let celronRootId = settings?.gdrive_celron_root_id;
            if (!celronRootId) {
                let topRootId = settings?.google_drive_folder_id || 'root';
                if (topRootId.includes('drive.google.com')) {
                    const match = topRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || topRootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (match) topRootId = match[1];
                    else topRootId = 'root';
                }
                celronRootId = await getOrCreateFolder(token, 'CELRONHUB', topRootId);
                setSettings(prev => ({ ...prev, gdrive_celron_root_id: celronRootId }));
                const { saveDocumentSettings } = await import('../../lib/store');
                await saveDocumentSettings({
                    ...settings,
                    gdrive_celron_root_id: celronRootId
                });
            }
            const year = new Date().getFullYear().toString();
            const archivePath = `Financial Archive/Statements/${statementData.partner?.name}/${year}`;
            
            const { createFolderStructure } = await import('../../lib/driveService');
            const folderId = await createFolderStructure(token, archivePath, celronRootId);

            const uploadRes = await uploadFileToDrive(token, file, { folderId });

            if (uploadRes?.id) {
                toast.success(`Statement Archived!\nFolder: ${archivePath}`);
            }
        } catch (err) {
            console.error('Archive failed:', err);
            alert('Archive Failed: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleViewArchives = async () => {
        if (!statementData) return toast.error('Please select a customer first.');
        setLoading(true);
        try {
            const token = await getStoredToken();
            if (!token) {
                toast.error('Google Drive connection required. Please connect via Corporate Vault > Connect Google.');
                setLoading(false);
                return;
            }

            let celronRootId = settings?.gdrive_celron_root_id;
            if (!celronRootId) {
                let topRootId = settings?.google_drive_folder_id || 'root';
                if (topRootId.includes('drive.google.com')) {
                    const match = topRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || topRootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (match) topRootId = match[1];
                    else topRootId = 'root';
                }
                celronRootId = await getOrCreateFolder(token, 'CELRONHUB', topRootId);
                setSettings(prev => ({ ...prev, gdrive_celron_root_id: celronRootId }));
                const { saveDocumentSettings } = await import('../../lib/store');
                await saveDocumentSettings({
                    ...settings,
                    gdrive_celron_root_id: celronRootId
                });
            }

            const archivePath = `Financial Archive/Statements/${statementData.partner?.name}`;
            const { createFolderStructure } = await import('../../lib/driveService');
            const folderId = await createFolderStructure(token, archivePath, celronRootId);
            
            if (folderId) {
                window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
            }
        } catch (err) {
            console.error('View Archive failed:', err);
            alert('Failed to open archive folder: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEmail = () => {
        if (!statementData) return toast.error('Please generate a statement first.');
        const defaultMsg = `Dear ${statementData.partner?.name || 'Accounts Team'},\n\nPlease find the Statement of Account (SOA-${new Date().toISOString().split('T')[0]}) for your review and reference.\n\nAwaiting for your valuable payment.\n\nTotal Due: ${statementCurrency} ${statementData.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}.\n\nBest Regards,\n\nANITHA HP:+65 81962270\nCELRON ENTERPRISES PTE LTD\n10, Jln, Besar, " Sim Lim Tower" #03-05, Singapore 208787\nEmail: accounts@celron.net | Tel: +6591090347\nweb: www.celron.net / www.celron.shop`;
        handleShareFile('email', defaultMsg);
    };

    const handleWhatsApp = () => {
        if (!statementData) return toast.error('Please generate a statement first.');
        setShowWhatsAppModal(true);
    };

    return (
        <div className="workflow-editor-theme" style={{ minHeight: '100vh', background: '#f8fafc' }}>
            <header className="editor-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className="icon-btn" onClick={() => {
                        if (selectedPartner || statementData) {
                            setSelectedPartner('');
                            setStatementData(null);
                        } else {
                            navigate('/workflows');
                        }
                    }}>
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                            Financial Module
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Statement Of Account</h1>
                            {statementData && (
                                <div style={{ 
                                    background: '#1e3a8a', 
                                    color: 'white', 
                                    padding: '4px 16px', 
                                    borderRadius: '20px', 
                                    fontSize: '1rem', 
                                    fontWeight: 800,
                                    boxShadow: '0 4px 6px -1px rgba(30, 58, 138, 0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <CreditCard size={16} />
                                    {statementCurrency} {statementData.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                            )}
                            {!statementData && companyAging.length > 0 && (
                                <div style={{ 
                                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', 
                                    color: 'white', 
                                    padding: '4px 16px', 
                                    borderRadius: '20px', 
                                    fontSize: '1rem', 
                                    fontWeight: 800,
                                    boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <Building2 size={16} />
                                    Total: SGD {companyAging.reduce((sum, item) => sum + (item.outstanding || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn-vibrant-secondary" onClick={() => setPaymentModal({ isOpen: true, prefill: { partner_id: selectedPartner } })}>
                        <CreditCard size={18} /> Record Payment
                    </button>
                    <button className="btn-vibrant-secondary" onClick={handleArchive} disabled={loading}>
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} 
                        {loading ? ' Archiving...' : ' Save to Archive'}
                    </button>
                    <button className="btn-vibrant-secondary" onClick={handleViewArchives} title="Open Google Drive Archive">
                        <ExternalLink size={18} /> View Archives
                    </button>
                    <button className="btn-vibrant-secondary" onClick={handlePrint}>
                        <Printer size={18} /> Print PDF
                    </button>
                    <button className="btn-vibrant-secondary" style={{ background: '#10b981', color: '#fff', border: 'none' }} onClick={handleExportExcel}>
                        <Download size={18} /> Export Excel
                    </button>
                    <button className="btn-vibrant-secondary" onClick={() => setShowEmailModal(true)}>
                        <Mail size={18} /> Send by Email
                    </button>
                    <button className="btn-vibrant-secondary" style={{ background: '#25D366', color: '#fff', border: 'none' }} onClick={() => setShowWhatsAppModal(true)}>
                        <MessageSquare size={18} /> Share via WhatsApp
                    </button>
                    <button className="icon-btn" onClick={() => navigate('/workflows')}>
                        <X size={20} />
                    </button>
                </div>
            </header>

            <div className="main-content" style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
                {/* Visual Tab Selector for SOA Summary vs. Automated Scheduler */}
                <div className="glass-panel" style={{ 
                    display: 'flex', 
                    gap: '12px', 
                    padding: '12px 20px', 
                    borderRadius: '16px', 
                    marginBottom: '24px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--glass)',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                            className={`btn-vibrant${soaView === 'summary' ? '' : '-secondary'}`}
                            onClick={() => setSoaView('summary')}
                            style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, borderRadius: '10px' }}
                        >
                            <Building2 size={16} /> Summary & Aging Reports
                        </button>
                        <button 
                            className={`btn-vibrant${soaView === 'automated' ? '' : '-secondary'}`}
                            onClick={() => setSoaView('automated')}
                            style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, borderRadius: '10px' }}
                        >
                            <Calendar size={16} /> Automated SOA Dispatch & Reminders
                        </button>
                    </div>
                    {soaView === 'automated' && (
                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '6px 14px', fontSize: '0.85rem', color: '#1e40af', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <AlertCircle size={16} /> 10-Day Billing Cycles: Active (10th, 20th, 30th)
                        </div>
                    )}
                </div>

                {soaView === 'summary' ? (
                    <>
                        <div className="glass-panel" style={{ marginBottom: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                        <div style={{ background: 'var(--accent)', color: 'white', padding: '8px', borderRadius: '10px' }}>
                            <Filter size={20} />
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Statement Filters</h2>
                    </div>

                    <div className="input-grid" style={{ gridTemplateColumns: '1.5fr 1fr 1fr auto auto auto', alignItems: 'flex-end', gap: '16px' }}>
                        <div className="form-item" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Select Customer</label>
                            <select 
                                className="form-select"
                                value={selectedPartner}
                                onChange={(e) => setSelectedPartner(e.target.value)}
                                style={{ height: '48px', fontSize: '1rem' }}
                            >
                                <option value="">-- Choose Customer --</option>
                                {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>

                        <div className="form-item" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Start Date</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input 
                                    type="date" 
                                    className="form-input" 
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                    style={{ height: '48px', paddingLeft: '40px' }}
                                />
                            </div>
                        </div>

                        <div className="form-item" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>End Date</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input 
                                    type="date" 
                                    className="form-input" 
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                                    style={{ height: '48px', paddingLeft: '40px' }}
                                />
                            </div>
                        </div>

                        <button 
                            className="btn-vibrant" 
                            onClick={() => handleGenerate()} 
                            disabled={loading || !selectedPartner}
                            style={{ height: '48px', padding: '0 24px', minWidth: '140px' }}
                        >
                            {loading ? <Loader2 className="animate-spin" /> : 'Generate'}
                        </button>



                        <button 
                            className="btn-vibrant-secondary" 
                            onClick={() => { 
                                setSelectedPartner(''); 
                                setStatementData(null); 
                                const globalOldest = getGlobalOldestInvoiceDate();
                                setDateRange({
                                    start: globalOldest,
                                    end: new Date().toISOString().split('T')[0]
                                });
                            }}
                            style={{ height: '48px', padding: '0 20px' }}
                        >
                            Reset
                        </button>
                    </div>
                </div>

                {statementData ? (
                    <>
                        <div className="animate-fade-in">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
                        {[
                            { label: 'Current', value: statementData?.aging.current || 0, color: '#10b981', gradient: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)', text: '#166534' },
                            { label: '31 - 60 Days', value: statementData?.aging.thirty || 0, color: '#f59e0b', gradient: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', text: '#92400e' },
                            { label: '61 - 90 Days', value: statementData?.aging.sixty || 0, color: '#ea580c', gradient: 'linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%)', text: '#9a3412' },
                            { label: '90+ Days Due', value: statementData?.aging.ninety || 0, color: '#ef4444', gradient: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)', text: '#b91c1c' }
                        ].map((bucket, i) => (
                            <div key={i} style={{ 
                                background: bucket.gradient, 
                                padding: '24px', 
                                borderRadius: '16px', 
                                border: `1px solid ${bucket.color}40`,
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: '4px',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                            }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: bucket.text, textTransform: 'uppercase', opacity: 0.8 }}>{bucket.label}</div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: bucket.text }}>
                                    {statementCurrency} {bucket.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>Transaction Ledger</h2>
                            {statementData && (
                                <div style={{ display: 'flex', gap: '24px' }}>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Period Balance</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)' }}>
                                            {statementCurrency} {statementData.ledger.reduce((acc, d) => acc + (d.debit - d.credit), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Statement Total</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                                            {statementCurrency} {statementData.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Beautiful Card-Embedded Tab Selector */}
                        <div style={{ 
                            display: 'flex', 
                            gap: '8px', 
                            background: '#f1f5f9', 
                            padding: '4px', 
                            borderRadius: '12px', 
                            margin: '20px 24px 0 24px',
                            width: 'fit-content',
                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)',
                            border: '1px solid #e2e8f0'
                        }}>
                            <button 
                                onClick={() => setLedgerTab('overdue')}
                                style={{
                                    padding: '8px 20px',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: ledgerTab === 'overdue' ? 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)' : 'transparent',
                                    color: ledgerTab === 'overdue' ? '#ffffff' : '#64748b',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    boxShadow: ledgerTab === 'overdue' ? '0 4px 10px rgba(79, 70, 229, 0.25)' : 'none'
                                }}
                            >
                                <AlertCircle size={14} /> Outstanding / Overdue
                                <span style={{ 
                                    background: ledgerTab === 'overdue' ? 'rgba(255,255,255,0.2)' : '#cbd5e1', 
                                    color: ledgerTab === 'overdue' ? '#ffffff' : '#475569', 
                                    padding: '1px 6px', 
                                    borderRadius: '12px', 
                                    fontSize: '0.7rem',
                                    fontWeight: 800
                                }}>
                                    {statementData?.ledger?.filter(d => !d.isSettled).length || 0}
                                </span>
                            </button>
                            <button 
                                onClick={() => setLedgerTab('paid')}
                                style={{
                                    padding: '8px 20px',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: ledgerTab === 'paid' ? 'linear-gradient(135deg, #10b981 0%, #047857 100%)' : 'transparent',
                                    color: ledgerTab === 'paid' ? '#ffffff' : '#64748b',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    boxShadow: ledgerTab === 'paid' ? '0 4px 10px rgba(16, 185, 129, 0.25)' : 'none'
                                }}
                            >
                                <CreditCard size={14} /> Paid / Settled
                                <span style={{ 
                                    background: ledgerTab === 'paid' ? 'rgba(255,255,255,0.2)' : '#cbd5e1', 
                                    color: ledgerTab === 'paid' ? '#ffffff' : '#475569', 
                                    padding: '1px 6px', 
                                    borderRadius: '12px', 
                                    fontSize: '0.7rem',
                                    fontWeight: 800
                                }}>
                                    {statementData?.ledger?.filter(d => d.isSettled).length || 0}
                                </span>
                            </button>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#fff', borderBottom: '2px solid #f1f5f9' }}>
                                        <th style={{ padding: '16px 20px', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Date</th>
                                        <th style={{ padding: '16px 20px', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Document / Subject</th>
                                        <th style={{ padding: '16px 20px', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Reference</th>
                                        <th style={{ padding: '16px 20px', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Vessel / Workplace</th>
                                        <th style={{ padding: '16px 20px', textAlign: 'right', color: '#64748b', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Debit</th>
                                        <th style={{ padding: '16px 20px', textAlign: 'right', color: '#64748b', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Credit</th>
                                        <th style={{ padding: '16px 20px', textAlign: 'right', color: '#64748b', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Balance</th>
                                        <th style={{ padding: '16px 20px', textAlign: 'center', color: '#64748b', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {statementData && statementData.openingBalance !== 0 && (
                                        <tr style={{ background: '#f0f9ff' }}>
                                            <td style={{ padding: '12px 20px', color: '#0369a1', fontWeight: 700 }} colSpan={6}>OPENING BALANCE</td>
                                            <td style={{ padding: '12px 20px', textAlign: 'right', color: '#0369a1', fontWeight: 800 }}>{statementData.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            <td></td>
                                        </tr>
                                    )}
                                    {statementData && statementData.ledger.map((doc, idx) => {
                                        if (ledgerTab === 'overdue' && doc.isSettled) return null;
                                        if (ledgerTab === 'paid' && !doc.isSettled) return null;
                                        
                                        const running = statementData.openingBalance + statementData.ledger.slice(0, idx + 1).reduce((acc, d) => acc + (d.debit - d.credit), 0);
                                        
                                        return (
                                            <tr key={doc.id} className="table-row" style={{ borderBottom: '1px solid #f1f5f9', opacity: doc.isSettled ? 0.6 : 1 }}>
                                                <td style={{ padding: '16px 20px' }}>{formatDate(doc.issue_date)}</td>
                                                <td style={{ padding: '16px 20px', fontFamily: "'Inter', sans-serif" }}>
                                                    <div style={{ color: '#1e293b' }}>{doc.document_no}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{doc.document_type} {doc.subject ? `- ${doc.subject}` : ''}</div>
                                                </td>
                                                <td style={{ padding: '16px 20px', fontSize: '0.85rem', fontFamily: "'Inter', sans-serif" }}>
                                                    <div style={{ fontWeight: 700, color: '#4f46e5' }}>{doc.customer_ref || doc.customer_po_no || doc.order_reference || '-'}</div>
                                                </td>
                                                <td style={{ padding: '16px 20px', fontSize: '0.85rem', color: '#64748b', fontFamily: "'Inter', sans-serif" }}>
                                                    {doc.vessels?.vessel_name || doc.work_locations?.location_name || doc.vessel_name || doc.work_location || '-'}
                                                </td>
                                                <td style={{ padding: '16px 20px', textAlign: 'right', color: '#ef4444', fontFamily: "'Inter', sans-serif" }}>
                                                    {doc.debit > 0 ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                            <span>{doc.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                            {doc.outstanding !== undefined && doc.outstanding !== doc.debit && (
                                                                <span style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px', fontWeight: 700 }}>
                                                                    BAL: {doc.currency || 'SGD'} {doc.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : '-'}
                                                </td>
                                                <td style={{ padding: '16px 20px', textAlign: 'right', color: '#10b981', fontFamily: "'Inter', sans-serif" }}>
                                                    {doc.credit > 0 ? doc.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                </td>
                                                <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 600, color: '#0f172a', fontFamily: "'Inter', sans-serif" }}>
                                                    {running.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                        {doc.debit > 0 && !doc.isSettled && (
                                                            <button 
                                                                className="btn-vibrant-secondary" 
                                                                onClick={() => setPaymentModal({ 
                                                                    isOpen: true, 
                                                                    prefill: { 
                                                                        partner_id: statementData.partner.id, 
                                                                        amount: doc.outstanding !== undefined ? doc.outstanding : doc.debit, 
                                                                        related_document_id: doc.id, 
                                                                        document_no: doc.document_no 
                                                                    } 
                                                                })} 
                                                                style={{ padding: '4px 8px', fontSize: '0.7rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }} 
                                                                title="Record Payment"
                                                            >
                                                                <CreditCard size={12} /> Payment Entry
                                                            </button>
                                                        )}
                                                        <button className="icon-btn" onClick={() => navigate(`/workflows/editor/${(doc.document_type || 'Tax Invoice').toLowerCase().replace(/ /g, '-')}/${doc.id}`)} title="Edit">
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button className="icon-btn" onClick={() => handleDeleteDocument(doc.id, doc.document_no)} style={{ color: '#ef4444' }} title="Delete">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {statementData && (
                            <div style={{ 
                                background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)', 
                                color: 'white', 
                                padding: '24px 32px', 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                borderTop: '1px solid rgba(255,255,255,0.1)',
                                position: 'relative',
                                zIndex: 10
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: '12px', borderRadius: '12px' }}>
                                        <CreditCard size={24} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Outstanding</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>Statement Balance</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '2.25rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                                        <span style={{ fontSize: '1.25rem', marginRight: '8px', opacity: 0.9 }}>{statementCurrency}</span>
                                        {statementData.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Statement Internal Notes */}
                    <div className="glass-panel" style={{ marginTop: '32px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <FileText size={20} className="text-accent" />
                                <h3 style={{ margin: 0 }}>Statement Internal Notes</h3>
                            </div>
                            <button className="btn-vibrant" onClick={() => alert('Notes updated successfully.')}>
                                <Save size={16} /> Update Notes
                            </button>
                        </div>
                        <RichTextEditor 
                            value={statementData.notes || ''} 
                            onChange={(val) => setStatementData({ ...statementData, notes: val })}
                            placeholder="Add reconciliation notes, special instructions, or payment agreements..."
                            height="300px"
                        />
                    </div>
                </div>
            </>
                ) : companyAging.length > 0 ? (() => {
                    return (
                        <div className="animate-fade-in">
                            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>Company-Wide Aging Summary Report</h2>
                                    <p style={{ color: '#64748b' }}>Overview of all customers with detailed aging buckets (Current to 91+ Days).</p>
                                </div>
                                <button 
                                    className="btn-vibrant" 
                                    onClick={() => handlePrintSummary()}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <Printer size={18} /> Print Summary Report
                                </button>
                            </div>

                            {/* Elegant Glassmorphic Tab Selector */}
                            <div style={{ 
                                display: 'flex', 
                                gap: '8px', 
                                background: '#f1f5f9', 
                                padding: '6px', 
                                borderRadius: '14px', 
                                marginBottom: '24px',
                                width: 'fit-content',
                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)',
                                border: '1px solid #e2e8f0'
                            }}>
                                <button 
                                    onClick={() => setActiveTab('overdue')}
                                    style={{
                                        padding: '10px 24px',
                                        fontWeight: 700,
                                        fontSize: '0.85rem',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: activeTab === 'overdue' ? 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)' : 'transparent',
                                        color: activeTab === 'overdue' ? '#ffffff' : '#64748b',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        boxShadow: activeTab === 'overdue' ? '0 4px 12px rgba(79, 70, 229, 0.25)' : 'none'
                                    }}
                                >
                                    <AlertCircle size={15} /> Overdue / Outstanding
                                    <span style={{ 
                                        background: activeTab === 'overdue' ? 'rgba(255,255,255,0.2)' : '#e2e8f0', 
                                        color: activeTab === 'overdue' ? '#ffffff' : '#475569', 
                                        padding: '2px 8px', 
                                        borderRadius: '20px', 
                                        fontSize: '0.75rem',
                                        fontWeight: 800
                                    }}>
                                        {overdueItems.length}
                                    </span>
                                </button>
                                <button 
                                    onClick={() => setActiveTab('paid')}
                                    style={{
                                        padding: '10px 24px',
                                        fontWeight: 700,
                                        fontSize: '0.85rem',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: activeTab === 'paid' ? 'linear-gradient(135deg, #10b981 0%, #047857 100%)' : 'transparent',
                                        color: activeTab === 'paid' ? '#ffffff' : '#64748b',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        boxShadow: activeTab === 'paid' ? '0 4px 12px rgba(16, 185, 129, 0.25)' : 'none'
                                    }}
                                >
                                    <CreditCard size={15} /> Paid / Settled
                                    <span style={{ 
                                        background: activeTab === 'paid' ? 'rgba(255,255,255,0.2)' : '#e2e8f0', 
                                        color: activeTab === 'paid' ? '#ffffff' : '#475569', 
                                        padding: '2px 8px', 
                                        borderRadius: '20px', 
                                        fontSize: '0.75rem',
                                        fontWeight: 800
                                    }}>
                                        {paidItems.length}
                                    </span>
                                </button>
                            </div>
                            
                            <div className="table-container" style={{ background: 'white' }}>
                                <table>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                             <th>Customer Name</th>
                                             <th style={{ textAlign: 'right' }}>Current</th>
                                             <th style={{ textAlign: 'right' }}>1-30 Days</th>
                                             <th style={{ textAlign: 'right' }}>31-60 Days</th>
                                             <th style={{ textAlign: 'right' }}>61-90 Days</th>
                                             <th style={{ textAlign: 'right' }}>91+ Days</th>
                                             <th style={{ textAlign: 'right' }}>Total Due</th>
                                             <th style={{ textAlign: 'right' }}>Action</th>
                                         </tr>
                                     </thead>
                                     <tbody>
                                         {displayedItems.map(item => (
                                             <tr key={item.id} className="table-row">
                                                 <td 
                                                     style={{ fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}
                                                     onClick={() => setSelectedPartner(item.id)}
                                                 >
                                                     {item.name}
                                                 </td>
                                                 <td style={{ textAlign: 'right' }}>{(item.aging.current || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                 <td style={{ textAlign: 'right' }}>{(item.aging.thirty || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                 <td style={{ textAlign: 'right' }}>{(item.aging.sixty || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                 <td style={{ textAlign: 'right' }}>{(item.aging.ninety || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                 <td style={{ textAlign: 'right', color: item.aging.overNinety > 0 ? '#ef4444' : 'inherit' }}>{(item.aging.overNinety || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                 <td style={{ textAlign: 'right', fontWeight: 700, color: (item.outstanding || 0) > 0 ? '#1e3a8a' : '#10b981' }}>
                                                     {item.currency || 'SGD'} {(item.outstanding || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                 </td>
                                                 <td style={{ textAlign: 'right' }}>
                                                     <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                         <button 
                                                              className="btn-vibrant-secondary"
                                                              style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                                                              onClick={() => {
                                                                  const oldestDate = item.oldest_invoice_date 
                                                                      ? item.oldest_invoice_date.split('T')[0]
                                                                      : new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
                                                                  const endDate = new Date().toISOString().split('T')[0];
                                                                  setSelectedPartner(item.id);
                                                                  handleGenerate(item.id, oldestDate, endDate);
                                                              }}
                                                          >
                                                              SOA
                                                          </button>
                                                         <button 
                                                             className="btn-primary"
                                                             style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px' }}
                                                             onClick={() => setPaymentModal({ isOpen: true, prefill: { partner_id: item.id } })}
                                                         >
                                                             <CreditCard size={14} /> Payment Entry
                                                         </button>
                                                     </div>
                                                 </td>
                                             </tr>
                                         ))}
                                         {/* Totals Row */}
                                         <tr style={{ background: '#f1f5f9', fontWeight: 900 }}>
                                             <td>TOTAL</td>
                                             <td style={{ textAlign: 'right' }}>{summaryCurrency} {displayedItems.reduce((acc, it) => acc + it.aging.current, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                             <td style={{ textAlign: 'right' }}>{summaryCurrency} {displayedItems.reduce((acc, it) => acc + it.aging.thirty, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                             <td style={{ textAlign: 'right' }}>{summaryCurrency} {displayedItems.reduce((acc, it) => acc + it.aging.sixty, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                             <td style={{ textAlign: 'right' }}>{summaryCurrency} {displayedItems.reduce((acc, it) => acc + it.aging.ninety, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                             <td style={{ textAlign: 'right' }}>{summaryCurrency} {displayedItems.reduce((acc, it) => acc + it.aging.overNinety, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                             <td style={{ textAlign: 'right', color: '#1e3a8a' }}>{summaryCurrency} {displayedItems.reduce((acc, it) => acc + it.outstanding, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                             <td></td>
                                         </tr>
                                     </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })() : (
                    <div style={{ padding: '80px 40px', textAlign: 'center', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                            <Filter size={32} color="#3b82f6" />
                        </div>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1e3a8a', marginBottom: '12px' }}>Customer Financial Dashboard</h2>
                        <p style={{ color: '#64748b', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto 24px' }}>Select a customer from the top filters to generate a detailed Statement of Account, view aging history, and record payments.</p>
                    </div>
                )}
            </>
        ) : (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* 10-Day Cycle Status Tracker Panel */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                    {[
                        { 
                            day: 5, 
                            title: '5th Billing Cycle', 
                            dueStr: 'Due on 5th of Month',
                            range: '1st - 5th invoices', 
                            bgColor: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', 
                            borderColor: '#bfdbfe', 
                            iconColor: '#3b82f6',
                            textColor: '#1e40af'
                        },
                        { 
                            day: 15, 
                            title: '15th Billing Cycle', 
                            dueStr: 'Due on 15th of Month',
                            range: '6th - 15th invoices', 
                            bgColor: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)', 
                            borderColor: '#e9d5ff', 
                            iconColor: '#a855f7',
                            textColor: '#6b21a8'
                        },
                        { 
                            day: 25, 
                            title: '25th Billing Cycle', 
                            dueStr: 'Due on 25th of Month',
                            range: '16th - 25th invoices', 
                            bgColor: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', 
                            borderColor: '#a7f3d0', 
                            iconColor: '#10b981',
                            textColor: '#065f46'
                        },
                        { 
                            day: 30, 
                            title: 'End of Month Cycle', 
                            dueStr: 'Due on Last Day of Month',
                            range: '26th - EOM invoices', 
                            bgColor: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', 
                            borderColor: '#fde68a', 
                            iconColor: '#f59e0b',
                            textColor: '#854d0e'
                        }
                    ].map(cycle => {
                        const today = new Date();
                        const isDone = isCycleDispatched(cycle.day);
                        const isCurrent = (cycle.day === 5 && today.getDate() >= 5 && today.getDate() < 15) ||
                                          (cycle.day === 15 && today.getDate() >= 15 && today.getDate() < 25) ||
                                          (cycle.day === 25 && today.getDate() >= 25 && today.getDate() < 30) ||
                                          (cycle.day === 30 && (today.getDate() >= 30 || today.getDate() < 5));
                        
                        return (
                            <div key={cycle.day} className="glass-panel" style={{ 
                                padding: '24px', 
                                background: cycle.bgColor, 
                                border: `1px solid ${cycle.borderColor}`,
                                borderRadius: '20px',
                                position: 'relative',
                                overflow: 'hidden',
                                boxShadow: isCurrent ? '0 10px 15px -3px rgba(0, 0, 0, 0.05)' : 'none'
                            }}>
                                {isCurrent && (
                                    <div style={{ 
                                        position: 'absolute', 
                                        top: '12px', 
                                        right: '12px', 
                                        background: '#2563eb', 
                                        color: 'white', 
                                        padding: '2px 10px', 
                                        borderRadius: '20px', 
                                        fontSize: '0.7rem', 
                                        fontWeight: 800,
                                        letterSpacing: '0.05em',
                                        textTransform: 'uppercase'
                                    }}>
                                        Active Cycle
                                    </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                    <div style={{ background: '#fff', color: cycle.iconColor, padding: '10px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Calendar size={20} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: cycle.textColor }}>{cycle.title}</h3>
                                        <span style={{ fontSize: '0.75rem', opacity: 0.8, color: cycle.textColor }}>{cycle.dueStr}</span>
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: cycle.textColor, marginBottom: '20px' }}>
                                    Scope: <strong>{cycle.range}</strong>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {isDone ? (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#10b981', fontWeight: 800 }}>
                                            <CheckCircle size={16} /> Dispatched Successfully
                                        </span>
                                    ) : isCurrent ? (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#d97706', fontWeight: 800 }} className="animate-pulse">
                                            <AlertCircle size={16} /> Action Required (Pending)
                                        </span>
                                    ) : (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#64748b', fontWeight: 700 }}>
                                            <Clock size={16} /> Upcoming
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Editable Email Template Panel */}
                <div className="glass-panel" style={{ padding: '24px', borderRadius: '20px', background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ background: '#eff6ff', color: '#2563eb', padding: '8px', borderRadius: '10px' }}>
                            <Mail size={20} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#1e293b' }}>Customizable Email Body Template</h3>
                            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                Customize the statement email message. Use placeholders: 
                                <strong style={{ color: '#2563eb' }}> [Customer Name]</strong>, 
                                <strong style={{ color: '#2563eb' }}> [Outstanding Balance]</strong>, 
                                <strong style={{ color: '#2563eb' }}> [Start Date]</strong>, 
                                <strong style={{ color: '#2563eb' }}> [End Date]</strong>.
                            </p>
                        </div>
                    </div>
                    <RichTextEditor 
                        value={customEmailBody} 
                        onChange={setCustomEmailBody} 
                        placeholder="Write the email content..."
                        height="220px"
                    />
                </div>

                {/* Bulk Dispatch Progress HUD */}
                {dispatchProgress && (
                    <div className="glass-panel" style={{ padding: '24px', borderRadius: '20px', borderLeft: '4px solid #10b981', background: '#f0fdf4' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Loader2 className="animate-spin" size={18} color="#10b981" />
                                <span style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '0.95rem' }}>{dispatchProgress.status}</span>
                            </div>
                            <span style={{ fontSize: '0.9rem', color: '#047857', fontWeight: 800 }}>
                                {dispatchProgress.current} / {dispatchProgress.total} (
                                {Math.round((dispatchProgress.current / dispatchProgress.total) * 100)}%)
                            </span>
                        </div>
                        <div style={{ background: '#d1fae5', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                            <div style={{ 
                                background: 'linear-gradient(90deg, #10b981 0%, #3b82f6 100%)', 
                                height: '100%', 
                                width: `${(dispatchProgress.current / dispatchProgress.total) * 100}%`, 
                                transition: 'width 0.4s ease' 
                            }}></div>
                        </div>
                    </div>
                )}

                {/* Accounts Checklist Table */}
                <div className="glass-panel" style={{ padding: '24px', borderRadius: '20px', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#1e293b' }}>Automated Dispatch Checklist</h3>
                            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Select outstanding customer accounts to receive Statement of Accounts dynamically.</p>
                        </div>
                        <button 
                            className="btn-vibrant" 
                            onClick={handleBulkDispatch}
                            disabled={saving || Object.keys(selectedDispatchPartners).filter(id => selectedDispatchPartners[id]).length === 0}
                            style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, borderRadius: '10px' }}
                        >
                            <Send size={16} /> 
                            {saving ? 'Dispatching...' : `Dispatch Selected SOAs (${Object.keys(selectedDispatchPartners).filter(id => selectedDispatchPartners[id]).length})`}
                        </button>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table className="workflow-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={{ width: '40px', padding: '16px 12px', textAlign: 'left' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={companyAging.filter(it => it.outstanding > 0.01).length > 0 && companyAging.filter(it => it.outstanding > 0.01).every(it => selectedDispatchPartners[it.id])} 
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                const updated = {};
                                                companyAging.filter(it => it.outstanding > 0.01).forEach(it => {
                                                    updated[it.id] = checked;
                                                });
                                                setSelectedDispatchPartners(updated);
                                            }}
                                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                        />
                                    </th>
                                    <th style={{ padding: '16px 12px', textAlign: 'left', fontWeight: 800, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>Customer Name</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 800, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>Outstanding Balance</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'left', fontWeight: 800, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>Last SOA Sent Date</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'left', fontWeight: 800, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>Email Recipients</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 800, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {companyAging.filter(it => it.outstanding > 0.01).map((item, idx) => {
                                    const status = dispatchingStates[item.id];
                                    const lastSent = getLastSentDate(item.id);
                                    const recips = getRecipientsList(item);
                                    
                                    return (
                                        <tr key={item.id} className="table-row" style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '16px 12px' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={!!selectedDispatchPartners[item.id]} 
                                                    onChange={(e) => setSelectedDispatchPartners(prev => ({ ...prev, [item.id]: e.target.checked }))}
                                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                                />
                                            </td>
                                            <td style={{ padding: '16px 12px', fontWeight: 700, color: '#0f172a' }}>{item.name}</td>
                                            <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 800, color: '#1e3a8a' }}>
                                                {item.currency || 'SGD'} {item.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ padding: '16px 12px', color: lastSent === 'Never Sent' ? '#94a3b8' : '#334155', fontSize: '0.85rem' }}>
                                                {lastSent}
                                            </td>
                                            <td style={{ padding: '16px 12px', color: '#64748b', fontSize: '0.8rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={recips}>
                                                {recips}
                                            </td>
                                            <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                                                {status === 'loading' && (
                                                    <span style={{ color: '#2563eb', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                                                        <Loader2 size={14} className="animate-spin" /> Sending...
                                                    </span>
                                                )}
                                                {status === 'success' && (
                                                    <span style={{ color: '#10b981', fontWeight: 800 }}>✅ Sent!</span>
                                                )}
                                                {status === 'failed' && (
                                                    <span style={{ color: '#ef4444', fontWeight: 800 }}>❌ Failed</span>
                                                )}
                                                {!status && (
                                                    <span style={{ color: '#64748b', fontWeight: 600 }}>Ready</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {companyAging.filter(it => it.outstanding > 0.01).length === 0 && (
                                    <tr>
                                        <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
                                            🎉 All accounts are fully settled! No outstanding Statements of Account to dispatch.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}
    </div>


            {/* Hidden Print Content - Off-screen for PDF capture */}
            <div style={{ position: 'fixed', left: 0, top: 0, zIndex: -9999, pointerEvents: 'none', width: '850px', background: '#fff' }}>
                <div ref={printRef} style={{ background: 'white', padding: '5mm' }}>
                    <style>{`
                        @import url('https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@300;400;700&display=swap');
                    `}</style>
                    {statementData && (
                        <div style={{ background: 'white', color: '#000', fontFamily: "'Roboto Condensed', sans-serif" }}>
                            {/* Celron Letterhead */}
                            {/* ERP Style Letterhead - Condensed */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                    {logoBase64 && <img src={logoBase64} alt="Logo" style={{ height: '50px', objectFit: 'contain' }} />}
                                    <div>
                                        <h1 style={{ margin: 0, color: '#1e3a8a', fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.03em', textTransform: 'uppercase' }}>Statement of Account</h1>
                                        <p style={{ margin: '2px 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Period: {formatDate(dateRange.start)} - {formatDate(dateRange.end)}</p>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e3a8a' }}>{profile?.company_name || 'CEL-RON ENTERPRISES PTE LTD'}</h2>
                                    <div style={{ fontSize: '0.6rem', color: '#64748b', marginTop: '4px', lineHeight: 1.3 }}>
                                        <div>{settings?.address || '10, Jln, Besar, "Sim Lim Tower", #03-05, Singapore 208787'}</div>
                                        <div>Tel: {settings?.phone || '+6581962270'} | Email: {settings?.email || 'accounts@celron.net'} | www.celron.net</div>
                                    </div>
                                </div>
                            </div>

                            {/* Info & Balance Cards - Compact */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginBottom: '20px' }}>
                                <div style={{ flex: 1, background: '#f8fafc', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '0.55rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Statement To</div>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>{statementData.partner?.name}</h3>
                                    <div style={{ marginTop: '6px', color: '#475569', fontSize: '0.65rem', lineHeight: 1.4 }}>
                                        <div style={{ whiteSpace: 'pre-line' }}>
                                            {statementData.partner?.address}
                                            {(statementData.partner?.city || statementData.partner?.pincode || statementData.partner?.country) && (
                                                <div>
                                                    {[
                                                        statementData.partner?.city,
                                                        statementData.partner?.country,
                                                        statementData.partner?.pincode
                                                    ].filter(Boolean).join(', ')}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ marginTop: '4px' }}>
                                            {(statementData.partner?.phone1 || statementData.partner?.phone) && (
                                                <div>Tel: {statementData.partner.phone1 || statementData.partner.phone}</div>
                                            )}
                                            {(statementData.partner?.email1 || statementData.partner?.email) && (
                                                <div style={{ fontWeight: 600 }}>{statementData.partner.email1 || statementData.partner.email}</div>
                                            )}
                                            {statementData.partner?.weblink && (
                                                <div style={{ color: '#1e3a8a', fontSize: '0.6rem' }}>{statementData.partner.weblink}</div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-12px' }}>
                                            <div style={{ fontSize: '0.6rem', background: '#e2e8f0', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, color: '#1e3a8a' }}>
                                                TERMS: {statementData.partner?.customerCreditTime && statementData.partner.customerCreditTime !== '0' ? `${statementData.partner.customerCreditTime} DAYS` : 'C.O.D'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ width: '260px', background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)', padding: '12px', borderRadius: '10px', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: '0 4px 10px rgba(30, 58, 138, 0.15)', textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Outstanding Balance</div>
                                    <div style={{ fontSize: '2.1rem', fontWeight: 900, marginTop: '2px' }}>
                                        <span style={{ fontSize: '0.9rem', opacity: 0.9, marginRight: '4px' }}>{statementCurrency}</span>
                                        {statementData.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                    <div style={{ fontSize: '0.55rem', marginTop: '8px', color: 'rgba(255,255,255,0.6)', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '6px' }}>
                                        As of {formatDate(dateRange.end)}
                                    </div>
                                </div>
                            </div>

                            {/* ERP Premium Table - Industrial-Fit Layout */}
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '6px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: '-0.01em' }}>
                                <thead>
                                    <tr style={{ background: '#1e3a8a', color: 'white' }}>
                                        <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 800, borderRight: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap', width: '9%' }}>DATE</th>
                                        <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 800, borderRight: '1px solid rgba(255,255,255,0.1)', width: '20%' }}>DOCUMENT / TYPE</th>
                                        <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 800, borderRight: '1px solid rgba(255,255,255,0.1)', width: '18%' }}>REFERENCE (CUST PO)</th>
                                        <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 800, borderRight: '1px solid rgba(255,255,255,0.1)', width: '24%' }}>VESSEL / WORKPLACE</th>
                                        <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, borderRight: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap', width: '10%' }}>AMOUNT</th>
                                        <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 800, borderRight: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap', width: '9%' }}>AGING</th>
                                        <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap', width: '10%' }}>BALANCE</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style={{ background: '#f1f5f9' }}>
                                        <td style={{ padding: '12px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 800, color: '#64748b', fontSize: '11px' }}>-</td>
                                        <td style={{ padding: '12px 6px', borderBottom: '1px solid #e2e8f0', fontWeight: 900, color: '#1e3a8a', fontSize: '11px' }} colSpan={5}>OPENING BALANCE</td>
                                        <td style={{ padding: '12px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 900, color: '#1e3a8a', whiteSpace: 'nowrap', fontSize: '11px' }}>{statementData.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                    {statementData.ledger.map((row, idx) => {
                                        // Calculate running balance for the print template
                                        let runningBalance = statementData.openingBalance;
                                        for (let i = 0; i <= idx; i++) {
                                            const r = statementData.ledger[i];
                                            runningBalance += (r.debit - r.credit);
                                        }

                                        return (
                                            <tr key={idx} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', whiteSpace: 'nowrap', color: '#64748b' }}>
                                                    {formatDate(row.issue_date)}
                                                </td>
                                                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                                                    <div style={{ color: '#1e293b' }}>{row.document_no}</div>
                                                    <div style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.02em', marginTop: '1px' }}>{row.document_type}</div>
                                                </td>
                                                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                                                    <div style={{ fontWeight: 700, color: '#1e3a8a' }}>{row.customer_ref || row.customer_po_no || row.order_reference || '-'}</div>
                                                </td>
                                                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f1f5f9', color: '#475569', wordBreak: 'break-word', lineHeight: 1.2 }}>{row.vessels?.vessel_name || row.work_locations?.location_name || row.vessel_name || row.work_location || '-'}</td>
                                                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: row.debit > 0 ? '#e11d48' : '#059669', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                                    {row.debit > 0 ? (
                                                        <div>
                                                            <div>{row.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                                            {row.outstanding !== undefined && row.outstanding !== row.debit && (
                                                                <div style={{ fontSize: '7px', color: '#64748b', marginTop: '1px' }}>
                                                                    BAL: {row.currency || 'SGD'} {row.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : `(${row.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })})`}
                                                </td>
                                                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: '#64748b', fontSize: '9px', fontWeight: 600 }}>
                                                    {Math.floor((new Date() - new Date(row.issue_date)) / (1000 * 60 * 60 * 24))} Days
                                                </td>
                                                <td style={{ padding: '4px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>{runningBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        );
                                    })}
                                    <tr style={{ background: '#0f172a', color: 'white' }}>
                                        <td style={{ padding: '15px 10px', textAlign: 'center', fontWeight: 700, color: 'white', fontSize: '13px' }}>-</td>
                                        <td style={{ padding: '15px 10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'white', fontSize: '13px' }} colSpan={5}>TOTAL OUTSTANDING</td>
                                        <td style={{ padding: '15px 10px', textAlign: 'right', fontWeight: 900, fontSize: '13px', color: 'white', whiteSpace: 'nowrap' }}>
                                            {statementCurrency} {statementData.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* Aging Summary & Terms */}
                            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', flex: 1 }}>
                                {[
                                    { label: 'Current', value: statementData.aging.current },
                                    { label: '31-60 Days', value: statementData.aging.thirty },
                                    { label: '61-90 Days', value: statementData.aging.sixty },
                                    { label: '90+ Days', value: statementData.aging.ninety }
                                ].map((bucket, i) => (
                                    <div key={i} style={{ background: bucket.value > 0 ? '#fff1f2' : '#f8fafc', padding: '10px', borderRadius: '8px', border: `1px solid ${bucket.value > 0 ? '#fecdd3' : '#e2e8f0'}`, textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.5rem', fontWeight: 800, color: bucket.value > 0 ? '#e11d48' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{bucket.label}</div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: bucket.value > 0 ? '#9f1239' : '#0f172a' }}>{statementCurrency} {bucket.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                    </div>
                                ))}
                                </div>
                                <div style={{ width: '120px', marginLeft: '15px', padding: '8px', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center', background: '#f8fafc' }}>
                                    <div style={{ fontSize: '0.45rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Delivery / Payment Terms</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#1e3a8a' }}>
                                        {(() => {
                                            const t = statementData.partner?.terms || statementData.partner?.payment_terms || statementData.partner?.customerCreditTime;
                                            if (!t || t === '0') return 'C.O.D';
                                            if (/^\d+$/.test(String(t).trim())) return `${t} DAYS`;
                                            return String(t).toUpperCase();
                                        })()}
                                    </div>
                                    <div style={{ fontSize: '0.4rem', color: '#94a3b8', marginTop: '2px' }}>
                                        {(() => {
                                            const t = statementData.partner?.terms || statementData.partner?.payment_terms || statementData.partner?.customerCreditTime;
                                            if (!t || String(t).toUpperCase().includes('C.O.D') || t === '0') return 'Payable upon Delivery';
                                            return 'From Date of Invoice';
                                        })()}
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginTop: '25px', borderTop: '1px solid #e2e8f0', paddingTop: '15px', fontSize: '0.55rem', color: '#94a3b8', textAlign: 'center' }}>
                                This is a computer generated document. No signature is required.
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Opening Balance Modal */}
            {openingBalanceModal.isOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: '24px', backdropFilter: 'blur(4px)' }}>
                    <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '900px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff', padding: 0 }}>
                        <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e3a8a' }}>Opening Balance Breakdown</h3>
                                <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>Transactions recorded before {new Date(dateRange.start).toLocaleDateString()}</p>
                            </div>
                            <button onClick={() => setOpeningBalanceModal({ isOpen: false, items: [] })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><AlertCircle size={24} style={{ transform: 'rotate(45deg)' }} /></button>
                        </div>
                        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '2px solid #f1f5f9' }}>
                                        <th style={{ padding: '12px' }}>Date</th>
                                        <th style={{ padding: '12px' }}>Document No</th>
                                        <th style={{ padding: '12px' }}>Type</th>
                                        <th style={{ padding: '12px', textAlign: 'right' }}>Debit (+)</th>
                                        <th style={{ padding: '12px', textAlign: 'right' }}>Credit (-)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {openingBalanceModal.items.map(it => (
                                        <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '12px' }}>{new Date(it.issue_date).toLocaleDateString()}</td>
                                            <td style={{ padding: '12px', fontWeight: 600 }}>{it.document_no}</td>
                                            <td style={{ padding: '12px', fontSize: '0.8rem' }}>{it.document_type}</td>
                                            <td style={{ padding: '12px', textAlign: 'right', color: it.debit > 0 ? '#1e293b' : '#94a3b8' }}>{it.debit > 0 ? it.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</td>
                                            <td style={{ padding: '12px', textAlign: 'right', color: it.credit > 0 ? '#10b981' : '#94a3b8' }}>{it.credit > 0 ? it.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                                        <td colSpan="3" style={{ padding: '16px', borderRadius: '0 0 0 12px' }}>CALCULATED OPENING BALANCE</td>
                                        <td colSpan="2" style={{ padding: '16px', textAlign: 'right', borderRadius: '0 0 12px 0', color: '#1e3a8a', fontSize: '1.1rem' }}>
                                            {statementCurrency} {statementData?.openingBalance?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        <div style={{ padding: '20px', background: '#f8fafc', textAlign: 'right' }}>
                            <button className="btn btn-primary" onClick={() => setOpeningBalanceModal({ isOpen: false, items: [] })}>Close Breakdown</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Payment Modal */}
            {paymentModal.isOpen && (
                <ReceivePaymentModal 
                    prefill={paymentModal.prefill} 
                    onClose={() => setPaymentModal({ isOpen: false, prefill: null })} 
                    onSuccess={handleQuickPaymentSuccess} 
                    partners={partners}
                    company_id={profile?.company_id}
                />
            )}

            {/* Hidden Print Content for Summary Report */}
            <div style={{ position: 'fixed', left: 0, top: 0, zIndex: -9999, pointerEvents: 'none', width: '1100px', background: '#fff' }}>
                <div ref={printSummaryRef} style={{ background: 'white', padding: '10mm' }}>
                    <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                        <h1 style={{ margin: 0, color: '#1e3a8a', fontSize: '1.6rem', fontWeight: 900 }}>A/R Ageing Summary Report</h1>
                        <h2 style={{ margin: '5px 0', fontSize: '1.1rem', color: '#475569' }}>{profile?.company_name || 'CEL-RON ENTERPRISES PTE LTD'}</h2>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>As of {formatDate(new Date())}</p>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #1e3a8a' }}>
                                <th style={{ padding: '10px', textAlign: 'left' }}>CUSTOMER NAME</th>
                                <th style={{ padding: '10px', textAlign: 'right' }}>CURRENT</th>
                                <th style={{ padding: '10px', textAlign: 'right' }}>1-30 DAYS</th>
                                <th style={{ padding: '10px', textAlign: 'right' }}>31-60 DAYS</th>
                                <th style={{ padding: '10px', textAlign: 'right' }}>61-90 DAYS</th>
                                <th style={{ padding: '10px', textAlign: 'right' }}>91+ DAYS</th>
                                <th style={{ padding: '10px', textAlign: 'right' }}>TOTAL DUE</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayedItems.map((item, idx) => (
                                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#fcfcfc' }}>
                                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{item.name}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{item.aging.current.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{item.aging.thirty.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{item.aging.sixty.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{item.aging.ninety.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{item.aging.overNinety.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{item.currency || 'SGD'} {item.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                            <tr style={{ background: '#f1f5f9', fontWeight: 900, borderTop: '2px solid #1e3a8a' }}>
                                <td style={{ padding: '12px 10px' }}>TOTAL</td>
                                <td style={{ padding: '12px 10px', textAlign: 'right' }}>{displayedItems.reduce((acc, it) => acc + it.aging.current, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={{ padding: '12px 10px', textAlign: 'right' }}>{displayedItems.reduce((acc, it) => acc + it.aging.thirty, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={{ padding: '12px 10px', textAlign: 'right' }}>{displayedItems.reduce((acc, it) => acc + it.aging.sixty, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={{ padding: '12px 10px', textAlign: 'right' }}>{displayedItems.reduce((acc, it) => acc + it.aging.ninety, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={{ padding: '12px 10px', textAlign: 'right' }}>{displayedItems.reduce((acc, it) => acc + it.aging.overNinety, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={{ padding: '12px 10px', textAlign: 'right' }}>{summaryCurrency} {displayedItems.reduce((acc, it) => acc + it.outstanding, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div style={{ marginTop: '30px', fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center' }}>
                        This report is generated from CelronHub ERP as of {new Date().toLocaleString()}
                    </div>
                </div>
            </div>
            {showWhatsAppModal && (
                <WhatsAppShareModal 
                    isOpen={showWhatsAppModal}
                    onClose={() => setShowWhatsAppModal(false)}
                    contacts={selectedPartner ? contacts.filter(c => c.partnerId === selectedPartner) : []}
                    partner={statementData?.partner || null}
                    documentData={{
                        document_type: statementData ? 'Statement of Account' : 'Aging Summary Report',
                        document_no: statementData ? `SOA-${new Date().toISOString().split('T')[0]}` : `SUM-${new Date().toISOString().split('T')[0]}`,
                        subject: statementData ? `Statement for period ${formatDate(dateRange.start)} to ${formatDate(dateRange.end)}` : `Company-Wide Aging Summary as of ${new Date().toLocaleDateString()}`,
                        currency: statementData ? statementCurrency : summaryCurrency,
                        total_amount: statementData ? statementData.closingBalance : companyAging.reduce((sum, item) => sum + item.outstanding, 0),
                        salesperson_name: profile?.full_name
                    }}
                    onShareFile={(msg, phone) => handleShareFile('whatsapp', msg, phone)}
                />
            )}

            {showEmailModal && (
                <EmailShareModal 
                    isOpen={showEmailModal}
                    onClose={() => setShowEmailModal(false)}
                    partner={statementData?.partner || null}
                    contacts={contacts}
                    dateRange={dateRange}
                    documentData={{
                        document_type: statementData ? 'Statement of Account' : 'Aging Summary Report',
                        document_no: statementData ? `SOA-${new Date().toISOString().split('T')[0]}` : `SUM-${new Date().toISOString().split('T')[0]}`,
                        closingBalance: statementData ? statementData.closingBalance : companyAging.reduce((sum, item) => sum + item.outstanding, 0),
                        currency: statementData ? statementCurrency : summaryCurrency
                    }}
                    onShare={(preview, attachExcel) => handleShareFile('email', preview.body, preview.to, preview.cc, preview.bcc, preview.subject, attachExcel)}
                />
            )}
        </div>
    );
}

// Helper Component: SearchableDropdown for contacts
function SearchableDropdown({ placeholder, searchVal, setSearchVal, isOpen, setIsOpen, options, onSelect }) {
    return (
        <div style={{ position: 'relative', width: '100%', zIndex: isOpen ? 9999 : 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <input 
                    type="text"
                    placeholder={placeholder}
                    value={searchVal}
                    onChange={(e) => { setSearchVal(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                    style={{ 
                        width: '100%', 
                        padding: '8px 12px 8px 32px', 
                        border: '1px solid #cbd5e1', 
                        borderRadius: '8px', 
                        fontSize: '12px', 
                        outline: 'none', 
                        boxSizing: 'border-box',
                        transition: 'border-color 0.2s',
                        background: '#fff',
                        height: '34px'
                    }}
                />
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px' }} />
                {searchVal && (
                    <button 
                        type="button" 
                        onClick={() => setSearchVal('')}
                        style={{ position: 'absolute', right: '10px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
                    >
                        <X size={14} />
                    </button>
                )}
            </div>
            {isOpen && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }} onClick={() => setIsOpen(false)} />
                    <div style={{ 
                        position: 'absolute', 
                        top: 'calc(100% + 4px)', 
                        left: 0, 
                        right: 0, 
                        background: '#fff', 
                        border: '1px solid #cbd5e1', 
                        borderRadius: '8px', 
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', 
                        maxHeight: '160px', 
                        overflowY: 'auto', 
                        zIndex: 9500,
                        padding: '4px'
                    }}>
                        {options.length === 0 ? (
                            <div style={{ padding: '8px 12px', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
                                No matching contacts found
                            </div>
                        ) : (
                            options.map((opt, i) => (
                                <DropdownItem 
                                    key={i} 
                                    opt={opt} 
                                    onClick={() => { onSelect(opt); setIsOpen(false); setSearchVal(''); }}
                                />
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

// Helper Component: SearchableDropdown Item
function DropdownItem({ opt, onClick }) {
    const [hover, setHover] = useState(false);
    return (
        <div 
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{ 
                padding: '6px 10px', 
                fontSize: '11px', 
                borderRadius: '6px', 
                cursor: 'pointer',
                background: hover ? '#f1f5f9' : 'transparent',
                transition: 'background 0.2s',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
            }}
        >
            <div style={{ fontWeight: 600, color: '#1e293b' }}>{opt.name}</div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>{opt.email}</div>
        </div>
    );
}

// Helper Component: Contact card representation
function ContactCard({ contact, emailPreview, toggleEmailInField, onEdit }) {
    const contactEmail = (contact.email || '').trim().toLowerCase();
    const isToActive = contactEmail ? emailPreview.to.split(';').map(e => e.trim().toLowerCase()).includes(contactEmail) : false;
    const isCcActive = contactEmail ? emailPreview.cc.split(';').map(e => e.trim().toLowerCase()).includes(contactEmail) : false;

    return (
        <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            minWidth: '220px'
        }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={contact.name}>
                    {contact.name}
                </span>
                <span style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={contact.email || 'No email registered'}>
                    {contact.email || 'No email registered'}
                </span>
            </div>
            
            <div style={{ display: 'flex', gap: '5px', borderLeft: '1px solid #f1f5f9', paddingLeft: '8px', alignItems: 'center' }}>
                {contact.id && (
                    <button 
                        type="button"
                        onClick={() => onEdit(contact)}
                        title="Edit Contact"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '3px', color: '#94a3b8', transition: 'color 0.2s' }}
                    >
                        <Edit2 size={12} />
                    </button>
                )}
                
                {contact.email && (
                    <>
                        <button 
                            type="button"
                            onClick={() => toggleEmailInField('to', contact.email)}
                            style={{ 
                                background: isToActive ? '#eef2ff' : '#f8fafc', 
                                color: isToActive ? '#4f46e5' : '#64748b', 
                                border: `1px solid ${isToActive ? '#c7d2fe' : '#e2e8f0'}`, 
                                borderRadius: '4px', 
                                padding: '2px 8px', 
                                fontSize: '10px', 
                                fontWeight: 800, 
                                cursor: 'pointer',
                                transition: 'all 0.15s ease-in-out'
                            }}
                        >
                            To
                        </button>
                        
                        <button 
                            type="button"
                            onClick={() => toggleEmailInField('cc', contact.email)}
                            style={{ 
                                background: isCcActive ? '#f0fdf4' : '#f8fafc', 
                                color: isCcActive ? '#16a34a' : '#64748b', 
                                border: `1px solid ${isCcActive ? '#bbf7d0' : '#e2e8f0'}`, 
                                borderRadius: '4px', 
                                padding: '2px 8px', 
                                fontSize: '10px', 
                                fontWeight: 800, 
                                cursor: 'pointer',
                                transition: 'all 0.15s ease-in-out'
                            }}
                        >
                            Cc
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

function EmailShareModal({ isOpen, onClose, partner, documentData, onShare, contacts = [], dateRange }) {
    const [emailPreview, setEmailPreview] = useState({
        to: '',
        cc: 'accounts@celron.net; acct.celron.sg@gmail.com',
        bcc: 'celron.simlim0305@gmail.com',
        subject: `${documentData?.document_type || 'Statement'} - ${partner?.name || 'Customer'}`,
        body: '',
        attachments: []
    });

    const [localContacts, setLocalContacts] = useState(contacts);
    const [attachExcel, setAttachExcel] = useState(false);

    // Searchable dropdown states
    const [companySearch, setCompanySearch] = useState('');
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
    const [officeSearch, setOfficeSearch] = useState('');
    const [showOfficeDropdown, setShowOfficeDropdown] = useState(false);

    // Lists of extra visible contacts added dynamically
    const [customVisibleContacts, setCustomVisibleContacts] = useState([]);
    const [customOfficeContacts, setCustomOfficeContacts] = useState([]);

    // Modal add/edit contact states
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [modalContactType, setModalContactType] = useState('customer'); // 'customer' or 'office'
    const [editingContact, setEditingContact] = useState(null);
    const [modalName, setModalName] = useState('');
    const [modalEmail, setModalEmail] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setLocalContacts(contacts);
    }, [contacts]);

    const formatDate = (d) => {
        if (!d) return '-';
        const date = new Date(d);
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    };

    useEffect(() => {
        if (isOpen) {
            const periodStr = dateRange ? `Period: ${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}\n\n` : '';
            const defaultMsg = `Dear ${partner?.name || 'Accounts Team'},\n\n${periodStr}Please find the ${documentData?.document_type || 'Statement'} (${documentData?.document_no || ''}) for your review and reference.\n\nAwaiting for your valuable payment.\n\nTotal Due: ${documentData?.currency || 'SGD'} ${(documentData?.closingBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}.\n\nBest Regards,\n\nANITHA HP:+65 81962270\nCELRON ENTERPRISES PTE LTD\n10, Jln, Besar, " Sim Lim Tower" #03-05, Singapore 208787\nEmail: accounts@celron.net | Tel: +6591090347\nweb: www.celron.net / www.celron.shop`;
            setEmailPreview(prev => ({ ...prev, body: defaultMsg }));
        }
    }, [isOpen, partner, documentData, dateRange]);

    const toggleEmailInField = (field, email) => {
        if (!email) return;
        setEmailPreview(prev => {
            const current = prev[field] || '';
            let emails = current.split(';').map(e => e.trim()).filter(Boolean);
            const lowerEmail = email.trim().toLowerCase();
            const matched = emails.find(e => e.toLowerCase() === lowerEmail);

            if (matched) {
                emails = emails.filter(e => e.toLowerCase() !== lowerEmail);
            } else {
                emails.push(email);
            }
            return { ...prev, [field]: emails.join('; ') };
        });
    };

    // Customer Contacts: direct ones + custom visibilities
    const getCustomerContacts = () => {
        const direct = partner ? localContacts.filter(c => c.partnerId === partner.id) : [];
        const combined = [...direct];
        customVisibleContacts.forEach(c => {
            if (c.email && !combined.find(x => x.email && x.email.toLowerCase() === c.email.toLowerCase())) {
                combined.push(c);
            }
        });
        return combined;
    };

    // Office Contacts: Our Office default + internal staff + custom office selections
    const getOfficeContacts = () => {
        const defaults = [
            { name: 'Our Office', email: 'accounts@celron.net' }
        ];

        // Find the Celron partner ID dynamically, or use the standard fallback
        const celronContact = localContacts.find(c => {
            const emailLower = (c.email || '').toLowerCase();
            return emailLower.endsWith('@celron.net') || emailLower.endsWith('@celron.com');
        });
        const celronPartnerId = celronContact?.partnerId || 'ae0c632b-d56b-425b-9773-79aa3fa33bd0';

        const isCelronContact = (c) => {
            if (!c.email) return false;
            const emailLower = c.email.toLowerCase();
            const nameLower = (c.name || '').toLowerCase();
            
            const isCelronEmail = emailLower.endsWith('@celron.net') || 
                                  emailLower.endsWith('@celron.com') ||
                                  emailLower.includes('celron');
                                  
            const isCelronPartner = c.partnerId === celronPartnerId;
            const isCelronName = nameLower.includes('celron') || nameLower.includes('cel-ron');
            
            return isCelronEmail || isCelronPartner || isCelronName;
        };

        const staff = localContacts.filter(c => isCelronContact(c));

        const combined = [...defaults];
        staff.forEach(c => {
            if (c.email && !combined.find(x => x.email && x.email.toLowerCase() === c.email.toLowerCase())) {
                combined.push({ id: c.id, name: c.name, email: c.email });
            }
        });
        customOfficeContacts.forEach(c => {
            if (c.email && !combined.find(x => x.email && x.email.toLowerCase() === c.email.toLowerCase())) {
                combined.push(c);
            }
        });
        return combined;
    };

    // Filter lists for dropdown searches
    const getCompanyDropdownOptions = () => {
        const query = companySearch.trim().toLowerCase();
        if (!query) {
            // Show all contacts that have email and are NOT already in the visible customer list
            const currentEmails = getCustomerContacts().map(c => (c.email || '').toLowerCase()).filter(Boolean);
            return localContacts.filter(c => c.partnerId && c.email && !currentEmails.includes(c.email.toLowerCase()));
        }
        return localContacts.filter(c => 
            c.email && 
            (c.name?.toLowerCase().includes(query) || c.email?.toLowerCase().includes(query))
        );
    };

    const getOfficeDropdownOptions = () => {
        const query = officeSearch.trim().toLowerCase();
        const currentEmails = getOfficeContacts().map(c => (c.email || '').toLowerCase()).filter(Boolean);

        const celronContact = localContacts.find(c => {
            const emailLower = (c.email || '').toLowerCase();
            return emailLower.endsWith('@celron.net') || emailLower.endsWith('@celron.com');
        });
        const celronPartnerId = celronContact?.partnerId || 'ae0c632b-d56b-425b-9773-79aa3fa33bd0';

        const isCelronContact = (c) => {
            if (!c.email) return false;
            const emailLower = c.email.toLowerCase();
            const nameLower = (c.name || '').toLowerCase();
            
            const isCelronEmail = emailLower.endsWith('@celron.net') || 
                                  emailLower.endsWith('@celron.com') ||
                                  emailLower.includes('celron');
                                  
            const isCelronPartner = c.partnerId === celronPartnerId;
            const isCelronName = nameLower.includes('celron') || nameLower.includes('cel-ron');
            
            return isCelronEmail || isCelronPartner || isCelronName;
        };

        const celronStaff = localContacts.filter(c => isCelronContact(c) && !currentEmails.includes(c.email.toLowerCase()));

        if (!query) {
            return celronStaff;
        }
        return celronStaff.filter(c => 
            c.name?.toLowerCase().includes(query) || c.email?.toLowerCase().includes(query)
        );
    };

    const handleSaveModalContact = async (e) => {
        if (e) e.preventDefault();
        if (!modalName.trim() || !modalEmail.trim()) {
            alert('Please enter both Name and Email.');
            return;
        }

        setIsSaving(true);
        try {
            const { saveContact, getContacts } = await import('../../lib/store');
            const contactData = {
                name: modalName.trim(),
                email: modalEmail.trim(),
                partnerId: modalContactType === 'customer' ? partner?.id : null,
                company_id: partner?.company_id || null
            };

            if (editingContact) {
                contactData.id = editingContact.id;
            }

            const saved = await saveContact(contactData);

            // Reload database contacts list
            const allContacts = await getContacts();
            if (allContacts) {
                setLocalContacts(allContacts);
            }

            // Instantly display and active-toggle the newly created contact card
            if (modalContactType === 'customer') {
                if (saved) {
                    setCustomVisibleContacts(prev => [...prev, saved]);
                    toggleEmailInField('to', saved.email);
                }
            } else {
                if (saved) {
                    setCustomOfficeContacts(prev => [...prev, saved]);
                    toggleEmailInField('cc', saved.email);
                }
            }

            // Close modal & reset fields
            setIsAddModalOpen(false);
            setEditingContact(null);
            setModalName('');
            setModalEmail('');
        } catch (err) {
            console.error('Failed to save contact:', err);
            alert('Failed to save contact: ' + (err.message || err));
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', width: '100%', maxWidth: '850px', display: 'flex', flexDirection: 'column', maxHeight: '95vh', overflow: 'hidden' }}>

                <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Send size={20} color="#3b82f6" /> Email Preview
                    </h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                        <X size={24} />
                    </button>
                </div>

                <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</label>
                            <input
                                type="email"
                                style={{ flex: 1, padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                value={emailPreview.to}
                                onChange={(e) => setEmailPreview(prev => ({ ...prev, to: e.target.value }))}
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cc (Separate with semicolon)</label>
                                <textarea
                                    rows="2"
                                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box', resize: 'none' }}
                                    value={emailPreview.cc}
                                    onChange={(e) => setEmailPreview(prev => ({ ...prev, cc: e.target.value }))}
                                    placeholder="email1@example.com; email2@example.com"
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bcc</label>
                                <textarea
                                    rows="2"
                                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box', resize: 'none' }}
                                    value={emailPreview.bcc}
                                    onChange={(e) => setEmailPreview(prev => ({ ...prev, bcc: e.target.value }))}
                                    placeholder="bcc1@example.com; bcc2@example.com"
                                />
                            </div>
                        </div>

                        {/* SEARCHABLE DUAL-COLUMN CONTACT SELECTOR */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '4px' }}>
                            
                            {/* Left Side: Customer Contacts */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Company Contacts
                                    </label>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            setModalContactType('customer');
                                            setEditingContact(null);
                                            setModalName('');
                                            setModalEmail('');
                                            setIsAddModalOpen(true);
                                        }}
                                        style={{ background: 'transparent', border: 'none', color: '#2563eb', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                    >
                                        <Plus size={12} /> Add Contact
                                    </button>
                                </div>

                                <SearchableDropdown 
                                    placeholder="Search other company contacts..."
                                    searchVal={companySearch}
                                    setSearchVal={setCompanySearch}
                                    isOpen={showCompanyDropdown}
                                    setIsOpen={setShowCompanyDropdown}
                                    options={getCompanyDropdownOptions()}
                                    onSelect={(selected) => {
                                        setCustomVisibleContacts(prev => {
                                            if (prev.find(x => x.email.toLowerCase() === selected.email.toLowerCase())) return prev;
                                            return [...prev, selected];
                                        });
                                        toggleEmailInField('to', selected.email);
                                    }}
                                />

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
                                    {getCustomerContacts().length === 0 ? (
                                        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#fff' }}>
                                            No company contacts selected. Click dropdown or "+ Add Contact" to append.
                                        </div>
                                    ) : (
                                        getCustomerContacts().map((contact, idx) => (
                                            <ContactCard 
                                                key={idx}
                                                contact={contact}
                                                emailPreview={emailPreview}
                                                toggleEmailInField={toggleEmailInField}
                                                onEdit={(c) => {
                                                    setModalContactType('customer');
                                                    setEditingContact(c);
                                                    setModalName(c.name);
                                                    setModalEmail(c.email);
                                                    setIsAddModalOpen(true);
                                                }}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Right Side: Our Office (Celron Contacts) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderLeft: '1px solid #e2e8f0', paddingLeft: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Our Office Contacts
                                    </label>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            setModalContactType('office');
                                            setEditingContact(null);
                                            setModalName('');
                                            setModalEmail('');
                                            setIsAddModalOpen(true);
                                        }}
                                        style={{ background: 'transparent', border: 'none', color: '#2563eb', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                    >
                                        <Plus size={12} /> Add Contact
                                    </button>
                                </div>

                                <SearchableDropdown 
                                    placeholder="Search office contacts..."
                                    searchVal={officeSearch}
                                    setSearchVal={setOfficeSearch}
                                    isOpen={showOfficeDropdown}
                                    setIsOpen={setShowOfficeDropdown}
                                    options={getOfficeDropdownOptions()}
                                    onSelect={(selected) => {
                                        setCustomOfficeContacts(prev => {
                                            if (prev.find(x => x.email.toLowerCase() === selected.email.toLowerCase())) return prev;
                                            return [...prev, selected];
                                        });
                                        toggleEmailInField('cc', selected.email);
                                    }}
                                />

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
                                    {getOfficeContacts().map((contact, idx) => (
                                        <ContactCard 
                                            key={idx}
                                            contact={contact}
                                            emailPreview={emailPreview}
                                            toggleEmailInField={toggleEmailInField}
                                            onEdit={(c) => {
                                                setModalContactType('office');
                                                setEditingContact(c);
                                                setModalName(c.name);
                                                setModalEmail(c.email);
                                                setIsAddModalOpen(true);
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>

                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subject</label>
                        <input
                            type="text"
                            style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                            value={emailPreview.subject}
                            onChange={(e) => setEmailPreview(prev => ({ ...prev, subject: e.target.value }))}
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Message Body</label>
                        <textarea
                            style={{ width: '100%', minHeight: '200px', padding: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', resize: 'vertical', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.5', boxSizing: 'border-box' }}
                            value={emailPreview.body}
                            onChange={(e) => setEmailPreview(prev => ({ ...prev, body: e.target.value }))}
                        />
                        <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <FileText size={24} color="#16a34a" />
                            <div>
                                <p style={{ fontSize: '12px', color: '#166534', margin: 0, fontWeight: 700 }}>📄 PDF Automatically Attached</p>
                                <p style={{ fontSize: '11px', color: '#166534', margin: '2px 0 0 0', opacity: 0.9 }}>The {documentData.document_type || 'Statement'} PDF has been generated and is attached to this email.</p>
                            </div>
                        </div>

                        {/* Optional Excel Attachment option */}
                        <div style={{ 
                            background: attachExcel ? '#ecfdf5' : '#f8fafc', 
                            padding: '16px', 
                            borderRadius: '12px', 
                            border: attachExcel ? '1px solid #10b981' : '1px solid #e2e8f0', 
                            marginTop: '12px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            transition: 'all 0.2s ease-in-out'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: attachExcel ? '#10b981' : '#94a3b8', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Download size={18} />
                                </div>
                                <div>
                                    <p style={{ fontSize: '12px', color: attachExcel ? '#065f46' : '#475569', margin: 0, fontWeight: 700 }}>Attach Excel Version (.xlsx)</p>
                                    <p style={{ fontSize: '11px', color: attachExcel ? '#047857' : '#64748b', margin: '2px 0 0 0', opacity: 0.9 }}>Required by some customers for automated reconciliation.</p>
                                </div>
                            </div>
                            <input 
                                type="checkbox" 
                                checked={attachExcel}
                                onChange={(e) => setAttachExcel(e.target.checked)}
                                style={{ 
                                    width: '20px', 
                                    height: '20px', 
                                    cursor: 'pointer',
                                    accentColor: '#10b981'
                                }}
                            />
                        </div>
                    </div>
                </div>

                <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc' }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => { onShare(emailPreview, attachExcel); onClose(); }}
                        style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600, color: '#fff', background: '#3b82f6', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <Send size={16} /> Send Email Now
                    </button>
                </div>
            </div>

            {/* LIGHTWEIGHT CONTACT ADD/EDIT OVERLAY MODAL */}
            {isAddModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10005, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' }}>
                    <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '400px', padding: '20px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
                                {editingContact ? '✏️ Edit Contact' : `➕ Add ${modalContactType === 'office' ? 'Office' : 'Customer'} Contact`}
                            </h3>
                            <button onClick={() => { setIsAddModalOpen(false); setEditingContact(null); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveModalContact} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Full Name</label>
                                <input 
                                    type="text" 
                                    required
                                    placeholder="e.g. Sunil Salian"
                                    value={modalName}
                                    onChange={e => setModalName(e.target.value)}
                                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Email Address</label>
                                <input 
                                    type="email" 
                                    required
                                    placeholder="e.g. sunil@greatship.com"
                                    value={modalEmail}
                                    onChange={e => setModalEmail(e.target.value)}
                                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                                <button 
                                    type="button"
                                    onClick={() => { setIsAddModalOpen(false); setEditingContact(null); }}
                                    style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', color: '#475569', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    disabled={isSaving}
                                    style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', background: '#3b82f6', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    {isSaving ? 'Saving...' : 'Save Contact'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Offscreen compilation container for sequential dispatching */}
            <div id="soa-offscreen-wrapper" style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none', width: '850px', background: '#fff' }}>
                <div ref={hiddenPrintRef} style={{ background: 'white', padding: '5mm' }}>
                    <style>{`
                        @import url('https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@300;400;700&display=swap');
                    `}</style>
                    {hiddenStatementData && (
                        <div style={{ background: 'white', color: '#000', fontFamily: "'Roboto Condensed', sans-serif" }}>
                            {/* Letterhead */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                    {logoBase64 && <img src={logoBase64} alt="Logo" style={{ height: '50px', objectFit: 'contain' }} />}
                                    <div>
                                        <h1 style={{ margin: 0, color: '#1e3a8a', fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.03em', textTransform: 'uppercase' }}>Statement of Account</h1>
                                        <p style={{ margin: '2px 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Period: {formatDate(dateRange.start)} - {formatDate(dateRange.end)}</p>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e3a8a' }}>{profile?.company_name || 'CEL-RON ENTERPRISES PTE LTD'}</h2>
                                    <div style={{ fontSize: '0.6rem', color: '#64748b', marginTop: '4px', lineHeight: 1.3 }}>
                                        <div>{settings?.address || '10, Jln, Besar, "Sim Lim Tower", #03-05, Singapore 208787'}</div>
                                        <div>Tel: {settings?.phone || '+6581962270'} | Email: {settings?.email || 'accounts@celron.net'} | www.celron.net</div>
                                    </div>
                                </div>
                            </div>

                            {/* Customer details */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontSize: '0.75rem' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 800, color: '#64748b', textTransform: 'uppercase', fontSize: '0.6rem', marginBottom: '2px' }}>TO:</div>
                                    <div style={{ fontWeight: 900, fontSize: '0.85rem', color: '#1e3a8a' }}>{hiddenStatementData.partner?.name}</div>
                                    <div style={{ whiteSpace: 'pre-line', color: '#334155', marginTop: '2px', lineHeight: 1.3 }}>{hiddenStatementData.partner?.billing_address || hiddenStatementData.partner?.address}</div>
                                </div>
                                <div style={{ width: '220px', textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <div><span style={{ fontWeight: 700, color: '#64748b' }}>Date: </span>{formatDate(new Date())}</div>
                                    <div><span style={{ fontWeight: 700, color: '#64748b' }}>Customer Code: </span>{hiddenStatementData.partner?.partner_code || 'N/A'}</div>
                                    <div><span style={{ fontWeight: 700, color: '#64748b' }}>Currency: </span>{hiddenStatementData.ledger?.find(d => d.currency)?.currency || 'SGD'}</div>
                                </div>
                            </div>

                            {/* Ledger Table */}
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5px', marginBottom: '15px' }}>
                                <thead>
                                    <tr style={{ background: '#1e3a8a', color: 'white' }}>
                                        <th style={{ padding: '6px', textAlign: 'center', color: 'white' }}>Date</th>
                                        <th style={{ padding: '6px', textAlign: 'left', color: 'white' }}>Ref No / Job No</th>
                                        <th style={{ padding: '6px', textAlign: 'left', color: 'white' }}>Particulars</th>
                                        <th style={{ padding: '6px', textAlign: 'right', color: 'white' }}>Debit (+)</th>
                                        <th style={{ padding: '6px', textAlign: 'right', color: 'white' }}>Credit (-)</th>
                                        <th style={{ padding: '6px', textAlign: 'center', color: 'white' }}>Age</th>
                                        <th style={{ padding: '6px', textAlign: 'right', color: 'white' }}>Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>{formatDate(dateRange.start)}</td>
                                        <td style={{ padding: '4px 6px' }}>OPENING BALANCE</td>
                                        <td style={{ padding: '4px 6px' }}>Balance brought forward</td>
                                        <td style={{ padding: '4px 6px', textAlign: 'right' }}>-</td>
                                        <td style={{ padding: '4px 6px', textAlign: 'right' }}>-</td>
                                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>-</td>
                                        <td style={{ padding: '4px 6px', textAlign: 'right' }}>{(hiddenStatementData.openingBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                    {(() => {
                                        let runningBalance = hiddenStatementData.openingBalance || 0;
                                        return hiddenStatementData.ledger?.map((row, idx) => {
                                            runningBalance += (row.debit || 0) - (row.credit || 0);
                                            return (
                                                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>{formatDate(row.issue_date)}</td>
                                                    <td style={{ padding: '4px 6px', fontWeight: 600 }}>{row.document_no}</td>
                                                    <td style={{ padding: '4px 6px', color: '#475569' }}>{row.subject || row.particulars || 'Invoice'}</td>
                                                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>{row.debit > 0 ? row.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</td>
                                                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>{row.credit > 0 ? row.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</td>
                                                    <td style={{ padding: '4px 6px', textAlign: 'center', color: '#64748b' }}>
                                                        {Math.floor((new Date() - new Date(row.issue_date)) / (1000 * 60 * 60 * 24))} Days
                                                    </td>
                                                    <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>{runningBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                    <tr style={{ background: '#0f172a', color: 'white' }}>
                                        <td style={{ padding: '10px', textAlign: 'center', fontWeight: 700, color: 'white' }}>-</td>
                                        <td style={{ padding: '10px', fontWeight: 900, textTransform: 'uppercase', color: 'white' }} colSpan={5}>TOTAL OUTSTANDING</td>
                                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 900, color: 'white' }}>
                                            {hiddenStatementData.ledger?.find(d => d.currency)?.currency || 'SGD'} {(hiddenStatementData.closingBalance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                </tbody>
                             </table>
 
                             {/* Aging summary & terms */}
                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '10px' }}>
                                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', flex: 1 }}>
                                     {[
                                         { label: 'Current', value: hiddenStatementData.aging?.current || 0 },
                                         { label: '31-60 Days', value: hiddenStatementData.aging?.thirty || 0 },
                                         { label: '61-90 Days', value: hiddenStatementData.aging?.sixty || 0 },
                                         { label: '90+ Days', value: hiddenStatementData.aging?.ninety || 0 }
                                     ].map((bucket, i) => (
                                         <div key={i} style={{ background: bucket.value > 0 ? '#fff1f2' : '#f8fafc', padding: '8px', borderRadius: '6px', border: `1px solid ${bucket.value > 0 ? '#fecdd3' : '#e2e8f0'}`, textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.5rem', fontWeight: 800, color: bucket.value > 0 ? '#e11d48' : '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>{bucket.label}</div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: bucket.value > 0 ? '#9f1239' : '#0f172a' }}>SGD {bucket.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ width: '120px', marginLeft: '15px', padding: '8px', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center', background: '#f8fafc' }}>
                                    <div style={{ fontSize: '0.45rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Delivery / Payment Terms</div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 900, color: '#1e3a8a' }}>
                                        {(() => {
                                            const t = hiddenStatementData.partner?.terms || hiddenStatementData.partner?.payment_terms || hiddenStatementData.partner?.customerCreditTime;
                                            if (!t || t === '0') return 'C.O.D';
                                            if (/^\d+$/.test(String(t).trim())) return `${t} DAYS`;
                                            return String(t).toUpperCase();
                                        })()}
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '10px', fontSize: '0.55rem', color: '#94a3b8', textAlign: 'center' }}>
                                This is a computer generated document. No signature is required.
                             </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ReceivePaymentModal({ prefill, onClose, onSuccess, partners, company_id }) {
    const [formData, setFormData] = useState({
        id: prefill?.id || null,
        partner_id: prefill?.partner_id || '',
        issue_date: prefill?.issue_date || new Date().toISOString().split('T')[0],
        total_amount: prefill?.amount || 0,
        payment_method: prefill?.payment_method || 'Bank Transfer',
        payment_ref: prefill?.payment_ref || '',
        related_document_id: prefill?.related_document_id || '',
        invoice_no: prefill?.document_no || '',
        subject: prefill?.subject || (prefill?.document_no ? `Payment for Invoice ${prefill.document_no}` : 'General Payment Received'),
        notes: prefill?.notes || ''
    });
    const [saving, setSaving] = useState(false);
    const [outstandingInvoices, setOutstandingInvoices] = useState([]);
    const [loadingInvoices, setLoadingInvoices] = useState(false);

    useEffect(() => {
        const fetchInvoices = async () => {
            if (!formData.partner_id) {
                setOutstandingInvoices([]);
                return;
            }
            setLoadingInvoices(true);
            try {
                const { data } = await getStatementData(company_id, formData.partner_id, '2000-01-01', '2099-12-31');
                if (data) {
                    const invoices = [];
                    const payments = new Map();
                    data.forEach(doc => {
                        if ((doc.document_type || '').includes('Invoice')) {
                            invoices.push(doc);
                        } else if (doc.document_type === 'Payment Received' && doc.internal_notes) {
                            try {
                                const notes = JSON.parse(doc.internal_notes);
                                if (notes.related_document_id) {
                                    payments.set(notes.related_document_id, (payments.get(notes.related_document_id) || 0) + parseFloat(doc.total_amount || 0));
                                }
                            } catch {}
                        }
                    });
                    const outstanding = invoices.map(inv => {
                        const paid = payments.get(inv.id) || 0;
                        return { ...inv, outstanding: (parseFloat(inv.total_amount || 0) - paid) };
                    }).filter(inv => inv.outstanding > 0.01);
                    setOutstandingInvoices(outstanding);
                }
            } catch (err) {
                console.error('Error fetching invoices', err);
            } finally {
                setLoadingInvoices(false);
            }
        };
        fetchInvoices();
    }, [formData.partner_id, company_id]);


    const handleSave = async () => {
        if (!formData.partner_id || !formData.total_amount) {
            alert('Partner and Amount are required.');
            return;
        }
        setSaving(true);
        try {
            const { generateDocNumber } = await import('../../lib/workflowV2Service');
            
            // If it's a new payment, generate a number. If editing, keep existing.
            const docNo = formData.id ? prefill?.document_no : await generateDocNumber(company_id || partners.find(p => p.id === formData.partner_id)?.company_id, 'Payment Received');
            
            const payload = {
                id: formData.id,
                partner_id: formData.partner_id,
                issue_date: formData.issue_date,
                total_amount: formData.total_amount,
                subject: formData.invoice_no ? `Payment for ${formData.invoice_no}` : formData.subject,
                notes: formData.notes,
                document_type: 'Payment Received',
                document_no: docNo || `PAY-${new Date().getTime()}`,
                company_id: company_id || partners.find(p => p.id === formData.partner_id)?.company_id,
                status: 'Confirmed',
                internal_notes: JSON.stringify({
                    payment_method: formData.payment_method,
                    payment_ref: formData.payment_ref,
                    related_document_id: formData.related_document_id === 'other_custom' ? null : formData.related_document_id
                })
            };

            const { error } = await saveWorkflowDocument(payload, []);
            if (error) throw error;
            onSuccess();
        } catch (err) {
            console.error('Save Payment Error:', err);
            alert(`Failed to record payment: ${err.message || 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    };

    const selectedInv = outstandingInvoices.find(i => i.id === formData.related_document_id);
    const remainingBalance = selectedInv ? selectedInv.outstanding - (parseFloat(formData.total_amount) || 0) : 0;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: '24px', backdropFilter: 'blur(4px)' }}>
            <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '1000px', background: '#fff', borderRadius: '20px', padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '24px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Record Customer Payment</h3>
                    <p style={{ margin: '4px 0 0 0', opacity: 0.9, fontSize: '0.85rem' }}>Instantly log payment and update SOA balance.</p>
                </div>
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="form-item" style={{ margin: 0 }}>
                        <label>Customer</label>
                        <select className="form-input" value={formData.partner_id} onChange={e => setFormData({ ...formData, partner_id: e.target.value })} disabled={!!prefill?.partner_id}>
                            <option value="">-- Select Customer --</option>
                            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div className="grid-2">
                        <div className="form-item" style={{ margin: 0 }}>
                            <label>Payment Date</label>
                            <input type="date" className="form-input" value={formData.issue_date} onChange={e => setFormData({ ...formData, issue_date: e.target.value })} />
                        </div>
                        <div className="form-item" style={{ margin: 0 }}>
                            <label>Amount Received (SGD)</label>
                            <input type="number" className="form-input" value={formData.total_amount} onChange={e => setFormData({ ...formData, total_amount: e.target.value })} />
                        </div>
                    </div>

                    {selectedInv && (
                        <div style={{
                            background: '#ecfdf5',
                            padding: '14px 20px',
                            borderRadius: '12px',
                            border: '1px solid #a7f3d0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            boxShadow: '0 2px 4px rgba(16,185,129,0.05)',
                            marginTop: '-4px'
                        }}>
                            <div>
                                <span style={{ color: '#065f46', fontWeight: 600, fontSize: '0.85rem' }}>Current Outstanding Balance: </span>
                                <span style={{ fontWeight: 800, color: '#047857', fontSize: '0.95rem', fontFamily: "'Inter', sans-serif" }}>
                                    SGD {selectedInv.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div style={{ borderLeft: '1px solid #d1fae5', height: '24px' }}></div>
                            <div>
                                <span style={{ color: '#065f46', fontWeight: 600, fontSize: '0.85rem' }}>Remaining Balance: </span>
                                <span style={{ fontWeight: 900, color: remainingBalance <= 0 ? '#10b981' : '#f59e0b', fontSize: '1rem', fontFamily: "'Inter', sans-serif" }}>
                                    SGD {Math.max(0, remainingBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    )}
                    <div className="grid-2">
                        <div className="form-item" style={{ margin: 0 }}>
                            <label>Payment Method</label>
                            <select className="form-input" value={formData.payment_method} onChange={e => setFormData({ ...formData, payment_method: e.target.value })}>
                                <option value="Bank Transfer">Bank Transfer</option>
                                <option value="PayNow">PayNow</option>
                                <option value="Cheque">Cheque</option>
                                <option value="Cash">Cash</option>
                            </select>
                        </div>
                        <div className="form-item" style={{ margin: 0 }}>
                            <label>Transaction Ref</label>
                            <input type="text" className="form-input" value={formData.payment_ref} onChange={e => setFormData({ ...formData, payment_ref: e.target.value })} placeholder="e.g. TXN-12345" />
                        </div>
                    </div>
                    <div className="grid-2">
                        <div className="form-item" style={{ margin: 0 }}>
                            <label>
                                Invoice No / Job No Reference 
                                {loadingInvoices && <Loader2 size={12} className="animate-spin" style={{ display: 'inline-block', marginLeft: '6px' }} />}
                            </label>
                            {formData.related_document_id === 'other_custom' ? (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input 
                                        type="text" 
                                        className="form-input" 
                                        style={{ flex: 1 }}
                                        value={formData.invoice_no} 
                                        onChange={e => setFormData({ ...formData, invoice_no: e.target.value })} 
                                        placeholder="Enter manual reference..." 
                                    />
                                    <button 
                                        type="button" 
                                        className="btn btn-secondary" 
                                        style={{ padding: '0 12px' }} 
                                        onClick={() => setFormData({ ...formData, related_document_id: '' })}
                                    >
                                        Back
                                    </button>
                                </div>
                            ) : (
                                <select 
                                    className="form-input" 
                                    value={formData.related_document_id} 
                                    onChange={e => {
                                        const selectedId = e.target.value;
                                        if (selectedId === 'other_custom') {
                                            setFormData({ ...formData, related_document_id: 'other_custom', invoice_no: '' });
                                        } else {
                                            const selectedInv = outstandingInvoices.find(i => i.id === selectedId);
                                            if (selectedInv) {
                                                setFormData({ 
                                                    ...formData, 
                                                    related_document_id: selectedId, 
                                                    invoice_no: selectedInv.document_no,
                                                    total_amount: selectedInv.outstanding > 0 ? selectedInv.outstanding : formData.total_amount
                                                });
                                            } else {
                                                setFormData({ ...formData, related_document_id: '', invoice_no: '' });
                                            }
                                        }
                                    }}
                                >
                                    <option value="">-- Select Outstanding Invoice --</option>
                                    {outstandingInvoices.map(inv => (
                                        <option key={inv.id} value={inv.id}>
                                            {inv.document_no} {inv.assigned_job_no ? `(Job: ${inv.assigned_job_no})` : ''} - Bal: SGD {inv.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </option>
                                    ))}
                                    <option value="other_custom">Custom Reference...</option>
                                </select>
                            )}
                        </div>
                        <div className="form-item" style={{ margin: 0 }}>
                            <label>Description / Allocation</label>
                            <input type="text" className="form-input" value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })} />
                        </div>
                    </div>
                    <div className="form-item" style={{ margin: 0 }}>
                        <label>NOTES WITH RICH TEXT (TABLES & IMAGES SUPPORTED):-</label>
                        <RichTextEditor 
                            value={formData.notes} 
                            onChange={val => setFormData({ ...formData, notes: val })} 
                            placeholder="Add internal notes, insert tables or upload images for reconciliation..."
                            height="250px"
                        />
                    </div>
                </div>
                <div style={{ padding: '24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc' }}>
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" style={{ background: '#10b981', borderColor: '#10b981' }} onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 size={18} className="animate-spin" /> : 'Record Payment Now'}
                    </button>
                </div>
            </div>
        </div>
    );
}
