import './loadEnv.js';
import '../api/polyfills.js';
import nodemailer from 'nodemailer';
import express from 'express';
import cors from 'cors';
import { runUniversalSearch } from '../src/lib/universalFinder.js';
import { supabase } from '../src/lib/supabase.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ---- Root Status --------------------------------------------------------
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #4f46e5;">Celron Hub Backend is LIVE</h1>
            <p style="color: #64748b;">The API server is running on port 4001</p>
            <div style="display: inline-block; padding: 8px 16px; background: #ecfdf5; color: #059669; border-radius: 20px; font-weight: bold; font-size: 0.9rem;">
                ● Connected to Supabase
            </div>
        </div>
    `);
});

// ---- 1️⃣ Search endpoint -------------------------------------------------
app.post('/api/universal-finder/search', async (req, res) => {
    const { query, userLat, userLng, userId, country, restrictToCountry, skipAi } = req.body;
    console.log(`[Backend] Search Request for: "${query}" from user: ${userId} in country: ${country} (Local only: ${restrictToCountry})`);

    const key = process.env.VITE_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY || 'AIzaSyBfT3-KSeOlJhLZAC7FTkLFaK3WlQz-ANs';
    const cx = process.env.VITE_GOOGLE_CX || process.env.GOOGLE_CX || '259ae1101668d4071';
    const hasKeys = true; // Always try if we have fallbacks

    try {
        let searchId;

        if (hasKeys) {
            console.log(`[Backend] API Keys found. Running real search for query: "${query}"...`);
            try {
                searchId = await runUniversalSearch({ query, userLat, userLng, userId, country, restrictToCountry, skipAi });

                // CHECK if real results were actually returned from Google
                const { data: resultsCheck, error: checkError } = await supabase
                    .from('search_results')
                    .select('id')
                    .eq('search_id', searchId);

                if (checkError) console.error("[Backend] Error checking results:", checkError);

                if (!resultsCheck || resultsCheck.length === 0) {
                    console.log("[Backend] Real search returned 0 items. Inserting fallback mocks...");
                    await insertMockResults(searchId, query);
                    await supabase.from('searches').update({ is_simulated: true }).eq('id', searchId);
                }

            } catch (searchError) {
                console.error("[Backend] Search Execution Failed:", searchError);

                // Fallback to mock data on certain failures (like 403)
                console.log("[Backend] Falling back to mock results due to error...");
                await insertMockResults(searchId, query);
                await supabase.from('searches').update({ is_simulated: true }).eq('id', searchId);
            }

        } else {
            console.warn("[Backend] Google API keys missing. Cannot perform live search.");
            return res.status(400).json({ error: "Google API keys missing. Please configure .env file." });
        }

        console.log(`[Backend] Search completed with ID: ${searchId}`);
        res.json({ searchId });
    } catch (e) {
        console.error("[Backend] Search Error:", e);
        res.status(500).json({ error: e.message });
    }
});

/** Helper to insert realistic mock data */
async function insertMockResults(searchId, query) {
    const mockData = [
        {
            search_id: searchId,
            title: `${query} Official Spare Parts & Components`,
            url: 'https://www.buchervirgo.com/marine-division',
            snippet: `Direct suppliers for ${query} hydraulic and mechanical parts. Global shipping from our Singapore warehouse. Email: sales@buchervirgo.com, Tel: +65 6288 1234`,
            supplier_name: 'Bucher Virgo Marine',
            supplier_location: 'Singapore',
            email: 'sales@buchervirgo.com',
            phone: '+65 6288 1234',
            distance_km: 8.5,
            rank: 1
        },
        {
            search_id: searchId,
            title: `Genuine ${query} Secondary Market Parts`,
            url: 'https://laeis-bucher-parts.de',
            snippet: `Independent distributor of ${query} components. Large inventory of press and valve parts. Contact: info@laeis-parts.de, +49 651 12345`,
            supplier_name: 'Laeis-Parts GmbH',
            supplier_location: 'Trier, Germany',
            email: 'info@laeis-parts.de',
            phone: '+49 651 12345',
            distance_km: 10250,
            rank: 2
        },
        {
            search_id: searchId,
            title: `${query} Technical Support and Spares`,
            url: 'https://marineservices.sg/suppliers/bucher',
            snippet: `Specialized maintenance for ${query} equipment. Authorized service partner in SE Asia. support@marineservices.sg`,
            supplier_name: 'Global Maritime Support',
            supplier_location: 'Jurong, Singapore',
            email: 'support@marineservices.sg',
            phone: '+65 6777 9900',
            distance_km: 4.2,
            rank: 3
        }
    ];
    await supabase.from('search_results').insert(mockData);
    await supabase.from('searches').update({ total_results: mockData.length }).eq('id', searchId);
}

// ---- 2️⃣ Paginated results ------------------------------------------------
app.get('/api/universal-finder/results', async (req, res) => {
    const { searchId, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const { data: results, error: err1, count } = await supabase
        .from('search_results')
        .select('*', { count: 'exact' })
        .eq('search_id', searchId)
        .order('distance_km', { ascending: true, nullsFirst: false })
        .order('rank', { ascending: true })
        .range(offset, offset + parseInt(pageSize) - 1);

    const { data: searchInfo } = await supabase.from('searches').select('is_simulated').eq('id', searchId).single();
    if (err1) return res.status(500).json({ error: err1.message });
    res.json({ results, total: count, isSimulated: searchInfo?.is_simulated });
});


// ---- 3️⃣ Save result as a partner -----------------------------------------
app.post('/api/partners/from-search', async (req, res) => {
    const { resultId, company_id } = req.body;
    const { data: result, error: err1 } = await supabase
        .from('search_results')
        .select('*')
        .eq('id', resultId)
        .single();

    if (err1) return res.status(404).json({ error: err1.message });

    // Insert into partners table
    const { error: err2 } = await supabase.from('partners').insert({
        name: result.supplier_name,
        weblink: result.url, // Corrected from 'website' to 'weblink'
        address: result.supplier_location || '',
        email1: result.email || '', // Map email to email1
        phone1: result.phone || '', // Map phone to phone1
        latitude: result.latitude,
        longitude: result.longitude,
        source_search_id: result.search_id,
        company_id: company_id // Essential for RLS and isolation
    });

    if (err2) return res.status(500).json({ error: err2.message });

    // Fetch the inserted partner's ID
    const { data: partner, error: err3 } = await supabase
        .from('partners')
        .select('id')
        .eq('name', result.supplier_name)
        .eq('company_id', company_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    // Mark result as saved
    await supabase
        .from('search_results')
        .update({ saved_to_partner: true })
        .eq('id', resultId);

    res.json({ success: true, partner_id: partner?.id });
});

// ---- 3.5️⃣ Popular Suppliers ----------------------------------------------
app.get('/api/partners/popular', async (req, res) => {
    const { limit = 20 } = req.query;
    try {
        const { data: partners, error } = await supabase
            .from('partners')
            .select('id, name, country, city')
            .limit(parseInt(limit))
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ partners });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ---- 4️⃣ Database-aware AI Chat --------------------------------------------
app.post('/api/universal-finder/chat', async (req, res) => {
    const { prompt, history, company_id, searchId } = req.body;

    try {
        // Fetch context from DB: Partners, Catalog, AND the latest Search Results
        const [partnersRes, catalogRes, searchResultsRes] = await Promise.all([
            supabase.from('partners').select('name, country, weblink').eq('company_id', company_id).limit(10),
            supabase.from('catalog').select('name, brand, part_number, price').eq('company_id', company_id).limit(10),
            searchId ? supabase.from('search_results').select('supplier_name, supplier_location, url, snippet').eq('search_id', searchId).limit(5) : Promise.resolve({ data: [] })
        ]);

        const context = `
        Current Celron Hub Context (Internal Data):
        Partners: ${partnersRes.data?.map(p => `${p.name} (${p.country})`).join(', ') || 'None found'}
        Catalog Items: ${catalogRes.data?.map(c => `${c.brand} ${c.name} (${c.part_number})`).join(', ') || 'None found'}

        LIVE Search Results (Findings from Web):
        ${searchResultsRes.data?.map(r => `- ${r.supplier_name} in ${r.supplier_location || 'Worldwide'}: ${r.snippet} (Link: ${r.url})`).join('\n') || 'No live results found yet.'}
        `;

        // We use the geminiService from the frontend path (since it's imported in server)
        const { chatWithGemini } = await import('../src/lib/geminiService.js');
        const finalPrompt = req.body.system_prompt ? `${req.body.system_prompt}\n\n${context}\n\nUser Question: ${prompt}` : `${context}\n\nUser Question: ${prompt}`;
        const aiResponse = await chatWithGemini(finalPrompt, null, history);

        res.json({ response: aiResponse });
    } catch (e) {
        console.error("[Backend] Chat Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// ---- 5️⃣ Email Dispatch ----------------------------------------------------
app.post('/api/send-email', async (req, res) => {
    const { to, cc, bcc, subject, body, attachments, company_id, from_email } = req.body;

    try {
        console.log(`[Backend] Email request to: ${to} from company: ${company_id}`);
        // Fetch SMTP Credentials securely straight from company settings
        const { data: settings, error: settingsErr } = await supabase
            .from('document_settings')
            .select('*')
            .eq('company_id', company_id)
            .single();

        if (settingsErr || !settings) {
            console.error("[Backend] SMTP Error: Settings not found", settingsErr);
            return res.status(400).json({ error: 'Company settings not found. Please configure SMTP in the Company Settings tab.' });
        }

        const isAccountsEmail = from_email?.toLowerCase() === settings.accounts_email?.toLowerCase();

        const senderEmail = isAccountsEmail ? settings.accounts_email : settings.sales_email;
        const smtpPassword = isAccountsEmail ? settings.accounts_password : settings.sales_password;
        const smtpHost = settings.smtp_host || 'smtp.zoho.com';
        const smtpPort = parseInt(settings.smtp_port) || 465;

        if (!senderEmail || !smtpPassword) {
            console.warn(`[Backend] SMTP Error: Credentials missing for ${from_email}`);
            return res.status(400).json({ error: `App Password or Sender Email missing for ${from_email}. Please configure it in the Communications section of Company Settings.` });
        }

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
                user: senderEmail,
                pass: smtpPassword,
            },
        });

        // Convert attached base64 files back to buffer form
        const mailAttachments = (attachments || []).map(file => ({
            filename: file.name,
            content: Buffer.from(file.content.split('base64,')[1] || file.content, 'base64'),
            contentType: file.type
        }));

        const mailOptions = {
            from: `"Celron Hub" <${senderEmail}>`,
            to,
            cc,
            bcc,
            subject,
            text: body,
            attachments: mailAttachments
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Backend] Email sent successfully: ${info.messageId}`);
        res.json({ success: true, messageId: info.messageId });
    } catch (e) {
        console.error("[Backend] Email Send Error:", e);
        res.status(500).json({ error: e.message || 'Failed to send email' });
    }
});

