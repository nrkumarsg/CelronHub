/**
 * Regex-based AI classifier helper to automatically extract brand/manufacturer,
 * model/series, category, document category, and relevant keywords/tags from uploaded filenames and OCR text.
 */

export const DOCUMENT_CATEGORIES = [
    {
        id: 'customer_enquiry',
        label: 'Customer Enquiry / Landing Note',
        shortLabel: 'Enquiry / RFQ',
        party: 'customer',
        icon: 'FileText',
        color: '#3b82f6',
        bg: '#eff6ff',
        subfolder: 'ROOT',
        docType: 'Enquiry',
        keywords: ['enquiry', 'enq', 'rfq', 'landing', 'inquiry', 'request', 'requisition', 'customer enquiry']
    },
    {
        id: 'customer_quote',
        label: 'Customer Quotation',
        shortLabel: 'Customer Quote',
        party: 'customer',
        icon: 'Receipt',
        color: '#f59e0b',
        bg: '#fffbeb',
        subfolder: 'SupportDocs',
        docType: 'Quotation',
        keywords: ['quote', 'quotation', 'qtn', 'offer', 'estimate', 'proposal', 'customer quote', 'commercial proposal']
    },
    {
        id: 'customer_po',
        label: 'Customer Purchase Order (PO)',
        shortLabel: 'Customer PO',
        party: 'customer',
        icon: 'Package',
        color: '#f97316',
        bg: '#fff7ed',
        subfolder: 'SupportDocs',
        docType: 'Purchase Order',
        keywords: ['customer po', 'customer order', 'purchase order', 'po-', 'po_', 'order acknowledgment', 'oa-', 'order confirmation', 'work order']
    },
    {
        id: 'supplier_po',
        label: 'Supplier PO / Sourced Cost',
        shortLabel: 'Supplier PO',
        party: 'supplier',
        icon: 'ShoppingCart',
        color: '#8b5cf6',
        bg: '#f5f3ff',
        subfolder: 'SupplierBills&Expenses',
        docType: 'Supplier PO',
        keywords: ['supplier po', 'vendor po', 'spo', 'supplier order', 'vendor order', 'rfq supplier', 'supplier quote', 'vendor quote']
    },
    {
        id: 'delivery_order',
        label: 'Delivery Order / Service Report',
        shortLabel: 'Delivery / Service',
        party: 'customer',
        icon: 'Truck',
        color: '#06b6d4',
        bg: '#ecfeff',
        subfolder: 'SupportDocs',
        docType: 'Delivery Order',
        keywords: ['delivery', 'do-', 'do_', 'service report', 'sr-', 'sr_', 'pod', 'signed do', 'field report', 'delivery order', 'job completion', 'timesheet', 'dispatch note']
    },
    {
        id: 'tax_invoice',
        label: 'Customer Tax Invoice (Billed)',
        shortLabel: 'Customer Invoice',
        party: 'customer',
        icon: 'DollarSign',
        color: '#10b981',
        bg: '#ecfdf5',
        subfolder: 'Worksuite',
        docType: 'Tax Invoice',
        keywords: ['tax invoice', 'invoice', 'inv-', 'inv_', 'proforma', 'billed', 'customer invoice', 'commercial invoice']
    },
    {
        id: 'credit_note',
        label: 'Credit Note (Invoice Adjustment)',
        shortLabel: 'Credit Note',
        party: 'customer',
        icon: 'RotateCcw',
        color: '#e11d48',
        bg: '#fff1f2',
        subfolder: 'Worksuite',
        docType: 'Credit Note',
        keywords: ['credit note', 'credit_note', 'credit memo', 'cn-', 'crn-', 'credit adjustment']
    },
    {
        id: 'supplier_bill',
        label: 'Supplier Bill / Expense Note',
        shortLabel: 'Supplier Bill',
        party: 'supplier',
        icon: 'CreditCard',
        color: '#d97706',
        bg: '#fffbeb',
        subfolder: 'SupplierBills&Expenses',
        docType: 'Supplier Bill',
        keywords: ['supplier bill', 'vendor bill', 'supplier inv', 'vendor invoice', 'expense', 'freight invoice', 'customs', 'receipts']
    },
    {
        id: 'payment_proof',
        label: 'Payment Proof (Paid Status)',
        shortLabel: 'Payment Proof / Paid',
        party: 'finance',
        icon: 'CheckCircle2',
        color: '#22c55e',
        bg: '#f0fdf4',
        subfolder: 'ROOT',
        docType: 'Payment Proof',
        keywords: ['payment', 'paid', 'receipt', 'remittance', 'voucher', 'bank slip', 'tt copy', 'proof of payment', 'official receipt']
    },
    {
        id: 'communications',
        label: 'Communications (.eml, chat, notes)',
        shortLabel: 'Email & Chat',
        party: 'general',
        icon: 'MessageSquare',
        color: '#6366f1',
        bg: '#eef2ff',
        subfolder: 'SupportDocs',
        docType: 'Communication',
        keywords: ['eml', 'msg', 'email', 'mail', 'chat', 'whatsapp', 'thread', 'communication', 'correspondence', 'thunderbird']
    },
    {
        id: 'photos_gallery',
        label: 'Photos & Documentation Gallery',
        shortLabel: 'Photos & Gallery',
        party: 'general',
        icon: 'Image',
        color: '#14b8a6',
        bg: '#f0fdfa',
        subfolder: 'Photos & Gallery',
        docType: 'Photo',
        keywords: ['photo', 'picture', 'image', 'gallery', 'camera', 'drawing', 'dwg', 'snapshot', 'jpg', 'png', 'site photo']
    }
];

