/**
 * Regex-based AI classifier helper to automatically extract brand/manufacturer,
 * model/series, category, and relevant keywords/tags from uploaded filenames.
 */

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
     * @returns {Object} suggestions
     */
    classify: (filename) => {
        if (!filename) return null;
        
        const cleanName = filename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
        const words = cleanName.split(/\s+/);
        
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

        // 2. Detect Category
        for (const cat of CATEGORIES) {
            const found = cat.keywords.some(keyword => lowerName.includes(keyword));
            if (found) {
                category = cat.name;
                break;
            }
        }

        // 3. Detect Model Number
        // Look for typical alphanumeric patterns (e.g. S7-1200, ACS880, C32, VLT3000, 6EY18AL, D380-A)
        // Usually contains a mix of letters and digits, often separated by a dash
        const modelRegex = /\b([a-zA-Z]{1,4}[-]?\d{2,5}[a-zA-Z]{0,3}|\d{1,4}[a-zA-Z]{1,4}[-]?\d{0,4})\b/g;
        const matches = cleanName.match(modelRegex);
        if (matches && matches.length > 0) {
            // Filter out common dates (like 2026, 250706) and size suffixes (e.g. 50mm, 24v)
            const cleanMatches = matches.filter(m => {
                const lower = m.toLowerCase();
                if (/^(19|20)\d{2}$/.test(m)) return false; // Year
                if (/^\d+$/.test(m) && m.length > 4) return false; // Date string or ID
                if (lower.endsWith('mm') || lower.endsWith('v') || lower.endsWith('hz') || lower.endsWith('kw')) return false; // Units
                return true;
            });
            if (cleanMatches.length > 0) {
                model = cleanMatches[0];
            }
        }

        // 4. Generate AI Keywords / Tags based on content matches
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

        // Add model and brand as keywords if detected
        if (maker) keywords.push(maker);
        if (model) keywords.push(model);
        if (category !== 'General') keywords.push(category);

        // Deduplicate and limit to 6 keywords
        keywords = [...new Set(keywords)].slice(0, 6);

        return {
            title: cleanName,
            manufacturer: maker,
            model: model,
            category: category,
            tags: keywords.join(', ')
        };
    }
};