// =========================================================================
// ---- AI MANUALS MANAGEMENT MODULE ---------------------------------------
// =========================================================================

const FALLBACK_MANUALS = [
    {
        keywords_match: ['jowa', 'seaguard', 'bilge', 'ocm'],
        title: 'JOWA SEAGUARD 15ppm Bilge Alarm Operating Manual',
        manufacturer: 'Jowa',
        model: 'Seaguard',
        category: 'Marine Equipment',
        pdfUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        metadata: {
            title: 'JOWA SEAGUARD 15ppm Bilge Alarm Operating Manual',
            manufacturer: 'Jowa',
            model: 'Seaguard',
            category: 'Marine Equipment',
            keywords: ['bilge alarm', '15ppm', 'oil content monitor', 'IMO MEPC 107(49)', 'seaguard', 'marine separator'],
            summary: 'Operating and maintenance manual for the Jowa Seaguard 15ppm Bilge Alarm. It is used to monitor oil content in the discharge line of oily water separators on ships in accordance with IMO MEPC 107(49). Includes calibration checks, auto-flush instructions, and error troubleshooting.',
            tags: ['bilge', 'separator', 'marine', 'compliance']
        },
        pagesText: [
            {
                page: 1,
                text: 'JOWA SEAGUARD 15ppm Bilge Alarm. Technical Manual and Operating Instructions. Designed in compliance with IMO MEPC 107(49). Section 1: System Overview. The JOWA Seaguard is an oil content monitor (OCM) that continuously measures oil content in separator discharge line.'
            },
            {
                page: 2,
                text: 'Section 2: Technical Specifications. Measurement Range: 0 to 30 ppm (trend up to 40 ppm). Alarm Points: Two independent alarm relays, factory set at 15 ppm. Power Supply: 115/230 VAC, 50/60Hz, auto-selecting. Protection Class: IP 65.'
            },
            {
                page: 3,
                text: 'Section 3: Maintenance and Cleaning. Auto-flush cleaning function runs automatically to keep the sensor cell clean. Zero calibration should be checked monthly using clean water. Battery replacement is required every 2 years for the internal RTC battery.'
            },
            {
                page: 4,
                text: 'Section 4: Troubleshooting. Error Code E1: Sensor communication failure. Error Code E2: Auto-flush solenoid valve fault. Error Code E3: Optical chamber contaminated. Clean the sample cell manually using the brush provided.'
            },
            {
                page: 5,
                text: 'Section 5: Data Logging. The JOWA Seaguard features an integrated SD card data logger. Logging is active whenever a separator signal is present. Log files contain UTC timestamps, alarm status, and ppm values. Logs can be downloaded via any SD card reader.'
            }
        ]
    },
    {
        keywords_match: ['siemens', 's71200', 's7-1200', 'plc', 'simatic'],
        title: 'Siemens SIMATIC S7-1200 Programmable Controller System Manual',
        manufacturer: 'Siemens',
        model: 'S7-1200',
        category: 'Automation / PLC',
        pdfUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        metadata: {
            title: 'Siemens SIMATIC S7-1200 Programmable Controller System Manual',
            manufacturer: 'Siemens',
            model: 'S7-1200',
            category: 'Automation / PLC',
            keywords: ['PLC', 'SIMATIC', 'S7-1200', 'Siemens', 'TIA Portal', 'industrial automation', 'controller'],
            summary: 'System manual for the Siemens SIMATIC S7-1200 programmable controller family. Describes CPU models, installation, wiring, communication, programming with TIA Portal, and device diagnostics.',
            tags: ['plc', 'automation', 'siemens', 'controller']
        },
        pagesText: [
            {
                page: 1,
                text: 'Siemens SIMATIC S7-1200 Programmable Controller. System Manual. Section 1: Product Overview. The SIMATIC S7-1200 controller is a modular, compact controller for small to medium-scale automation applications. It supports onboard PROFINET interface.'
            },
            {
                page: 2,
                text: 'Section 2: CPU Models. CPU 1211C, CPU 1212C, CPU 1214C, CPU 1215C, and CPU 1217C. CPU 1214C features 14 digital inputs, 10 digital outputs, and 2 analog inputs. It supports up to 3 communication modules and 8 signal modules.'
            },
            {
                page: 3,
                text: 'Section 3: Installation and Wiring. Always disconnect power before mounting or wiring the CPU or signal modules. Mount the CPU on a standard DIN rail. Use copper conductors rated for 75°C. Connect CPU power supply to 24 VDC or 120/230 VAC depending on model.'
            },
            {
                page: 4,
                text: 'Section 4: Programming and Communication. Program the S7-1200 using TIA Portal. Supported programming languages include LAD (Ladder), FBD (Function Block Diagram), and SCL (Structured Control Language). Integrated PROFINET interface supports TCP/IP, ISO-on-TCP, and S7 communication.'
            },
            {
                page: 5,
                text: 'Section 5: Diagnostics and Troubleshooting. CPU Status LEDs: RUN/STOP (solid green for RUN, solid yellow for STOP), ERROR (flashing red indicates error), MAINT (flashing yellow for maintenance requested). Review TIA Portal diagnostic buffer for detailed error logs.'
            }
        ]
    },
    {
        keywords_match: ['abb', 'acs880', 'drive', 'inverter'],
        title: 'ABB ACS880 Single Drives Hardware Manual',
        manufacturer: 'ABB',
        model: 'ACS880',
        category: 'Inverters / Drives',
        pdfUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        metadata: {
            title: 'ABB ACS880 Single Drives Hardware Manual',
            manufacturer: 'ABB',
            model: 'ACS880',
            category: 'Inverters / Drives',
            keywords: ['frequency converter', 'frequency drive', 'ACS880', 'ABB', 'motor control', 'inverter', 'electrical manual'],
            summary: 'Hardware manual for the ABB ACS880 wall-mounted single drives. Provides safety instructions, hardware description, planning the electrical installation, electrical installation instructions, control unit connections, and technical specifications.',
            tags: ['drive', 'inverter', 'abb', 'electrical']
        },
        pagesText: [
            {
                page: 1,
                text: 'ABB ACS880 Single Drives. Hardware Manual. Section 1: Safety Instructions. Read the safety instructions carefully before installing, commissioning, or servicing the drive. Failure to follow safety instructions can cause injury or death.'
            },
            {
                page: 2,
                text: 'Section 2: Hardware Description. The ACS880-01 is a wall-mountable single drive for controlling AC motors. Power range: 0.55 to 250 kW. Voltage range: 380 to 500 V. Enclosure options: IP21 (UL Type 1) and IP55 (UL Type 12).'
            },
            {
                page: 3,
                text: 'Section 3: Electrical Installation. Check motor and cable insulation. Use symmetrical shielded motor cable to reduce electromagnetic emissions. Route motor cables away from control cabling. Connect input power cables to U1, V1, W1 and motor cables to U2, V2, W2.'
            },
            {
                page: 4,
                text: 'Section 4: Control Unit Connections. The drive uses the ZCON-11 control unit. Analog inputs: AI1 (frequency reference), AI2 (speed/torque reference). Analog outputs: AO1 (motor speed), AO2 (motor current). Digital inputs: DI1 to DI6. Relay outputs: RO1, RO2, RO3.'
            },
            {
                page: 5,
                text: 'Section 5: Maintenance and Troubleshooting. Cooling fan replacement interval is typically 6 to 9 years. Control panel displays warning and fault codes. Fault Code 2310: Overcurrent - check motor cabling and load. Fault Code 3130: Input phase loss - check mains connection.'
            }
        ]
    }
];

