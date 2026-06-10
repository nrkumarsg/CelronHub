import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
    getJobById, getJobExpenses, createJobExpense, deleteJobExpense, updateJobExpense,
    getDocuments, deleteJob, updateJob,
    getSupplierQuotes, updateEnquiry
} from '../../lib/workflowService';
import { getWorkflowDocumentsByJob, generateDocNumber, recordExternalDocument } from '../../lib/workflowV2Service';
import { generateDocumentPDF } from '../../lib/pdfGenerator';
import { moveFolder, checkFileExists, createFolderStructure, uploadFileToDrive } from '../../lib/driveService';
import { initializeVault } from '../../lib/vaultService';
import { validateToken, connectGoogleAPI } from '../../lib/googleAuthService';
import EditJobModal from '../../components/workflows/EditJobModal';
import CommunicationWall from '../../components/common/CommunicationWall';
import DriveScannerLinker from '../../components/workflows/DriveScannerLinker';
import JobVault from '../../components/workflows/JobVault';
import { 
    ArrowLeft, ArrowRight, ExternalLink, Ship, Package, DollarSign, Clock, CheckCircle2, 
    AlertCircle, FileText, Download, Edit, Trash2, Printer, Plus, Search, Archive, 
    Upload, ListChecks, FileDigit, Truck, CreditCard, BadgeDollarSign, Quote, Loader2,
    Calendar, User, CreditCard as CardIcon, Briefcase, ChevronRight, Activity, 
    HardDrive, FolderOpen, Image as ImageIcon, CheckSquare
} from 'lucide-react';
import SafeDriveLink from '../../components/common/SafeDriveLink';
import UploadOverlay from '../../components/common/UploadOverlay';

