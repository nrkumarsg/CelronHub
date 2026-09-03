import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    ArrowLeft, LayoutDashboard, ShoppingCart, FileText, FolderOpen, 
    DollarSign, TrendingUp, Clock, CheckCircle2, AlertCircle, Plus, 
    Edit3, Trash2, ExternalLink, RefreshCcw, Loader2, Sparkles, Building2, 
    Ship, MapPin, Eye, Printer, Send, Package, Receipt 
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getJobEagleViewData, saveWorkflowDocument, deleteWorkflowDocument } from '../../lib/workflowV2Service';
import { supabase } from '../../lib/supabase';
import EagleDriveTreeViewer from '../../components/workflows/EagleDriveTreeViewer';
import SupplierOrderCrudModal from '../../components/workflows/SupplierOrderCrudModal';
import SmartUploadPanel from '../../components/upload/SmartUploadPanel';
import { getStoredToken } from '../../lib/googleAuthService';
import toast from 'react-hot-toast';

const STAGES = [
    { key: 'ENQ', label: 'Enquiry', color: '#3b82f6', bg: '#eff6ff', tab: 'enquiry' },
    { key: 'QTN', label: 'Quoted', color: '#f59e0b', bg: '#fffbeb', tab: 'quotation' },
    { key: 'PO',  label: 'Ordered', color: '#f97316', bg: '#fff7ed', tab: 'customer_po' },
    { key: 'SRC', label: 'Sourced', color: '#8b5cf6', bg: '#f5f3ff', tab: 'supplier' },
    { key: 'DEL', label: 'Delivered', color: '#06b6d4', bg: '#ecfeff', tab: 'drive' },
    { key: 'INV', label: 'Invoiced', color: '#10b981', bg: '#ecfdf5', tab: 'drive' },
    { key: 'PAID', label: 'Paid', color: '#22c55e', bg: '#f0fdf4', tab: 'drive' },
];