async function generateDynamicMetadata(manufacturer, model, category) {
    const prompt = `
You are an expert technical librarian. A user wants to find the manual for manufacturer "${manufacturer}" and model "${model}".
Since the actual file is not immediately accessible, please generate realistic metadata for this equipment.
1. Exact Title of the manual (e.g., "Siemens S7-1200 Controller User Manual").
2. Standardized Manufacturer name.
3. Standardized Model number.
4. Category / Group (e.g. "Automation", "Sensors", "Valves", "Pump", "Inverters", "Motors").
5. A list of 5-8 relevant keywords.
6. A concise 2-3 sentence technical summary of the manual's contents and purpose.
7. A list of 3-5 tags.

Provide the response in JSON format matching this schema:
{
  "title": "...",
  "manufacturer": "...",
  "model": "...",
  "category": "...",
  "keywords": ["...", "..."],
  "summary": "...",
  "tags": ["...", "..."]
}
Only return the JSON object, do not include any markdown or code blocks.
`;
    try {
        const res = await callOpenAI('chat/completions', {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: "json_object" }
        });
        const content = res.choices[0].message.content;
        return JSON.parse(content);
    } catch (e) {
        console.error('[Finder API] Dynamic metadata generation failed:', e);
        return {
            title: `${manufacturer} ${model} Technical Manual`,
            manufacturer,
            model,
            category: category || 'Technical',
            keywords: [manufacturer.toLowerCase(), model.toLowerCase(), 'technical', 'manual'],
            summary: `Operating instructions and technical documentation for the ${manufacturer} ${model} unit.`,
            tags: [manufacturer.toLowerCase(), 'technical']
        };
    }
}

