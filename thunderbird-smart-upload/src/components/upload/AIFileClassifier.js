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
    classify: (filename) => {
        if (!filename) return null;
        
        const cleanName = filename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
        
        let maker = '';
        let category = 'General Document';

        const lowerName = cleanName.toLowerCase();
        for (const brand of BRANDS) {
            const regex = new RegExp(`\\b${brand.toLowerCase()}\\b`, 'i');
            if (regex.test(lowerName)) {
                maker = brand;
                break;
            }
        }

        for (const cat of CATEGORIES) {
            const found = cat.keywords.some(keyword => lowerName.includes(keyword));
            if (found) {
                category = cat.name;
                break;
            }
        }

        return {
            maker,
            category,
            cleanName
        };
    }
};