const BRANDS = [
    'ABB', 'Siemens', 'Danfoss', 'Wärtsilä', 'Wartsila', 'Caterpillar', 'CAT', 'Cummins',
    'Yanmar', 'Furuno', 'Sperry', 'Alfa Laval', 'AlfaLaval', 'Mitsubishi', 'Daihatsu',
    'Kongsberg', 'MTU', 'Volvo Penta', 'VolvoPenta', 'MAN', 'Yokogawa', 'Schneider',
    'Rockwell', 'Allen Bradley', 'AllenBradley', 'Omron', 'Endress Hauser', 'EndressHauser',
    'Rexroth', 'Bosch', 'Kirloskar', 'Sulzer'
];

const CATEGORIES = [
    { name: 'Manual', keywords: ['manual', 'instruction', 'service', 'operation', 'userguide', 'maintenance', 'techdoc'] },
    { name: 'Invoice', keywords: ['invoice', 'inv', 'bill', 'receipt', 'payment', 'po', 'purchase'] },
    { name: 'Drawing', keywords: ['drawing', 'dwg', 'dxf', 'plan', 'layout', 'schematic', 'diagram', 'arrangement', 'ga'] },
    { name: 'Certificate', keywords: ['certificate', 'cert', 'coc', 'class', 'calibration', 'cal', 'testreport', 'compliance'] }
];