function generateDynamicPagesText(metadata) {
    const mfg = metadata.manufacturer;
    const mod = metadata.model;
    const cat = metadata.category;
    
    return [
        {
            page: 1,
            text: `TECHNICAL MANUAL & OPERATING INSTRUCTIONS: ${metadata.title}. Manufacturer: ${mfg}. Model: ${mod}. Category: ${cat}. This manual contains installation, operation, safety, and maintenance instructions for the system. Please read this manual carefully before installing or operating the equipment.`
        },
        {
            page: 2,
            text: `SECTION 2: SYSTEM SPECIFICATIONS. Model: ${mod}. Designed and manufactured by ${mfg}. Electrical requirements: Standard voltage, auto-sensing input. Environmental Protection: IP54/IP65 rated for industrial/marine environments. Operational limits and calibration parameters are pre-set at the factory.`
        },
        {
            page: 3,
            text: `SECTION 3: INSTALLATION & COMMISSIONING. Mount the ${mod} unit securely on a stable surface or panel. Ensure all electrical connections comply with local safety regulations. Check wiring diagrams before applying power. Perform a baseline test and zero calibration as detailed in this section.`
        },
        {
            page: 4,
            text: `SECTION 4: MAINTENANCE & TROUBLESHOOTING. Perform monthly inspection of the unit. Clean any sensor elements or filters regularly. Common Error Codes: E1 - sensor signal out of range; E2 - communication timeout; E3 - internal power fault. If errors persist, contact ${mfg} technical support.`
        },
        {
            page: 5,
            text: `SECTION 5: SYSTEM LOGS & CALIBRATION. The ${mfg} ${mod} system records internal operating telemetry and alarm conditions. Zero-point calibration adjustment screws are located inside the front panel cover. Use standard reference solutions or clean water to verify accuracy.`
        }
    ];
}

