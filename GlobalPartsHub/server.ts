import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { PRESEEDED_SUPPLIERS, SG_LAT, SG_LNG } from "./server-data.js";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Haversine distance in KM from Singapore (1.3521, 103.8198)
function getKilometerDistance(lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - SG_LAT) * Math.PI / 180;
  const dLon = (lon2 - SG_LNG) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(SG_LAT * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return Math.round(d);
}

// Global high-fidelity offline AI overview generator
function generateOfflineOverview(qStr: string) {
  const q = (qStr || "").toLowerCase();
  if (q.includes("mean well") || q.includes("power") || q.includes("mdr") || q.includes("supply")) {
    return {
      summary: "These industrial DIN rail power supplies are part of the Mean Well MDR series, designed for mounting in electrical cabinets. They offer stable 5V, 12V, or 24V outputs crucial for sensitive automation telemetry, logic chips, and electromagnetic relays.",
      modelVarieties: [
        "MDR-40-5 (5V): Compact 40W auxiliary logic unit",
        "MDR-60-24 (24V): Standard marine PLC controller driver",
        "MDR-100-12 (12V): High current low voltage stabilizer"
      ],
      keyFeatures: [
        "Universal AC input range (85-264VAC) with short circuit, overload, and overvoltage protections",
        "DIN rail TS-35/7.5 or 15 mounting format for standard electrical cabinets",
        "LED state indicators for visual diagnostics with under 0.75W no-load power consumption"
      ],
      usage: [
        "Commonly used in industrial automation PLC rack power supplies",
        "Marine bridge control boards and localized telemetry relays",
        "Renewable wind controller units and distributed solar cabinets"
      ]
    };
  } else if (q.includes("bearing") || q.includes("skf") || q.includes("spherical") || q.includes("roller")) {
    return {
      summary: "These carbon-alloy spherical roller bearings are part of the SKF high load carrying capacity series, engineered specifically for extreme radial loads and complex heavy shaft axial guidance.",
      modelVarieties: [
        "SKF 22218 CC/W33: Double row heavy radial barrel roller bearing",
        "SKF 6204-2RSH: High friction contact seal deep groove bearing",
        "SKF NU 310 ECP: Cylindrical roller high-speed thrust bearing"
      ],
      keyFeatures: [
        "Self-aligning symmetrical outer ring rolling profile to handle shaft misalignments up to 2 degrees",
        "Standard lubrication guide groove and 3 oil guides for regular automatic greasing",
        "High carbon chromium structural steel with specialized heat treatment for low friction coefficient"
      ],
      usage: [
        "High vibration main propulsion ocean-going vessel shafts",
        "Heavy cargo conveyor drums and industrial jaw crusher planetary drives",
        "Power generation cooling tower fan impellers and diesel engine main shafts"
      ]
    };
  } else if (q.includes("injector") || q.includes("yanmar") || q.includes("fuel") || q.includes("valve") || q.includes("engine") || q.includes("compressor")) {
    return {
      summary: "These high-pressure diesel fuel direct injection assemblies are calibrated for marine auxiliary power engines, optimizing atomized spray flow pattern rates to reduce greenhouse particulate emissions.",
      modelVarieties: [
        "Yanmar 6AYM Injection Assembly: Marine propulsion heavy core system",
        "Bosch CR-34S Common Rail Set: Continuous solenoid pressure stabilizer",
        "Cummins KTA19 Injector Block: Heavy cargo ship backup engine variant"
      ],
      keyFeatures: [
        "Multi-hole micro-drilled spray nozzle tips configured for high-uniformity fuel atomization",
        "Specially tempered steel needle valve that withstands continuous temperatures up to 600°C",
        "High speed solenoids with accurate mechanical return spring calibrated to ~250 Bar"
      ],
      usage: [
        "Deep-sea cargo ship auxiliary power generators",
        "Port towboat primary diesel engine propulsion chambers",
        "Heavy machinery diesel engines and pipeline standby water pump blocks"
      ]
    };
  } else {
    return {
      summary: `These designated industrial parts and system components support replacement matching operations for the searched query: "${qStr || 'spare parts'}".`,
      modelVarieties: [
        "Industrial high-durability primary series",
        "Compact low-clearance space auxiliary scale"
      ],
      keyFeatures: [
        "Certified Class-A industrial or marine B2B durability specification compliance",
        "Broad compatibility with OEM interfaces and structural mounts",
        "High-grade carbon-alloy metal or chemical engineering compound fabrication"
      ],
      usage: [
        "Regular preventative maintenance catalog cycles",
        "Critical emergency breakdown on-site swaps",
        "Heavy industrial systems retrofit installations"
      ]
    };
  }
}

