import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sparkles, Mail, Phone, Globe, Building2, User, Plus, Check, X, 
  ArrowLeft, CheckCircle2, Trash2, Users, Loader2, Info, Search, HelpCircle,
  UploadCloud, Image as ImageIcon
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getPartners, savePartner, saveContact } from '../lib/store';
import { parseBulkEmails, smartSearchCompany, extractDualPartnerContact } from '../lib/geminiService';
import Tesseract from 'tesseract.js';
import toast from 'react-hot-toast';


export default function AiEmailParser() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  
  // Data State
  const [partnersList, setPartnersList] = useState([]);
  const [inputText, setInputText] = useState('');
  
  // Image & OCR States
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);
  
  // Processing Flow States
  const [currentStep, setCurrentStep] = useState('input'); // 'input' | 'parsing' | 'research' | 'review' | 'saving' | 'success'
  const [loadingMessage, setLoadingMessage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  
  // Parsed Output States
  const [candidates, setCandidates] = useState([]); // contacts from parser
  const [uniqueCompanies, setUniqueCompanies] = useState([]); // companies from parser
  const [companyDetails, setCompanyDetails] = useState({}); // domain -> researched details
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [selectedCompanies, setSelectedCompanies] = useState(new Set());
  
  // Form Edits State
  const [editedContacts, setEditedContacts] = useState({});
  const [editedCompanies, setEditedCompanies] = useState({});
  const [linkedPartnerIds, setLinkedPartnerIds] = useState({}); // domain -> existing partnerId or ''

  useEffect(() => {
    loadPartners();
  }, []);

  const loadPartners = async () => {
    try {
      const data = await getPartners(profile);
      setPartnersList(data);
    } catch (err) {
      console.error('Failed to load partners:', err);
    }
  };

  const loadExample = () => {
    setInputText(`To:
    HussianShah: hussianShah@ttsalvage.com

Cc:
    You: navneetkaushik@prakritimarine.com
    Mujeeb Ansari: Mansari@ttsalvage.com
    Anuj Sahai: asahai@ttsalvage.com
    Alex Ang Yew Boon: alexang@ttsalvage.com
    Joshi Mathew: joshi.mathew60@gmail.com
    Kedar Chaudhary: kchaudhary@ttsalvage.com
    ramesh patro: ramesh_patro@yahoo.com`);
    toast.success('Example loaded! Click "Parse & Research Network"');
  };

  const cleanDomain = (urlOrEmail) => {
    if (!urlOrEmail) return '';
    let str = urlOrEmail.toLowerCase().trim();
    if (str.includes('@')) {
      str = str.split('@')[1];
    }
    str = str.replace(/^(https?:\/\/)?(www\.)?/, '');
    str = str.split('/')[0];
    return str;
  };

  const handleImageSelect = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      toast.error('Please upload a valid image file (PNG, JPG, JPEG).');
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
    toast.success('Image loaded! Click "Parse Card with AI OCR"');
  };

  useEffect(() => {
    const handlePaste = (e) => {
      if (currentStep !== 'input') return;
      const items = (e.clipboardData || window.clipboardData)?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.indexOf('image') === 0) {
          const blob = item.getAsFile();
          handleImageSelect(blob);
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [currentStep]);

  const handleParseImage = async () => {
    if (!imagePreview) {
      toast.error('Please select or paste an image first.');
      return;
    }

    // Step 1: Running OCR
    setCurrentStep('parsing');
    setLoadingMessage('Phase 1: Running High-Performance OCR...');
    setProgressPercent(10);

    try {
      const result = await Tesseract.recognize(imagePreview, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            setProgressPercent(Math.floor(10 + m.progress * 40)); // 10% to 50%
          }
        }
      });

      const ocrText = result.data.text.trim();
      if (!ocrText) {
        toast.error('AI was unable to extract text. Make sure the image has readable text.');
        setCurrentStep('input');
        return;
      }

      setLoadingMessage('AI analyzing extracted contact & company structures...');
      setProgressPercent(60);

      const dualData = await extractDualPartnerContact(ocrText);
      if (!dualData) {
        toast.error('AI was unable to extract dual details from this card. Please try manual pasting or a clearer image.');
        setCurrentStep('input');
        return;
      }

      // Map extracted fields to Candidates (Contacts)
      const contactData = dualData.contact || {};
      const partnerData = dualData.partner || {};

      // Determine domain
      let domain = cleanDomain(partnerData.website || contactData.email || '');
      if (domain === 'gmail.com' || domain === 'yahoo.com' || domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'ymail.com') {
        if (!partnerData.website) {
          domain = '';
        }
      }

      const companyNameResolved = partnerData.name || (domain ? domain.split('.')[0] : 'Individual');

      const candidate = {
        name: contactData.name || 'Unknown Contact',
        email: contactData.email || `scanned_${Date.now()}@example.com`,
        companyName: companyNameResolved,
        domain: domain
      };

      const contactsList = [candidate];
      setCandidates(contactsList);
      setSelectedContacts(new Set([candidate.email]));

      // Setup contact edits
      const initialContactsEdit = {
        [candidate.email]: {
          name: candidate.name,
          email: candidate.email,
          post: contactData.post || '',
          department: domain && domain !== 'gmail.com' && domain !== 'yahoo.com' ? (contactData.department || 'Operations') : 'Other',
          handphone: contactData.handphone || contactData.phone || '',
          companyDomain: candidate.companyName.toLowerCase() === 'individual' ? '' : candidate.domain
        }
      };
      setEditedContacts(initialContactsEdit);

      // Setup company edits
      const companies = [];
      const initialCompaniesEdit = {};
      const initialLinked = {};

      if (candidate.companyName.toLowerCase() !== 'individual' && candidate.domain) {
        const co = {
          name: candidate.companyName,
          domain: candidate.domain
        };
        companies.push(co);
        setSelectedCompanies(new Set([co.domain]));

        initialCompaniesEdit[co.domain] = {
          name: partnerData.name || co.name,
          weblink: partnerData.website || co.domain,
          country: partnerData.country || 'Singapore',
          city: partnerData.city || '',
          address: partnerData.address || '',
          phone1: partnerData.phone || '',
          email1: partnerData.email || '',
          uen: partnerData.uen || '',
          types: ['Supplier']
        };

        // Check for existing partners
        const existing = partnersList.find(p => {
          const web = (p.weblink || '').toLowerCase();
          const pName = (p.name || '').toLowerCase();
          return web.includes(co.domain.toLowerCase()) || 
                 pName === co.name.toLowerCase() || 
                 pName.replace(/\s+/g, '') === co.name.toLowerCase().replace(/\s+/g, '');
        });

        if (existing) {
          initialLinked[co.domain] = existing.id;
          toast.success(`Matched "${co.name}" with existing partner!`, { icon: '🤝' });
        } else {
          initialLinked[co.domain] = 'NEW';
        }
      } else {
        setSelectedCompanies(new Set());
      }

      setUniqueCompanies(companies);
      setLinkedPartnerIds(initialLinked);
      setEditedCompanies(initialCompaniesEdit);

      // Phase 2: Live corporate web research if we have a company domain
      if (companies.length > 0) {
        setCurrentStep('research');
        setProgressPercent(75);

        const details = {};
        for (let i = 0; i < companies.length; i++) {
          const co = companies[i];
          setLoadingMessage(`Phase 2: Live corporate web research for "${co.name}" (${co.domain})...`);

          try {
            const research = await smartSearchCompany(co.name, co.domain);
            if (research) {
              details[co.domain] = research;
              // Merge scanned card info + researched internet info!
              initialCompaniesEdit[co.domain] = {
                name: research.company_name || partnerData.name || co.name,
                weblink: research.website || partnerData.website || co.domain,
                country: research.country || partnerData.country || 'Singapore',
                city: research.city || partnerData.city || '',
                address: research.address || partnerData.address || '',
                phone1: research.phone || partnerData.phone || '',
                email1: research.email || partnerData.email || '',
                uen: research.uen || partnerData.uen || '',
                types: research.categories || ['Supplier']
              };
            }
          } catch (researchErr) {
            console.warn(`Research failed for ${co.name}:`, researchErr);
          }
          setProgressPercent(Math.floor(75 + ((i + 1) / companies.length) * 25));
        }

        setCompanyDetails(details);
        setEditedCompanies({ ...initialCompaniesEdit });
      }

      setProgressPercent(100);
      setCurrentStep('review');
      toast.success('AI Card Scanning & Research complete!');
    } catch (err) {
      console.error('OCR or AI extraction failed:', err);
      toast.error('Scanned parsing failed: ' + err.message);
      setCurrentStep('input');
    }
  };

  const handleParse = async () => {
    if (!inputText.trim()) {
      toast.error('Please paste or enter some email content first.');
      return;
    }

    // Step 1: NLP Parsing
    setCurrentStep('parsing');
    setLoadingMessage('Parsing email headers and signatures...');
    setProgressPercent(15);
    
    try {
      const contacts = await parseBulkEmails(inputText);
      
      if (!contacts || contacts.length === 0) {
        toast.error('AI was unable to extract any contacts. Please try checking the email format.');
        setCurrentStep('input');
        return;
      }

      setCandidates(contacts);
      
      // Select all contacts by default
      const defaultContacts = new Set(contacts.map(c => c.email));
      setSelectedContacts(defaultContacts);
      
      // Group unique companies (ignoring "Individual")
      const companiesMap = {};
      contacts.forEach(c => {
        if (c.companyName && c.companyName.toLowerCase() !== 'individual' && c.domain) {
          companiesMap[c.domain] = {
            name: c.companyName,
            domain: c.domain
          };
        }
      });
      
      const companies = Object.values(companiesMap);
      setUniqueCompanies(companies);
      
      const defaultCompanies = new Set(companies.map(co => co.domain));
      setSelectedCompanies(defaultCompanies);

      // Setup initial edits mapping
      const initialContactsEdit = {};
      contacts.forEach(c => {
        initialContactsEdit[c.email] = {
          name: c.name,
          email: c.email,
          post: '',
          department: c.domain && c.domain.toLowerCase() !== 'gmail.com' && c.domain.toLowerCase() !== 'yahoo.com' ? 'Operations' : 'Other',
          handphone: '',
          companyDomain: c.companyName.toLowerCase() === 'individual' ? '' : c.domain
        };
      });
      setEditedContacts(initialContactsEdit);

      // Check for existing partners matching domain or name
      const initialLinked = {};
      const initialCompaniesEdit = {};
      
      companies.forEach(co => {
        // Try exact match on website or domain
        const existing = partnersList.find(p => {
          const web = (p.weblink || '').toLowerCase();
          const pName = (p.name || '').toLowerCase();
          return web.includes(co.domain.toLowerCase()) || 
                 pName === co.name.toLowerCase() || 
                 pName.replace(/\s+/g, '') === co.name.toLowerCase().replace(/\s+/g, '');
        });
        
        if (existing) {
          initialLinked[co.domain] = existing.id;
          toast.success(`Matched "${co.name}" with existing partner!`, { icon: '🤝' });
        } else {
          initialLinked[co.domain] = 'NEW';
        }
        
        initialCompaniesEdit[co.domain] = {
          name: co.name,
          weblink: co.domain,
          country: 'Singapore',
          city: '',
          address: '',
          phone1: '',
          email1: '',
          uen: '',
          types: ['Supplier']
        };
      });
      setLinkedPartnerIds(initialLinked);
      setEditedCompanies(initialCompaniesEdit);

      // Step 2: Company Research
      if (companies.length > 0) {
        setCurrentStep('research');
        setProgressPercent(40);
        
        const details = {};
        for (let i = 0; i < companies.length; i++) {
          const co = companies[i];
          setLoadingMessage(`Searching global registries for "${co.name}" (${co.domain})...`);
          
          try {
            // Live internet research pipeline
            const research = await smartSearchCompany(co.name, co.domain);
            if (research) {
              details[co.domain] = research;
              // Pre-fill fields with researched data
              initialCompaniesEdit[co.domain] = {
                name: research.company_name || co.name,
                weblink: research.website || co.domain,
                country: research.country || 'Singapore',
                city: research.city || '',
                address: research.address || '',
                phone1: research.phone || '',
                email1: research.email || '',
                uen: research.uen || '',
                types: research.categories || ['Supplier']
              };
            }
          } catch (researchErr) {
            console.warn(`Research failed for ${co.name}:`, researchErr);
          }
          
          setProgressPercent(Math.floor(40 + ((i + 1) / companies.length) * 50));
        }
        
        setCompanyDetails(details);
        setEditedCompanies({ ...initialCompaniesEdit });
      }

      setProgressPercent(100);
      setCurrentStep('review');
      toast.success('AI Email Parsing & Research complete!');
    } catch (err) {
      console.error('Parsing failed:', err);
      toast.error('Failed to parse text. Please try again with standard text.');
      setCurrentStep('input');
    }
  };

  const handleToggleContact = (email) => {
    const next = new Set(selectedContacts);
    if (next.has(email)) next.delete(email);
    else next.add(email);
    setSelectedContacts(next);
  };

  const handleToggleCompany = (domain) => {
    const next = new Set(selectedCompanies);
    if (next.has(domain)) next.delete(domain);
    else next.add(domain);
    setSelectedCompanies(next);
  };

  const handleContactChange = (email, field, value) => {
    setEditedContacts(prev => ({
      ...prev,
      [email]: {
        ...prev[email],
        [field]: value
      }
    }));
  };

  const handleCompanyChange = (domain, field, value) => {
    setEditedCompanies(prev => ({
      ...prev,
      [domain]: {
        ...prev[domain],
        [field]: value
      }
    }));
  };

  const handleSaveAll = async () => {
    const contactsToSave = candidates.filter(c => selectedContacts.has(c.email));
    
    if (contactsToSave.length === 0) {
      toast.error('Please select at least one contact to save.');
      return;
    }

    setCurrentStep('saving');
    setLoadingMessage('Creating your smart business network...');
    setProgressPercent(10);

    try {
      const companyDomainToId = {};
      const newCompaniesCount = Object.keys(editedCompanies).filter(d => selectedCompanies.has(d) && linkedPartnerIds[d] === 'NEW').length;
      
      let processedCompanies = 0;

      // 1. Process Companies/Partners
      for (const domain of Object.keys(editedCompanies)) {
        if (!selectedCompanies.has(domain)) continue;

        const isNew = linkedPartnerIds[domain] === 'NEW';
        const editedCo = editedCompanies[domain];
        
        if (!isNew) {
          // Link to existing partner and update all edited profile details in DB
          const partnerId = linkedPartnerIds[domain];
          companyDomainToId[domain] = partnerId;
          
          setLoadingMessage(`Updating Partner "${editedCo.name}"...`);
          await savePartner({
            id: partnerId,
            name: editedCo.name,
            weblink: editedCo.weblink,
            country: editedCo.country,
            address: editedCo.address,
            phone1: editedCo.phone1,
            email1: editedCo.email1,
            types: editedCo.types,
            uen: editedCo.uen,
            company_id: profile?.company_id
          });
        } else {
          // Create new Partner profile
          setLoadingMessage(`Creating Partner profile for "${editedCo.name}"...`);
          const saved = await savePartner({
            name: editedCo.name,
            weblink: editedCo.weblink,
            country: editedCo.country,
            address: editedCo.address,
            phone1: editedCo.phone1,
            email1: editedCo.email1,
            types: editedCo.types,
            uen: editedCo.uen,
            info: `UEN: ${editedCo.uen || 'No UEN recorded'}. Created via AI Email Parser.`,
            company_id: profile?.company_id
          });
          
          companyDomainToId[domain] = saved.id;
          processedCompanies++;
          setProgressPercent(Math.floor(10 + (processedCompanies / newCompaniesCount) * 40));
        }
      }

      // 2. Process Contacts
      let processedContacts = 0;
      for (const c of contactsToSave) {
        const editedC = editedContacts[c.email];
        setLoadingMessage(`Saving contact "${editedC.name}"...`);

        // Resolve Partner ID
        let resolvedPartnerId = null;
        if (editedC.companyDomain && companyDomainToId[editedC.companyDomain]) {
          resolvedPartnerId = companyDomainToId[editedC.companyDomain];
        }

        await saveContact({
          name: editedC.name,
          email: editedC.email,
          handphone: editedC.handphone,
          post: editedC.post || 'Representative',
          department: editedC.department || 'Other',
          partnerId: resolvedPartnerId,
          company_id: profile?.company_id,
          info: `Created via bulk email parser. Linked to domain: ${editedC.companyDomain || 'Individual'}`
        });

        processedContacts++;
        setProgressPercent(Math.floor(50 + (processedContacts / contactsToSave.length) * 50));
      }

      setProgressPercent(100);
      setCurrentStep('success');
      toast.success('Successfully built your parsed network!', { duration: 5000 });
    } catch (err) {
      console.error('Batch Save failed:', err);
      toast.error('Network generation encountered an error: ' + err.message);
      setCurrentStep('review');
    }
  };

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%', padding: '32px', color: '#334155', borderRadius: '16px' }}>
      
      {/* Header Panel */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', borderBottom: '1px solid #e2e8f0', paddingBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={() => navigate('/partners')} 
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', color: '#64748b', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.2s' }}
            onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
            onMouseOut={e => e.currentTarget.style.background = '#fff'}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', padding: '8px', borderRadius: '10px', color: '#fff', display: 'flex' }}><Sparkles size={20} /></span>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                AI Email &amp; Contact Parser
              </h1>
            </div>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.95rem' }}>Parse emails, auto-research companies online, and map your business relationship instantly</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={loadExample} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
            <HelpCircle size={18} color="#7c3aed" /> Load Example Copy-Paste
          </button>
        </div>
      </header>

      {/* STEP: INPUT */}
      {currentStep === 'input' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)', gap: '32px', alignItems: 'stretch' }}>
          
          {/* Left Panel: Text Parser */}
          <div className="glass-panel animate-fade-in" style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '36px', borderRadius: '20px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div style={{ background: 'rgba(124, 58, 237, 0.08)', padding: '12px', borderRadius: '14px', color: '#7c3aed' }}>
                  <Sparkles size={28} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>Paste Email Header or Directory List</h2>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', lineHeight: '1.4' }}>Paste your list of email coordinates or copy directly from Outlook, Gmail, or signatures. The AI resolves individuals, infers companies, and enriches details via internet search.</p>
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <textarea
                  className="form-textarea"
                  style={{ minHeight: '260px', padding: '16px', borderRadius: '14px', border: '1.5px solid #e2e8f0', fontSize: '1rem', fontFamily: 'monospace', background: '#faf9fe', width: '100%', outline: 'none', transition: 'border-color 0.2s' }}
                  placeholder="Example:&#10;To:&#10;  HussianShah: hussianShah@ttsalvage.com&#10;Cc:&#10;  You: navneetkaushik@prakritimarine.com&#10;  Mujeeb Ansari: Mansari@ttsalvage.com"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={handleParse}
                disabled={!inputText.trim()}
                style={{ 
                  background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', 
                  color: '#fff', 
                  border: 'none', 
                  padding: '14px 28px', 
                  borderRadius: '12px', 
                  fontSize: '1rem', 
                  fontWeight: 700, 
                  cursor: inputText.trim() ? 'pointer' : 'not-allowed', 
                  boxShadow: inputText.trim() ? '0 8px 16px -4px rgba(124, 58, 237, 0.3)' : 'none',
                  opacity: inputText.trim() ? 1 : 0.6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.2s'
                }}
              >
                <Sparkles size={20} /> Parse &amp; Research Network
              </button>
            </div>
          </div>

          {/* Right Panel: Image OCR Parser */}
          <div className="glass-panel animate-fade-in" style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '36px', borderRadius: '20px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div style={{ background: 'rgba(124, 58, 237, 0.08)', padding: '12px', borderRadius: '14px', color: '#7c3aed' }}>
                  <ImageIcon size={28} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>Upload Card or Signature Image</h2>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', lineHeight: '1.4' }}>Upload or drag-and-drop a business card / signature image (e.g. PNG, JPG). You can also press <strong>Ctrl+V</strong> anywhere to paste a clipboard screenshot directly!</p>
                </div>
              </div>

              {/* Hidden file input */}
              <input 
                type="file" 
                ref={fileInputRef} 
                accept="image/*" 
                style={{ display: 'none' }} 
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleImageSelect(e.target.files[0]);
                  }
                }}
              />

              {/* Dropzone Container */}
              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleImageSelect(e.dataTransfer.files[0]);
                  }
                }}
                style={{ 
                  border: isDragOver ? '2px dashed #7c3aed' : '2px dashed #cbd5e1',
                  background: isDragOver ? '#fdfaff' : '#faf9fe',
                  borderRadius: '16px',
                  minHeight: '260px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '20px',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.2s',
                  boxShadow: isDragOver ? '0 4px 20px rgba(124, 58, 237, 0.08)' : 'inset 0 2px 4px rgba(0,0,0,0.01)',
                  width: '100%'
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                {imagePreview ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{ position: 'relative', width: '100%', maxHeight: '200px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', background: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <img 
                        src={imagePreview} 
                        style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain' }} 
                        alt="Preview Scanned Business Card" 
                      />
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setImageFile(null);
                          setImagePreview('');
                        }}
                        style={{ 
                          position: 'absolute', 
                          top: '10px', 
                          right: '10px', 
                          background: 'rgba(15, 23, 42, 0.75)', 
                          color: '#fff', 
                          border: 'none', 
                          width: '32px', 
                          height: '32px', 
                          borderRadius: '50%', 
                          cursor: 'pointer', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          boxShadow: '0 2px 8px rgba(0,0,0,0.25)', 
                          transition: 'all 0.15s' 
                        }}
                        onMouseOver={el => el.currentTarget.style.background = 'rgba(239, 68, 68, 0.95)'}
                        onMouseOut={el => el.currentTarget.style.background = 'rgba(15, 23, 42, 0.75)'}
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ImageIcon size={14} /> {imageFile ? imageFile.name : 'Pasted Image'} ({(imagePreview.length / 1024 * 0.75).toFixed(1)} KB)
                    </span>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', pointerEvents: 'none' }}>
                    <div style={{ width: '64px', height: '64px', background: 'rgba(124, 58, 237, 0.06)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed', margin: '0 auto' }}>
                      <UploadCloud size={32} style={{ display: 'block', margin: 'auto' }} />
                    </div>
                    <div>
                      <span style={{ display: 'block', fontSize: '1rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Drag &amp; Drop or Browse Image
                      </span>
                      <span style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8' }}>
                        Supports PNG, JPG, JPEG up to 10MB
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button 
                onClick={handleParseImage}
                disabled={!imagePreview}
                style={{ 
                  background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', 
                  color: '#fff', 
                  border: 'none', 
                  padding: '14px 28px', 
                  borderRadius: '12px', 
                  fontSize: '1rem', 
                  fontWeight: 700, 
                  cursor: imagePreview ? 'pointer' : 'not-allowed', 
                  boxShadow: imagePreview ? '0 8px 16px -4px rgba(124, 58, 237, 0.3)' : 'none',
                  opacity: imagePreview ? 1 : 0.6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.2s'
                }}
              >
                <Sparkles size={20} /> Parse Card with AI OCR
              </button>
            </div>
          </div>

        </div>
      )}

      {/* STEPS: PARSING, RESEARCH, SAVING (LOADING STATES) */}
      {(currentStep === 'parsing' || currentStep === 'research' || currentStep === 'saving') && (
        <div className="glass-panel animate-fade-in" style={{ background: '#fff', padding: '60px 40px', borderRadius: '20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', marginBottom: '32px' }}>
            <Loader2 className="animate-spin" size={64} style={{ color: '#7c3aed' }} />
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#7c3aed' }}>
              <Sparkles size={24} className="animate-pulse" />
            </div>
          </div>
          
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
            {currentStep === 'parsing' && 'Phase 1: Deep NLP Signature Analysis'}
            {currentStep === 'research' && 'Phase 2: Live Corporate Web Intelligence'}
            {currentStep === 'saving' && 'Phase 3: Database Network Blueprint Generation'}
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.95rem', maxWidth: '500px', margin: '0 auto 24px' }}>
            {loadingMessage}
          </p>

          {/* Progress Bar */}
          <div style={{ width: '100%', maxWidth: '400px', height: '8px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden', margin: '0 auto' }}>
            <div style={{ width: `${progressPercent}%`, height: '100%', background: 'linear-gradient(90deg, #a855f7 0%, #7c3aed 100%)', borderRadius: '10px', transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}></div>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginTop: '8px', fontWeight: 700 }}>
            {progressPercent}% COMPLETE
          </span>
        </div>
      )}

      {/* STEP: REVIEW & EDIT PRE-SAVE */}
      {currentStep === 'review' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* Summary Banner */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(90deg, #faf5ff 0%, #f3e8ff 100%)', border: '1px solid #e9d5ff', padding: '20px 24px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ background: '#7c3aed', color: '#fff', padding: '10px', borderRadius: '12px', display: 'flex' }}><CheckCircle2 size={24} /></span>
              <div>
                <h3 style={{ margin: 0, color: '#581c87', fontWeight: 800, fontSize: '1.15rem' }}>AI Extraction Complete</h3>
                <p style={{ margin: '2px 0 0 0', color: '#7e22ce', fontSize: '0.9rem' }}>
                  Parsed <strong>{candidates.length}</strong> contacts. Researched and matched <strong>{uniqueCompanies.length}</strong> unique companies. Review details below.
                </p>
              </div>
            </div>
            <button onClick={handleSaveAll} className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', padding: '12px 28px', borderRadius: '12px', fontSize: '1rem', fontWeight: 700, boxShadow: '0 8px 16px rgba(124, 58, 237, 0.25)', border: 'none' }}>
              Add to Database &amp; Build Network
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px', alignItems: 'start' }}>
            
            {/* PARTNERS REVIEW SECTION */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
                <Building2 size={20} color="#7c3aed" />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                  1. Partners (Companies) to Link or Create
                </h2>
                <span style={{ background: '#e0e7ff', color: '#4f46e5', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>
                  {uniqueCompanies.length} Found
                </span>
              </div>

              {uniqueCompanies.length === 0 ? (
                <div className="glass-panel" style={{ padding: '30px', textAlign: 'center', color: '#64748b', background: '#fff' }}>
                  <Info size={28} style={{ marginBottom: '10px', display: 'block', margin: '0 auto', color: '#94a3b8' }} />
                  Only generic email handles found (e.g. Gmail/Yahoo). No corporate partners need to be created.
                </div>
              ) : (
                uniqueCompanies.map((co) => {
                  const isChecked = selectedCompanies.has(co.domain);
                  const editedCo = editedCompanies[co.domain] || {};
                  const isNew = linkedPartnerIds[co.domain] === 'NEW';
                  const hasDetails = !!companyDetails[co.domain];
                  const detail = companyDetails[co.domain] || {};

                  return (
                    <div 
                      key={co.domain} 
                      style={{ 
                        background: '#fff', 
                        border: isChecked ? '1px solid #c084fc' : '1px solid #e2e8f0', 
                        borderRadius: '16px', 
                        padding: '20px', 
                        boxShadow: isChecked ? '0 4px 20px rgba(168, 85, 247, 0.05)' : '0 1px 3px rgba(0,0,0,0.02)',
                        transition: 'all 0.2s',
                        opacity: isChecked ? 1 : 0.6
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={() => handleToggleCompany(co.domain)}
                            style={{ width: '18px', height: '18px', accentColor: '#7c3aed', cursor: 'pointer' }}
                          />
                          <div>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1e293b' }}>
                              {co.name}
                            </h3>
                            <span style={{ fontSize: '0.8rem', color: '#64748b', fontFamily: 'monospace' }}>
                              {co.domain}
                            </span>
                          </div>
                        </div>

                        {/* Option to Link to Existing or Create New */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <select
                            value={linkedPartnerIds[co.domain] || 'NEW'}
                            onChange={(e) => {
                              const val = e.target.value;
                              setLinkedPartnerIds(prev => ({
                                ...prev,
                                [co.domain]: val
                              }));
                              
                              if (val !== 'NEW') {
                                const existingPartner = partnersList.find(p => p.id === val);
                                if (existingPartner) {
                                  setEditedCompanies(prev => ({
                                    ...prev,
                                    [co.domain]: {
                                      ...prev[co.domain],
                                      name: existingPartner.name || prev[co.domain]?.name || '',
                                      uen: existingPartner.uen || prev[co.domain]?.uen || '',
                                      email1: existingPartner.email1 || prev[co.domain]?.email1 || '',
                                      weblink: existingPartner.weblink || prev[co.domain]?.weblink || '',
                                      address: existingPartner.address || prev[co.domain]?.address || '',
                                      phone1: existingPartner.phone1 || prev[co.domain]?.phone1 || '',
                                      country: existingPartner.country || prev[co.domain]?.country || 'Singapore',
                                      types: existingPartner.types || prev[co.domain]?.types || ['Supplier']
                                    }
                                  }));
                                }
                              }
                            }}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 600, background: '#f8fafc', color: '#475569', outline: 'none' }}
                          >
                            <option value="NEW">✨ Create New Partner</option>
                            {partnersList.map(p => (
                              <option key={p.id} value={p.id}>🔗 Link to: {p.name}</option>
                            ))}
                          </select>
                          
                          {/* Live Web Research Status Indicator */}
                          {hasDetails && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                              <Check size={10} /> Live Researched (Conf: {detail.confidence}%)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Editable Form Fields */}
                      {isChecked && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {/* Alert Banner / Status */}
                          <div style={{ 
                            background: isNew ? 'rgba(124, 58, 237, 0.04)' : 'rgba(79, 70, 229, 0.04)', 
                            border: isNew ? '1px solid rgba(124, 58, 237, 0.15)' : '1px solid rgba(79, 70, 229, 0.15)',
                            padding: '12px 16px', 
                            borderRadius: '12px', 
                            fontSize: '0.85rem', 
                            color: isNew ? '#7c3aed' : '#4f46e5', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px',
                            fontWeight: 600
                          }}>
                            {isNew ? (
                              <>
                                <Sparkles size={16} />
                                <span>✨ Creating New Partner Profile (Will be saved as a new partner)</span>
                              </>
                            ) : (
                              <>
                                <Info size={16} />
                                <span>🔗 Linked to Existing Partner (Saving will fully update their profile details in database)</span>
                              </>
                            )}
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#faf9fe', padding: '14px', borderRadius: '12px', border: '1px solid #f3e8ff' }}>
                            
                            {/* Company Name */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', margin: 0 }}>Company Name</label>
                                {editedCo.name && (
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <button 
                                      onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(editedCo.name + ' Singapore')}`, '_blank')}
                                      style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', fontWeight: 700 }}
                                      title="Search Company Name on Google"
                                    >
                                      <Search size={10} /> Google
                                    </button>
                                    <span style={{ color: '#cbd5e1', fontSize: '0.7rem' }}>|</span>
                                    <button 
                                      onClick={() => window.open(`https://www.sgpbusiness.com/search?q=${encodeURIComponent(editedCo.name)}`, '_blank')}
                                      style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', fontWeight: 700 }}
                                      title="Search Company Name on SGP Business"
                                    >
                                      <Building2 size={10} /> SGP Business
                                    </button>
                                  </div>
                                )}
                              </div>
                              <input 
                                type="text" 
                                className="form-input" 
                                style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                                value={editedCo.name || ''} 
                                onChange={e => handleCompanyChange(co.domain, 'name', e.target.value)}
                              />
                            </div>

                            {/* Singapore UEN */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', margin: 0 }}>Singapore UEN / Reg No</label>
                                {editedCo.name && (
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <button 
                                      onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(editedCo.uen || (editedCo.name + ' UEN Singapore'))}`, '_blank')}
                                      style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', fontWeight: 700 }}
                                      title="Search UEN on Google"
                                    >
                                      <Search size={10} /> Google
                                    </button>
                                    <span style={{ color: '#cbd5e1', fontSize: '0.7rem' }}>|</span>
                                    <button 
                                      onClick={() => window.open(`https://www.sgpbusiness.com/search?q=${encodeURIComponent(editedCo.uen || editedCo.name)}`, '_blank')}
                                      style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', fontWeight: 700 }}
                                      title="Search UEN on SGP Business"
                                    >
                                      <Building2 size={10} /> SGP Business
                                    </button>
                                  </div>
                                )}
                              </div>
                              <input 
                                type="text" 
                                className="form-input" 
                                style={{ padding: '6px 10px', fontSize: '0.85rem' }} 
                                value={editedCo.uen || ''} 
                                onChange={e => handleCompanyChange(co.domain, 'uen', e.target.value)}
                                placeholder="e.g. 201436227C"
                              />
                            </div>

                            {/* Email */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', margin: 0 }}>Email</label>
                                {editedCo.email1 && (
                                  <button 
                                    onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(editedCo.email1)}`, '_blank')}
                                    style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', fontWeight: 700 }}
                                    title="Search Email on Google"
                                  >
                                    <Search size={10} /> Verify
                                  </button>
                                )}
                              </div>
                              <input 
                                type="text" 
                                className="form-input" 
                                style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                                value={editedCo.email1 || ''} 
                                onChange={e => handleCompanyChange(co.domain, 'email1', e.target.value)}
                              />
                            </div>

                            {/* Website */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', margin: 0 }}>Website</label>
                                {editedCo.weblink && (
                                  <button 
                                    onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(editedCo.weblink)}`, '_blank')}
                                    style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', fontWeight: 700 }}
                                    title="Search Website on Google"
                                  >
                                    <Search size={10} /> Verify
                                  </button>
                                )}
                              </div>
                              <input 
                                type="text" 
                                className="form-input" 
                                style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                                value={editedCo.weblink || ''} 
                                onChange={e => handleCompanyChange(co.domain, 'weblink', e.target.value)}
                              />
                            </div>

                            {/* Phone */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', margin: 0 }}>Phone No</label>
                                {editedCo.phone1 && (
                                  <button 
                                    onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(editedCo.phone1)}`, '_blank')}
                                    style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', fontWeight: 700 }}
                                    title="Search Phone on Google"
                                  >
                                    <Search size={10} /> Verify
                                  </button>
                                )}
                              </div>
                              <input 
                                type="text" 
                                className="form-input" 
                                style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                                value={editedCo.phone1 || ''} 
                                onChange={e => handleCompanyChange(co.domain, 'phone1', e.target.value)}
                                placeholder="e.g. +65 6591 5288"
                              />
                            </div>

                            {/* Blank spacer */}
                            <div style={{ minHeight: '1px' }}></div>

                            {/* Headquarters Address */}
                            <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', margin: 0 }}>Headquarters Address</label>
                                {editedCo.address && (
                                  <button 
                                    onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(editedCo.address)}`, '_blank')}
                                    style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', fontWeight: 700 }}
                                    title="Search Address on Google"
                                  >
                                    <Search size={10} /> Verify
                                  </button>
                                )}
                              </div>
                              <textarea 
                                className="form-input" 
                                style={{ padding: '6px 10px', fontSize: '0.85rem', minHeight: '50px', resize: 'vertical' }}
                                value={editedCo.address || ''} 
                                onChange={e => handleCompanyChange(co.domain, 'address', e.target.value)}
                              />
                            </div>

                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* CONTACTS REVIEW SECTION */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
                <User size={20} color="#10b981" />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                  2. Contacts to Create
                </h2>
                <span style={{ background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>
                  {candidates.length} Extracted
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {candidates.map((c) => {
                  const isChecked = selectedContacts.has(c.email);
                  const editedC = editedContacts[c.email] || {};

                  return (
                    <div 
                      key={c.email} 
                      style={{ 
                        background: '#fff', 
                        border: isChecked ? '1px solid #a7f3d0' : '1px solid #e2e8f0', 
                        borderRadius: '16px', 
                        padding: '16px', 
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                        transition: 'all 0.2s',
                        opacity: isChecked ? 1 : 0.6
                      }}
                    >
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => handleToggleContact(c.email)}
                          style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }}
                        />
                        <div style={{ display: 'flex', flex: 1, justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input 
                                type="text" 
                                style={{ border: 'none', background: 'transparent', fontSize: '1rem', fontWeight: 700, color: '#1e293b', width: 'auto', outline: 'none', borderBottom: '1px dashed transparent' }}
                                onFocus={e => e.target.style.borderBottomColor = '#cbd5e1'}
                                onBlur={e => e.target.style.borderBottomColor = 'transparent'}
                                value={editedC.name || ''}
                                onChange={e => handleContactChange(c.email, 'name', e.target.value)}
                              />
                              {editedC.name && (
                                <button 
                                  onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(editedC.name + ' ' + (c.companyName || ''))}`, '_blank')}
                                  style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                  title="Search Contact on Google"
                                >
                                  <Search size={12} />
                                </button>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>Email:</span>
                              <input 
                                type="email" 
                                style={{ border: 'none', background: 'transparent', fontSize: '0.85rem', color: '#64748b', flex: 1, outline: 'none', borderBottom: '1px dashed transparent', minWidth: '180px' }}
                                onFocus={e => e.target.style.borderBottomColor = '#cbd5e1'}
                                onBlur={e => e.target.style.borderBottomColor = 'transparent'}
                                value={editedC.email || ''}
                                onChange={e => handleContactChange(c.email, 'email', e.target.value)}
                              />
                              {editedC.email && (
                                <button 
                                  onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(editedC.email)}`, '_blank')}
                                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                  title="Search Email on Google"
                                >
                                  <Search size={10} />
                                </button>
                              )}
                            </div>
                          </div>
                          
                          {/* Company Link Indicator */}
                          {c.companyName && c.companyName.toLowerCase() !== 'individual' ? (
                            <span style={{ fontSize: '0.75rem', background: '#f5f3ff', color: '#7c3aed', padding: '4px 10px', borderRadius: '12px', fontWeight: 700 }}>
                              🏢 {c.companyName}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '12px', fontWeight: 700 }}>
                              👤 Individual
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Detail inputs */}
                      {isChecked && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '10px 0 0 0', borderTop: '1px solid #f1f5f9' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', width: '100%' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>Title:</span>
                            <input 
                              type="text" 
                              placeholder="e.g. Sales Director" 
                              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', flex: 1, color: '#334155' }}
                              value={editedC.post || ''}
                              onChange={e => handleContactChange(c.email, 'post', e.target.value)}
                            />
                            {editedC.post && (
                              <button 
                                onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(editedC.name + ' ' + editedC.post + ' ' + (c.companyName || ''))}`, '_blank')}
                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                title="Search Title on Google"
                              >
                                <Search size={12} />
                              </button>
                            )}
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', width: '100%' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>Mobile:</span>
                            <input 
                              type="text" 
                              placeholder="Mobile phone" 
                              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', flex: 1, color: '#334155' }}
                              value={editedC.handphone || ''}
                              onChange={e => handleContactChange(c.email, 'handphone', e.target.value)}
                            />
                            {editedC.handphone && (
                              <button 
                                onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(editedC.handphone)}`, '_blank')}
                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                title="Search Mobile on Google"
                              >
                                <Search size={12} />
                              </button>
                            )}
                          </div>

                          <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>Dept:</span>
                            <select
                              value={editedC.department || 'Other'}
                              onChange={e => handleContactChange(c.email, 'department', e.target.value)}
                              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: '#334155', width: '100%', cursor: 'pointer' }}
                            >
                              <option value="Operations">Operations</option>
                              <option value="Purchase">Purchase</option>
                              <option value="Technical">Technical</option>
                              <option value="Accounts">Accounts</option>
                              <option value="Management">Management</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP: SUCCESS CELEBRATION */}
      {currentStep === 'success' && (
        <div className="glass-panel animate-fade-in" style={{ background: '#fff', padding: '60px 40px', borderRadius: '20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 15px 35px -5px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ width: '80px', height: '80px', background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#166534', marginBottom: '24px', animation: 'fadeIn 0.6s' }}>
            <CheckCircle2 size={48} />
          </div>
          
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1e293b', marginBottom: '12px' }}>
            Network Connected Successfully!
          </h2>
          <p style={{ color: '#64748b', fontSize: '1rem', maxWidth: '500px', margin: '0 auto 36px', lineHeight: 1.6 }}>
            The AI parsed all contacts, created or linked corporate partner profiles, and seamlessly established the relational database hooks. All contacts are now live.
          </p>

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <button 
              onClick={() => {
                setInputText('');
                setCandidates([]);
                setUniqueCompanies([]);
                setCurrentStep('input');
              }} 
              className="btn btn-secondary" 
              style={{ fontWeight: 600, padding: '12px 24px', borderRadius: '10px' }}
            >
              Parse Another Email
            </button>
            <button 
              onClick={() => navigate('/partners')} 
              className="btn btn-primary" 
              style={{ background: '#7c3aed', fontWeight: 600, padding: '12px 24px', borderRadius: '10px' }}
            >
              Go to Partners Directory
            </button>
            <button 
              onClick={() => navigate('/contacts')} 
              className="btn btn-secondary" 
              style={{ fontWeight: 600, padding: '12px 24px', borderRadius: '10px' }}
            >
              Go to Contacts Directory
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Small functional components for readability
function ReviewItem({ label, value, fullWidth = false }) {
  if (!value) return null;
  return (
    <div style={{ gridColumn: fullWidth ? 'span 2' : 'span 1' }}>
      <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ color: '#334155', fontSize: '0.85rem', fontWeight: 600 }}>{value}</span>
    </div>
  );
}