export default function JobEagleView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { profile } = useAuth();

    const [loading, setLoading] = useState(true);
    const [jobSuite, setJobSuite] = useState(null);
    const [activeTab, setActiveTab] = useState('drive'); // 'drive' | 'supplier' | 'enquiry' | 'quotation' | 'customer_po'
    const [selectedStageKey, setSelectedStageKey] = useState('ENQ');
    
    // Modal states
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [selectedSupplierOrder, setSelectedSupplierOrder] = useState(null);

    useEffect(() => {
        if (id) {
            loadEagleViewData();
        }
    }, [id]);

    const loadEagleViewData = async () => {
        setLoading(true);
        try {
            const res = await getJobEagleViewData(id);
            if (res.success && res.data) {
                setJobSuite(res.data);
            } else {
                toast.error(res.error || 'Failed to load Job Eagle View');
            }
        } catch (err) {
            console.error('Error loading Eagle View:', err);
            toast.error('Error fetching job details');
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        if (window.history.state && window.history.state.idx > 0) {
            navigate(-1);
        } else {
            navigate('/workflows/jobs-dashboard');
        }
    };

    const handleDeleteSupplierOrder = async (docId, docNo) => {
        if (!window.confirm(`Are you sure you want to delete Supplier Order ${docNo}?`)) return;
        try {
            const res = await deleteWorkflowDocument(docId);
            if (res.success) {
                toast.success(`Deleted Supplier Order ${docNo}`);
                loadEagleViewData();
            } else {
                toast.error(res.error || 'Failed to delete supplier order');
            }
        } catch (err) {
            console.error('Delete error:', err);
            toast.error('Error deleting supplier order');
        }
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', color: '#64748b', gap: '12px' }}>
                <Loader2 size={36} className="animate-spin text-indigo-600" />
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Loading Job Eagle View...</h3>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>Compiling transaction suite, supplier orders, and Drive folder tree</p>
            </div>
        );
    }

    if (!jobSuite || !jobSuite.masterJob) {
        return (
            <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#ffffff', padding: '32px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', textAlign: 'center', maxWidth: '450px' }}>
                    <AlertCircle size={40} style={{ color: '#ef4444', margin: '0 auto 12px' }} />
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Job Record Not Found</h2>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '12px 0 20px' }}>Unable to find job details for reference: {id}</p>
                    <button
                        onClick={handleBack}
                        style={{ background: '#4f46e5', color: '#ffffff', border: 'none', padding: '10px 20px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}
                    >
                        Return to Jobs Dashboard
                    </button>
                </div>
            </div>
        );
    }

    const { masterJob, jobNo, enquiryDoc, quotationDocs, customerPoDocs, supplierPoDocs, doDocs, invoiceDocs, metrics } = jobSuite;
    const customer = masterJob.partners?.name || masterJob.customer_name || 'Celron Customer';
    const vessel = masterJob.vessels?.vessel_name || masterJob.work_locations?.location_name || 'N.A';

    const isJobPaid = (masterJob?.status && String(masterJob.status).toLowerCase() === 'paid') ||
                      (invoiceDocs && invoiceDocs.some(d => d.status && String(d.status).toLowerCase() === 'paid'));

    const getStageStatus = (stageKey) => {
        if (isJobPaid) return 'done';
        if (stageKey === 'ENQ') return (enquiryDoc || masterJob) ? 'done' : 'idle';
        if (stageKey === 'QTN') return quotationDocs.length > 0 ? 'done' : (enquiryDoc ? 'active' : 'idle');
        if (stageKey === 'PO') return customerPoDocs.length > 0 ? 'done' : (quotationDocs.length > 0 ? 'active' : 'idle');
        if (stageKey === 'SRC') return supplierPoDocs.length > 0 ? 'done' : (customerPoDocs.length > 0 ? 'active' : 'idle');
        if (stageKey === 'DEL') return doDocs.length > 0 ? 'done' : (supplierPoDocs.length > 0 || customerPoDocs.length > 0 ? 'active' : 'idle');
        if (stageKey === 'INV') return invoiceDocs.length > 0 ? 'done' : (doDocs.length > 0 ? 'active' : 'idle');
        if (stageKey === 'PAID') return isJobPaid ? 'done' : (invoiceDocs.length > 0 ? 'active' : 'idle');

        const order = ['ENQ', 'QTN', 'PO', 'SRC', 'DEL', 'INV', 'PAID'];
        const idx = order.indexOf(stageKey);
        const hasLater = (
            (idx < 1 && quotationDocs.length > 0) ||
            (idx < 2 && customerPoDocs.length > 0) ||
            (idx < 3 && supplierPoDocs.length > 0) ||
            (idx < 4 && doDocs.length > 0) ||
            (idx < 5 && invoiceDocs.length > 0) ||
            (idx < 6 && isJobPaid)
        );
        return hasLater ? 'done' : 'idle';
    };

    const stageCounts = {
        ENQ: (enquiryDoc || masterJob) ? 1 : 0,
        QTN: quotationDocs.length,
        PO: customerPoDocs.length,
        SRC: supplierPoDocs.length,
        DEL: doDocs.length,
        INV: invoiceDocs.length,
        PAID: isJobPaid ? 1 : 0,
    };

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', display: 'flex', flexDirection: 'column' }}>
            {/* Top Navigation Bar */}
            <div style={{ background: '#1e2544', color: '#ffffff', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '14px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyBetween: 'space-between', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                        onClick={handleBack}
                        style={{ background: 'rgba(255,255,255,0.1)', hoverBackground: 'rgba(255,255,255,0.2)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease' }}
                        title="Back to Previous View"
                    >
                        <ArrowLeft size={16} /> Back
                    </button>

                    <div style={{ height: '24px', width: '1px', background: 'rgba(255,255,255,0.15)' }} />

                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h1 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#ffffff', margin: 0, letterSpacing: '-0.02em' }}>{jobNo}</h1>
                            <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '0.7rem', padding: '2px 10px', borderRadius: '12px', fontWeight: 800 }}>
                                Eagle View
                            </span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, color: '#f8fafc' }}>{customer}</span>
                            <span>•</span>
                            <span>Vessel: {vessel}</span>
                        </p>
                    </div>
                </div>

                {/* Right Quick Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        onClick={() => { setSelectedSupplierOrder(null); setIsSupplierModalOpen(true); }}
                        style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#0f172a', fontWeight: 900, border: 'none', padding: '9px 18px', borderRadius: '10px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 14px rgba(245,158,11,0.35)' }}
                    >
                        <Plus size={16} /> Create Supplier Order
                    </button>

                    <button
                        onClick={() => navigate(`/workflows/editor/job/${masterJob.id}`)}
                        style={{ background: '#4f46e5', color: '#ffffff', fontWeight: 700, border: 'none', padding: '9px 16px', borderRadius: '10px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}
                    >
                        <Edit3 size={15} /> Edit Job Suite
                    </button>

                    <button
                        onClick={loadEagleViewData}
                        style={{ background: 'rgba(255,255,255,0.1)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.15)', padding: '8px 12px', borderRadius: '10px', fontSize: '0.8rem', cursor: 'pointer' }}
                        title="Refresh Eagle View"
                    >
                        <RefreshCcw size={15} />
                    </button>
                </div>
            </div>

            {/* Main Content Body */}
            <div style={{ padding: '24px', maxWidth: '1600px', width: '100%', margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Executive Summary Dashboard Header */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                    {/* Billed Metric */}
                    <div style={{ background: '#ffffff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Billed (Invoices)</span>
                            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: '4px', display: 'block' }}>
                                SGD {metrics.billedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginTop: '4px', display: 'block' }}>
                                {invoiceDocs.length} Invoice(s) Generated
                            </span>
                        </div>
                        <div style={{ width: '48px', height: '48px', background: '#ecfdf5', color: '#10b981', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                            <DollarSign size={24} />
                        </div>
                    </div>

                    {/* PO Cost Metric */}
                    <div style={{ background: '#ffffff', padding: '20px', borderRadius: '16px', border: '1px solid #fde68a', boxShadow: '0 4px 20px rgba(245,158,11,0.08)', display: 'flex', alignItems: 'center', justifyBetween: 'space-between', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#f59e0b' }} />
                        <div>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Supplier PO Cost</span>
                            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#d97706', marginTop: '4px', display: 'block' }}>
                                SGD {metrics.supplierPoTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600, marginTop: '4px', display: 'block' }}>
                                {supplierPoDocs.length} Linked Supplier Order(s)
                            </span>
                        </div>
                        <div style={{ width: '48px', height: '48px', background: '#fffbe finished', color: '#d97706', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyCenter: 'center', fontWeight: 800 }}>
                            <ShoppingCart size={24} />
                        </div>
                    </div>

                    {/* Gross Profit Metric */}
                    <div style={{ background: '#ffffff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyBetween: 'space-between' }}>
                        <div>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Net Gross Profit</span>
                            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: metrics.grossProfit >= 0 ? '#4f46e5' : '#ef4444', marginTop: '4px', display: 'block' }}>
                                SGD {metrics.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#4f46e5', fontWeight: 800, marginTop: '4px', display: 'block' }}>
                                Profit Margin: {metrics.profitMarginPercent}%
                            </span>
                        </div>
                        <div style={{ width: '48px', height: '48px', background: '#eef2ff', color: '#4f46e5', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyCenter: 'center', fontWeight: 800 }}>
                            <TrendingUp size={24} />
                        </div>
                    </div>

                    {/* Overall Status */}
                    <div style={{ background: '#ffffff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyBetween: 'space-between' }}>
                        <div>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Lifecycle Status</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#1e293b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                                {masterJob.status || 'Active'}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                                Created: {masterJob.created_at?.split('T')[0] || 'N/A'}
                            </span>
                        </div>
                        <div style={{ width: '48px', height: '48px', background: '#f1f5f9', color: '#475569', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyCenter: 'center', fontWeight: 800 }}>
                            <Clock size={24} />
                        </div>
                    </div>
                </div>

                {/* Transaction Lifecycle Activity Stepper */}
                <div style={{ background: '#0f172a', color: '#ffffff', padding: '20px', borderRadius: '16px', border: '1px solid #1e293b', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px', display: 'flex', justifyBetween: 'space-between', alignItems: 'center' }}>
                        <span>Transaction Lifecycle Stepper</span>
                        <span style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 700 }}>Job ID: {jobNo}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                        {/* 1. Enquiry Step */}
                        <div style={{ padding: '12px', borderRadius: '12px', border: enquiryDoc ? '1px solid rgba(16,185,129,0.5)' : '1px solid #1e293b', background: enquiryDoc ? '#1e293b' : 'rgba(15,23,42,0.6)' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>1. Enquiry</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#ffffff', display: 'block', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {enquiryDoc ? enquiryDoc.document_no : 'Not Recorded'}
                            </span>
                            <span style={{ fontSize: '0.65rem', display: 'inline-block', marginTop: '8px', padding: '2px 8px', borderRadius: '10px', fontWeight: 800, background: enquiryDoc ? 'rgba(16,185,129,0.2)' : '#1e293b', color: enquiryDoc ? '#6ee7b7' : '#64748b' }}>
                                {enquiryDoc ? enquiryDoc.status : 'Pending'}
                            </span>
                        </div>

                        {/* 2. Quotation Step */}
                        <div style={{ padding: '12px', borderRadius: '12px', border: quotationDocs.length > 0 ? '1px solid rgba(16,185,129,0.5)' : '1px solid #1e293b', background: quotationDocs.length > 0 ? '#1e293b' : 'rgba(15,23,42,0.6)' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>2. Customer Quote</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#ffffff', display: 'block', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {quotationDocs.length > 0 ? `${quotationDocs.length} Quote(s)` : 'None'}
                            </span>
                            <span style={{ fontSize: '0.65rem', display: 'inline-block', marginTop: '8px', padding: '2px 8px', borderRadius: '10px', fontWeight: 800, background: quotationDocs.length > 0 ? 'rgba(16,185,129,0.2)' : '#1e293b', color: quotationDocs.length > 0 ? '#6ee7b7' : '#64748b' }}>
                                {quotationDocs.length > 0 ? quotationDocs[0].status : 'Pending'}
                            </span>
                        </div>

                        {/* 3. Customer PO Step */}
                        <div style={{ padding: '12px', borderRadius: '12px', border: customerPoDocs.length > 0 ? '1px solid rgba(16,185,129,0.5)' : '1px solid #1e293b', background: customerPoDocs.length > 0 ? '#1e293b' : 'rgba(15,23,42,0.6)' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>3. Customer PO</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#ffffff', display: 'block', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {customerPoDocs.length > 0 ? customerPoDocs[0].customer_ref || customerPoDocs[0].document_no : 'Ref: N/A'}
                            </span>
                            <span style={{ fontSize: '0.65rem', display: 'inline-block', marginTop: '8px', padding: '2px 8px', borderRadius: '10px', fontWeight: 800, background: customerPoDocs.length > 0 ? 'rgba(16,185,129,0.2)' : '#1e293b', color: customerPoDocs.length > 0 ? '#6ee7b7' : '#64748b' }}>
                                {customerPoDocs.length > 0 ? 'Confirmed' : 'Pending'}
                            </span>
                        </div>

                        {/* 4. Supplier PO Step */}
                        <div style={{ padding: '12px', borderRadius: '12px', border: supplierPoDocs.length > 0 ? '1px solid rgba(245,158,11,0.6)' : '1px solid #1e293b', background: supplierPoDocs.length > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(15,23,42,0.6)' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', display: 'block' }}>4. Supplier PO</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fef08a', display: 'block', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {supplierPoDocs.length > 0 ? `${supplierPoDocs.length} PO(s)` : 'SGD 0 Cost'}
                            </span>
                            <span style={{ fontSize: '0.65rem', display: 'inline-block', marginTop: '8px', padding: '2px 8px', borderRadius: '10px', fontWeight: 800, background: supplierPoDocs.length > 0 ? 'rgba(245,158,11,0.2)' : '#1e293b', color: supplierPoDocs.length > 0 ? '#fde68a' : '#64748b', border: supplierPoDocs.length > 0 ? '1px solid rgba(245,158,11,0.3)' : 'none' }}>
                                {supplierPoDocs.length > 0 ? `SGD ${metrics.supplierPoTotal.toLocaleString()}` : 'None'}
                            </span>
                        </div>

                        {/* 5. Delivery Order Step */}
                        <div style={{ padding: '12px', borderRadius: '12px', border: doDocs.length > 0 ? '1px solid rgba(16,185,129,0.5)' : '1px solid #1e293b', background: doDocs.length > 0 ? '#1e293b' : 'rgba(15,23,42,0.6)' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>5. Delivery Order</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#ffffff', display: 'block', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {doDocs.length > 0 ? `${doDocs.length} DO(s)` : 'Pending'}
                            </span>
                            <span style={{ fontSize: '0.65rem', display: 'inline-block', marginTop: '8px', padding: '2px 8px', borderRadius: '10px', fontWeight: 800, background: doDocs.length > 0 ? 'rgba(16,185,129,0.2)' : '#1e293b', color: doDocs.length > 0 ? '#6ee7b7' : '#64748b' }}>
                                {doDocs.length > 0 ? 'Dispatched' : 'Pending'}
                            </span>
                        </div>

                        {/* 6. Tax Invoice Step */}
                        <div style={{ padding: '12px', borderRadius: '12px', border: invoiceDocs.length > 0 ? '1px solid rgba(16,185,129,0.5)' : '1px solid #1e293b', background: invoiceDocs.length > 0 ? '#1e293b' : 'rgba(15,23,42,0.6)' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>6. Tax Invoice</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#ffffff', display: 'block', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {invoiceDocs.length > 0 ? `SGD ${metrics.billedTotal.toLocaleString()}` : 'Unbilled'}
                            </span>
                            <span style={{ fontSize: '0.65rem', display: 'inline-block', marginTop: '8px', padding: '2px 8px', borderRadius: '10px', fontWeight: 800, background: invoiceDocs.length > 0 ? 'rgba(16,185,129,0.2)' : '#1e293b', color: invoiceDocs.length > 0 ? '#6ee7b7' : '#64748b' }}>
                                {invoiceDocs.length > 0 ? invoiceDocs[0].status : 'Draft'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Smart Document Upload Component (Embedded) ── */}
                <div style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', background: '#ffffff' }}>
                    <SmartUploadPanel 
                        isOpen={true}
                        embedded={true}
                        documentType="Job Documentation"
                        accept="*/*"
                        activeFolderId={masterJob.drive_folder_id || masterJob.gdrive_folder_id || null}
                        activeFolderName={`${jobNo} > Photos & Gallery`}
                        runningEnquiryNo={jobNo}
                        onSelect={async (file, metadata) => {
                            if (!file) return;
                            const targetSubfolder = metadata?.docCategory?.subfolder || metadata?.targetSubfolder || 'Photos & Gallery';
                            const categoryLabel = metadata?.docCategory?.shortLabel || metadata?.docCategory?.label || 'Document';
                            const loadToast = toast.loading(`Uploading ${file.name || 'document'} to [${targetSubfolder}]...`);
                            try {
                                const token = getStoredToken();
                                if (!token) {
                                    toast.dismiss(loadToast);
                                    toast.error('Google Drive is not authenticated. Please connect Google Drive first.');
                                    return;
                                }

                                const year = new Date(masterJob.created_at || new Date()).getFullYear().toString();
                                const cleanTitle = `${jobNo} - ${customer}`;
                                const { provisionFullProjectStructure, getOrCreateFolder, copyFile, uploadFileToDrive } = await import('../../lib/driveService');
                                const { getDocumentSettings } = await import('../../lib/store');

                                let rootId = masterJob.gdrive_folder_id || masterJob.drive_folder_id;

                                if (!rootId) {
                                    const docSettings = await getDocumentSettings(profile?.company_id);
                                    let celronRootId = docSettings?.gdrive_celron_root_id || docSettings?.google_drive_folder_id || '1GPr3g5mq6_TotBzM8gDz_atJPR7TgbB-';
                                    if (celronRootId && celronRootId.includes('drive.google.com')) {
                                        const match = celronRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || celronRootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                                        if (match) celronRootId = match[1];
                                    }
                                    rootId = await provisionFullProjectStructure(token, celronRootId, year, cleanTitle);
                                    if (rootId && masterJob.id) {
                                        await supabase.from('workflow_documents').update({ gdrive_folder_id: rootId, drive_folder_id: rootId }).eq('id', masterJob.id);
                                    }
                                }

                                let targetId = metadata?.targetFolder?.id || metadata?.targetFolder?.folderId;
                                let targetName = metadata?.targetFolder?.name || metadata?.targetFolder?.label;

                                if (!targetId && rootId) {
                                    if (targetSubfolder === 'ROOT' || targetSubfolder === 'Root' || !targetSubfolder) {
                                        targetId = rootId;
                                        targetName = `${jobNo} (Root Folder)`;
                                    } else {
                                        targetId = await getOrCreateFolder(token, targetSubfolder, rootId);
                                        targetName = `${jobNo} > ${targetSubfolder}`;
                                    }
                                } else if (!targetId) {
                                    targetId = rootId;
                                    targetName = `${jobNo} > Root Folder`;
                                }

                                let uploadedResult;
                                if (file.isGoogleDrive) {
                                    uploadedResult = await copyFile(token, file.id, targetId);
                                } else {
                                    uploadedResult = await uploadFileToDrive(token, file, { 
                                        folderId: targetId, 
                                        title: file.name 
                                    });
                                }

                                const fileId = uploadedResult?.id || file.id;
                                const fileLink = fileId ? `https://drive.google.com/file/d/${fileId}/view` : (uploadedResult?.webViewLink || '');

                                // Database Synchronization: Update attachments and transaction state
                                const currentAttachments = Array.isArray(masterJob.attachment_urls) ? masterJob.attachment_urls : [];
                                const updatedAttachments = fileLink && !currentAttachments.includes(fileLink)
                                    ? [...currentAttachments, fileLink]
                                    : currentAttachments;

                                const categoryId = metadata?.docCategory?.id || '';
                                const docType = metadata?.docCategory?.docType || '';

                                let jobUpdates = { attachment_urls: updatedAttachments };

                                if (categoryId === 'payment_proof' || docType === 'Payment Proof') {
                                    jobUpdates.status = 'Paid';
                                    jobUpdates.is_paid = true;
                                    // Also mark any linked invoices as Paid
                                    if (invoiceDocs && invoiceDocs.length > 0) {
                                        for (const inv of invoiceDocs) {
                                            await supabase
                                                .from('workflow_documents')
                                                .update({ status: 'Paid', is_paid: true })
                                                .eq('id', inv.id);
                                        }
                                    }
                                } else if (categoryId === 'delivery_order' || docType === 'Delivery Order') {
                                    if (masterJob.status === 'Active' || masterJob.status === 'Pending') {
                                        jobUpdates.status = 'Delivered';
                                    }
                                } else if (categoryId === 'customer_po' && !masterJob.customer_ref) {
                                    // If filename has PO number, try to extract it
                                    const poMatch = file.name.match(/PO[-_ ]?([A-Za-z0-9]+)/i);
                                    if (poMatch && poMatch[1]) {
                                        jobUpdates.customer_ref = `PO-${poMatch[1]}`;
                                    }
                                }

                                await supabase
                                    .from('workflow_documents')
                                    .update(jobUpdates)
                                    .eq('id', masterJob.id);

                                toast.dismiss(loadToast);
                                toast.success(`Saved "${file.name}" to Google Drive [${targetSubfolder}] as ${categoryLabel}!`);
                                loadEagleViewData();
                            } catch (err) {
                                toast.dismiss(loadToast);
                                console.error('Drive upload failed:', err);
                                toast.error('Upload failed: ' + err.message);
                            }
                        }}
                    />
                </div>

                {/* ── Status Info Section (Inbetween Stepper and Google Drive Tree & Views) ── */}
                <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px 20px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Header Row: Filter & Stage Dot Legend */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                FILTER:
                            </span>
                            {STAGES.map(s => {
                                const count = stageCounts[s.key] || 0;
                                const status = getStageStatus(s.key);
                                const isDone = status === 'done';
                                const isActive = status === 'active';
                                return (
                                    <button
                                        key={s.key}
                                        onClick={() => {
                                            setSelectedStageKey(s.key);
                                            setActiveTab(s.tab);
                                        }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            background: isActive ? s.bg : '#f8fafc',
                                            border: `1px solid ${isActive ? s.color : '#e2e8f0'}`,
                                            borderRadius: '20px',
                                            padding: '3px 10px',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                        title={`Jump to ${s.label} view`}
                                    >
                                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: isDone || isActive ? s.color : '#cbd5e1' }} />
                                        <span style={{ fontSize: '0.72rem', color: isDone || isActive ? s.color : '#64748b', fontWeight: isDone || isActive ? 700 : 500 }}>
                                            {s.label} ({count})
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#ef4444' }} />
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>= Overdue follow-up</span>
                        </div>
                    </div>

                    {/* 7-Stage Interactive Pill Bar (ENQ, QTN, PO, SRC, DEL, INV, PAID) */}
                    <div style={{ display: 'flex', gap: '8px', width: '100%', overflowX: 'auto', padding: '2px 0' }}>
                        {STAGES.map(stage => {
                            const status = getStageStatus(stage.key);
                            const isDone = status === 'done';
                            const isActive = status === 'active';

                            let detailText = '';
                            if (stage.key === 'ENQ') detailText = enquiryDoc ? (enquiryDoc.document_no || 'Recorded') : 'Pending';
                            else if (stage.key === 'QTN') detailText = quotationDocs.length > 0 ? `${quotationDocs.length} Quote(s)` : 'None';
                            else if (stage.key === 'PO') detailText = customerPoDocs.length > 0 ? (customerPoDocs[0].customer_ref || 'Confirmed') : 'Pending';
                            else if (stage.key === 'SRC') detailText = supplierPoDocs.length > 0 ? `${supplierPoDocs.length} PO(s)` : 'SGD 0 Cost';
                            else if (stage.key === 'DEL') detailText = doDocs.length > 0 ? `${doDocs.length} DO(s)` : 'Pending';
                            else if (stage.key === 'INV') detailText = invoiceDocs.length > 0 ? `SGD ${metrics.billedTotal.toLocaleString()}` : 'Unbilled';
                            else if (stage.key === 'PAID') detailText = isJobPaid ? 'Paid' : 'Pending';

                            return (
                                <button
                                    key={stage.key}
                                    onClick={() => {
                                        setSelectedStageKey(stage.key);
                                        setActiveTab(stage.tab);
                                    }}
                                    title={`${stage.label} — ${detailText} (Click to open ${stage.label} view)`}
                                    style={{
                                        flex: 1,
                                        minWidth: '85px',
                                        padding: '8px 6px',
                                        borderRadius: '8px',
                                        border: isActive ? `2px solid ${stage.color}` : 'none',
                                        background: isDone ? stage.color : isActive ? stage.bg : '#f1f5f9',
                                        color: isDone ? '#ffffff' : isActive ? stage.color : '#94a3b8',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '2px',
                                        transition: 'all 0.2s ease',
                                        position: 'relative',
                                        boxShadow: isActive ? `0 2px 8px ${stage.color}33` : 'none'
                                    }}
                                >
                                    <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        {stage.key}
                                    </span>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, opacity: isDone ? 0.95 : 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                                        {detailText}
                                    </span>

                                    {isActive && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '3px',
                                            right: '3px',
                                            width: '5px',
                                            height: '5px',
                                            borderRadius: '50%',
                                            background: stage.color
                                        }} />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#ffffff', borderRadius: '16px 16px 0 0', padding: '12px 16px 0', gap: '8px', overflowX: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                    <button
                        onClick={() => setActiveTab('drive')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', fontSize: '0.8rem', fontWeight: 800, border: 'none', borderBottom: activeTab === 'drive' ? '3px solid #f59e0b' : '3px solid transparent', background: activeTab === 'drive' ? '#eff6ff' : 'transparent', color: activeTab === 'drive' ? '#b45309' : '#475569', cursor: 'pointer', borderRadius: '8px 8px 0 0', transition: 'all 0.2s ease' }}
                    >
                        <FolderOpen size={16} /> Google Drive Tree & Viewer
                    </button>

                    <button
                        onClick={() => setActiveTab('supplier')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', fontSize: '0.8rem', fontWeight: 800, border: 'none', borderBottom: activeTab === 'supplier' ? '3px solid #f59e0b' : '3px solid transparent', background: activeTab === 'supplier' ? '#eff6ff' : 'transparent', color: activeTab === 'supplier' ? '#b45309' : '#475569', cursor: 'pointer', borderRadius: '8px 8px 0 0', transition: 'all 0.2s ease' }}
                    >
                        <ShoppingCart size={16} /> Supplier Orders (PO Cost: SGD {metrics.supplierPoTotal.toLocaleString()})
                    </button>

                    <button
                        onClick={() => setActiveTab('enquiry')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', fontSize: '0.8rem', fontWeight: 800, border: 'none', borderBottom: activeTab === 'enquiry' ? '3px solid #f59e0b' : '3px solid transparent', background: activeTab === 'enquiry' ? '#eff6ff' : 'transparent', color: activeTab === 'enquiry' ? '#b45309' : '#475569', cursor: 'pointer', borderRadius: '8px 8px 0 0', transition: 'all 0.2s ease' }}
                    >
                        <FileText size={16} /> Enquiry Detail
                    </button>

                    <button
                        onClick={() => setActiveTab('quotation')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', fontSize: '0.8rem', fontWeight: 800, border: 'none', borderBottom: activeTab === 'quotation' ? '3px solid #f59e0b' : '3px solid transparent', background: activeTab === 'quotation' ? '#eff6ff' : 'transparent', color: activeTab === 'quotation' ? '#b45309' : '#475569', cursor: 'pointer', borderRadius: '8px 8px 0 0', transition: 'all 0.2s ease' }}
                    >
                        <Receipt size={16} /> Quotation Detail ({quotationDocs.length})
                    </button>

                    <button
                        onClick={() => setActiveTab('customer_po')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', fontSize: '0.8rem', fontWeight: 800, border: 'none', borderBottom: activeTab === 'customer_po' ? '3px solid #f59e0b' : '3px solid transparent', background: activeTab === 'customer_po' ? '#eff6ff' : 'transparent', color: activeTab === 'customer_po' ? '#b45309' : '#475569', cursor: 'pointer', borderRadius: '8px 8px 0 0', transition: 'all 0.2s ease' }}
                    >
                        <Package size={16} /> Customer Order Detail
                    </button>
                </div>

                {/* Tab 1: Google Drive Tree & Viewer */}
                {activeTab === 'drive' && (
                    <EagleDriveTreeViewer 
                        jobFolderId={masterJob.gdrive_folder_id}
                        jobNo={jobNo}
                        customerName={customer}
                        companyId={masterJob.company_id}
                        selectedStage={selectedStageKey}
                    />
                )}

                {/* Tab 2: Supplier Orders (PO Cost Management & CRUD) */}
                {activeTab === 'supplier' && (
                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <ShoppingCart size={20} style={{ color: '#f59e0b' }} />
                                    Supplier Orders linked to {jobNo}
                                </h3>
                                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0' }}>
                                    Total PO Cost currently sums to <strong>SGD {metrics.supplierPoTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                                </p>
                            </div>

                            <button
                                onClick={() => { setSelectedSupplierOrder(null); setIsSupplierModalOpen(true); }}
                                style={{ background: '#f59e0b', color: '#0f172a', fontWeight: 900, border: 'none', padding: '8px 16px', borderRadius: '10px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(245,158,11,0.3)' }}
                            >
                                <Plus size={15} /> Add Supplier Order
                            </button>
                        </div>

                        {supplierPoDocs.length > 0 ? (
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                                    <thead style={{ background: '#0f172a', color: '#ffffff', fontWeight: 800 }}>
                                        <tr>
                                            <th style={{ padding: '12px' }}>Supplier PO No</th>
                                            <th style={{ padding: '12px' }}>Vendor / Supplier</th>
                                            <th style={{ padding: '12px' }}>Issue Date</th>
                                            <th style={{ padding: '12px' }}>Status</th>
                                            <th style={{ padding: '12px' }}>Line Items</th>
                                            <th style={{ padding: '12px', textAlign: 'right' }}>PO Total Amount</th>
                                            <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody style={{ divideY: '1px solid #f1f5f9' }}>
                                        {supplierPoDocs.map(po => (
                                            <tr key={po.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '12px', fontWeight: 800, color: '#4338ca' }}>{po.document_no}</td>
                                                <td style={{ padding: '12px', fontWeight: 700, color: '#0f172a' }}>{po.partners?.name || 'Supplier Partner'}</td>
                                                <td style={{ padding: '12px', color: '#475569' }}>{po.issue_date || po.created_at?.split('T')[0]}</td>
                                                <td style={{ padding: '12px' }}>
                                                    <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 800 }}>
                                                        {po.status || 'Confirmed'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px', color: '#475569' }}>{po.items?.length || 0} line item(s)</td>
                                                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 900, color: '#d97706' }}>
                                                    {po.currency || 'SGD'} {(parseFloat(po.total_amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td style={{ padding: '12px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                    <button
                                                        onClick={() => { setSelectedSupplierOrder(po); setIsSupplierModalOpen(true); }}
                                                        style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                        title="Edit Supplier Order"
                                                    >
                                                        <Edit3 size={14} /> Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSupplierOrder(po.id, po.document_no)}
                                                        style={{ background: '#ffe4e6', color: '#e11d48', border: 'none', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer' }}
                                                        title="Delete Supplier Order"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{ background: '#fffbe finished', border: '2px dashed #fde68a', borderRadius: '12px', padding: '32px', textAlign: 'center', color: '#92400e' }}>
                                <ShoppingCart size={32} style={{ margin: '0 auto 8px', color: '#f59e0b' }} />
                                <p style={{ fontSize: '0.9rem', fontWeight: 800, margin: 0 }}>No Supplier Orders Linked to {jobNo}</p>
                                <p style={{ fontSize: '0.8rem', color: '#b45309', margin: '4px 0 16px' }}>
                                    Click below to issue a supplier PO and update the PO Cost from SGD 0.
                                </p>
                                <button
                                    onClick={() => { setSelectedSupplierOrder(null); setIsSupplierModalOpen(true); }}
                                    style={{ background: '#f59e0b', color: '#0f172a', fontWeight: 900, border: 'none', padding: '10px 20px', borderRadius: '10px', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}
                                >
                                    <Plus size={16} /> Issue Supplier Order Now
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Tab 3: Customer Enquiry Detail */}
                {activeTab === 'enquiry' && (
                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileText size={20} style={{ color: '#4f46e5' }} />
                                Customer Enquiry Details ({enquiryDoc?.document_no || 'N/A'})
                            </h3>
                            {enquiryDoc && (
                                <button
                                    onClick={() => navigate(`/workflows/editor/enquiry/${enquiryDoc.id}`)}
                                    style={{ background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', fontWeight: 700, padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <Edit3 size={14} /> Open Full Enquiry Form
                                </button>
                            )}
                        </div>

                        {enquiryDoc ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.8rem' }}>
                                    <div><strong style={{ color: '#64748b' }}>Enquiry No:</strong> {enquiryDoc.document_no}</div>
                                    <div><strong style={{ color: '#64748b' }}>Customer:</strong> {enquiryDoc.partners?.name || customer}</div>
                                    <div><strong style={{ color: '#64748b' }}>Subject:</strong> {enquiryDoc.subject || 'N/A'}</div>
                                    <div><strong style={{ color: '#64748b' }}>Contact:</strong> {enquiryDoc.contacts?.name || 'N/A'}</div>
                                    <div><strong style={{ color: '#64748b' }}>Date:</strong> {enquiryDoc.issue_date || enquiryDoc.created_at?.split('T')[0]}</div>
                                    <div><strong style={{ color: '#64748b' }}>Status:</strong> {enquiryDoc.status}</div>
                                </div>

                                <h4 style={{ fontSize: '0.75rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Enquiry Line Items</h4>
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                                        <thead style={{ background: '#f1f5f9', fontWeight: 700, color: '#334155' }}>
                                            <tr>
                                                <th style={{ padding: '10px 12px' }}>#</th>
                                                <th style={{ padding: '10px 12px' }}>Description</th>
                                                <th style={{ padding: '10px 12px' }}>Qty</th>
                                                <th style={{ padding: '10px 12px' }}>UOM</th>
                                            </tr>
                                        </thead>
                                        <tbody style={{ divideY: '1px solid #f1f5f9' }}>
                                            {(enquiryDoc.items || []).map((it, idx) => (
                                                <tr key={it.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{idx + 1}</td>
                                                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>{it.description}</td>
                                                    <td style={{ padding: '10px 12px' }}>{it.quantity}</td>
                                                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{it.uom}</td>
                                                </tr>
                                            ))}
                                            {(!enquiryDoc.items || enquiryDoc.items.length === 0) && (
                                                <tr><td colSpan={4} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8' }}>No enquiry line items recorded</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '0.8rem' }}>No customer enquiry linked to this job.</div>
                        )}
                    </div>
                )}

                {/* Tab 4: Customer Quotation Detail */}
                {activeTab === 'quotation' && (
                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Receipt size={20} style={{ color: '#4f46e5' }} />
                                Customer Quotations ({quotationDocs.length})
                            </h3>
                        </div>

                        {quotationDocs.map(q => (
                            <div key={q.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                                    <span style={{ fontWeight: 800, color: '#4338ca', fontSize: '0.9rem' }}>{q.document_no}</span>
                                    <span style={{ background: '#d1fae5', color: '#065f46', padding: '2px 10px', borderRadius: '12px', fontWeight: 800 }}>
                                        Quote Total: {q.currency || 'SGD'} {(parseFloat(q.total_amount) || 0).toLocaleString()}
                                    </span>
                                </div>

                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: '#ffffff' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                                        <thead style={{ background: '#f1f5f9', fontWeight: 700, color: '#334155' }}>
                                            <tr>
                                                <th style={{ padding: '10px 12px' }}>Item Description</th>
                                                <th style={{ padding: '10px 12px' }}>Qty</th>
                                                <th style={{ padding: '10px 12px' }}>Unit Rate ({q.currency})</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody style={{ divideY: '1px solid #f1f5f9' }}>
                                            {(q.items || []).map((it, idx) => (
                                                <tr key={it.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>{it.description}</td>
                                                    <td style={{ padding: '10px 12px' }}>{it.quantity}</td>
                                                    <td style={{ padding: '10px 12px' }}>{(parseFloat(it.unit_price) || 0).toLocaleString()}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>{(parseFloat(it.amount) || 0).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Tab 5: Customer Order Detail */}
                {activeTab === 'customer_po' && (
                    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Package size={20} style={{ color: '#4f46e5' }} />
                            Customer Purchase Order & Reference Details
                        </h3>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.8rem' }}>
                            <div><strong style={{ color: '#64748b' }}>Customer PO Ref:</strong> {masterJob.customer_ref || 'PO07800122'}</div>
                            <div><strong style={{ color: '#64748b' }}>Customer:</strong> {customer}</div>
                            <div><strong style={{ color: '#64748b' }}>Vessel / Location:</strong> {vessel}</div>
                            <div><strong style={{ color: '#64748b' }}>Payment Terms:</strong> {masterJob.terms_conditions || '50% on Order and 50% on COD'}</div>
                            <div><strong style={{ color: '#64748b' }}>Currency:</strong> {masterJob.currency || 'SGD'}</div>
                            <div><strong style={{ color: '#64748b' }}>Job Due Date:</strong> {masterJob.expiry_date || 'N/A'}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Supplier Order CRUD Modal */}
            <SupplierOrderCrudModal
                isOpen={isSupplierModalOpen}
                onClose={() => setIsSupplierModalOpen(false)}
                onSuccess={() => loadEagleViewData()}
                job={masterJob}
                existingOrder={selectedSupplierOrder}
                companyId={profile?.company_id}
            />
        </div>
    );
}