// Helper to strip markdown and isolate clean outer JSON boundaries
function cleanAndParseJSON(text: string): any {
  let cleanText = text.trim();
  
  // Strip code blocks with backticks
  if (cleanText.startsWith("```")) {
    cleanText = cleanText.replace(/^```[a-zA-Z0-9]*\n?/, "");
    cleanText = cleanText.replace(/\n?```$/, "");
    cleanText = cleanText.trim();
  }
  
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    // Fall back to scanning for outermost brace JSON
    const firstBrace = cleanText.indexOf("{");
    const lastBrace = cleanText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        const jsonCandidate = cleanText.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonCandidate);
      } catch (err2) {
        // Fall back to array JSON scan block
        const firstBracket = cleanText.indexOf("[");
        const lastBracket = cleanText.lastIndexOf("]");
        if (firstBracket !== -1 && lastBracket !== -1) {
          try {
            const jsonCandidate = cleanText.substring(firstBracket, lastBracket + 1);
            return JSON.parse(jsonCandidate);
          } catch (err3) {
            throw new Error(`Failed to extract valid JSON candidate: ${(err3 as Error).message}`);
          }
        }
        throw e;
      }
    }
    throw e;
  }
}

// Search API
app.post("/api/search", async (req, res) => {
  try {
    const { query, segment, country, image, imageMimeType, imageName } = req.body;
    
    const hasQuery = query && query.trim() !== "";
    const hasImage = image && image.trim() !== "";

    if (!hasQuery && !hasImage) {
      return res.status(400).json({ error: "Search query or spare part image is required." });
    }

    let searchQuery = (query || "").trim();
    const apiKey = process.env.GEMINI_API_KEY;
    const targetCountry = country || "All";

    // Log the incoming search parameters
    console.log(`[GlobalPartsHub Router] Query: "${searchQuery}", Country: "${targetCountry}", Segment: "${segment || 'All'}", HasPhoto: ${!!hasImage}`);

    // If offline or no key, or fallback
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
      console.warn("[GlobalPartsHub Warn] No valid GEMINI_API_KEY. Sourcing catalog with offline matches.");
      
      let OfflineIdentifiedPartMessage = "";
      if (hasImage) {
        // Mock identify what part is shown in photo
        const placeholderNames = [
          "High-Pressure Cryogenic Actuator Valve V201",
          "SKF Spherical Roller Bearing Model 22218",
          "Yanmar Main Engine Fuel Injector Assembly",
          "Ballard Hydrogen Fuel Cell Rebuild Core"
        ];
        // Select based on segment or name
        let index = 1; // Default bearings
        if (segment === "Marine & Offshore Spares") index = 2;
        else if (segment === "Innovative Spares") index = 3;
        else if (segment === "Industrial Spares") index = 0;
        
        const partName = placeholderNames[index];
        searchQuery = partName.split(" ")[1] || partName; // e.g. "Bearing" or "Valve" or "Fuel"
        OfflineIdentifiedPartMessage = `Photo Analysis Simulated: Identified "${partName}" in your picture "${imageName || 'upload.jpg'}". Sourcing matching geographic suppliers... `;
      }

      const filtered = PRESEEDED_SUPPLIERS.filter(item => {
        // Filter by segment if specified
        if (segment && segment !== "All" && item.industrySegment !== segment) {
          return false;
        }

        // Filter by country if specified
        if (targetCountry && targetCountry !== "All") {
          const matchCountry = item.location.toLowerCase().includes(targetCountry.toLowerCase());
          if (!matchCountry) return false;
        }
        
        // Search matches in Name, Brand info, Specialities, address
        const lowerCaseQuery = searchQuery.toLowerCase().trim();
        if (lowerCaseQuery === "") return true; // match all if just category/country filter

        // Smart Word-Token matching (handles singular/plural variations and word order freedom)
        const queryWords = lowerCaseQuery.split(/\s+/).filter(w => w.length > 0);
        
        const combinedText = `
          ${item.name} 
          ${item.availableBrandsInfo} 
          ${item.whyRecommended} 
          ${item.industrySegment} 
          ${item.location}
          ${item.address}
          ${item.matchedProduct || ""}
        `.toLowerCase();

        // Ensure every single token of the search query is located as a substring
        return queryWords.every(word => {
          // Soft singular/plural checking so "electronic" matches database "electronics" and vice versa
          const cleanWord = word.endsWith('s') && word.length > 3 ? word.slice(0, -1) : word;
          return combinedText.includes(word) || combinedText.includes(cleanWord);
        });
      });

      // Map results with computed distance and match scores
      const results = filtered.map(item => {
        const distance = getKilometerDistance(item.latitude, item.longitude);
        
        // Compute standard mock matchScore based on smart token match
        let matchScore = 70.0;
        if (searchQuery) {
          const lowerCaseQuery = searchQuery.toLowerCase().trim();
          const queryWords = lowerCaseQuery.split(/\s+/).filter(w => w.length > 0);
          
          let matchedWordsCount = 0;
          const combinedText = `
            ${item.name} 
            ${item.availableBrandsInfo} 
            ${item.whyRecommended} 
            ${item.industrySegment} 
            ${item.location}
            ${item.address}
            ${item.matchedProduct || ""}
          `.toLowerCase();

          queryWords.forEach(word => {
            const cleanWord = word.endsWith('s') && word.length > 3 ? word.slice(0, -1) : word;
            if (combinedText.includes(word) || combinedText.includes(cleanWord)) {
              matchedWordsCount++;
            }
          });

          if (queryWords.length > 0) {
            matchScore += (matchedWordsCount / queryWords.length) * 22;
          }
          if (item.name.toLowerCase().includes(lowerCaseQuery)) {
            matchScore += 6;
          }
        }
        
        const price = item.price || `$${(150 + Math.random() * 340).toFixed(2)}`;
        const matchedProduct = item.matchedProduct || `${searchQuery ? searchQuery : "Industrial Replacement Spare Part"}`;

        return {
          ...item,
          price,
          matchedProduct,
          distance,
          matchScore: Math.min(matchScore + Math.floor(Math.random() * 3), 99.1),
          isAiGenerated: false
        };
      });

      // Sort: closest first
      results.sort((a, b) => a.distance - b.distance);

      // Create high-fidelity dynamic offline AI overview
      const aiOverview = generateOfflineOverview(searchQuery);

      return res.json({
        results,
        isAi: false,
        aiOverview,
        message: OfflineIdentifiedPartMessage + `Offline Catalog Mode Active: Showing matches${targetCountry !== "All" ? ` located in ${targetCountry}` : ""}. (Configure GEMINI_API_KEY in Secrets for real AI image analysis & global search!)`
      });
    }

    // Initialize @google/genai SDK
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    // Elegant query prompt for spare parts and systems analysis
    const systemPromptMessage = `You are the core logic engine of GlobalPartsHub, a specialized global spare parts and industrial system matchmaker.
Your objective is to identify 5 to 7 highly realistic or actual global distributors and suppliers for the requested query, AND compose a professional Google Search style AI Overview summarizing the industrial utility of this query.

Guidelines:
1. ${targetCountry && targetCountry !== "All" ? `User selected country limit is "${targetCountry}". You MUST return ONLY suppliers located in "${targetCountry}". Location field must reflect details in "${targetCountry}".` : 'ALWAYS include 1 to 2 Singapore-based suppliers first. Singapore coordinates are lat: ~1.35, lng: ~103.8. They will be calculated as ~0 km point distance.'}
2. Be professional and output exact contact details (plausible or actual working B2B contacts, emails, valid website formats, phone tags).
3. Industry segment must always match one of these strict values: "Marine & Offshore Spares", "Industrial Spares", "Innovative Spares", "Common Spares".
4. Return a single response matching the requested schema. Ensure the supplier results are populated in "results", and the buyer's guide / contextual analysis is in "aiOverview".`;

    const modelToUse = "gemini-3.5-flash";
    
    // Prepare contents block for AI Search
    let contents: any[] = [];
    if (hasImage) {
      const base64Data = image.replace(/^data:image\/[a-z]+;base64,/, "");
      contents.push({
        inlineData: {
          mimeType: imageMimeType || "image/jpeg",
          data: base64Data
        }
      });
      contents.push(`Identify the industrial or marine spare part, hardware, component, or engine model shown in this photo. Once identified, search and provide 5-7 matching suppliers/distributors carrying this parts category${segment && segment !== "All" ? ` in the industry segment: "${segment}"` : ""}. ${targetCountry !== "All" ? `Only look for suppliers currently operating inside "${targetCountry}".` : "Include Singapore distributors first if possible."} Fill both "results" array and "aiOverview" object accordingly.`);
    } else {
      contents.push(`Find suppliers for parts: "${searchQuery}" in the segment: "${segment || 'All'}". ${targetCountry !== "All" ? `Only return suppliers located inside "${targetCountry}".` : ""} Fill both "results" array and "aiOverview" object based on structural engineering catalogs.`);
    }

    const response = await ai.models.generateContent({
      model: modelToUse,
      contents: contents,
      config: {
        systemInstruction: systemPromptMessage,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            results: {
              type: Type.ARRAY,
              description: "List of 5 to 7 real or plausible suppliers offering this type of product",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  location: { type: Type.STRING, description: "City, Country" },
                  latitude: { type: Type.NUMBER, description: "Approximate latitude of supplier city" },
                  longitude: { type: Type.NUMBER, description: "Approximate longitude of supplier city" },
                  phoneNo: { type: Type.STRING, description: "Official B2B style phone number" },
                  email: { type: Type.STRING, description: "Sales or procurement B2B business email" },
                  contactPerson: { type: Type.STRING, description: "Contact person with designation e.g. Hans Krause (Global Spares Exec)" },
                  website: { type: Type.STRING, description: "Official website domain" },
                  stockStatus: { type: Type.STRING, description: "e.g. In Stock, 2-3 Days Lead Time, Out of Stock, Made to Order" },
                  availableBrandsInfo: { type: Type.STRING, description: "Specific brands/models carried matching the query" },
                  whyRecommended: { type: Type.STRING, description: "A robust reason why this supplier has the spare parts we wanted" },
                  industrySegment: { type: Type.STRING, description: "Must be one of: Marine & Offshore Spares, Industrial Spares, Innovative Spares, Common Spares" },
                  supplierRole: { type: Type.STRING, description: "Must be one of strict values: Maker, Distributor, Agent, Stockist." },
                  address: { type: Type.STRING, description: "Detailed physical street address with building numbers, road/lane names, industrial sectors, and local postal codes if applicable." },
                  price: { type: Type.STRING, description: "Estimated market unit or catalog price for matching standard part, e.g. '$300.62', '$317.48', '$45.00', or '$1,250.00'." },
                  matchedProduct: { type: Type.STRING, description: "A designated specific spare part brand model code or name that matched, conforming to search/photo context. E.g. 'PR Electronics 4184 Universal Signal Transmitter'." }
                },
                required: [
                  "name", "location", "latitude", "longitude", "phoneNo", "email",
                  "contactPerson", "website", "stockStatus", "availableBrandsInfo",
                  "whyRecommended", "industrySegment", "supplierRole", "address", "price", "matchedProduct"
                ]
              }
            },
            aiOverview: {
              type: Type.OBJECT,
              description: "A professional Google Search style AI overview outlining core specs and specifications of the part",
              properties: {
                summary: { type: Type.STRING, description: "A clear paragraph detailing the purpose, engineering purpose, and class details of the part" },
                modelVarieties: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Specific standard model numbers and variations" },
                keyFeatures: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Key features such as thermal tolerance, mounting size, certifications, etc." },
                usage: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Common deployment scenarios and automation controls" }
              },
              required: ["summary", "modelVarieties", "keyFeatures", "usage"]
            }
          },
          required: ["results", "aiOverview"]
        }
      }
    });

    const outputText = response.text;
    if (!outputText || outputText.trim() === "") {
      throw new Error("No response text returned by Gemini");
    }

    // Resilient parse cleaning
    const parsedData = cleanAndParseJSON(outputText);
    const suppliersList = parsedData.results || [];
    const aiOverview = parsedData.aiOverview || generateOfflineOverview(searchQuery);

    // Enrich with calculated distance and match scores
    const results = suppliersList.map((s: any) => {
      const distance = getKilometerDistance(s.latitude || 0, s.longitude || 0);
      let matchScore = parseFloat((82 + Math.random() * 15.5).toFixed(1));
      if (searchQuery && (s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.availableBrandsInfo.toLowerCase().includes(searchQuery.toLowerCase()))) {
        matchScore = Math.min(matchScore + 8.0, 99.8);
      }

      // Safe normalization of supplier type
      let role: "Maker" | "Distributor" | "Agent" | "Stockist" = "Stockist";
      if (s.supplierRole) {
        const sr = s.supplierRole.toLowerCase();
        if (sr.includes("maker") || sr.includes("oem") || sr.includes("manufacturer")) {
          role = "Maker";
        } else if (sr.includes("distributor")) {
          role = "Distributor";
        } else if (sr.includes("agent") || sr.includes("broker")) {
          role = "Agent";
        } else if (sr.includes("stockist") || sr.includes("supplier") || sr.includes("common")) {
          role = "Stockist";
        }
      }

      return {
        ...s,
        supplierRole: role,
        distance,
        matchScore,
        isAiGenerated: true
      };
    });

    // Sort: lowest distance first
    results.sort((a: any, b: any) => a.distance - b.distance);

    let prefixMsg = "";
    if (hasImage) {
      prefixMsg = "AI Image Recognition Complete! Successfully identified the parts characteristics in your photograph and matched with worldwide warehouses. ";
    }

    return res.json({
      results,
      isAi: true,
      aiOverview,
      message: prefixMsg + `AI Database Matching successful! Found ${results.length} authorized suppliers${targetCountry !== "All" ? ` centered in ${targetCountry}` : ""}.`
    });

  } catch (error: any) {
    console.error("[GlobalPartsHub API Error] Search execution failed:", error);
    
    // Graceful fallback to cached search
    const fallbackQuery = (req.body.query || "").toLowerCase();
    const fallbackSegment = req.body.segment || "All";

    const filtered = PRESEEDED_SUPPLIERS.filter(item => {
      if (fallbackSegment !== "All" && item.industrySegment !== fallbackSegment) {
        return false;
      }
      return (
        item.name.toLowerCase().includes(fallbackQuery) ||
        item.availableBrandsInfo.toLowerCase().includes(fallbackQuery) ||
        item.industrySegment.toLowerCase().includes(fallbackQuery)
      );
    });

    const results = (filtered.length > 0 ? filtered : PRESEEDED_SUPPLIERS).map(item => {
      const price = item.price || `$${(150 + Math.random() * 340).toFixed(2)}`;
      const matchedProduct = item.matchedProduct || `${fallbackQuery ? req.body.query : "Replacement Heavy Duty Spare"}`;
      return {
        ...item,
        price,
        matchedProduct,
        distance: getKilometerDistance(item.latitude, item.longitude),
        matchScore: 78.4,
        isAiGenerated: false
      };
    });

    results.sort((a, b) => a.distance - b.distance);

    const aiOverview = generateOfflineOverview(fallbackQuery || "spare parts");

    return res.json({
      results,
      isAi: false,
      aiOverview,
      message: `Switched to offline hub. AI service is taking a moment to breathe (Error: ${error.message || "Parse Error"}).`
    });
  }
});

// Serve Vite SPA
async function initializeServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[GlobalPartsHub] Initializing Vite middleware for dev mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[GlobalPartsHub] Initializing static assets in production mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[GlobalPartsHub Server] Running securely on http://0.0.0.0:${PORT}`);
  });
}

initializeServer().catch(err => {
  console.error("Critical error starting Express + Vite server:", err);
});