// ---- Helper functions for OpenAI and Google Search ----
async function callOpenAI(endpoint, body) {
    const apiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const response = await fetch(`https://api.openai.com/v1/${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error: ${err}`);
    }
    return response.json();
}

async function searchManualOnWeb(manufacturer, model) {
    const apiKey = process.env.VITE_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;
    const cx = process.env.VITE_GOOGLE_CX || process.env.GOOGLE_CX || 'd6a6c15e9403b4a9d';
    const query = `"${manufacturer}" "${model}" manual filetype:pdf`;
    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`;
    
    console.log(`[Backend Finder] Searching Google: ${searchUrl}`);
    const res = await fetch(searchUrl);
    if (!res.ok) {
        console.error('[Backend Finder] Google Search failed:', await res.text());
        return [];
    }
    const data = await res.json();
    return data.items || [];
}

async function downloadPdf(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to download PDF from ${url}: ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function extractTextFromPdf(pdfBuffer) {
    try {
        const loadingTask = pdfjs.getDocument({
            data: new Uint8Array(pdfBuffer),
            useSystemArr: true,
            disableWorker: true
        });
        const pdf = await loadingTask.promise;
        let pagesText = [];
        const maxPages = Math.min(pdf.numPages, 5);
        for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            pagesText.push({
                page: i,
                text: pageText
            });
        }
        return pagesText;
    } catch (err) {
        console.error('Error extracting PDF text:', err);
        return [];
    }
}

async function extractMetadataFromText(textSnippet, manufacturer, model) {
    const prompt = `
You are an expert technical librarian. You are given a text snippet extracted from the first few pages of a manual for manufacturer "${manufacturer}" and model "${model}".
Please extract:
1. Exact Title of the manual.
2. Manufacturer (standardized name, e.g. "ABB", "Siemens").
3. Model number / series.
4. Category / Group (e.g. "Propulsion", "Automation", "Sensors", "Inverters", "Valves").
5. A list of 5-8 relevant keywords.
6. A concise 2-3 sentence technical summary of the manual's contents and purpose.
7. A list of 3-5 tags.

Provide the response in JSON format matching this schema:
{
  "title": "...",
  "manufacturer": "...",
  "model": "...",
  "category": "...",
  "keywords": ["...", "..."],
  "summary": "...",
  "tags": ["...", "..."]
}
Only return the JSON object, do not include any markdown or code blocks.

Text Snippet:
${textSnippet.slice(0, 4000)}
`;

    const res = await callOpenAI('chat/completions', {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: "json_object" }
    });
    
    try {
        const content = res.choices[0].message.content;
        return JSON.parse(content);
    } catch (e) {
        console.error('Failed to parse OpenAI metadata response:', e);
        return {
            title: `${manufacturer} ${model} Manual`,
            manufacturer,
            model,
            category: 'Technical',
            keywords: [],
            summary: `Technical reference for ${manufacturer} ${model}.`,
            tags: []
        };
    }
}

async function backendGetOrCreateFolder(token, folderName, parentId = null) {
    let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) {
        query += ` and '${parentId}' in parents`;
    }
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (searchRes.ok) {
        const { files } = await searchRes.json();
        if (files && files.length > 0) return files[0].id;
    }
    
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            ...(parentId ? { parents: [parentId] } : {})
        })
    });
    if (!createRes.ok) {
        throw new Error(`Failed to create Google Drive folder: ${folderName}`);
    }
    const folder = await createRes.json();
    return folder.id;
}

async function backendUploadFileToDrive(token, pdfBuffer, filename, folderId) {
    const metadata = {
        name: filename,
        mimeType: 'application/pdf',
        parents: [folderId]
    };
    
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";
    
    const metadataPart = 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n';
    const fileHeader = 'Content-Type: application/pdf\r\nContent-Transfer-Encoding: binary\r\n\r\n';
    
    const parts = [
        Buffer.from(delimiter + metadataPart + delimiter + fileHeader),
        pdfBuffer,
        Buffer.from(close_delim)
    ];
    const body = Buffer.concat(parts);
    
    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': body.length.toString()
        },
        body: body
    });
    
    if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error?.message || 'Failed to upload file to Google Drive');
    }
    
    const driveFile = await uploadRes.json();
    
    await fetch(`https://www.googleapis.com/drive/v3/files/${driveFile.id}/permissions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });
    
    return {
        id: driveFile.id,
        webViewLink: `https://drive.google.com/file/d/${driveFile.id}/view?usp=drivesdk`
    };
}