export const AIFileClassifier = {
    /**
     * Classify a filename and return metadata suggestions.
     * @param {string} filename
     * @param {string} [textContent]
     * @returns {Object} suggestions
     */
    classify: (filename, textContent = '') => {
        if (!filename && !textContent) return null;
        
        const cleanName = (filename || '').replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
        const combinedText = `${cleanName} ${textContent || ''}`.toLowerCase();
        
        let maker = '';
        let model = '';
        let category = 'General';
        let keywords = [];

        // 1. Detect Brand / Manufacturer
        const lowerName = cleanName.toLowerCase();
        for (const brand of BRANDS) {
            const regex = new RegExp(`\\b${brand.toLowerCase()}\\b`, 'i');
            if (regex.test(lowerName)) {
                maker = brand;
                break;
            }
        }

        // 2. Detect General Category
        for (const cat of CATEGORIES) {
            const found = cat.keywords.some(keyword => lowerName.includes(keyword));
            if (found) {
                category = cat.name;
                break;
            }
        }

        // 3. Detect Document Category from DOCUMENT_CATEGORIES
        let matchedDocCategory = DOCUMENT_CATEGORIES.find(dc => dc.id === 'photos_gallery');
        let highestScore = 0;

        for (const dc of DOCUMENT_CATEGORIES) {
            let score = 0;
            for (const kw of dc.keywords) {
                if (combinedText.includes(kw)) {
                    score += kw.length;
                }
            }
            if (score > highestScore) {
                highestScore = score;
                matchedDocCategory = dc;
            }
        }

        // Special check for .eml/.msg files
        if (filename && (filename.endsWith('.eml') || filename.endsWith('.msg'))) {
            matchedDocCategory = DOCUMENT_CATEGORIES.find(dc => dc.id === 'communications') || matchedDocCategory;
        }

        // 4. Detect Model Number
        const modelRegex = /\b([a-zA-Z]{1,4}[-]?\d{2,5}[a-zA-Z]{0,3}|\d{1,4}[a-zA-Z]{1,4}[-]?\d{0,4})\b/g;
        const matches = cleanName.match(modelRegex);
        if (matches && matches.length > 0) {
            const cleanMatches = matches.filter(m => {
                const lower = m.toLowerCase();
                if (/^(19|20)\d{2}$/.test(m)) return false;
                if (/^\d+$/.test(m) && m.length > 4) return false;
                if (lower.endsWith('mm') || lower.endsWith('v') || lower.endsWith('hz') || lower.endsWith('kw')) return false;
                return true;
            });
            if (cleanMatches.length > 0) {
                model = cleanMatches[0];
            }
        }

        // 5. Generate AI Keywords / Tags based on content matches
        if (lowerName.includes('vfd') || lowerName.includes('inverter') || lowerName.includes('drive') || lowerName.includes('acs')) {
            keywords.push('VFD', 'Drive', 'Inverter', 'Electrical');
        }
        if (lowerName.includes('engine') || lowerName.includes('propulsion') || lowerName.includes('cylinder') || lowerName.includes('piston')) {
            keywords.push('Propulsion', 'Main Engine', 'Mechanical');
        }
        if (lowerName.includes('pump') || lowerName.includes('fluid') || lowerName.includes('bilge') || lowerName.includes('ballast')) {
            keywords.push('Pump', 'Fluid Management', 'Piping');
        }
        if (lowerName.includes('valve') || lowerName.includes('actuator') || lowerName.includes('manifold')) {
            keywords.push('Valve', 'Flow Control', 'Piping');
        }
        if (lowerName.includes('generator') || lowerName.includes('alternator') || lowerName.includes('genset')) {
            keywords.push('Generator', 'Auxiliary Power', 'Electrical');
        }
        if (lowerName.includes('radar') || lowerName.includes('gps') || lowerName.includes('gyro') || lowerName.includes('autopilot')) {
            keywords.push('Navigation', 'Bridge Gear', 'Avionics');
        }
        if (lowerName.includes('calibration') || lowerName.includes('cal') || lowerName.includes('test') || lowerName.includes('report')) {
            keywords.push('Calibration', 'QC Certificate', 'QA Report');
        }

        if (maker) keywords.push(maker);
        if (model) keywords.push(model);
        if (matchedDocCategory?.shortLabel) keywords.push(matchedDocCategory.shortLabel);

        keywords = [...new Set(keywords)].slice(0, 6);

        return {
            title: cleanName,
            manufacturer: maker,
            model: model,
            category: category,
            tags: keywords.join(', '),
            docCategory: matchedDocCategory,
            targetSubfolder: matchedDocCategory?.subfolder || 'Photos & Gallery'
        };
    }
};