export default function JobDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { profile } = useAuth();

    const [job, setJob] = useState(null);
    const [expenses, setExpenses] = useState([]);
    const [quotes, setQuotes] = useState([]);
    const [v2Docs, setV2Docs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showEdit, setShowEdit] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadLink, setUploadLink] = useState(null);
    const [isUpdatingDesc, setIsUpdatingDesc] = useState(false);
    const [tempDesc, setTempDesc] = useState('');

    // Form States
    const [showExpenseForm, setShowExpenseForm] = useState(false);
    const [newExpense, setNewExpense] = useState({ supplier_name: '', description: '', amount: '', status: 'Unpaid' });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [jobRes, expRes, v2DocsRes, quoteRes] = await Promise.all([
                getJobById(profile.company_id, id),
                getJobExpenses(profile.company_id, id),
                getWorkflowDocumentsByJob(id),
                getSupplierQuotes(id)
            ]);

            if (jobRes.data) {
                setJob(jobRes.data);
                setTempDesc(jobRes.data.description || '');
            }
            if (expRes.data) setExpenses(expRes.data);
            if (v2DocsRes.data) setV2Docs(v2DocsRes.data);
            if (quoteRes?.data) setQuotes(quoteRes.data);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    }, [id, profile]);

    useEffect(() => {
        if (profile && id) {
            fetchData();
        }
    }, [fetchData, id, profile]);

    const handleGoBack = () => {
        if (window.history.state && window.history.state.idx > 0) {
            navigate(-1);
        } else {
            navigate('/workflows/jobs-dashboard');
        }
    };

    const handleUpdateDescription = async () => {
        setIsUpdatingDesc(true);
        try {
            const { error } = await updateJob(id, { description: tempDesc });
            if (error) throw error;
            setJob(prev => ({ ...prev, description: tempDesc }));
            alert("Job details updated!");
        } catch (err) {
            alert("Failed to update description: " + err.message);
        } finally {
            setIsUpdatingDesc(false);
        }
    };

    const handleAddExpense = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...newExpense,
                job_id: id,
                company_id: profile.company_id,
                amount: parseFloat(newExpense.amount) || 0
            };
            const { data, error } = await createJobExpense(payload);
            if (error) throw error;
            setExpenses([...expenses, data]);
            setShowExpenseForm(false);
            setNewExpense({ supplier_name: '', description: '', amount: '', status: 'Unpaid' });
        } catch (err) { alert('Failed to add job cost: ' + err.message); }
    };

    const handleDeleteExpense = async (expenseId) => {
        if (!window.confirm('Are you sure you want to delete this expense?')) return;
        try {
            const { error } = await deleteJobExpense(expenseId);
            if (error) throw error;
            setExpenses(expenses.filter(e => e.id !== expenseId));
        } catch (err) { alert('Failed to delete expense'); }
    };

    const handleArchive = async () => {
        const folderId = job.enquiries?.gdrive_folder_id || job.gdrive_folder_id;
        if (!folderId) {
            alert("No Google Drive folder found for this job.");
            return;
        }
        if (!window.confirm("Archive this job to the Corporate Vault?")) return;
        setIsArchiving(true);
        try {
            const accessToken = localStorage.getItem('google_access_token');
            const vaultRootId = await initializeVault(accessToken, profile.company_id);
            await moveFolder(accessToken, folderId, vaultRootId);
            await updateJob(id, { status: 'Archived' });
            if (job.enquiry_id) await updateEnquiry(job.enquiry_id, { status: 'Archived' });
            alert("Successfully moved to Corporate Vault!");
            fetchData();
        } catch (err) { alert(`Failed to archive: ${err.message}`); }
        finally { setIsArchiving(false); }
    };

    const handleUploadToFolder = async (folderName, type = 'file') => {
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const accessToken = localStorage.getItem('google_access_token');
                const projectFolderId = job.enquiries?.gdrive_folder_id || job.gdrive_folder_id;
                if (!projectFolderId) throw new Error("No project folder linked.");

                const subFolderId = await createFolderStructure(accessToken, folderName, projectFolderId);
                const uploadRes = await uploadFileToDrive(accessToken, file, {
                    folderId: subFolderId,
                    title: file.name,
                    company_id: profile.company_id,
                    onProgress: (p) => setUploadProgress(p)
                });
                if (uploadRes.webViewLink) {
                    alert(`${file.name} uploaded to ${folderName}`);
                    fetchData();
                }
            } catch (err) { alert("Upload failed: " + err.message); }
        };
        input.click();
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '20px' }}>
            <Loader2 size={48} className="animate-spin" color="var(--primary)" />
            <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Loading Job Portal...</p>
        </div>
    );

    if (!job) return (
        <div className="page-container" style={{ textAlign: 'center', padding: '100px' }}>
            <AlertCircle size={64} color="#ef4444" style={{ marginBottom: '24px' }} />
            <h2 style={{ fontSize: '2rem', fontWeight: 800 }}>Job Not Found</h2>
            <p style={{ color: 'var(--text-secondary)' }}>This job record could not be retrieved from the database.</p>
            <Link to="/workflows" className="btn btn-primary" style={{ marginTop: '24px' }}>Back to Dashboard</Link>
        </div>
    );

    const totalRevenue = job.po_amount || 0;
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const profit = totalRevenue - totalExpenses;

    // Activity Finder
    const getDocByAction = (type) => v2Docs.find(d => d.document_type === type);

    return (
        <div className="page-container" style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
            {/* Header Area */}
            <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <button onClick={handleGoBack} className="btn btn-icon btn-outline" style={{ borderRadius: '50%' }}>
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                            <h1 style={{ fontSize: '2rem', fontWeight: 900, margin: 0, color: '#1e293b' }}>{job.job_no}</h1>
                            <span className={`badge ${job.status?.toLowerCase()}`} style={{ fontSize: '0.85rem', padding: '6px 14px' }}>{job.status}</span>
                        </div>
                        <p style={{ margin: 0, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Briefcase size={16} /> Linked to Enquiry: <strong>{job.enquiries?.enquiry_no || 'Manual'}</strong>
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={() => setShowEdit(true)} className="btn btn-outline" style={{ gap: '10px' }}><Edit size={18} /> Edit Job</button>
                    <button onClick={handleArchive} disabled={isArchiving} className="btn btn-secondary" style={{ gap: '10px' }}>
                        {isArchiving ? <Loader2 size={18} className="animate-spin" /> : <Archive size={18} />}
                        Archive to Vault
                    </button>
                    <button onClick={() => window.print()} className="btn btn-primary" style={{ gap: '10px' }}><Download size={18} /> Export Record</button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '32px' }}>
                {/* Main Content */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    
                    {/* Stage 1: Job Identity & Details */}
                    <div className="glass-panel" style={{ padding: '32px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'var(--primary)' }}></div>
                        <h3 style={{ margin: '0 0 24px 0', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.25rem', fontWeight: 800 }}>
                            <User size={24} color="var(--primary)" /> 1. Job Identity & Client Detail
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                            {/* Read-only Customer Info */}
                            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '12px' }}>Customer Contact</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>{job.partners?.name || 'Walk-in Customer'}</div>
                                    <div style={{ fontSize: '0.9rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <FileText size={14} /> {job.partners?.address || 'No address provided'}
                                    </div>
                                    <div style={{ display: 'flex', gap: '20px' }}>
                                        <div style={{ fontSize: '0.9rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Calendar size={14} /> {job.partners?.email1 || 'No email'}
                                        </div>
                                        <div style={{ fontSize: '0.9rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <DollarSign size={14} /> {job.partners?.phone1 || 'No phone'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Multi-line Job Description */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Scope of Work / Job Details</label>
                                <textarea
                                    className="input"
                                    style={{ flex: 1, minHeight: '120px', resize: 'vertical', fontSize: '0.95rem', lineHeight: '1.6', padding: '12px' }}
                                    placeholder="Enter detailed scope of work here..."
                                    value={tempDesc}
                                    onChange={(e) => setTempDesc(e.target.value)}
                                />
                                <button 
                                    onClick={handleUpdateDescription} 
                                    disabled={isUpdatingDesc || tempDesc === job.description}
                                    className="btn btn-sm btn-outline"
                                    style={{ alignSelf: 'flex-end', gap: '8px' }}
                                >
                                    {isUpdatingDesc ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />}
                                    Save Description
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Stage 2 & 3: Activity Gallery */}
                    <div className="glass-panel" style={{ padding: '32px' }}>
                        <h3 style={{ margin: '0 0 24px 0', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.25rem', fontWeight: 800 }}>
                            <Activity size={24} color="#f59e0b" /> 2. Process Activity Gallery
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
                            {/* Enquiry Tile */}
                            <Link to={`/workflows/enquiry/${job.enquiry_id}`} className="activity-tile">
                                <div className="icon-wrap" style={{ background: '#eff6ff', color: '#3b82f6' }}><FileText size={20} /></div>
                                <div className="tile-content">
                                    <span className="label">Enquiry</span>
                                    <span className="value">{job.enquiries?.enquiry_no}</span>
                                    <span className="status-badge success">Received</span>
                                </div>
                                <ChevronRight size={16} className="arrow" />
                            </Link>
                            
                            {/* Quotation Tile */}
                            {getDocByAction('Quotation') ? (
                                <Link to={`/workflows/edit/${getDocByAction('Quotation').id}`} className="activity-tile">
                                    <div className="icon-wrap" style={{ background: '#fef3c7', color: '#d97706' }}><Quote size={20} /></div>
                                    <div className="tile-content">
                                        <span className="label">Quotation</span>
                                        <span className="value">{getDocByAction('Quotation').document_no}</span>
                                        <span className="status-badge warning">Sent</span>
                                    </div>
                                    <ChevronRight size={16} className="arrow" />
                                </Link>
                            ) : (
                                <div className="activity-tile disabled">
                                    <div className="icon-wrap"><Quote size={20} /></div>
                                    <div className="tile-content">
                                        <span className="label">Quotation</span>
                                        <span className="value">Not Generated</span>
                                    </div>
                                </div>
                            )}

                            {/* Operations Tile (DO/SR) */}
                            {getDocByAction('Delivery Order') || getDocByAction('Service Report') ? (
                                <Link to={`/workflows?job_id=${id}`} className="activity-tile">
                                    <div className="icon-wrap" style={{ background: '#ecfdf5', color: '#10b981' }}><Truck size={20} /></div>
                                    <div className="tile-content">
                                        <span className="label">Operations</span>
                                        <span className="value">{getDocByAction('Delivery Order')?.document_no || getDocByAction('Service Report')?.document_no}</span>
                                        <span className="status-badge success">Delivered</span>
                                    </div>
                                    <ChevronRight size={16} className="arrow" />
                                </Link>
                            ) : (
                                <div className="activity-tile disabled">
                                    <div className="icon-wrap"><Truck size={20} /></div>
                                    <div className="tile-content">
                                        <span className="label">Operations</span>
                                        <span className="value">Pending</span>
                                    </div>
                                </div>
                            )}

                            {/* Invoicing Tile */}
                            {getDocByAction('Invoice') ? (
                                <Link to={`/workflows/edit/${getDocByAction('Invoice').id}`} className="activity-tile">
                                    <div className="icon-wrap" style={{ background: '#fef2f2', color: '#ef4444' }}><DollarSign size={20} /></div>
                                    <div className="tile-content">
                                        <span className="label">Invoice</span>
                                        <span className="value">{getDocByAction('Invoice').document_no}</span>
                                        <span className="status-badge danger">Invoiced</span>
                                    </div>
                                    <ChevronRight size={16} className="arrow" />
                                </Link>
                            ) : (
                                <div className="activity-tile disabled">
                                    <div className="icon-wrap"><DollarSign size={20} /></div>
                                    <div className="tile-content">
                                        <span className="label">Financials</span>
                                        <span className="value">Not Invoiced</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Stage 4: Costing Subtable */}
                    <div className="glass-panel" style={{ padding: '32px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.25rem', fontWeight: 800 }}>
                                <BadgeDollarSign size={24} color="#10b981" /> 3. Expenses & Supplier Bills
                            </h3>
                            <button onClick={() => setShowExpenseForm(true)} className="btn btn-sm btn-primary" style={{ gap: '8px' }}>
                                <Plus size={16} /> Add Supplier Bill
                            </button>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                                <thead>
                                    <tr style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        <th style={{ padding: '12px', textAlign: 'left' }}>Supplier</th>
                                        <th style={{ padding: '12px', textAlign: 'left' }}>Content</th>
                                        <th style={{ padding: '12px', textAlign: 'right' }}>Amount</th>
                                        <th style={{ padding: '12px', textAlign: 'center' }}>Evidence</th>
                                        <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {expenses.map(exp => (
                                        <tr key={exp.id} className="table-row-hover" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                                            <td style={{ padding: '16px 12px', fontWeight: 700, color: '#1e293b' }}>{exp.supplier_name}</td>
                                            <td style={{ padding: '16px 12px', color: '#64748b', fontSize: '0.9rem' }}>{exp.description}</td>
                                            <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)', fontSize: '1rem' }}>${exp.amount?.toLocaleString()}</td>
                                            <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                                                {exp.attachment_url ? (
                                                    <SafeDriveLink url={exp.attachment_url} label="View Bill" className="btn btn-xs btn-outline" />
                                                ) : (
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8 italic' }}>No File</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                                                <button onClick={() => handleDeleteExpense(exp.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {expenses.length === 0 && (
                                        <tr>
                                            <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                                <DollarSign size={32} style={{ opacity: 0.2, marginBottom: '8px' }} />
                                                <p>No supplier invoices recorded for this job.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Stage 4: Project Vault (Interactive) */}
                    <JobVault job={job} googleToken={localStorage.getItem('google_access_token')} />

                </div>

                {/* Sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    
                    {/* Customer Purchase Order Block */}
                    <div className="glass-panel" style={{ padding: '24px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: 'white' }}>
                        <h4 style={{ margin: '0 0 20px 0', fontSize: '0.9rem', color: '#94a3b8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CardIcon size={16} /> Customer Order Details
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>PO Reference:</span>
                                <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>{job.po_ref || 'PENDING'}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', opacity: 0.6, marginBottom: '4px' }}>PO Date</label>
                                    <div style={{ fontWeight: 600 }}>{job.po_date || 'N/A'}</div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', opacity: 0.6, marginBottom: '4px' }}>Ordered By</label>
                                    <div style={{ fontWeight: 600 }}>{job.po_by || 'N/A'}</div>
                                </div>
                            </div>
                            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: 0 }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '1rem', opacity: 0.9 }}>Order Value:</span>
                                <span style={{ fontSize: '1.75rem', fontWeight: 900, color: '#4ade80' }}>${totalRevenue.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>


                    {/* Financial Summary Card */}
                    <div className="glass-panel" style={{ padding: '24px', background: '#f8fafc' }}>
                        <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 800 }}>Financial Performance</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#64748b' }}>Revenue (PO)</span>
                                <span style={{ fontWeight: 600 }}>${totalRevenue.toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#64748b' }}>Project Costs</span>
                                <span style={{ fontWeight: 600, color: '#ef4444' }}>-${totalExpenses.toLocaleString()}</span>
                            </div>
                            <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>Project Profit</span>
                                <span style={{ fontWeight: 900, fontSize: '1.5rem', color: profit >= 0 ? '#10b981' : '#ef4444' }}>
                                    ${profit.toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Modals & Overlays */}
            {showEdit && <EditJobModal job={job} onClose={() => setShowEdit(false)} onSave={() => { setShowEdit(false); fetchData(); }} />}
            {uploadProgress > 0 && <UploadOverlay progress={uploadProgress} link={uploadLink} onClose={() => { setUploadProgress(0); setUploadLink(null); }} />}

            {/* Custom Styles for Activity Tiles */}
            <style dangerouslySetInnerHTML={{ __html: `
                .activity-tile {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 16px;
                    background: #fff;
                    border: 1px solid #e2e8f0;
                    border-radius: 16px;
                    text-decoration: none;
                    color: inherit;
                    transition: all 0.2s ease;
                    position: relative;
                }
                .activity-tile:hover {
                    border-color: var(--primary);
                    transform: translateY(-2px);
                    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
                }
                .activity-tile .icon-wrap {
                    padding: 10px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .activity-tile .tile-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }
                .activity-tile .label {
                    font-size: 0.75rem;
                    color: #64748b;
                    font-weight: 700;
                    text-transform: uppercase;
                }
                .activity-tile .value {
                    font-weight: 800;
                    font-size: 0.95rem;
                    color: #1e293b;
                }
                .activity-tile .arrow {
                    color: #cbd5e1;
                    transition: transform 0.2s ease;
                }
                .activity-tile:hover .arrow {
                    transform: translateX(4px);
                    color: var(--primary);
                }
                .activity-tile.disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    background: #f1f5f9;
                }
                .status-badge {
                    font-size: 0.65rem;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-weight: 700;
                    width: fit-content;
                    margin-top: 4px;
                }
                .status-badge.success { background: #dcfce7; color: #166534; }
                .status-badge.warning { background: #fef3c7; color: #92400e; }
                .status-badge.danger { background: #fee2e2; color: #991b1b; }

                .upload-btn {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px 16px;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #475569;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: left;
                }
                .upload-btn:hover {
                    background: #f1f5f9;
                    border-color: var(--primary);
                    color: var(--primary);
                }
            `}} />
        </div>
    );
}
