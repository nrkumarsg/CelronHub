import React, { useState } from 'react';
import { 
    X, Upload, FolderPlus, HelpCircle, Briefcase, FileText, 
    Building2, Ship, MapPin, Sparkles, Check, AlertCircle, RefreshCcw 
} from 'lucide-react';
import SearchableSelect from '../common/SearchableSelect';
import { generateDocNumber } from '../../lib/workflowV2Service';
import { provisionEnquiryFolderStructure, provisionFullProjectStructure, uploadFileToDrive } from '../../lib/driveService';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

export default function WorkflowUploadModal({
    isOpen,
    onClose,
    partners = [],
    contacts = [],
    vessels = [],
    workLocations = [],
    companyId,
    settings,
    updateWizardData,
    onNavigateStep,
    onRefreshRepository
}) {
    const [workflowType, setWorkflowType] = useState('ENQUIRY'); // 'ENQUIRY' | 'JOB'
    const [partnerId, setPartnerId] = useState('');
    const [contactId, setContactId] = useState('');
    const [vesselId, setVesselId] = useState('');
    const [workLocationId, setWorkLocationId] = useState('');
    const [subject, setSubject] = useState('');
    const [attachedFile, setAttachedFile] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);

    if (!isOpen) return null;

    // Filter contacts based on selected partner
    const filteredContacts = partnerId 
        ? contacts.filter(c => (c.partnerId === partnerId || c.partner_id === partnerId))
        : contacts;

    const handleFileDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setAttachedFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) {
            setAttachedFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        const toastId = toast.loading(
            workflowType === 'ENQUIRY' 
                ? "Generating Enquiry & provisioning Google Drive folder..." 
                : "Generating Job & provisioning Google Drive folder...",
            { id: 'workflow-upload' }
        );

        try {
            const selectedPartner = partners.find(p => p.id === partnerId);
            const customerName = selectedPartner?.name || selectedPartner?.company_name || 'Celron Customer';
            const year = new Date().getFullYear();
            const token = localStorage.getItem('google_access_token');
            const rootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id || '1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w';

            if (workflowType === 'ENQUIRY') {
                // 1. Generate Enquiry Document No
                const enqNo = await generateDocNumber(companyId, 'Enquiry');
                const folderTitle = `${enqNo} - ${customerName}`;

                // 2. Provision Google Drive Folder for Enquiry
                let driveFolderId = null;
                let driveLink = '';
                if (token) {
                    try {
                        const folderRes = await provisionEnquiryFolderStructure(token, rootId, year, folderTitle);
                        driveFolderId = folderRes?.enqFolderId || null;
                        driveLink = folderRes?.webViewLink || (driveFolderId ? `https://drive.google.com/drive/folders/${driveFolderId}` : '');
                    } catch (driveErr) {
                        console.warn("Google Drive enquiry folder creation deferred:", driveErr);
                    }
                }

                // 3. Upload attached file if provided
                let fileUrl = '';
                let fileDriveId = null;
                if (attachedFile && token && driveFolderId) {
                    try {
                        const uploaded = await uploadFileToDrive(token, attachedFile, {
                            folderId: driveFolderId,
                            title: attachedFile.name
                        });
                        fileDriveId = uploaded.id || null;
                        fileUrl = uploaded.webViewLink || '';
                    } catch (uploadErr) {
                        console.warn("File upload to Drive failed:", uploadErr);
                    }
                }

                // 4. Insert into database
                const { data: dbDoc, error: dbErr } = await supabase
                    .from('workflow_documents')
                    .insert({
                        company_id: companyId,
                        document_type: 'Enquiry',
                        document_no: enqNo,
                        issue_date: new Date().toISOString().split('T')[0],
                        partner_id: partnerId || null,
                        contact_id: contactId || null,
                        vessel_id: vesselId || null,
                        work_location_id: workLocationId || null,
                        subject: subject || `Enquiry for ${customerName}`,
                        status: 'Active',
                        gdrive_folder_id: driveFolderId,
                        gdrive_file_link: driveLink || fileUrl || null,
                        notes: attachedFile ? `Attached File: ${attachedFile.name}` : null
                    })
                    .select('*')
                    .single();

                if (dbErr) throw dbErr;

                // 5. Update Wizard State
                updateWizardData({
                    enquiryNo: enqNo,
                    partnerId: partnerId || '',
                    customerName: customerName,
                    contactId: contactId || '',
                    vesselId: vesselId || '',
                    workLocationId: workLocationId || '',
                    subject: subject || `Enquiry for ${customerName}`,
                    gdriveFolderId: driveFolderId,
                    gdrive_folder_id: driveFolderId,
                    landingNoteFile: attachedFile ? attachedFile.name : null,
                    landingNoteUrl: fileUrl,
                    landingNoteDriveId: fileDriveId
                });

                toast.success(`Enquiry ${enqNo} created with Google Drive folder!`, { id: toastId });

                if (onRefreshRepository) onRefreshRepository();
                onClose();

                // Redirect to Step 1 (Enquiry Landing)
                if (onNavigateStep) onNavigateStep(1);

            } else {
                // WORKFLOW TYPE: JOB
                // 1. Generate Job Document No
                const jobNo = await generateDocNumber(companyId, 'Job');
                const projectFolderName = `${jobNo} - ${customerName}`;

                // 2. Provision Google Drive Folder for Job
                let driveFolderId = null;
                let driveLink = '';
                if (token) {
                    try {
                        driveFolderId = await provisionFullProjectStructure(token, rootId, year, projectFolderName);
                        if (driveFolderId) {
                            driveLink = `https://drive.google.com/drive/folders/${driveFolderId}`;
                        }
                    } catch (driveErr) {
                        console.warn("Google Drive job folder creation deferred:", driveErr);
                    }
                }

                // 3. Upload attached file if provided
                let fileUrl = '';
                let fileDriveId = null;
                if (attachedFile && token && driveFolderId) {
                    try {
                        const uploaded = await uploadFileToDrive(token, attachedFile, {
                            folderId: driveFolderId,
                            title: attachedFile.name
                        });
                        fileDriveId = uploaded.id || null;
                        fileUrl = uploaded.webViewLink || '';
                    } catch (uploadErr) {
                        console.warn("File upload to Drive failed:", uploadErr);
                    }
                }

                // 4. Insert into database
                const { data: dbDoc, error: dbErr } = await supabase
                    .from('workflow_documents')
                    .insert({
                        company_id: companyId,
                        document_type: 'Job',
                        document_no: jobNo,
                        assigned_job_no: jobNo,
                        is_job: true,
                        issue_date: new Date().toISOString().split('T')[0],
                        partner_id: partnerId || null,
                        contact_id: contactId || null,
                        vessel_id: vesselId || null,
                        work_location_id: workLocationId || null,
                        subject: subject || `Job Order for ${customerName}`,
                        status: 'Active',
                        gdrive_folder_id: driveFolderId,
                        gdrive_file_link: driveLink || fileUrl || null,
                        notes: attachedFile ? `Initial Job Upload: ${attachedFile.name}` : null
                    })
                    .select('*')
                    .single();

                if (dbErr) throw dbErr;

                // 5. Update Wizard State
                updateWizardData({
                    jobNo: jobNo,
                    enquiryNo: `ENQ-FOR-${jobNo}`,
                    partnerId: partnerId || '',
                    customerName: customerName,
                    contactId: contactId || '',
                    vesselId: vesselId || '',
                    workLocationId: workLocationId || '',
                    subject: subject || `Job Order for ${customerName}`,
                    jobDriveFolderId: driveFolderId,
                    gdriveFolderId: driveFolderId,
                    jobFile: attachedFile ? attachedFile.name : null,
                    jobUrl: fileUrl
                });

                toast.success(`Job Order ${jobNo} created with Google Drive project folder!`, { id: toastId });

                if (onRefreshRepository) onRefreshRepository();
                onClose();

                // Redirect to Step 4 (Job Execution)
                if (onNavigateStep) onNavigateStep(4);
            }

        } catch (err) {
            console.error("Error submitting workflow upload:", err);
            toast.error("Failed to create workflow: " + (err.message || 'Database error'), { id: 'workflow-upload' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(5px)',
            zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px'
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: '20px',
                maxWidth: '650px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                    color: '#ffffff',
                    borderTopLeftRadius: '20px',
                    borderTopRightRadius: '20px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: 'rgba(99, 102, 241, 0.2)', padding: '10px', borderRadius: '12px' }}>
                            <Upload size={22} color="#818cf8" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Workflow Document Upload</h3>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                Select workflow type, customer details &amp; auto-create Google Drive folder
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* WORKFLOW TYPE SELECTOR (1: Enquiry vs 2: Job) */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.86rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                            1. Select Workflow Purpose:
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <button
                                type="button"
                                onClick={() => setWorkflowType('ENQUIRY')}
                                style={{
                                    border: workflowType === 'ENQUIRY' ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                                    background: workflowType === 'ENQUIRY' ? '#eff6ff' : '#f8fafc',
                                    borderRadius: '14px',
                                    padding: '16px',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontWeight: 800, color: workflowType === 'ENQUIRY' ? '#1d4ed8' : '#334155', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <FileText size={18} color={workflowType === 'ENQUIRY' ? '#2563eb' : '#64748b'} />
                                        1) For Enquiry
                                    </span>
                                    {workflowType === 'ENQUIRY' && <Check size={18} color="#2563eb" />}
                                </div>
                                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                    Paper scan, RFQ landing note, or customer lead inquiry. Provisions Enquiry Drive folder.
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setWorkflowType('JOB')}
                                style={{
                                    border: workflowType === 'JOB' ? '2px solid #10b981' : '1px solid #cbd5e1',
                                    background: workflowType === 'JOB' ? '#ecfdf5' : '#f8fafc',
                                    borderRadius: '14px',
                                    padding: '16px',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontWeight: 800, color: workflowType === 'JOB' ? '#047857' : '#334155', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Briefcase size={18} color={workflowType === 'JOB' ? '#059669' : '#64748b'} />
                                        2) For Job
                                    </span>
                                    {workflowType === 'JOB' && <Check size={18} color="#059669" />}
                                </div>
                                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                    Direct Job creation, confirmed customer order or service execution. Provisions full Job Drive project folder.
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Customer & Relationship Details */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                Customer / Partner *
                            </label>
                            <SearchableSelect
                                options={partners.map(p => ({
                                    value: p.id,
                                    label: p.name || p.company_name || 'Unnamed Partner',
                                    sublabel: p.city ? `City: ${p.city}` : null
                                }))}
                                value={partnerId}
                                onChange={(val) => {
                                    setPartnerId(val);
                                    setContactId('');
                                }}
                                placeholder="Search Customer..."
                                icon={Building2}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                Contact Person
                            </label>
                            <SearchableSelect
                                options={filteredContacts.map(c => ({
                                    value: c.id,
                                    label: c.name || 'Unnamed Contact',
                                    sublabel: c.email || c.phone || null
                                }))}
                                value={contactId}
                                onChange={setContactId}
                                placeholder="Select Contact..."
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                Vessel (Optional)
                            </label>
                            <SearchableSelect
                                options={vessels.map(v => ({
                                    value: v.id,
                                    label: v.vessel_name || 'Unnamed Vessel',
                                    sublabel: v.imo_number ? `IMO: ${v.imo_number}` : null
                                }))}
                                value={vesselId}
                                onChange={setVesselId}
                                placeholder="Search Vessel..."
                                icon={Ship}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                Work Location / Port
                            </label>
                            <SearchableSelect
                                options={workLocations.map(w => ({
                                    value: w.id,
                                    label: w.location_name || 'Unnamed Location',
                                    sublabel: w.pincode ? `Pincode: ${w.pincode}` : null
                                }))}
                                value={workLocationId}
                                onChange={setWorkLocationId}
                                placeholder="Select Location..."
                                icon={MapPin}
                            />
                        </div>
                    </div>

                    {/* Subject / Title */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                            Subject / Work Description
                        </label>
                        <input
                            type="text"
                            placeholder={workflowType === 'ENQUIRY' ? "e.g. Technical Service & Calibration Enquiry" : "e.g. Engine Overhaul & Calibration Job Works"}
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.88rem',
                                outline: 'none'
                            }}
                        />
                    </div>

                    {/* Drag & Drop File Upload Area */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                            Upload Document / Paper Scan (Optional)
                        </label>
                        <div
                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={handleFileDrop}
                            style={{
                                border: `2px dashed ${isDragOver ? '#3b82f6' : '#cbd5e1'}`,
                                background: isDragOver ? '#eff6ff' : '#f8fafc',
                                borderRadius: '12px',
                                padding: '20px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            onClick={() => document.getElementById('workflow-file-input').click()}
                        >
                            <input
                                id="workflow-file-input"
                                type="file"
                                onChange={handleFileSelect}
                                style={{ display: 'none' }}
                                accept=".pdf,.doc,.docx,.jpg,.png,.jpeg,.txt,.csv,.xlsx"
                            />
                            <Upload size={28} color="#64748b" style={{ margin: '0 auto 8px', display: 'block' }} />
                            {attachedFile ? (
                                <div>
                                    <span style={{ fontWeight: 800, color: '#1d4ed8', fontSize: '0.9rem' }}>
                                        📎 {attachedFile.name}
                                    </span>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                        ({(attachedFile.size / 1024).toFixed(1)} KB) - Click or drop another file to replace
                                    </span>
                                </div>
                            ) : (
                                <div>
                                    <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.86rem' }}>
                                        Drag and drop PDF/Scan file here, or <strong style={{ color: '#2563eb' }}>Browse</strong>
                                    </span>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                                        Files will be saved directly into the created Google Drive folder
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Submit Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            style={{
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                color: '#475569',
                                borderRadius: '10px',
                                padding: '10px 18px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            style={{
                                background: workflowType === 'ENQUIRY' 
                                    ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                                    : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                border: 'none',
                                color: '#ffffff',
                                borderRadius: '10px',
                                padding: '10px 22px',
                                fontSize: '0.88rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: workflowType === 'ENQUIRY'
                                    ? '0 4px 14px rgba(59, 130, 246, 0.3)'
                                    : '0 4px 14px rgba(16, 185, 129, 0.3)'
                            }}
                        >
                            {isSubmitting ? (
                                <>
                                    <RefreshCcw size={16} className="animate-spin" /> Provisioning Drive Folder...
                                </>
                            ) : workflowType === 'ENQUIRY' ? (
                                <>
                                    <FolderPlus size={18} /> Create Enquiry &amp; Drive Folder →
                                </>
                            ) : (
                                <>
                                    <FolderPlus size={18} /> Create Job &amp; Project Drive Folder →
                                </>
                            )}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}