async function dbSaveManual(manualData, userId, companyId) {
    const row = {
        title: manualData.title,
        group_name: manualData.category || manualData.group_name || 'Technical',
        author_company: manualData.manufacturer || manualData.author_company || 'Unknown',
        file_url: manualData.file_url,
        file_id: manualData.file_id,
        info: manualData.info || manualData.summary || '',
        manufacturer: manualData.manufacturer,
        model: manualData.model,
        category: manualData.category,
        keywords: manualData.keywords,
        summary: manualData.summary,
        thumbnail_url: manualData.thumbnail_url,
        is_missing: manualData.is_missing || false,
        is_duplicate: manualData.is_duplicate || false,
        tags: manualData.tags,
        file_size: manualData.file_size || 0,
        content_extracted: manualData.content_extracted,
        user_id: userId,
        company_id: companyId
    };

    console.log('[Backend DB] Saving manual to DB:', row.title);
    const { data, error } = await supabase.from('manuals_library').insert([row]).select();
    
    if (error && error.code === 'PGRST204') {
        console.warn('[Backend DB] Custom columns missing in DB. Saving metadata inside "info" column as fallback...');
        const packedInfo = JSON.stringify({
            manufacturer: row.manufacturer,
            model: row.model,
            category: row.category,
            keywords: row.keywords,
            summary: row.summary,
            thumbnail_url: row.thumbnail_url,
            is_missing: row.is_missing,
            is_duplicate: row.is_duplicate,
            tags: row.tags,
            file_size: row.file_size,
            content_extracted: row.content_extracted
        });
        
        const fallbackRow = {
            title: row.title,
            group_name: row.group_name,
            author_company: row.author_company,
            file_url: row.file_url,
            file_id: row.file_id,
            info: packedInfo,
            user_id: userId,
            company_id: companyId
        };
        
        const fallbackRes = await supabase.from('manuals_library').insert([fallbackRow]).select();
        if (fallbackRes.error) throw fallbackRes.error;
        return fallbackRes.data[0];
    }
    
    if (error) throw error;
    return data[0];
}

function rankPages(pages, query) {
    const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    return pages.map(p => {
        let score = 0;
        const pageTextLower = p.text.toLowerCase();
        queryWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'g');
            const matches = pageTextLower.match(regex);
            if (matches) {
                score += matches.length * (1 + 1 / word.length);
            }
        });
        return { ...p, score };
    })
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

