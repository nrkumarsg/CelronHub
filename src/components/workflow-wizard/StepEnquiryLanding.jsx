import React, { useState, useEffect } from 'react';
import { 
    FileText, Upload, Check, Folder, Search, Building2, User, 
    Ship, MapPin, ArrowRight, RefreshCcw, Sparkles, ExternalLink, Plus, Edit2, Trash2 
} from 'lucide-react';
import SearchableSelect from '../common/SearchableSelect';
import SmartUploadPanel from '../upload/SmartUploadPanel';
import DropdownCrudModal from '../common/DropdownCrudModal';
import UniversalFileViewer from '../common/UniversalFileViewer';
import DriveExplorer from '../common/DriveExplorer';
import { generateDocNumber } from '../../lib/workflowV2Service';
import toast from 'react-hot-toast';

export default function StepEnquiryLanding({ 
    wizardData, 
    updateWizardData, 
    onNext, 
    onPrev,
    partners = [], 
    contacts = [], 
    vessels = [], 
    workLocations = [],
    companyId,
    reloadDatasets,
    settings = {}
}) {
    const [isUploadPanelOpen, setIsUploadPanelOpen] = useState(false);
    const [isGeneratingNo, setIsGeneratingNo] = useState(false);
    const [showAllContacts, setShowAllContacts] = useState(false);
    const [isParsingScan, setIsParsingScan] = useState(false);

    const handleStartFromScan = async () => {
        setIsParsingScan(true);
        toast.loading("Scanning latest landing note / email scan to auto-build job...", { id: 'start-scan' });
        try {
            const token = localStorage.getItem('google_access_token');
            const rootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id || '1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w';
            
            const { listFolderContent } = await import('../../lib/driveService');
            const files = await listFolderContent(token, rootId);
            const latestScan = files.find(f => f.mimeType !== 'application/vnd.google-apps.folder');

            if (latestScan) {
                handleSelectFile(latestScan);
                toast.success(`Attached scan "${latestScan.name}" to Enquiry ${wizardData.enquiryNo || ''}!`, { id: 'start-scan' });
            } else {
                toast.dismiss('start-scan');
                setIsUploadPanelOpen(true);
            }
        } catch (err) {
            console.error("Start from scan error:", err);
            toast.error("Start from scan: " + err.message, { id: 'start-scan' });
        } finally {
            setIsParsingScan(false);
        }
    };

    // Filter contacts based on selected customer / partner
    const filteredContacts = React.useMemo(() => {
        if (!wizardData.partnerId || showAllContacts) {
            return contacts;
        }
        return contacts.filter(c => (c.partnerId === wizardData.partnerId || c.partner_id === wizardData.partnerId));
    }, [contacts, wizardData.partnerId, showAllContacts]);

    // CRUD Modal State
    const [crudState, setCrudState] = useState({
        isOpen: false,
        type: 'partner', // 'partner' | 'contact' | 'vessel' | 'location'
        mode: 'create',  // 'create' | 'edit'
        initialData: null
    });

    const activeLandingFolder = wizardData?.gdriveFolderId || 
                                wizardData?.gdrive_folder_id || 
                                wizardData?.landingNoteDriveId || 
                                settings?.gdrive_01_id || 
                                settings?.gdrive_celron_root_id || 
                                settings?.google_drive_folder_id || 
                                '1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w';

    const driveLandingUrl = (typeof activeLandingFolder === 'string' && (activeLandingFolder.startsWith('http://') || activeLandingFolder.startsWith('https://')))
        ? activeLandingFolder
        : `https://drive.google.com/drive/folders/${activeLandingFolder}`;

    useEffect(() => {
        if (!wizardData.enquiryNo && companyId) {
            autoGenerateEnquiryNo();
        }
    }, [companyId]);

    // Auto-provision or locate dedicated folder for this Enquiry No under 2026/Enquiries
    useEffect(() => {
        if (wizardData.enquiryNo && !wizardData.gdriveFolderId) {
            ensureEnquiryDriveFolder(wizardData.enquiryNo, wizardData.customerName);
        }
    }, [wizardData.enquiryNo, wizardData.customerName, wizardData.gdriveFolderId]);

    const ensureEnquiryDriveFolder = async (enqNo, custName) => {
        const token = localStorage.getItem('google_access_token');
        if (!token || !enqNo) return;

        try {
            const rootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id || '1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w';
            const year = new Date().getFullYear();
            const folderTitle = `${enqNo}${custName ? ` - ${custName}` : ''}`;
            const { provisionEnquiryFolderStructure } = await import('../../lib/driveService');
            const res = await provisionEnquiryFolderStructure(token, rootId, year, folderTitle);
            if (res && res.enqFolderId) {
                updateWizardData({
                    gdriveFolderId: res.enqFolderId,
                    gdrive_folder_id: res.enqFolderId
                });
            }
        } catch (err) {
            console.warn('Auto-provisioning enquiry drive folder skipped/deferred:', err);
        }
    };

    const autoGenerateEnquiryNo = async () => {
        setIsGeneratingNo(true);
        try {
            const nextNo = await generateDocNumber(companyId, 'Enquiry');
            updateWizardData({ enquiryNo: nextNo });
            ensureEnquiryDriveFolder(nextNo, wizardData.customerName);
        } catch (err) {
            console.error('Error generating enquiry no:', err);
            const fallbackNo = `ENQ-${new Date().getFullYear()}-0001`;
            updateWizardData({ enquiryNo: fallbackNo });
            ensureEnquiryDriveFolder(fallbackNo, wizardData.customerName);
        } finally {
            setIsGeneratingNo(false);
        }
    };

    const handleSelectFile = (file) => {
        if (!file) return;
        const fileName = file.name || file.fileName || 'Landing Note Paper Document';
        const fileUrl = file.webViewLink || file.url || file.previewUrl || '';
        const driveId = file.id || file.fileId || null;

        const newDoc = {
            id: driveId || `file_${Date.now()}`,
            name: fileName,
            url: fileUrl,
            driveId: driveId,
            uploadedAt: new Date().toISOString(),
            enquiryNo: wizardData.enquiryNo || 'Draft Enquiry'
        };

        const existingFiles = Array.isArray(wizardData.landingNoteFiles) ? wizardData.landingNoteFiles : [];
        const updatedFiles = [newDoc, ...existingFiles.filter(f => f.name !== fileName)];

        updateWizardData({
            landingNoteFile: fileName,
            landingNoteUrl: fileUrl,
            landingNoteDriveId: driveId,
            landingNoteFiles: updatedFiles
        });
        toast.success(`Attached to enquiry folder (${wizardData.enquiryNo || 'Enquiry'}): ${fileName}`);
    };

    // Open CRUD Modal Handler
    const openCrud = (type, mode = 'create', existingItem = null) => {
        setCrudState({
            isOpen: true,
            type,
            mode,
            initialData: existingItem
        });
    };

    const handleCrudSuccess = async (result) => {
        if (reloadDatasets) {
            await reloadDatasets();
        }

        if (result && result.id) {
            // Auto-select newly created or edited item in wizard state
            if (crudState.type === 'partner') {
                updateWizardData({ partnerId: result.id, customerName: result.name });
            } else if (crudState.type === 'contact') {
                updateWizardData({ contactId: result.id });
            } else if (crudState.type === 'vessel') {
                updateWizardData({ vesselId: result.id });
            } else if (crudState.type === 'location') {
                updateWizardData({ workLocationId: result.id });
            }
        } else if (result && result.deletedId) {
            // Un-select deleted item
            if (crudState.type === 'partner' && wizardData.partnerId === result.deletedId) {
                updateWizardData({ partnerId: '', customerName: '' });
            } else if (crudState.type === 'contact' && wizardData.contactId === result.deletedId) {
                updateWizardData({ contactId: '' });
            } else if (crudState.type === 'vessel' && wizardData.vesselId === result.deletedId) {
                updateWizardData({ vesselId: '' });
            } else if (crudState.type === 'location' && wizardData.workLocationId === result.deletedId) {
                updateWizardData({ workLocationId: '' });
            }
        }
    };

    const selectedPartner = partners.find(p => p.id === wizardData.partnerId);
    const selectedContact = contacts.find(c => c.id === wizardData.contactId);
    const selectedVessel = vessels.find(v => v.id === wizardData.vesselId);
    const selectedLocation = workLocations.find(w => w.id === wizardData.workLocationId);

    const isValid = wizardData.enquiryNo && (wizardData.partnerId || wizardData.customerName);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header & Instructions */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: '#3b82f6', color: '#fff', padding: '8px', borderRadius: '10px' }}>
                            <FileText size={22} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                                Step 1: Paper Enquiry / Landing Note Scan
                            </h2>
                            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                Upload paper notes, select/confirm customer details from Supabase (with full +Add &amp; Amend CRUD modal support), and generate Enquiry No.
                            </span>
                        </div>
                    </div>

                    {/* Quick Cross-Check External Links & Start From Scan Strategy Button */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                            type="button"
                            onClick={handleStartFromScan}
                            disabled={isParsingScan}
                            style={{
                                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                color: '#fff',
                                border: 'none',
                                padding: '6px 14px',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 2px 4px rgba(79, 70, 229, 0.25)'
                            }}
                        >
                            <Sparkles size={14} /> Start From Scan: Build Job
                        </button>
                        <a
                            href="/enquiries"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                            📋 Enquiry List ↗
                        </a>
                        <a
                            href="/workflows/editor/new?type=Enquiry"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                            ✏️ Enquiry Editor ↗
                        </a>
                    </div>
                </div>
            </div>

            {/* 100% Full Width Smart Document Upload Hub */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Folder size={20} color="#f59e0b" /> Paper Scan &amp; Google Drive Landing Folder (100% Full Width Upload Hub)
                        </h3>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            All uploaded paper notes, scans &amp; files automatically reach Google Drive folder for Enquiry No: 
                            <strong style={{ color: '#2563eb', marginLeft: '6px' }}>{wizardData.enquiryNo || 'ENQ-XXXX-XXXX'}</strong>
                        </span>
                    </div>
                    <a
                        href={driveLandingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '0.78rem', color: '#3b82f6', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none', background: '#eff6ff', padding: '6px 12px', borderRadius: '8px', border: '1px solid #bfdbfe' }}
                    >
                        Open Google Drive Folder <ExternalLink size={12} />
                    </a>
                </div>

                {/* 100% Width Smart Document Upload Tool */}
                <div style={{ width: '100%' }}>
                    <SmartUploadPanel
                        embedded={true}
                        isOpen={true}
                        runningEnquiryNo={wizardData.enquiryNo}
                        activeFolderId={activeLandingFolder}
                        activeFolderName={`Enquiry Landing Folder (${wizardData.enquiryNo || 'Draft'})`}
                        onSelect={handleSelectFile}
                        documentType="enquiry"
                        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                    />
                </div>
            </div>

            {/* 50% / 50% Split Layout: Staging Component (Left 50%) + Google Dynamic Explorer (Right 50%) */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                gap: '20px',
                alignItems: 'stretch'
            }}>
                {/* LEFT 50%: STAGING COMPONENT (Scan Preview + Attached Project Papers List) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '0' }}>
                    <UniversalFileViewer
                        file={wizardData.landingNoteFile}
                        fileUrl={wizardData.landingNoteUrl}
                        title="Loaded File / Scan Preview (Staging)"
                        emptyTitle="No File Loaded Yet"
                        emptySubtitle="Select or scan a document using the Smart Upload hub above to preview loaded files here."
                        onRemove={() => {
                            updateWizardData({
                                landingNoteFile: null,
                                landingNoteUrl: '',
                                landingNoteDriveId: null
                            });
                            toast.info('Removed attachment');
                        }}
                    />

                    {/* List of all attached project papers for this Enquiry No */}
                    {wizardData.landingNoteFiles && wizardData.landingNoteFiles.length > 0 && (
                        <div style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '12px',
                            padding: '14px'
                        }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Project Papers Attached ({wizardData.landingNoteFiles.length})</span>
                                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Folder: {wizardData.enquiryNo || 'Enquiry'}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                                {wizardData.landingNoteFiles.map((doc, idx) => (
                                    <div 
                                        key={doc.id || idx}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '8px 12px',
                                            background: wizardData.landingNoteFile === doc.name ? '#eff6ff' : '#fff',
                                            border: '1px solid ' + (wizardData.landingNoteFile === doc.name ? '#bfdbfe' : '#cbd5e1'),
                                            borderRadius: '8px',
                                            fontSize: '0.78rem'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                            <FileText size={14} color="#3b82f6" style={{ flexShrink: 0 }} />
                                            <span style={{ fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {doc.name}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                            <button
                                                type="button"
                                                onClick={() => updateWizardData({ landingNoteFile: doc.name, landingNoteUrl: doc.url, landingNoteDriveId: doc.driveId })}
                                                style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                Preview
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const updated = wizardData.landingNoteFiles.filter(f => f.name !== doc.name);
                                                    const nextSelected = updated[0] || null;
                                                    updateWizardData({
                                                        landingNoteFiles: updated,
                                                        landingNoteFile: nextSelected ? nextSelected.name : null,
                                                        landingNoteUrl: nextSelected ? nextSelected.url : '',
                                                        landingNoteDriveId: nextSelected ? nextSelected.driveId : null
                                                    });
                                                    toast.info(`Removed ${doc.name}`);
                                                }}
                                                style={{ background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', padding: '2px' }}
                                                title="Remove paper attachment"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT 50%: GOOGLE DRIVE DYNAMIC EXPLORER FOCUSED ON NEW ENQUIRY FOLDER */}
                <div style={{ minWidth: '0', display: 'flex', flexDirection: 'column' }}>
                    <DriveExplorer 
                        initialFolderId={activeLandingFolder}
                        folderName={`Enquiry Folder (${wizardData.enquiryNo || 'Draft'})`}
                    />
                </div>
            </div>

            {/* Basic Information & Supabase Confirmation with CRUD Modal Triggers */}
            <div style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '16px',
                padding: '20px'
            }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 700 }}>
                    Basic Enquiry Information
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    
                    {/* 1. Auto Enquiry No */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Incremental Auto Enquiry No *
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={wizardData.enquiryNo || ''}
                                onChange={(e) => updateWizardData({ enquiryNo: e.target.value })}
                                placeholder="Auto generating..."
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '0.9rem',
                                    fontWeight: 800,
                                    background: '#f8fafc',
                                    color: '#1e293b'
                                }}
                            />
                            <button
                                type="button"
                                onClick={autoGenerateEnquiryNo}
                                disabled={isGeneratingNo}
                                title="Re-generate next incremental number"
                                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 12px', cursor: 'pointer' }}
                            >
                                <RefreshCcw size={16} className={isGeneratingNo ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    {/* 2. Customer / Partner Dropdown + CRUD */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                                Select Customer / Partner (Supabase) *
                            </label>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                    type="button"
                                    onClick={() => openCrud('partner', 'create')}
                                    style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                    title="Add New Customer"
                                >
                                    <Plus size={12} /> Add
                                </button>
                                {wizardData.partnerId && selectedPartner && (
                                    <button
                                        type="button"
                                        onClick={() => openCrud('partner', 'edit', selectedPartner)}
                                        style={{ background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', borderRadius: '6px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                        title="Amend / Edit selected customer"
                                    >
                                        <Edit2 size={12} /> Amend
                                    </button>
                                )}
                            </div>
                        </div>
                        <SearchableSelect
                            options={partners.map(p => ({ id: p.id, name: `${p.name} ${p.city ? `(${p.city})` : ''}` }))}
                            value={wizardData.partnerId}
                            onChange={(e) => {
                                const selectedId = e.target.value;
                                const selected = partners.find(p => p.id === selectedId);
                                const currentContactObj = contacts.find(c => c.id === wizardData.contactId);
                                const contactBelongsToNewPartner = currentContactObj && (currentContactObj.partnerId === selectedId || currentContactObj.partner_id === selectedId);

                                updateWizardData({
                                    partnerId: selectedId,
                                    customerName: selected?.name || '',
                                    contactId: contactBelongsToNewPartner ? wizardData.contactId : ''
                                });
                            }}
                            placeholder="Search & confirm customer..."
                            onAddNew={() => openCrud('partner', 'create')}
                            addNewText="+ Add New Customer"
                        />
                    </div>

                    {/* 3. Contact Person Dropdown + CRUD */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                                    Contact Person (Supabase)
                                </label>
                                {wizardData.partnerId && (
                                    <button
                                        type="button"
                                        onClick={() => setShowAllContacts(!showAllContacts)}
                                        style={{
                                            background: showAllContacts ? '#f1f5f9' : '#e0e7ff',
                                            color: showAllContacts ? '#475569' : '#4338ca',
                                            border: '1px solid ' + (showAllContacts ? '#cbd5e1' : '#c7d2fe'),
                                            borderRadius: '12px',
                                            padding: '1px 8px',
                                            fontSize: '0.68rem',
                                            fontWeight: 700,
                                            cursor: 'pointer'
                                        }}
                                        title={showAllContacts ? "Click to filter contacts by selected customer" : "Click to show all contacts"}
                                    >
                                        {showAllContacts ? 'Showing All' : `Filtered (${filteredContacts.length})`}
                                    </button>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                    type="button"
                                    onClick={() => openCrud('contact', 'create', { partnerId: wizardData.partnerId, partner_id: wizardData.partnerId })}
                                    style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                    title="Add New Contact Person"
                                >
                                    <Plus size={12} /> Add
                                </button>
                                {wizardData.contactId && selectedContact && (
                                    <button
                                        type="button"
                                        onClick={() => openCrud('contact', 'edit', selectedContact)}
                                        style={{ background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', borderRadius: '6px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                        title="Amend / Edit selected contact"
                                    >
                                        <Edit2 size={12} /> Amend
                                    </button>
                                )}
                            </div>
                        </div>
                        <SearchableSelect
                            options={filteredContacts.map(c => ({ 
                                id: c.id, 
                                name: `${c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unnamed Contact'} ${c.email ? `- ${c.email}` : ''}` 
                            }))}
                            value={wizardData.contactId}
                            onChange={(e) => updateWizardData({ contactId: e.target.value })}
                            placeholder={
                                wizardData.partnerId && !showAllContacts && filteredContacts.length === 0
                                    ? "No contacts for this customer yet..."
                                    : "Search contact person..."
                            }
                            onAddNew={() => openCrud('contact', 'create', { partnerId: wizardData.partnerId, partner_id: wizardData.partnerId })}
                            addNewText="+ Add New Contact Person"
                        />
                    </div>

                    {/* 4. Vessel / Ship Dropdown + CRUD */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                                Vessel / Ship Name (Supabase)
                            </label>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                    type="button"
                                    onClick={() => openCrud('vessel', 'create')}
                                    style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                    title="Add New Vessel"
                                >
                                    <Plus size={12} /> Add
                                </button>
                                {wizardData.vesselId && selectedVessel && (
                                    <button
                                        type="button"
                                        onClick={() => openCrud('vessel', 'edit', selectedVessel)}
                                        style={{ background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', borderRadius: '6px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                        title="Amend / Edit selected vessel"
                                    >
                                        <Edit2 size={12} /> Amend
                                    </button>
                                )}
                            </div>
                        </div>
                        <SearchableSelect
                            options={vessels.map(v => ({ id: v.id, name: `${v.vessel_name || v.name} ${v.imo_number ? `(IMO: ${v.imo_number})` : ''}` }))}
                            value={wizardData.vesselId}
                            onChange={(e) => updateWizardData({ vesselId: e.target.value })}
                            placeholder="Search vessel name..."
                            onAddNew={(typedSearch) => openCrud('vessel', 'create', typeof typedSearch === 'string' && typedSearch ? { vessel_name: typedSearch } : null)}
                            addNewText="+ Add New Vessel"
                        />
                    </div>

                    {/* 5. Work Location Dropdown + CRUD */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                                Work Location (Supabase)
                            </label>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                    type="button"
                                    onClick={() => openCrud('location', 'create')}
                                    style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                    title="Add New Work Location"
                                >
                                    <Plus size={12} /> Add
                                </button>
                                {wizardData.workLocationId && selectedLocation && (
                                    <button
                                        type="button"
                                        onClick={() => openCrud('location', 'edit', selectedLocation)}
                                        style={{ background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', borderRadius: '6px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                        title="Amend / Edit selected work location"
                                    >
                                        <Edit2 size={12} /> Amend
                                    </button>
                                )}
                            </div>
                        </div>
                        <SearchableSelect
                            options={workLocations.map(w => ({ id: w.id, name: `${w.location_name || w.name} ${w.address ? `- ${w.address}` : ''}` }))}
                            value={wizardData.workLocationId}
                            onChange={(e) => updateWizardData({ workLocationId: e.target.value })}
                            placeholder="Search work location / shipyard..."
                            onAddNew={() => openCrud('location', 'create')}
                            addNewText="+ Add New Work Location"
                        />
                    </div>

                    {/* 6. Subject / Title */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#475569' }}>
                            Subject / Enquiry Title
                        </label>
                        <input
                            type="text"
                            value={wizardData.subject || ''}
                            onChange={(e) => updateWizardData({ subject: e.target.value })}
                            placeholder="e.g. Overhaul Main Engine Spare Parts Enquiry"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Smart Upload Tool Modal */}
            <SmartUploadPanel
                isOpen={isUploadPanelOpen}
                onClose={() => setIsUploadPanelOpen(false)}
                activeFolderId={activeLandingFolder}
                activeFolderName="Enquiry Landing Notes (Google Drive)"
                onSelect={(file) => {
                    handleSelectFile(file);
                    setIsUploadPanelOpen(false);
                }}
                documentType="enquiry"
                accept=".pdf,.png,.jpg,.jpeg"
            />

            {/* CRUD Operations Modal */}
            <DropdownCrudModal
                isOpen={crudState.isOpen}
                onClose={() => setCrudState({ ...crudState, isOpen: false })}
                type={crudState.type}
                mode={crudState.mode}
                initialData={crudState.initialData}
                companyId={companyId}
                partners={partners}
                vessels={vessels}
                onSuccess={handleCrudSuccess}
            />

            {/* Footer Navigation */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                    onClick={onNext}
                    disabled={!isValid}
                    style={{
                        background: isValid 
                            ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' 
                            : '#cbd5e1',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '12px 24px',
                        fontSize: '0.9rem',
                        fontWeight: 800,
                        cursor: isValid ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: isValid ? '0 4px 12px rgba(79, 70, 229, 0.3)' : 'none'
                    }}
                >
                    Next Activity: Quotation Costing <ArrowRight size={18} />
                </button>
            </div>
        </div>
    );
}