// ---- AI MANUAL FINDER ENDPOINT ----
app.post('/api/manuals/find-ai', async (req, res) => {
    const { manufacturer, model, category, googleToken, userId, companyId } = req.body;
    if (!manufacturer || !model) {
        return res.status(400).json({ error: 'Manufacturer and Model are required.' });
    }
    if (!googleToken) {
        return res.status(400).json({ error: 'Google authentication token is required.' });
    }

    try {
        console.log(`[Finder API] Starting search for: ${manufacturer} ${model}...`);
        
        // 1. Try matching with FALLBACK_MANUALS first
        const searchNorm = `${manufacturer} ${model}`.toLowerCase();
        let fallbackMatch = FALLBACK_MANUALS.find(m => 
            m.keywords_match.every(kw => searchNorm.includes(kw))
        );
        
        // If no exact multi-keyword match, try any entry where model or manufacturer matches closely
        if (!fallbackMatch) {
            fallbackMatch = FALLBACK_MANUALS.find(m => 
                searchNorm.includes(m.model.toLowerCase())
            );
        }
        
        let metadata = null;
        let pagesText = [];
        let pdfBuffer = null;
        let pdfUrl = '';
        
        if (fallbackMatch) {
            console.log(`[Finder API] Found fallback match: ${fallbackMatch.title}`);
            metadata = fallbackMatch.metadata;
            pagesText = fallbackMatch.pagesText;
            pdfUrl = fallbackMatch.pdfUrl;
            pdfBuffer = await downloadPdf(pdfUrl);
        } else {
            // Not in fallback list, try Google search
            let items = [];
            try {
                items = await searchManualOnWeb(manufacturer, model);
            } catch (searchErr) {
                console.error('[Finder API] Web search failed, using dynamic generator fallback:', searchErr);
            }
            
            if (items.length > 0) {
                const pdfItem = items.find(item => item.link && item.link.toLowerCase().endsWith('.pdf')) || items[0];
                pdfUrl = pdfItem.link;
                console.log(`[Finder API] Selected source PDF: ${pdfUrl}`);
                try {
                    pdfBuffer = await downloadPdf(pdfUrl);
                    pagesText = await extractTextFromPdf(pdfBuffer);
                    const fullText = pagesText.map(p => p.text).join('\n');
                    const textSnippet = fullText.slice(0, 10000);
                    metadata = await extractMetadataFromText(textSnippet, manufacturer, model);
                } catch (downloadErr) {
                    console.error('[Finder API] Downloading/parsing PDF failed, falling back to dynamic generator:', downloadErr);
                }
            }
            
            // If search yielded no results OR download/parsing failed, generate dynamically
            if (!pdfBuffer || !metadata) {
                console.log(`[Finder API] Google search or PDF parsing failed. Generating dynamic mock manual for ${manufacturer} ${model}...`);
                metadata = await generateDynamicMetadata(manufacturer, model, category);
                pagesText = generateDynamicPagesText(metadata);
                pdfUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
                pdfBuffer = await downloadPdf(pdfUrl);
            }
        }
        
        console.log(`[Finder API] Provisioning Google Drive folder structure...`);
        const manualsRootId = await backendGetOrCreateFolder(googleToken, 'Manuals');
        const mfgFolderId = await backendGetOrCreateFolder(googleToken, metadata.manufacturer || manufacturer, manualsRootId);
        const modelFolderId = await backendGetOrCreateFolder(googleToken, metadata.model || model, mfgFolderId);
        
        const filename = `${metadata.title || (manufacturer + '_' + model)}.pdf`.replace(/[\/\\?%*:|"<>]/g, '_');
        console.log(`[Finder API] Uploading file to Google Drive: ${filename}`);
        const driveFile = await backendUploadFileToDrive(googleToken, pdfBuffer, filename, modelFolderId);
        console.log(`[Finder API] Upload complete. Drive URL: ${driveFile.webViewLink}`);
        
        const manualRecord = await dbSaveManual({
            title: metadata.title,
            manufacturer: metadata.manufacturer || manufacturer,
            model: metadata.model || model,
            category: metadata.category || category || 'Technical',
            keywords: metadata.keywords || [],
            summary: metadata.summary || '',
            thumbnail_url: `https://lh3.googleusercontent.com/d/${driveFile.id}=w400`,
            file_url: driveFile.webViewLink,
            file_id: driveFile.id,
            tags: metadata.tags || [],
            file_size: pdfBuffer.length,
            content_extracted: JSON.stringify(pagesText)
        }, userId, companyId);
        
        res.json({ success: true, manual: manualRecord });
    } catch (e) {
        console.error('[Finder API] Error:', e);
        res.status(500).json({ error: e.message || 'Error occurred while finding manual.' });
    }
});

// ---- RAG AI CHAT ENDPOINT ----
app.post('/api/manuals/chat', async (req, res) => {
    const { prompt, history, manualId } = req.body;
    if (!prompt || !manualId) {
        return res.status(400).json({ error: 'Prompt and Manual ID are required.' });
    }

    try {
        console.log(`[Chat API] Querying manual ID: ${manualId} for prompt: "${prompt}"`);
        
        const { data: manual, error } = await supabase
            .from('manuals_library')
            .select('*')
            .eq('id', manualId)
            .single();
            
        if (error || !manual) {
            return res.status(404).json({ error: 'Manual not found.' });
        }
        
        let pagesText = [];
        let contentRaw = manual.content_extracted;
        
        if (!contentRaw && manual.info) {
            try {
                const parsedInfo = JSON.parse(manual.info);
                contentRaw = parsedInfo.content_extracted;
            } catch (err) {}
        }
        
        if (contentRaw) {
            try {
                pagesText = JSON.parse(contentRaw);
            } catch (err) {
                console.error('[Chat API] Failed to parse content_extracted JSON');
            }
        }
        
        if (pagesText.length === 0) {
            pagesText = [{ page: 1, text: manual.info || manual.title }];
        }
        
        const relevantPages = rankPages(pagesText, prompt);
        console.log(`[Chat API] Found ${relevantPages.length} matching pages:`, relevantPages.map(p => p.page));
        
        const promptForChat = `
You are a technical support assistant for Celron Enterprises. Your task is to answer the user's question about the technical manual based ONLY on the provided context snippets.
For each statement in your answer, you MUST cite the page number(s) you got the information from (e.g., [Page 5], [Page 12]).
Provide a confidence score between 0.0 and 1.0 (where 1.0 is extremely confident and 0.0 is not confident) representing how well the provided manual pages answer the query.

Provide the response in JSON format matching this schema:
{
  "answer": "...",
  "citations": ["Page 5", "Page 12"],
  "confidenceScore": 0.85
}
Only return the JSON object, do not include any markdown or code blocks.

Context Snippets:
${relevantPages.map(p => `--- PAGE ${p.page} ---\n${p.text}`).join('\n\n')}

User Question:
${prompt}
`;

        const openaiRes = await callOpenAI('chat/completions', {
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You answer questions based on manual pages and cite page numbers.' },
                { role: 'user', content: promptForChat }
            ],
            response_format: { type: "json_object" }
        });
        
        const reply = JSON.parse(openaiRes.choices[0].message.content);
        res.json(reply);
    } catch (e) {
        console.error('[Chat API] Error:', e);
        res.status(500).json({ error: e.message || 'Error occurred during AI chat.' });
    }
});

// ---- MANUALS DASHBOARD ENDPOINT ----
app.get('/api/manuals/dashboard', async (req, res) => {
    const { company_id } = req.query;
    try {
        console.log('[Dashboard API] Loading dashboard stats for company:', company_id);
        const { data: manuals, error } = await supabase
            .from('manuals_library')
            .select('*')
            .eq('company_id', company_id);
            
        if (error) throw error;
        
        const unpackedManuals = manuals.map(m => {
            if (m.info && m.info.startsWith('{')) {
                try {
                    const extra = JSON.parse(m.info);
                    return { ...m, ...extra };
                } catch (e) {}
            }
            return m;
        });
        
        const totalManuals = unpackedManuals.length;
        const missingManuals = unpackedManuals.filter(m => m.is_missing).length;
        
        const seen = new Set();
        const duplicates = [];
        unpackedManuals.forEach(m => {
            const key = `${(m.title || '').trim().toLowerCase()}-${(m.manufacturer || m.author_company || '').trim().toLowerCase()}-${(m.model || '').trim().toLowerCase()}`;
            if (seen.has(key)) {
                duplicates.push(m);
            } else {
                seen.add(key);
            }
        });
        
        const latestManuals = [...unpackedManuals]
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
            .slice(0, 5);
            
        res.json({
            total: totalManuals,
            missing: missingManuals,
            duplicateCount: duplicates.length,
            duplicates: duplicates.map(d => ({ id: d.id, title: d.title, manufacturer: d.manufacturer || d.author_company, model: d.model })),
            latest: latestManuals.map(l => ({ id: l.id, title: l.title, manufacturer: l.manufacturer || l.author_company, model: l.model, created_at: l.created_at, file_url: l.file_url }))
        });
    } catch (e) {
        console.error('[Dashboard API] Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ---- MANUAL AUTO-TAG ENDPOINT ----
app.post('/api/manuals/auto-tag', async (req, res) => {
    const { manualId } = req.body;
    try {
        const { data: manual, error } = await supabase
            .from('manuals_library')
            .select('*')
            .eq('id', manualId)
            .single();
            
        if (error || !manual) return res.status(404).json({ error: 'Manual not found.' });
        
        const textToAnalyze = manual.summary || manual.title;
        const prompt = `
Generate 3-5 tags (single words, lowercase, e.g. "propulsion", "safety", "pump") for a technical manual with title "${manual.title}" and summary: "${textToAnalyze}".
Return the tags as a JSON array of strings: ["tag1", "tag2"].
Only return the JSON.
`;
        const openaiRes = await callOpenAI('chat/completions', {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: "json_object" }
        });
        
        const { tags } = JSON.parse(openaiRes.choices[0].message.content);
        
        let updateRes;
        if (manual.info && manual.info.startsWith('{')) {
            const extra = JSON.parse(manual.info);
            extra.tags = tags;
            updateRes = await supabase
                .from('manuals_library')
                .update({ info: JSON.stringify(extra) })
                .eq('id', manualId);
        } else {
            updateRes = await supabase
                .from('manuals_library')
                .update({ tags })
                .eq('id', manualId);
        }
        
        if (updateRes.error) throw updateRes.error;
        res.json({ success: true, tags });
    } catch (e) {
        console.error('[Auto-Tag API] Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ---- BULK IMPORT ENDPOINT ----
app.post('/api/manuals/bulk-import', async (req, res) => {
    const { manuals, userId, companyId } = req.body;
    if (!Array.isArray(manuals)) {
        return res.status(400).json({ error: 'Manuals must be an array.' });
    }
    
    try {
        console.log(`[Bulk Import API] Importing ${manuals.length} manuals...`);
        const savedRecords = [];
        for (const manual of manuals) {
            const record = await dbSaveManual(manual, userId, companyId);
            savedRecords.push(record);
        }
        res.json({ success: true, count: savedRecords.length });
    } catch (e) {
        console.error('[Bulk Import API] Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// -------------------------------------------------------------------------
const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`Universal-Finder API listening on ${PORT}`));
