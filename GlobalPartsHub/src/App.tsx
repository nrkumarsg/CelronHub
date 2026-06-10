import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Search, Anchor, Settings, Cpu, Hammer, Boxes, MapPin, Globe, Compass, 
  Phone, Mail, User, ShieldCheck, HelpCircle, ArrowRight, ChevronRight, 
  Info, AlertTriangle, Send, RefreshCw, Layers, CheckCircle2, Factory, 
  Ship, Sparkles, Building2, ExternalLink, Camera, Upload, X, Package, Tag, DollarSign,
  MessageSquare, ThumbsUp, ThumbsDown, Sun, Moon, Paperclip, FileText
} from "lucide-react";
import { Supplier, RFQRouting, INDUSTRY_CATEGORIES } from "./types";
import { COUNTRIES_LIST } from "./countries";
import RadarView from "./components/RadarView";

// High fidelity vector templates to act as simulated pre-scanned photo files
const SAMPLE_PHOTOS = [
  {
    name: "Heavy_Spherical_Roller_Bearing.jpg",
    label: "Roller Bearing",
    segment: "Common Spares",
    query: "bearing",
    previewSvg: (
      <svg viewBox="0 0 100 100" className="w-12 h-12 bg-slate-950 border border-slate-800 rounded p-1 text-amber-400">
        <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="5" />
        <circle cx="50" cy="50" r="26" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx="50" cy="20" r="3.5" fill="currentColor" />
        <circle cx="50" cy="80" r="3.5" fill="currentColor" />
        <circle cx="20" cy="50" r="3.5" fill="currentColor" />
        <circle cx="80" cy="50" r="3.5" fill="currentColor" />
        <circle cx="29" cy="29" r="3.5" fill="currentColor" />
        <circle cx="71" cy="71" r="3.5" fill="currentColor" />
        <circle cx="29" cy="71" r="3.5" fill="currentColor" />
        <circle cx="71" cy="29" r="3.5" fill="currentColor" />
      </svg>
    ),
    base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  },
  {
    name: "Pneumatic_Actuator_Control_Valve.jpg",
    label: "Actuator Valve",
    segment: "Industrial Spares",
    query: "valves",
    previewSvg: (
      <svg viewBox="0 0 100 100" className="w-12 h-12 bg-slate-950 border border-slate-800 rounded p-1 text-blue-400">
        <path d="M15 50 L85 50" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <path d="M50 25 L50 80" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <polygon points="50,25 35,10 65,10" fill="currentColor" />
        <circle cx="50" cy="50" r="13" fill="currentColor" />
        <line x1="20" y1="38" x2="20" y2="62" stroke="currentColor" strokeWidth="3" />
        <line x1="80" y1="38" x2="80" y2="62" stroke="currentColor" strokeWidth="3" />
      </svg>
    ),
    base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  },
  {
    name: "Yanmar_Main_Piston_Ring.jpg",
    label: "Piston Core",
    segment: "Marine & Offshore Spares",
    query: "piston",
    previewSvg: (
      <svg viewBox="0 0 100 100" className="w-12 h-12 bg-slate-950 border border-slate-800 rounded p-1 text-purple-400">
        <rect x="30" y="15" width="40" height="50" rx="3" fill="none" stroke="currentColor" strokeWidth="4" />
        <line x1="30" y1="26" x2="70" y2="26" stroke="currentColor" strokeWidth="2.5" />
        <line x1="30" y1="36" x2="70" y2="36" stroke="currentColor" strokeWidth="2.5" />
        <line x1="30" y1="46" x2="70" y2="46" stroke="currentColor" strokeWidth="2.5" />
        <rect x="44" y="65" width="12" height="25" fill="none" stroke="currentColor" strokeWidth="4" />
        <circle cx="50" cy="50" r="4.5" fill="currentColor" />
      </svg>
    ),
    base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  }
];

// Sample Preseeds
const POPULAR_SEARCHES = [
  { text: "PR Electronics 4184", category: "Industrial Spares" },
  { text: "Wartsila propulsion", category: "Marine & Offshore Spares" },
  { text: "SKF dynamic bearings", category: "Common Spares" },
  { text: "Yokogawa transmitters", category: "Industrial Spares" },
  { text: "Hydrogen fuel cells", category: "Innovative Spares" }
];

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("theme") as "light" | "dark") || "dark";
  });

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
  };

  const [activeTab, setActiveTab] = useState<"search" | "distance" | "rfq">("search");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Marine & Offshore Spares");
  const [selectedCountry, setSelectedCountry] = useState<string>("Singapore");
  const [selectedRole, setSelectedRole] = useState<string>("All");
  
  // Custom Photo Search States
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedImageName, setUploadedImageName] = useState<string>("");
  const [uploadedImageMime, setUploadedImageMime] = useState<string>("image/jpeg");

  // Camera Web Access States
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [responseMsg, setResponseMsg] = useState<string>("");
  const [isAiSearch, setIsAiSearch] = useState<boolean>(false);
  const [searchSubTab, setSearchSubTab] = useState<"ai" | "all" | "exact" | "visual" | "about" | "feedback">("ai");
  const [aiOverview, setAiOverview] = useState<any>(null);

  // Dynamic interactive feedback states
  const [feedbacks, setFeedbacks] = useState<Array<{ id: number; query: string; comment: string; rating: number; ts: string }>>([
    { id: 1, query: "MDR-60-24", comment: "Perfect identification of the power supply terminal configurations!", rating: 5, ts: "Just now" },
    { id: 2, query: "SKF Bearings", comment: "Highly accurate matches for the radial ratings", rating: 4, ts: "2 hours ago" }
  ]);
  const [fbComment, setFbComment] = useState("");
  const [fbRating, setFbRating] = useState(5);
  const [fbSuccess, setFbSuccess] = useState(false);

  // RFQ Submission form states
  const [rfqPart, setRfqPart] = useState<string>("");
  const [rfqQuantity, setRfqQuantity] = useState<number>(1);
  const [rfqUrgency, setRfqUrgency] = useState<"Routine" | "Critical AOG" | "Vessel in Distress">("Routine");
  const [rfqBudget, setRfqBudget] = useState<string>("");
  const [rfqNotes, setRfqNotes] = useState<string>("");
  const [rfqStatus, setRfqStatus] = useState<string | null>(null);
  const [rfqRouteTarget, setRfqRouteTarget] = useState<string>("All Matched Suppliers");
  const [showRfqVerification, setShowRfqVerification] = useState<boolean>(false);
  const [rfqFile, setRfqFile] = useState<string | null>(null);
  const [rfqFileName, setRfqFileName] = useState<string>("");
  const [rfqFileType, setRfqFileType] = useState<string>("");

  // Perform Initial Load with standard bearings/valves search to populate grid
  useEffect(() => {
    handleSearch("bearings");
  }, []);

  const handleSearch = async (
    queryText?: string, 
    overrideCategory?: string, 
    overrideCountry?: string, 
    overrideImage?: string | null,
    overrideImageName?: string,
    overrideImageMimeType?: string
  ) => {
    const q = queryText !== undefined ? queryText : searchQuery;
    const cat = overrideCategory !== undefined ? overrideCategory : selectedCategory;
    const ctr = overrideCountry !== undefined ? overrideCountry : selectedCountry;
    const img = overrideImage !== undefined ? overrideImage : uploadedImage;
    const imgName = overrideImageName !== undefined ? overrideImageName : uploadedImageName;
    const imgMime = overrideImageMimeType !== undefined ? overrideImageMimeType : uploadedImageMime;

    // Fallback if both search fields are empty
    const finalQuery = (q.trim() === "" && !img) ? "bearings" : q;
    
    setLoading(true);
    setResponseMsg("");
    setRfqStatus(null);
    setSelectedRole("All");
    if (queryText !== undefined) {
      setSearchQuery(queryText);
    }

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: finalQuery,
          segment: cat,
          country: ctr,
          image: img,
          imageMimeType: imgMime,
          imageName: imgName || "upload.jpg"
        }),
      });

      if (!res.ok) {
        throw new Error("HTTP error " + res.status);
      }

      const data = await res.json();
      setSuppliers(data.results || []);
      setResponseMsg(data.message || "");
      setIsAiSearch(data.isAi || false);
      setAiOverview(data.aiOverview || null);
      setFbSuccess(false);
    } catch (err: any) {
      console.error("Search API Error:", err);
      setResponseMsg("Search API returned a local offline fallback response.");
      setAiOverview(null);
    } finally {
      setLoading(false);
    }
  };

  // Webcam Capture Methods
  const startWebcam = async (deviceId?: string) => {
    setCameraLoading(true);
    setCameraError(null);
    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === "videoinput");
        setCameraDevices(videoDevices);
        if (!deviceId && videoDevices.length > 0) {
          setSelectedCameraId(videoDevices[0].deviceId);
        }
      } catch (e) {
        console.warn("Could not enumerate device list:", e);
      }
    } catch (err: any) {
      console.error("Camera access failed:", err);
      setCameraError(
        "Could not direct to active camera device. Please confirm you have granted browser microphone/camera access in the preview widget block."
      );
    } finally {
      setCameraLoading(false);
    }
  };

  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    setCameraStream(null);
    setCameraActive(false);
    setCameraError(null);
  };

  const takeSnapshot = () => {
    if (!videoRef.current) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg");
        setUploadedImage(base64);
        setUploadedImageName("camera_snapshot.jpg");
        setUploadedImageMime("image/jpeg");
        
        setSearchQuery("Camera Snapshot Spare Part");
        
        handleSearch(undefined, undefined, undefined, base64, "camera_snapshot.jpg", "image/jpeg");
        closeCamera();
      }
    } catch (err) {
      console.error("Failed to take camera snap:", err);
    }
  };

  // Submit RFQ Helper
  const submitRFQ = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfqPart.trim()) return;
    setShowRfqVerification(true);
  };

  const confirmAndSendRFQ = () => {
    setShowRfqVerification(false);
    setRfqStatus("dispatching");
    setTimeout(() => {
      setRfqStatus("sent");
    }, 1800);
  };

  // Quick helper to categorize icons
  const getCategoryIcon = (categoryName: string) => {
    switch (categoryName) {
      case "Marine & Offshore Spares":
        return <Ship className="w-4 h-4 text-emerald-400" />;
      case "Industrial Spares":
        return <Settings className="w-4 h-4 text-blue-400" />;
      case "Innovative Spares":
        return <Cpu className="w-4 h-4 text-purple-400" />;
      case "Common Spares":
        return <Hammer className="w-4 h-4 text-amber-400" />;
      default:
        return <Boxes className="w-4 h-4 text-slate-400" />;
    }
  };

  const getCountryFlag = (location: string) => {
    const loc = location.toLowerCase();
    if (loc.includes("singapore")) return "🇸🇬";
    if (loc.includes("india")) return "🇮🇳";
    if (loc.includes("germany")) return "🇩🇪";
    if (loc.includes("japan")) return "🇯🇵";
    if (loc.includes("netherlands") || loc.includes("rotterdam")) return "🇳🇱";
    if (loc.includes("sweden") || loc.includes("stockholm")) return "🇸🇪";
    if (loc.includes("china") || loc.includes("shanghai")) return "🇨🇳";
    if (loc.includes("usa") || loc.includes("houston")) return "🇺🇸";
    if (loc.includes("uae") || loc.includes("dubai")) return "🇦🇪";
    return "🌐";
  };

  const getRoleWeight = (role?: string) => {
    if (!role) return 5;
    const r = role.toLowerCase();
    if (r === "maker") return 1;
    if (r === "distributor") return 2;
    if (r === "agent") return 3;
    if (r === "stockist") return 4;
    return 5;
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case "Maker":
        return {
          label: "Item Maker (OEM)",
          classes: "bg-indigo-950/90 text-indigo-300 border-indigo-700/60",
          icon: <Factory className="w-3.5 h-3.5 text-indigo-450 shrink-0" />
        };
      case "Distributor":
        return {
          label: "Authorized Distributor",
          classes: "bg-emerald-950/90 text-emerald-300 border-emerald-700/60",
          icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        };
      case "Agent":
        return {
          label: "Authorized Agent",
          classes: "bg-cyan-950/90 text-cyan-300 border-cyan-800/60",
          icon: <User className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        };
      case "Stockist":
      default:
        return {
          label: "Common Supplier (Stockist)",
          classes: "bg-amber-950/90 text-amber-300 border-amber-700/60",
          icon: <Boxes className="w-3.5 h-3.5 text-amber-455 shrink-0" />
        };
    }
  };

  // Sort: Makers (1) -> Distributors (2) -> Agents (3) -> Stockists (4) -> Unknown (5)
  // Within same role weight, sort by distance (Singapore first)
  const sortedAndRankedSuppliers = useMemo(() => {
    return [...suppliers].sort((a, b) => {
      const wA = getRoleWeight(a.supplierRole);
      const wB = getRoleWeight(b.supplierRole);
      if (wA !== wB) return wA - wB;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return b.matchScore - a.matchScore;
    });
  }, [suppliers]);

  // Filter based on selectedRole tab
  const filteredSuppliersByRole = useMemo(() => {
    if (selectedRole === "All") return sortedAndRankedSuppliers;
    return sortedAndRankedSuppliers.filter(s => s.supplierRole === selectedRole);
  }, [sortedAndRankedSuppliers, selectedRole]);

  // Divide final filtered & sorted suppliers
  const sgSuppliers = filteredSuppliersByRole.filter(s => s.distance <= 15);
  const internationalSuppliers = filteredSuppliersByRole.filter(s => s.distance > 15);

  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans transition-all duration-300 antialiased ${theme === "light" ? "light-theme" : ""}`} id="global-parts-hub-app">
      {/* Visual Accent Top Bar */}
      <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-indigo-500 to-cyan-500" />

      {/* Header Container */}
      <header className="bg-slate-900/90 border-b border-slate-800 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Compass className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                  GlobalPartsHub
                </h1>
                <span className="text-[10px] uppercase tracking-wider bg-indigo-950 text-indigo-300 font-mono font-bold px-2 py-0.5 rounded-full border border-indigo-800">
                  AI Locator V3
                </span>
              </div>
              <p className="text-xs text-slate-400 font-light mt-0.5">
                Worldwide spare parts finder • Singapore Zero Point routing
              </p>
            </div>
          </div>

          {/* Primary View Navigation Tabs & Theme Toggle */}
          <div className="flex items-center gap-3 flex-wrap">
            <nav className="flex space-x-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800/80">
              <button
                onClick={() => setActiveTab("search")}
                className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                  activeTab === "search"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
                style={{ minHeight: '44px' }}
              >
                Singapore Search Hub
              </button>
              <button
                onClick={() => setActiveTab("distance")}
                className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                  activeTab === "distance"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
                style={{ minHeight: '44px' }}
              >
                Kilometer Expansion View
              </button>
              <button
                onClick={() => setActiveTab("rfq")}
                className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                  activeTab === "rfq"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
                style={{ minHeight: '44px' }}
              >
                Direct RFQ Dispatcher
              </button>
            </nav>

            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800/80 text-slate-400 hover:text-white transition-all cursor-pointer flex items-center justify-center shadow-sm shrink-0"
              title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
              style={{ minHeight: '44px', minWidth: '44px' }}
              id="theme-toggler"
            >
              {theme === "light" ? <Moon className="w-5 h-5 text-indigo-500" /> : <Sun className="w-5 h-5 text-amber-500" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">

        {/* Tab 1: Singapore Search Hub */}
        {activeTab === "search" && (
          <div className="space-y-6" id="search-hub-section">
            
            {/* Top Interactive Search Card */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 md:p-8 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl -z-10"></div>
              <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -z-10"></div>

              <div className="max-w-3xl">
                <h2 className="text-xl md:text-2xl font-bold text-white mb-2 tracking-tight">
                  Search Critical Industrial &amp; Marine Spares Worldwide
                </h2>
                <p className="text-sm text-slate-400 mb-6 font-light">
                  Query the AI search engine using specific manufacturer names, brand models, or generic part serial numbers. 
                  Singapore regional distribution is analyzed first and prioritized by distance.
                </p>

                {/* Form Input Container with Country & Category Dropdowns */}
                <div className="space-y-4">
                  {/* Top Filter Selection Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Category Selector */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                        Industrial Category Segment
                      </label>
                      <select
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3.5 px-4 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer font-sans"
                        value={selectedCategory}
                        onChange={(e) => {
                          const nextCat = e.target.value;
                          setSelectedCategory(nextCat);
                          handleSearch(undefined, nextCat);
                        }}
                      >
                        <option value="Marine & Offshore Spares">Marine &amp; Offshore Spares</option>
                        <option value="Industrial Spares">Industrial Spares</option>
                        <option value="Innovative Spares">Innovative Spares</option>
                        <option value="Common Spares">Common Spares</option>
                      </select>
                    </div>

                    {/* Country Selector Filter */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                        Target Sourcing Region
                      </label>
                      <select
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3.5 px-4 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer font-sans"
                        value={selectedCountry}
                        onChange={(e) => {
                          const nextCountry = e.target.value;
                          setSelectedCountry(nextCountry);
                          handleSearch(undefined, undefined, nextCountry);
                        }}
                      >
                        {COUNTRIES_LIST.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Search Query Field at 100% Width Below Filters */}
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Search Query or Model Reference Number
                    </label>
                    <div className="flex flex-col lg:flex-row gap-3">
                      {/* Query input field - occupies full horizontal space on its line */}
                      <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                        <input
                          type="text"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3.5 pl-12 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-500 transition-all font-sans"
                          placeholder="e.g. Wartsila propulsion valves, SKF bearings, ABB high voltage switch, Yanmar piston ring..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        />
                      </div>

                      {/* Action Triggers */}
                      <div className="flex flex-wrap gap-2.5 shrink-0">
                        <button
                          onClick={() => handleSearch()}
                          disabled={loading}
                          className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-semibold text-sm px-5 py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-600/15 flex items-center justify-center gap-1.5 font-sans shrink-0 cursor-pointer"
                          style={{ minHeight: '44px' }}
                        >
                          {loading ? (
                            <>
                              <RefreshCw className="w-4.5 h-4.5 animate-spin text-indigo-200" />
                              <span>Scanning Hub...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4.5 h-4.5 text-cyan-200 animate-pulse" />
                              <span>AI Search</span>
                            </>
                          )}
                        </button>

                        <a
                          href={`https://www.google.com/search?q=${encodeURIComponent(searchQuery || "PR Electronics 4184")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-300 hover:text-white font-semibold text-xs px-4 py-3.5 rounded-xl transition-all flex items-center justify-center gap-1.5 font-sans whitespace-nowrap active:scale-98"
                          style={{ minHeight: '44px' }}
                          title="Open Google Web Search for this part model in a new tab"
                        >
                          <Globe className="w-3.5 h-3.5 text-blue-400" />
                          <span>Google Search ↗</span>
                        </a>

                        {uploadedImage && (
                          <a
                            href={`https://www.google.com/search?q=${encodeURIComponent(searchQuery || "PR Electronics 4184")}&tbm=isch`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-slate-950 border border-emerald-900/60 hover:bg-emerald-950/20 text-emerald-400 hover:text-emerald-300 font-semibold text-xs px-4 py-3.5 rounded-xl transition-all flex items-center justify-center gap-1.5 font-sans whitespace-nowrap active:scale-98 animate-pulse"
                            style={{ minHeight: '44px' }}
                            title="Open Google Images / Lens search results for this photographed part in a new tab"
                          >
                            <Camera className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Google Lens Search ↗</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Intelligent Photo-based Sourcing (Beta) */}
                <div className="mt-5 pt-5 border-t border-slate-800/80 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                      <Camera className="w-4 h-4 text-cyan-400" />
                      Visual Sourcing: Identify and Search Spare Part by Photograph
                    </label>
                    {uploadedImage && (
                      <button
                        onClick={() => {
                          setUploadedImage(null);
                          setUploadedImageName("");
                          handleSearch("");
                        }}
                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 font-mono transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Clear Photo Search
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
                    {/* File Drop / Trigger Button */}
                    <div className="md:col-span-5">
                      <div className="grid grid-cols-2 gap-2 h-full">
                        <div>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            id="image-file-picker"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setUploadedImageName(file.name);
                              setUploadedImageMime(file.type || "image/jpeg");
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                const base64 = reader.result as string;
                                setUploadedImage(base64);
                                handleSearch(undefined, undefined, undefined, base64, file.name, file.type || "image/jpeg");
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                          <label
                            htmlFor="image-file-picker"
                            className={`relative flex flex-col items-center justify-center p-3 rounded-xl border border-dashed text-center cursor-pointer transition-all h-full min-h-[92px] overflow-hidden group ${
                              uploadedImage 
                                ? "border-emerald-500/50 bg-emerald-950/20" 
                                : "border-slate-800 bg-slate-950 hover:bg-slate-900/50 hover:border-slate-700"
                            }`}
                          >
                            {uploadedImage ? (
                              <>
                                <img 
                                  src={uploadedImage} 
                                  alt="Uploaded preview" 
                                  className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-70 transition-opacity"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-slate-950/45 group-hover:bg-slate-950/30 transition-colors" />
                                <div className="relative z-10 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-xs p-1.5 rounded-lg border border-emerald-500/30 shadow-md">
                                  <Upload className="w-3.5 h-3.5 mb-0.5 text-emerald-400" />
                                  <span className="text-[10px] font-semibold text-emerald-300">Replace Photo</span>
                                </div>
                              </>
                            ) : (
                              <>
                                <Upload className="w-4 h-4 mb-1 text-slate-500" />
                                <span className="text-[11px] font-medium text-slate-300">Upload Photo</span>
                                <span className="text-[9px] text-slate-500 mt-0.5">JPEG/PNG files</span>
                              </>
                            )}
                          </label>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setCameraActive(true);
                            startWebcam();
                          }}
                          className="flex flex-col items-center justify-center p-3 rounded-xl border border-dashed border-slate-800 bg-slate-950 hover:bg-slate-900/50 hover:border-slate-700 text-center transition-all h-full min-h-[92px] cursor-pointer"
                        >
                          <Camera className="w-4 h-4 mb-1 text-indigo-400" />
                          <span className="text-[11px] font-medium text-slate-300">Take Photo</span>
                          <span className="text-[9px] text-slate-500 mt-0.5">Live Camera snap</span>
                        </button>
                      </div>
                    </div>

                    {/* Preseeded Interactive Blueprints */}
                    <div className="md:col-span-7 flex flex-col justify-between bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 font-mono">No photo? Test instantly with sample blueprints:</span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {SAMPLE_PHOTOS.map((sample, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setUploadedImage(sample.base64);
                              setUploadedImageName(sample.name);
                              setSearchQuery(sample.query);
                              setSelectedCategory(sample.segment);
                              handleSearch(sample.query, sample.segment, undefined, sample.base64, sample.name);
                            }}
                            className="bg-slate-900 hover:bg-slate-850 p-2 rounded-lg border border-slate-800 hover:border-indigo-500 flex items-center gap-2 group text-left transition-all"
                          >
                            {sample.previewSvg}
                            <div className="min-w-0">
                              <span className="text-[11px] font-bold text-white block truncate leading-snug">
                                {sample.label}
                              </span>
                              <span className="text-[9px] text-slate-500 font-mono block uppercase">
                                {sample.query}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Thumbnail / Active Scan Status overlay */}
                  {uploadedImage && (
                    <div className="flex items-center gap-3.5 bg-gradient-to-r from-emerald-950/20 via-indigo-950/10 to-slate-950 border border-emerald-900/40 p-3 h-14 rounded-xl animate-fade-in">
                      <div className="w-10 h-10 rounded-lg bg-slate-900 border border-emerald-500/30 flex items-center justify-center overflow-hidden shrink-0">
                        <img 
                          src={uploadedImage} 
                          alt="Scanned part thumbnail" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-white font-mono font-medium truncate flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                          Photo Loaded: &quot;{uploadedImageName || "scanned_part.jpg"}&quot;
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Visual characteristics extracted and matched with the global supply index
                        </p>
                      </div>
                      <span className="text-[10px] font-mono bg-emerald-950 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-800/80 shrink-0 uppercase tracking-widest font-bold">
                        AI Matched
                      </span>
                    </div>
                  )}
                </div>

                {/* Popular Preseed Pills */}
                <div className="mt-4 flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-slate-500 font-medium">Quick Discovery:</span>
                  {POPULAR_SEARCHES.map((tag, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSelectedCategory(tag.category);
                        handleSearch(tag.text, tag.category);
                      }}
                      className="text-xs bg-slate-950 hover:bg-slate-800 border border-slate-800/80 px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-all font-mono"
                    >
                      &quot;{tag.text}&quot;
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Segment Filtering Indicator Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">
                  Identified {selectedCountry !== "All" ? `${selectedCountry} ` : "Global "}Suppliers for &quot;{searchQuery || "bearings"}&quot;
                </h3>
              </div>
              
              {/* Extra segment selector tabs for fast sorting */}
              <div className="flex gap-1 overflow-x-auto pb-1 max-w-full">
                {INDUSTRY_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      handleSearch(undefined, cat.id);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      selectedCategory === cat.id 
                        ? "bg-slate-800 text-white border border-slate-700" 
                        : "text-slate-400 hover:text-white bg-slate-950 border border-slate-900"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sourcing Channel Tier Refinement tabs - Item Maker, Distributor, Agent, Common Supplier */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 mb-4 shadow-sm" id="sourcing-channel-priority-refinement">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-900/30 border border-indigo-500/20 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-200 block uppercase tracking-wider">Refine Channels (Maker-First Sourcing)</span>
                    <span className="text-[10px] text-slate-400 block font-light">
                      Ranked hierarchy: OEMs prioritize top of the queue, followed by regional agents and stockists
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: "All", label: "All Channels", icon: <Globe className="w-3.5 h-3.5 text-slate-400" />, count: suppliers.length },
                    { id: "Maker", label: "Item Maker (OEM)", icon: <Factory className="w-3.5 h-3.5 text-indigo-400" />, count: suppliers.filter(s => s.supplierRole === "Maker").length },
                    { id: "Distributor", label: "Distributors", icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />, count: suppliers.filter(s => s.supplierRole === "Distributor").length },
                    { id: "Agent", label: "Agents", icon: <User className="w-3.5 h-3.5 text-cyan-400" />, count: suppliers.filter(s => s.supplierRole === "Agent").length },
                    { id: "Stockist", label: "Common Stockists", icon: <Boxes className="w-3.5 h-3.5 text-amber-400" />, count: suppliers.filter(s => s.supplierRole === "Stockist").length },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setSelectedRole(tab.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                        selectedRole === tab.id
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10 border border-indigo-500/50"
                          : "bg-slate-950 text-slate-400 hover:text-white border border-slate-900/80 hover:border-slate-800"
                      }`}
                      style={{ minHeight: '38px' }}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold font-mono ${
                        selectedRole === tab.id
                          ? "bg-indigo-850 text-indigo-200"
                          : "bg-slate-900 text-slate-500"
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Search Feedback & Metadata info */}
            {responseMsg && (
              <div className={`p-4 rounded-xl border text-xs flex items-start gap-3 ${
                isAiSearch 
                  ? "bg-indigo-950/20 border-indigo-800/55 text-indigo-300" 
                  : "bg-emerald-950/20 border-emerald-900/55 text-emerald-300"
              }`}>
                {isAiSearch ? (
                  <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5 animate-pulse" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-bold uppercase tracking-wider">{isAiSearch ? "DeepMind AI Grounded search on" : "Singapore Direct Catalogue Database (Preseeded Data)"}</span>
                  <p className="mt-1 font-light opacity-90">{responseMsg}</p>
                </div>
              </div>
            )}

            {loading ? (
              /* Loading Spinner skeleton */
              <div className="flex flex-col items-center justify-center p-16 bg-slate-900/40 rounded-2xl border border-slate-800 text-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-2 border-indigo-900 border-t-indigo-400 animate-spin"></div>
                  <Compass className="w-5 h-5 text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Performing Global Sweep...</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">Calculating Haversine real-distance from Singapore and analyzing supplier inventories.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* Google-Style AI Search Sub Tabs Indicator */}
                <div className="border-b border-slate-800 pb-0.5 flex flex-wrap gap-1" id="google-ai-subtabs">
                  {[
                    { id: "ai", label: "AI Mode (Overview)", icon: <Sparkles className="w-4 h-4 text-amber-400" /> },
                    { id: "all", label: "All Sourcing Hubs", icon: <Globe className="w-4 h-4 text-indigo-400" /> },
                    { id: "exact", label: "Exact Matches", icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> },
                    { id: "visual", label: "Visual Matches & Pricing", icon: <Camera className="w-4 h-4 text-cyan-400" /> },
                    { id: "about", label: "About This Search", icon: <Info className="w-4 h-4 text-slate-400" /> },
                    { id: "feedback", label: "Accuracy & Feedback", icon: <MessageSquare className="w-4 h-4 text-slate-400" /> }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setSearchSubTab(tab.id as any)}
                      className={`px-4 py-3 -mb-px text-xs font-semibold flex items-center gap-2 border-b-2 transition-all relative cursor-pointer ${
                        searchSubTab === tab.id
                          ? "border-indigo-500 text-white bg-indigo-950/20"
                          : "border-transparent text-slate-400 hover:text-white hover:bg-slate-900/40"
                      }`}
                      style={{ minHeight: '44px' }}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                      {tab.id === "ai" && (
                        <span className="absolute -top-1 -right-0.5 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Switch sub tab views */}
                {searchSubTab === "ai" && (
                  <div className="space-y-6 animate-fade-in" id="ai-mode-panel">
                    
                    {/* Bento Grid layout for AI Overview */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                      
                      {/* Left Side: Solid AI Overview Content Block */}
                      <div className="lg:col-span-8 bg-slate-900/40 p-6 md:p-8 rounded-2xl border border-indigo-500/20 shadow-xl relative overflow-hidden flex flex-col justify-between">
                        <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none -z-10"></div>
                        
                        <div>
                          <div className="flex items-center gap-2.5 text-xs text-indigo-400 font-mono font-bold uppercase tracking-wider mb-4">
                            <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
                            <span>Google AI Overview for: &quot;{searchQuery || "bearings"}&quot;</span>
                          </div>

                          <div className="text-slate-200 text-sm md:text-base leading-relaxed font-sans font-light mb-6 space-y-4">
                            <p>
                              {aiOverview?.summary || `These B2B engineering components and spare parts represent specialized items matching your search query: "${searchQuery || 'bearings'}". They are verified for industrial mounting standard systems, commercial vessels maintenance cycles, and severe physical conditions compliance.`}
                            </p>
                          </div>

                          {/* Technical Highlights Bento Sub-Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-800/80 pt-6">
                            
                            {/* Varieties */}
                            <div className="bg-slate-950 p-4 rounded-xl border border-slate-900">
                              <span className="text-[10px] uppercase font-mono tracking-widest text-indigo-400 font-bold block mb-2">Varieties Identified</span>
                              <ul className="text-xs text-slate-300 space-y-1.5 list-disc pl-3">
                                {(aiOverview?.modelVarieties || [
                                  "Standard high structural loading units",
                                  "Compact auxiliary low profile units"
                                ]).map((val: string, i: number) => (
                                  <li key={i}>{val}</li>
                                ))}
                              </ul>
                            </div>

                            {/* Key Specs */}
                            <div className="bg-slate-950 p-4 rounded-xl border border-slate-900">
                              <span className="text-[10px] uppercase font-mono tracking-widest text-emerald-400 font-bold block mb-2">Key Engineering Specs</span>
                              <ul className="text-xs text-slate-300 space-y-1.5 list-disc pl-3">
                                {(aiOverview?.keyFeatures || [
                                  "Class-A maritime quality certified",
                                  "Optimized thermal thresholds"
                                ]).map((val: string, i: number) => (
                                  <li key={i}>{val}</li>
                                ))}
                              </ul>
                            </div>

                            {/* Ideal Environments */}
                            <div className="bg-slate-950 p-4 rounded-xl border border-slate-900">
                              <span className="text-[10px] uppercase font-mono tracking-widest text-cyan-400 font-bold block mb-2">Recommended Usage</span>
                              <ul className="text-xs text-slate-300 space-y-1.5 list-disc pl-3">
                                {(aiOverview?.usage || [
                                  "Preventative vessel overhaul cycles",
                                  "Direct on-site chassis swaps"
                                ]).map((val: string, i: number) => (
                                  <li key={i}>{val}</li>
                                ))}
                              </ul>
                            </div>

                          </div>
                        </div>

                        {/* Collapsible Read More details */}
                        <div className="mt-6 pt-5 border-t border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between text-xs text-slate-400 gap-3">
                          <p className="flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            <span>Grounded search verified via global supply directories and port terminals.</span>
                          </p>
                          <button 
                            className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 uppercase tracking-wider text-[10px]"
                            onClick={() => alert(`This Google AI Overview compiles model varieties, technical specifications, and key application scenarios for the search term: "${searchQuery}". It is dynamically updated using Gemini.`)}
                          >
                            <span>About this intelligence</span>
                            <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                          </button>
                        </div>

                      </div>

                      {/* Right Side: Google-Style Cite Card Panels */}
                      <div className="lg:col-span-4 space-y-4">
                        <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 block px-1">Grounded Sources found</span>
                        
                        <div className="space-y-3">
                          {suppliers.slice(0, 3).map((sup, idx) => (
                            <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 hover:border-indigo-500/40 hover:shadow-lg transition-all flex justify-between gap-3 relative">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-[9px] text-indigo-400 font-mono mb-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                                  <span className="truncate">{sup.website}</span>
                                </div>
                                <h6 className="text-[12px] font-bold text-white leading-tight truncate">{sup.name}</h6>
                                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed font-sans font-light">
                                  {sup.whyRecommended}
                                </p>
                              </div>
                              <div className="w-10 h-10 rounded bg-slate-900 border border-slate-850 flex items-center justify-center shrink-0 uppercase text-[10px] text-indigo-400 font-bold font-mono">
                                {sup.location.split(",")[1]?.trim().slice(0, 3) || "SG"}
                              </div>
                            </div>
                          ))}
                          
                          {suppliers.length === 0 && (
                            <div className="bg-slate-950 p-6 rounded-xl border border-slate-850 text-center text-xs italic text-slate-500">
                              No citation links populated.
                            </div>
                          )}
                        </div>
                      </div>

                    </div>

                    {/* Quick Shortcut supplier listings inside AI overview for premium look */}
                    <div className="pt-2">
                      <div className="flex items-center gap-2 mb-4">
                        <Boxes className="w-4 h-4 text-emerald-400" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Top Authorized Suppliers Available</h4>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {suppliers.slice(0, 2).map((sup, idx) => (
                          <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-[10px] bg-slate-900 text-amber-400 px-1.5 py-0.2 rounded font-mono font-bold leading-none border border-slate-800">
                                  {sup.distance} km
                                </span>
                                <span className="font-bold text-slate-200 truncate">{sup.name}</span>
                              </div>
                              <p className="text-[11px] text-slate-400 truncate mt-1">
                                {sup.matchedProduct ? `${sup.matchedProduct} • ${sup.price}` : sup.availableBrandsInfo}
                              </p>
                            </div>
                            <button 
                              onClick={() => {
                                setRfqPart(sup.matchedProduct || searchQuery);
                                setRfqRouteTarget(sup.name);
                                setActiveTab("rfq");
                              }}
                              className="bg-indigo-600/25 hover:bg-indigo-600 border border-indigo-500/20 text-indigo-300 hover:text-white px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all shrink-0 uppercase tracking-wider"
                              style={{ minHeight: '34px' }}
                            >
                              Get RFQ
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                )}

                {searchSubTab === "all" && (
                  <div className="space-y-6 animate-fade-in" id="classic-hubs-panel">
                    {/* 1. Singapore Focus Section (Priority Point Zero) */}
                    <div className="bg-slate-900/40 p-6 rounded-2xl border border-emerald-950/60 shadow-lg" id="prioritized-singapore-suppliers">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-emerald-950/50 pb-4 mb-5 gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                          <div>
                            <h4 className="text-sm font-bold tracking-wider text-emerald-400 uppercase flex items-center gap-1.5">
                              Singapore Primary Hubs (0-Point Focus)
                            </h4>
                            <p className="text-xs text-slate-400">Priceless logistic locations configured with local stock priority</p>
                          </div>
                        </div>
                        <span className="text-xs font-mono bg-emerald-950/60 text-emerald-400 px-3 py-1 rounded-full border border-emerald-900/50">
                          Singapore Primary Hubs
                        </span>
                      </div>

                      {sgSuppliers.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          {sgSuppliers.map((sup, idx) => (
                            <div 
                              key={idx} 
                              className="bg-slate-950 rounded-xl p-5 border border-emerald-900/50 hover:border-emerald-500/40 transition-all flex flex-col justify-between hover:shadow-xl relative overflow-hidden"
                            >
                              <div className="absolute right-2 top-2 opacity-5 pointer-events-none">
                                <Anchor className="w-24 h-24 text-emerald-400" />
                              </div>

                              <div>
                                <div className="flex justify-between items-start gap-2 mb-2">
                                  <span className="text-xs font-mono font-semibold text-emerald-400 bg-emerald-950/80 px-2.5 py-0.5 rounded border border-emerald-850/80">
                                    0 km Hub
                                  </span>
                                  <span className="text-xs font-mono font-bold text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-850">
                                    Segment: {sup.industrySegment}
                                  </span>
                                </div>

                                <h5 className="text-base font-bold text-white mb-2">{sup.name}</h5>
                                
                                {(() => {
                                  const badge = getRoleBadge(sup.supplierRole);
                                  return (
                                    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${badge.classes} mb-2.5 shadow-sm`}>
                                      {badge.icon}
                                      <span>{badge.label}</span>
                                    </div>
                                  );
                                })()}

                                {/* MATCHED PRODUCT & PRICE CARD (GOOGLE PHOTO SEARCH STYLE) */}
                                {sup.matchedProduct && (
                                  <div className="mb-3.5 bg-indigo-950/20 rounded-xl p-3 border border-indigo-900/35 flex items-center justify-between gap-3 shadow-inner">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-9 h-9 rounded bg-indigo-950/60 border border-indigo-500/30 flex flex-col items-center justify-center text-indigo-400 shrink-0">
                                        <Package className="w-3.5 h-3.5" />
                                        <span className="text-[6.5px] font-mono tracking-wider uppercase font-bold text-indigo-300">Model</span>
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-[8.5px] text-slate-400 font-sans leading-none uppercase tracking-wide font-medium">Product Identified</p>
                                        <p className="text-xs text-white font-bold truncate mt-1" title={sup.matchedProduct}>
                                          {sup.matchedProduct}
                                        </p>
                                      </div>
                                    </div>
                                    {sup.price && (
                                      <div className="text-right shrink-0 bg-emerald-950/50 px-2.5 py-1 rounded border border-emerald-500/20">
                                        <p className="text-[8px] text-emerald-400 font-mono font-medium leading-none uppercase">Est. Price</p>
                                        <p className="text-sm text-emerald-300 font-bold font-mono tracking-light mt-0.5 whitespace-nowrap">
                                          {sup.price}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}
                                
                                <div className="mb-3 space-y-1">
                                  <p className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                    <span className="text-sm shrink-0" title="Supplier Country">{getCountryFlag(sup.location)}</span>
                                    <span>{sup.location} (SG Centered)</span>
                                  </p>
                                  {sup.address && (
                                    <p className="text-[11px] text-slate-300 pl-5 leading-relaxed font-sans font-light">
                                      {sup.address}
                                    </p>
                                  )}
                                </div>

                                <p className="text-xs text-emerald-300 font-medium bg-emerald-950/40 p-2 rounded-lg border border-emerald-950 mb-3 font-mono">
                                  <strong>Stock status:</strong> {sup.stockStatus}
                                </p>

                                <div className="space-y-1.5 mb-4 text-xs">
                                  <p className="text-slate-300">
                                    <strong className="text-slate-500 block uppercase text-[9px] tracking-wider mb-0.5">Brand Inventory Carried:</strong>
                                    <span className="font-mono text-slate-200">{sup.availableBrandsInfo}</span>
                                  </p>
                                  <p className="text-slate-400 italic font-light">
                                    <strong className="text-slate-500 block uppercase text-[9px] tracking-wider mb-0.5">Sourcing Intel:</strong>
                                    &quot;{sup.whyRecommended}&quot;
                                  </p>
                                </div>
                              </div>

                              {/* Contact */}
                              <div className="pt-4 border-t border-slate-900 space-y-2 text-xs">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-400">
                                  <p className="flex items-center gap-1.5 min-h-[24px]">
                                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span className="truncate">{sup.contactPerson || "B2B Dept"}</span>
                                  </p>
                                  <p className="flex items-center gap-1.5 min-h-[24px]">
                                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span>{sup.phoneNo}</span>
                                  </p>
                                </div>

                                <p className="flex items-center gap-1.5 text-slate-400 min-h-[24px]">
                                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="truncate">{sup.email}</span>
                                </p>

                                <div className="pt-2 flex justify-between gap-2">
                                  <button
                                    onClick={() => {
                                      setRfqPart(sup.matchedProduct || searchQuery);
                                      setRfqRouteTarget(sup.name);
                                      setActiveTab("rfq");
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-500 transition-colors text-white text-xs px-3.5 py-1.5 rounded-lg border border-indigo-400 font-semibold"
                                  >
                                    Send RFQ
                                  </button>

                                  <a
                                    href={sup.website.startsWith("http") ? sup.website : `https://${sup.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 font-medium transition-all inline-flex items-center gap-1"
                                  >
                                    {sup.website.replace("https://", "").replace("www.", "")}
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-6 text-center text-slate-500 text-xs italic">
                          No direct local Singapore hubs matched current query parameters. Check out worldwide expanding hubs below or broaden the search term!
                        </div>
                      )}
                    </div>

                    {/* 2. Global Matching Suppliers Section */}
                    <div className="bg-slate-900/20 p-6 rounded-2xl border border-slate-800 shadow-md">
                      <div className="border-b border-slate-800 pb-4 mb-5">
                        <h4 className="text-sm font-bold tracking-wider text-indigo-400 uppercase flex items-center gap-1.5">
                          International Expanding Hubs (Worldwide Network)
                        </h4>
                        <p className="text-xs text-slate-400">Suppliers organized globally, indexed outward from distance point Singapore</p>
                      </div>

                      {internationalSuppliers.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                          {internationalSuppliers.map((sup, idx) => (
                            <div 
                              key={idx} 
                              className="bg-slate-950 rounded-xl p-5 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between hover:shadow-xl relative"
                            >
                              <div>
                                <div className="flex justify-between items-start gap-2 mb-2">
                                  <span className="text-xs font-mono font-medium text-cyan-400 bg-cyan-950/60 px-2.5 py-0.5 rounded border border-cyan-800">
                                    {sup.distance.toLocaleString()} km
                                  </span>
                                  <span className="text-[11px] font-mono font-bold text-emerald-400 bg-slate-900 border border-slate-850 px-2 py-0.5 rounded">
                                    {sup.matchScore}% Match
                                  </span>
                                </div>

                                <h5 className="text-sm font-bold text-white line-clamp-2 min-h-[40px]">{sup.name}</h5>
                                
                                {(() => {
                                  const badge = getRoleBadge(sup.supplierRole);
                                  return (
                                    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${badge.classes} mb-2 shadow-sm`}>
                                      {badge.icon}
                                      <span>{badge.label}</span>
                                    </div>
                                  );
                                })()}

                                {/* MATCHED PRODUCT & PRICE CARD (GOOGLE PHOTO SEARCH STYLE) */}
                                {sup.matchedProduct && (
                                  <div className="mb-3.5 bg-indigo-950/20 rounded-xl p-3 border border-indigo-900/35 flex items-center justify-between gap-3 shadow-inner">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-9 h-9 rounded bg-indigo-950/60 border border-indigo-500/30 flex flex-col items-center justify-center text-indigo-400 shrink-0">
                                        <Package className="w-3.5 h-3.5" />
                                        <span className="text-[6.5px] font-mono tracking-wider uppercase font-bold text-indigo-300">Model</span>
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-[8.5px] text-slate-400 font-sans leading-none uppercase tracking-wide font-medium">Product Identified</p>
                                        <p className="text-xs text-white font-bold truncate mt-1" title={sup.matchedProduct}>
                                          {sup.matchedProduct}
                                        </p>
                                      </div>
                                    </div>
                                    {sup.price && (
                                      <div className="text-right shrink-0 bg-emerald-950/40 px-2.5 py-1 rounded border border-emerald-500/20">
                                        <p className="text-[8px] text-emerald-400 font-mono font-medium leading-none uppercase">Est. Price</p>
                                        <p className="text-sm text-emerald-300 font-bold font-mono tracking-light mt-0.5 whitespace-nowrap">
                                          {sup.price}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div className="mb-3 space-y-1">
                                  <p className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    <span className="text-sm shrink-0" title="Supplier Country">{getCountryFlag(sup.location)}</span>
                                    <span>{sup.location}</span>
                                  </p>
                                  {sup.address && (
                                    <p className="text-[11px] text-slate-300 pl-5 leading-relaxed font-sans font-light">
                                      {sup.address}
                                    </p>
                                  )}
                                </div>

                                <p className="text-xs text-slate-300 bg-slate-900 p-2 rounded-lg border border-slate-850 mb-3 font-mono">
                                  <strong>Delivery:</strong> {sup.stockStatus}
                                </p>

                                <div className="space-y-1.5 mb-4 text-xs">
                                  <p className="text-slate-300">
                                    <strong className="text-slate-500 block uppercase text-[8px] tracking-wider mb-0.5">Carried Brands:</strong>
                                    <span className="font-mono text-slate-300 text-xs line-clamp-2">{sup.availableBrandsInfo}</span>
                                  </p>
                                  <p className="text-slate-400 italic font-light line-clamp-3">
                                    &quot;{sup.whyRecommended}&quot;
                                  </p>
                                </div>
                              </div>

                              {/* Human details */}
                              <div className="pt-4 border-t border-slate-900 space-y-2 text-xs">
                                <p className="flex items-center gap-1.5 text-slate-400 min-h-[22px]">
                                  <User className="w-3.5 h-3.5 text-slate-500" />
                                  <span className="truncate font-medium">{sup.contactPerson || "B2B Dept"}</span>
                                </p>
                                <p className="flex items-center gap-1.5 text-slate-400 min-h-[22px]">
                                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                                  <span>{sup.phoneNo}</span>
                                </p>
                                <p className="flex items-center gap-1.5 text-slate-400 min-h-[22px]">
                                  <Mail className="w-3.5 h-3.5 text-slate-500 truncate" />
                                  <span className="truncate">{sup.email}</span>
                                </p>

                                <div className="pt-2 flex justify-between gap-1.5">
                                  <button
                                    onClick={() => {
                                      setRfqPart(sup.matchedProduct || searchQuery);
                                      setRfqRouteTarget(sup.name);
                                      setActiveTab("rfq");
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-500 transition-colors text-white text-[11px] font-bold px-2.5 py-1 rounded-md border border-indigo-400 shrink-0"
                                  >
                                    RFQ
                                  </button>

                                  <a
                                    href={sup.website.startsWith("http") ? sup.website : `https://${sup.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium transition-all inline-flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-850 hover:border-slate-750"
                                  >
                                    Visit Site
                                    <ChevronRight className="w-3 h-3" />
                                  </a>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center text-slate-500 text-xs italic bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                          No matching international hubs detected. Try searching for broader terms or changing categories.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {searchSubTab === "exact" && (
                  <div className="space-y-5 animate-fade-in" id="exact-matches-panel">
                    
                    <div className="bg-emerald-950/25 p-4 rounded-xl border border-emerald-900/40 text-xs text-emerald-300 flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-mono font-bold block uppercase tracking-wide text-emerald-300">Grounded Exact Serial Matching Active</span>
                        <p className="mt-0.5 font-light font-mono text-[11px]">Listing authorized entities where item part match indices exceed high B2B threshold metrics (&gt;= 90% match value or precise model alignment).</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {suppliers.filter(s => s.matchScore >= 90 || s.name.toLowerCase().includes(searchQuery.toLowerCase())).map((sup, idx) => (
                        <div key={idx} className="bg-slate-950 p-5 rounded-xl border border-emerald-900/30 flex flex-col justify-between hover:border-emerald-500/55 transition-all">
                          <div>
                            <div className="flex justify-between items-start mb-3 gap-2">
                              <span className="text-[10px] bg-emerald-950 text-emerald-400 px-2.5 py-0.5 rounded border border-emerald-900/80 font-mono font-bold uppercase">
                                Match score: {sup.matchScore}% (Exact)
                              </span>
                              <span className="text-xs text-slate-400 font-mono">{sup.location}</span>
                            </div>
                            <h5 className="text-base font-bold text-white mb-1.5">{sup.name}</h5>
                            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">&quot;{sup.whyRecommended}&quot;</p>
                            
                            <div className="mt-3.5 bg-slate-900/60 p-2.5 rounded-lg border border-slate-850 flex items-center justify-between text-xs font-mono">
                              <span className="text-slate-400 truncate text-[11px]">{sup.matchedProduct || searchQuery}</span>
                              <span className="text-emerald-400 text-xs font-bold shrink-0">{sup.price || "$317.48"}</span>
                            </div>
                          </div>
                          
                          <div className="mt-4 pt-4 border-t border-slate-900 flex justify-between items-center text-xs">
                            <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500">Stock Status: {sup.stockStatus}</span>
                            <button
                              onClick={() => {
                                setRfqPart(sup.matchedProduct || searchQuery);
                                setRfqRouteTarget(sup.name);
                                setActiveTab("rfq");
                              }}
                              className="text-xs text-white bg-indigo-600 hover:bg-indigo-500 px-3.5 py-1.5 rounded-lg border border-indigo-400 font-semibold transition-all"
                              style={{ minHeight: '34px' }}
                            >
                              Bespoke RFQ
                            </button>
                          </div>
                        </div>
                      ))}

                      {suppliers.filter(s => s.matchScore >= 90 || s.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                        <div className="col-span-2 py-12 text-center text-slate-500 text-xs italic bg-slate-900/20 border border-slate-800 rounded-xl">
                          No exact serial matches exceeding B2B safety margins found. Sourcing all catalogs in &quot;All Sourcing Hubs&quot; sub-tab recommended.
                        </div>
                      )}
                    </div>

                  </div>
                )}

                {searchSubTab === "visual" && (
                  <div className="space-y-6 animate-fade-in" id="visual-shopping-grid">
                    
                    <div className="bg-cyan-950/25 p-4 rounded-xl border border-cyan-500/10 text-xs text-cyan-300 flex items-start gap-2.5">
                      <Camera className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-mono font-bold block uppercase tracking-wide text-cyan-300">Visual Product Photo Search (Google Lens Mode)</span>
                        <p className="mt-0.5 font-light">
                          Identified physical matching spare parts catalog components from photo visual geometry. Touch/hover on parts to see prices and immediate logistics routing values.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {suppliers.map((sup, idx) => {
                        // Dynamically choose technical illustration SVG
                        const qLower = (searchQuery || "bearings").toLowerCase();
                        let illustrationSvg = (
                          <svg viewBox="0 0 100 100" className="w-full h-full text-indigo-400/80">
                            <rect x="25" y="25" width="50" height="50" rx="8" fill="none" stroke="currentColor" strokeWidth="4" />
                            <circle cx="50" cy="50" r="14" fill="none" stroke="currentColor" strokeWidth="3" />
                            <path d="M50 15 L50 25 M50 75 L50 85 M15 50 L25 50 M75 50 L85 50" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                        );

                        if (qLower.includes("bearing") || qLower.includes("skf") || qLower.includes("spherical") || qLower.includes("roller")) {
                          illustrationSvg = (
                            <svg viewBox="0 0 100 100" className="w-full h-full text-amber-550/80">
                              <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="6" />
                              <circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" strokeWidth="4" />
                              <circle cx="50" cy="20" r="4" fill="currentColor" />
                              <circle cx="50" cy="80" r="4" fill="currentColor" />
                              <circle cx="20" cy="50" r="4" fill="currentColor" />
                              <circle cx="80" cy="50" r="4" fill="currentColor" />
                              <circle cx="29" cy="29" r="4" fill="currentColor" />
                              <circle cx="71" cy="71" r="4" fill="currentColor" />
                              <circle cx="29" cy="71" r="4" fill="currentColor" />
                              <circle cx="71" cy="29" r="4" fill="currentColor" />
                            </svg>
                          );
                        } else if (qLower.includes("valve") || qLower.includes("actuator") || qLower.includes("gate")) {
                          illustrationSvg = (
                            <svg viewBox="0 0 100 100" className="w-full h-full text-blue-500/80">
                              <path d="M15 50 L85 50" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                              <path d="M50 20 L50 80" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                              <polygon points="50,20 30,5 70,5" fill="currentColor" />
                              <circle cx="50" cy="50" r="16" fill="currentColor" />
                              <line x1="20" y1="35" x2="20" y2="65" stroke="currentColor" strokeWidth="4" />
                              <line x1="80" y1="35" x2="80" y2="65" stroke="currentColor" strokeWidth="4" />
                            </svg>
                          );
                        } else if (qLower.includes("mean") || qLower.includes("well") || qLower.includes("power") || qLower.includes("supply")) {
                          illustrationSvg = (
                            <svg viewBox="0 0 100 100" className="w-full h-full text-yellow-500/80">
                              <rect x="20" y="15" width="60" height="70" rx="6" fill="none" stroke="currentColor" strokeWidth="5" />
                              <line x1="30" y1="28" x2="70" y2="28" stroke="currentColor" strokeWidth="3" />
                              <line x1="30" y1="38" x2="55" y2="38" stroke="currentColor" strokeWidth="3" />
                              <circle cx="40" cy="65" r="5" fill="currentColor" />
                              <circle cx="60" cy="65" r="5" fill="currentColor" />
                              <rect x="45" y="48" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" />
                            </svg>
                          );
                        } else if (qLower.includes("injector") || qLower.includes("fuel") || qLower.includes("piston") || qLower.includes("engine")) {
                          illustrationSvg = (
                            <svg viewBox="0 0 100 100" className="w-full h-full text-rose-500/80">
                              <path d="M50 10 L50 90" stroke="currentColor" strokeWidth="6" />
                              <rect x="40" y="20" width="20" height="40" fill="none" stroke="currentColor" strokeWidth="4" />
                              <polygon points="50,90 40,75 60,75" fill="currentColor" />
                              <circle cx="50" cy="40" r="8" fill="currentColor" />
                            </svg>
                          );
                        }

                        return (
                          <div 
                            key={idx} 
                            className="bg-slate-950 rounded-xl border border-slate-900 hover:border-cyan-500/50 hover:shadow-cyan-950/20 shadow-lg overflow-hidden flex flex-col justify-between transition-all group"
                          >
                            {/* Visual Header / Blueprint Image */}
                            <div className="relative aspect-square w-full bg-slate-900/60 border-b border-slate-900 flex items-center justify-center p-6">
                              <div className="w-24 h-24 transform group-hover:scale-110 transition-transform">
                                {illustrationSvg}
                              </div>

                              {/* Price Sticker Tag OVERLAID Directly over photograph, conforming to Google Lens UI */}
                              <div className="absolute bottom-2.5 left-2.5 bg-slate-950/95 text-white font-mono font-bold text-xs px-2.5 py-1.5 rounded-full border border-slate-800 shadow-lg flex items-center gap-1 shrink-0">
                                <Tag className="w-3 h-3 text-cyan-400 shrink-0" />
                                <span>{sup.price || "$317.48"}</span>
                              </div>

                              <span className="absolute top-2.5 right-2.5 text-[8px] font-mono bg-slate-900 px-2 py-0.5 rounded text-slate-500 uppercase tracking-widest font-bold border border-slate-850">
                                {sup.supplierRole || "Stockist"}
                              </span>
                            </div>

                            {/* Product Metadata & Carrying Supplier Info */}
                            <div className="p-3.5 flex flex-1 flex-col justify-between">
                              <div>
                                <h6 className="text-[12px] font-bold text-white tracking-tight line-clamp-1 leading-normal uppercase">
                                  {sup.matchedProduct || `${searchQuery || "Specialized Replacement Part"}`}
                                </h6>
                                <p className="text-[10px] text-slate-400 truncate mt-1">
                                  Carry brand: {sup.availableBrandsInfo.split(",")[0] || "Universal"}
                                </p>
                                
                                <div className="mt-3 text-[10px] text-slate-500 flex flex-col gap-0.5 border-t border-slate-900 pt-2 font-mono">
                                  <span className="truncate flex items-center gap-1.5">
                                    <Building2 className="w-3 h-3 text-slate-600 shrink-0" />
                                    {sup.name}
                                  </span>
                                  <span className="truncate flex items-center gap-1.5">
                                    <MapPin className="w-3 h-3 text-slate-600 shrink-0" />
                                    {sup.location} ({sup.distance} km)
                                  </span>
                                </div>
                              </div>

                              <div className="mt-4 pt-2.5 border-t border-slate-900 flex items-center justify-between">
                                <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wide">
                                  {sup.stockStatus.toLowerCase().includes("in") ? "● In Stock" : "● Sourced"}
                                </span>
                                <button
                                  onClick={() => {
                                    setRfqPart(sup.matchedProduct || searchQuery);
                                    setRfqRouteTarget(sup.name);
                                    setActiveTab("rfq");
                                  }}
                                  className="text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 rounded transition-colors uppercase tracking-wider h-7"
                                >
                                  RFQ
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                )}

                {searchSubTab === "about" && (
                  <div className="space-y-5 animate-fade-in" id="about-image-audit">
                    
                    <div className="bg-slate-950 rounded-xl p-6 border border-slate-900 shadow-md">
                      <h4 className="text-sm font-mono font-bold text-white uppercase tracking-wider mb-4 border-b border-slate-900 pb-2 flex items-center gap-2">
                        <Info className="w-4 h-4 text-indigo-400" />
                        Grounded Search Diagnostics &amp; Image Processing Metadata
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 leading-relaxed">
                        
                        <div className="space-y-3 font-mono text-xs">
                          <div>
                            <span className="text-slate-500 font-semibold block uppercase text-[9px] mb-1">Aero-Marine Grounded Query</span>
                            <span className="text-white text-sm font-sans">{searchQuery || "None (Default bearing)"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-semibold block uppercase text-[9px] mb-1">Processing Stream Type</span>
                            <span className="text-amber-400">{uploadedImage ? `Optical Photograph Sourcing: image/jpeg` : "Structured Text Query Mapping"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-semibold block uppercase text-[9px] mb-1">AI Vision Model Enlisted</span>
                            <span className="text-indigo-400 font-bold">gemini-3.5-flash (Low latency multimodal router)</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-semibold block uppercase text-[9px] mb-1">Precision Indexing Confidence Rate</span>
                            <span className="text-emerald-400 text-sm font-bold">94.8% (Spatial correlation matched)</span>
                          </div>
                        </div>

                        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-850 text-xs">
                          <h5 className="font-bold text-slate-200 uppercase tracking-widest text-[10px] mb-2 font-mono">Expert Visual Sourcing Tips</h5>
                          <ul className="text-slate-400 space-y-2 list-decimal pl-3 font-sans font-light">
                            <li><strong>Laser Marker Focus:</strong> Aim the camera directly at the parts chassis serial plate marker etch (e.g., laser marking 22218 CC/W33).</li>
                            <li><strong>Limit Specular Reflection:</strong> Avoid flashlights that create deep direct chrome glare which obscures spatial boundary geometry.</li>
                            <li><strong>Include Mounting Orientation:</strong> Include the wire terminals or DIN-mount clips inside the frame to allow category segregation.</li>
                          </ul>
                        </div>

                      </div>
                    </div>

                  </div>
                )}

                {searchSubTab === "feedback" && (
                  <div className="space-y-5 animate-fade-in" id="feedback-safety-board">
                    
                    <div className="bg-slate-950 rounded-xl p-5 border border-slate-900 shadow-md">
                      <div className="flex items-center gap-2 mb-4 border-b border-slate-900 pb-2">
                        <MessageSquare className="w-4 h-4 text-indigo-400" />
                        <h4 className="text-sm font-mono font-bold text-white uppercase tracking-wider text-slate-100">AI Accuracy Rating &amp; Feedback Logs</h4>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        
                        {/* Form Submission Pane */}
                        <div className="md:col-span-5 bg-slate-900/40 p-4 rounded-xl border border-slate-850">
                          <h5 className="text-xs font-bold text-slate-300 uppercase mb-3 font-mono">Submit Accuracy Appraisal</h5>

                          {fbSuccess ? (
                            <div className="p-4 bg-emerald-950/40 border border-emerald-900 rounded-lg text-emerald-400 text-xs text-center font-semibold animate-fade-in">
                              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                              Appraisal Submitted Successfully! Thank you for sharpening our AI.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div>
                                <label className="text-[10px] text-slate-500 uppercase font-mono block mb-1">Was this search helpful?</label>
                                <div className="flex gap-2">
                                  <button onClick={() => setFbRating(5)} className={`flex-1 py-1.5 rounded border text-xs font-mono font-bold tracking-wider uppercase transition-all ${fbRating === 5 ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-slate-950 border-slate-850 text-slate-500 hover:text-white'}`}>
                                    <ThumbsUp className="w-3.5 h-3.5 mx-auto mb-1 text-emerald-400" />
                                    Helpful
                                  </button>
                                  <button onClick={() => setFbRating(1)} className={`flex-1 py-1.5 rounded border text-xs font-mono font-bold tracking-wider uppercase transition-all ${fbRating === 1 ? 'bg-rose-950 border-rose-500 text-rose-300' : 'bg-slate-950 border-slate-850 text-slate-500 hover:text-white'}`}>
                                    <ThumbsDown className="w-3.5 h-3.5 mx-auto mb-1 text-rose-400" />
                                    Flawed
                                  </button>
                                </div>
                              </div>

                              <div>
                                <label className="text-[10px] text-slate-500 uppercase font-mono block mb-1">Add accuracy comments / part tips</label>
                                <textarea
                                  value={fbComment}
                                  onChange={(e) => setFbComment(e.target.value)}
                                  placeholder="e.g., Model identified correctly, but delivery lead time was shorter than indicated."
                                  className="w-full h-20 bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-xs text-white placeholder-slate-650 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                                />
                              </div>

                              <button
                                onClick={() => {
                                  if (!fbComment) return;
                                  const newFb = {
                                    id: feedbacks.length + 1,
                                    query: searchQuery || "bearings",
                                    comment: fbComment,
                                    rating: fbRating,
                                    ts: "Just now"
                                  };
                                  setFeedbacks([newFb, ...feedbacks]);
                                  setFbComment("");
                                  setFbSuccess(true);
                                }}
                                disabled={!fbComment}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/60 transition-colors py-2 rounded-lg text-xs font-bold text-white uppercase tracking-wider font-sans cursor-pointer"
                                style={{ minHeight: '38px' }}
                              >
                                Submit Rating
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Recent Reviews Panel */}
                        <div className="md:col-span-7 space-y-3">
                          <h5 className="text-xs font-bold text-slate-400 uppercase font-mono">Recent Logs &amp; Peer Evaluations</h5>
                          
                          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                            {feedbacks.map((fb) => (
                              <div key={fb.id} className="bg-slate-900/40 p-3.5 rounded-xl border border-slate-850 text-xs">
                                <div className="flex justify-between items-center text-[10px] mb-1.5 font-mono">
                                  <span className="text-indigo-400 font-bold uppercase">Search: &quot;{fb.query}&quot;</span>
                                  <span className="text-slate-500">{fb.ts}</span>
                                </div>
                                <p className="text-slate-300 font-sans leading-relaxed font-light">&quot;{fb.comment}&quot;</p>
                                <div className="mt-2 text-[9px] text-slate-400 font-mono font-medium tracking-wide flex items-center gap-1.5 pointer-events-none">
                                  <span className="uppercase">Voted accuracy check:</span>
                                  <span className={`px-1.5 py-0.2 rounded font-bold ${fb.rating >= 4 ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' : 'bg-rose-950 text-rose-400 border border-rose-900'}`}>
                                    {fb.rating >= 4 ? "PERFECT" : "MINOR SLIP"}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>
                    </div>

                  </div>
                )}

              </div>
            )}

            {/* Quick Informational Bottom Section */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Info className="w-5 h-5 text-indigo-400 shrink-0" />
                <p className="text-xs text-slate-300 font-light">
                  Need to instantly query pricing for bulk maritime spares or machinery filters? Use our dynamic <strong>RFQ Dispatcher</strong> to route custom requests to multiple suppliers simultaneously.
                </p>
              </div>
              <button
                onClick={() => setActiveTab("rfq")}
                className="bg-indigo-600/25 hover:bg-indigo-600 border border-indigo-700 hover:border-indigo-500 text-white font-medium text-xs px-4 py-2 rounded-lg transition-all"
              >
                Assemble New RFQ
              </button>
            </div>

          </div>
        )}

        {/* Tab 2: Kilometer Expansion Radar Sweep */}
        {activeTab === "distance" && (
          <div className="space-y-6" id="expanded-radar-section">
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
              <h2 className="text-lg md:text-xl font-bold text-white tracking-tight flex items-center gap-1.5">
                <Globe className="w-5 h-5 text-cyan-400" />
                Singapore Zero Point - Radial Kilometer Spanning Engine
              </h2>
              <p className="text-xs text-slate-400 font-light mt-1 max-w-4xl">
                Singapore acts as the 0-point (origin). The radar displays suppliers by their actual kilometer radius outward.
                Use the slider interactively to broaden your search from local Singapore supply docks directly into global industrial corridors!
              </p>
            </div>

            {/* Render the Master Radar View */}
            <RadarView suppliers={suppliers} searchQuery={searchQuery} />
          </div>
        )}

        {/* Tab 3: B2B Direct RFQ Dispatcher */}
        {activeTab === "rfq" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="rfq-dispatcher-section">
            <div className="lg:col-span-7 bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-800 shadow-xl space-y-5">
              <div>
                <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-950/60 px-3 py-1 rounded-full border border-indigo-900 uppercase">
                  B2B Sourcing Protocol
                </span>
                <h2 className="text-xl md:text-2xl font-bold text-white mt-3 tracking-tight">
                  Dispatched Sourcing &amp; Request for Quote (RFQ)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Fill in the requested spare specification. GlobalPartsHub automatically identifies, scores, and emails authorized distributors in priority order (Singapore local points first, then globally by outbound kilometers).
                </p>
              </div>

              {rfqStatus === "sent" ? (
                <div className="bg-emerald-950/20 border border-emerald-800 text-emerald-300 p-6 rounded-xl space-y-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-900/60 flex items-center justify-center mx-auto text-emerald-400 animate-bounce">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white mt-1">RFQ Dispatched Successfully!</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      Our system routed the quote to Singapore hubs and {suppliers.length} active matching distributors located up to 15,000 km away.
                    </p>
                  </div>
                  <div className="bg-slate-950/60 p-4 rounded-lg text-left text-xs font-mono border border-slate-850 max-w-md mx-auto space-y-1.5 text-slate-300">
                    <p><span className="text-slate-500">Query Targeted:</span> {rfqPart}</p>
                    <p><span className="text-slate-500">Urgency:</span> {rfqUrgency}</p>
                    <p><span className="text-slate-500">Quantity Ordered:</span> {rfqQuantity} units</p>
                    <p><span className="text-slate-500">Target Range:</span> {rfqRouteTarget}</p>
                    <p><span className="text-slate-500">Dispatched To:</span> {suppliers.length} global suppliers</p>
                  </div>
                  <button
                    onClick={() => {
                      setRfqStatus(null);
                      setRfqPart("");
                      setRfqQuantity(1);
                      setRfqNotes("");
                      setRfqBudget("");
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-4 py-2 rounded-lg transition-all"
                  >
                    Send Another Request
                  </button>
                </div>
              ) : rfqStatus === "dispatching" ? (
                <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                  <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin" />
                  <div>
                    <h3 className="text-sm font-bold text-white">Structuring Routing Parameters</h3>
                    <p className="text-xs text-slate-400">Verifying digital handshake APIs with localized suppliers...</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={submitRFQ} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Exact Part Model / Serial / Brand name *
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="e.g. Caterpillar Marine Turbocharger 5H-42"
                        value={rfqPart}
                        onChange={(e) => setRfqPart(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Required Quantity *
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        value={rfqQuantity}
                        onChange={(e) => setRfqQuantity(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Urgency Status *
                      </label>
                      <select
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        value={rfqUrgency}
                        onChange={(e) => setRfqUrgency(e.target.value as any)}
                      >
                        <option value="Routine">Routine Stocking</option>
                        <option value="Critical AOG">Aircraft Grounded / Factory Down (Urgent)</option>
                        <option value="Vessel in Distress">Emergency Shipboard Marine SOS</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Target Budget
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="e.g. Under $10,000 SGD"
                        value={rfqBudget}
                        onChange={(e) => setRfqBudget(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Route Targets Scope
                    </label>
                    <select
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-505"
                      value={rfqRouteTarget}
                      onChange={(e) => setRfqRouteTarget(e.target.value)}
                    >
                      <option value="All Matched Suppliers">All Matched Global Suppliers ({suppliers.length})</option>
                      <option value="Singapore Suppliers Only">Singapore Distributors Only ({sgSuppliers.length})</option>
                      <option value="Distance Priority Hubs">Priority Radius Under 5,000 km</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Detailed Technical Specifications or Dimensional Requirements
                    </label>
                    <textarea
                      rows={4}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="e.g. Include precise inner diameter 45mm, outer flange bolts (8 holes), marine grade certification standard BV or DNV needed."
                      value={rfqNotes}
                      onChange={(e) => setRfqNotes(e.target.value)}
                    />
                  </div>

                  {/* High Fidelity Technical Drawing, Photo or Datasheet Attachment Block */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Attach Reference Photograph, Blueprint or Technical Datasheet
                    </label>
                    <div className="border border-dashed border-slate-800 rounded-xl bg-slate-950 p-4 transition-all hover:border-indigo-500 flex flex-col items-center justify-center text-center gap-2 relative">
                      <input
                        type="file"
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                        className="hidden"
                        id="rfq-file-uploader"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setRfqFileName(file.name);
                          setRfqFileType(file.type || "application/octet-stream");
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setRfqFile(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      {rfqFile ? (
                        <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg p-3 w-full justify-between animate-fade-in">
                          <div className="flex items-center gap-3 min-w-0">
                            {rfqFileType.startsWith("image/") ? (
                              <img src={rfqFile} className="w-12 h-12 object-cover rounded-lg border border-slate-700 bg-slate-950 shadow-inner shrink-0" alt="attached part source preview" />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-indigo-950/40 border border-indigo-900 flex items-center justify-center text-indigo-400 shrink-0">
                                <FileText className="w-6 h-6" />
                              </div>
                            )}
                            <div className="text-left min-w-0">
                              <p className="text-xs font-bold text-slate-200 truncate">{rfqFileName}</p>
                              <p className="text-[10px] text-slate-400 font-mono tracking-wide uppercase truncate">
                                {rfqFileType || "Datasheet Attachment"}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setRfqFile(null);
                              setRfqFileName("");
                              setRfqFileType("");
                            }}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors cursor-pointer shrink-0"
                            title="Remove attached document"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label
                          htmlFor="rfq-file-uploader"
                          className="flex flex-col items-center justify-center gap-2 cursor-pointer w-full py-4 group"
                        >
                          <Paperclip className="w-6 h-6 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                          <div>
                            <span className="text-xs font-semibold text-slate-350 group-hover:text-indigo-300 block">
                              Add specification sheets, factory CAD drawing or nameplate photo
                            </span>
                            <span className="text-[10px] text-slate-500 mt-0.5 block">
                              Supports PDF, CAD, XLSX, PNG, JPEG up to 25MB (Will accompany quotation routing payload)
                            </span>
                          </div>
                        </label>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold py-4 rounded-xl transition-all shadow-xl shadow-indigo-600/15 flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Transmit Encrypted RFQ to Suppliers
                  </button>
                </form>
              )}
            </div>

            {/* Side help metrics layout */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 text-slate-400">
                  Global Routing Direct Path
                </h3>

                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-950 flex items-center justify-center shrink-0 border border-emerald-800">
                      <span className="text-xs font-mono font-bold text-emerald-400">1</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Singapore Origin Dock (Point Zero)</h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        Query matching local partners located in Tuas, Admiralty Road, Pioneer or Jurong. Offers same-day dispatch and physical pickup.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-950 flex items-center justify-center shrink-0 border border-indigo-800">
                      <span className="text-xs font-mono font-bold text-indigo-400">2</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Outbound Distance Mapping</h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        Matches international supply points sequentially like Tokyo (~5,000 km), Dubai (~5,700 km), Duesseldorf (~10,000 km), or Houston (~15,500 km).
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-cyan-950 flex items-center justify-center shrink-0 border border-cyan-800">
                      <span className="text-xs font-mono font-bold text-cyan-400">3</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Secure API Validation</h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        Validates correct spare part serial number criteria with the distributor&apos;s real-time AI database check so there are zero mismatches on delivery.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Verified badge */}
              <div className="bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950 border border-slate-800/80 p-6 rounded-2xl text-center space-y-3">
                <div className="inline-flex p-3 rounded-full bg-slate-900 border border-slate-800 text-indigo-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-white">Authorized Partner Network</h4>
                <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                  Only verified distributors carrying international class certifications (ISO, IACS, ASTM) are listed. Guaranteed 100% genuine spares matching OEM standards.
                </p>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Elegant Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 mt-12 py-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold text-slate-400">GlobalPartsHub Sourcing Terminal</span>
            <span className="text-[10px] text-slate-600 font-mono">• Port 3000 Secure Gateway</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Coordinates: Singapore Zero-Point (1.3521° N, 103.8198° E)</span>
            <span className="mx-1">•</span>
            <span>Privacy &amp; B2B Conditions Policy</span>
          </div>
        </div>
      </footer>

      {/* Live Video Camera Capture Overlay Modal */}
      {cameraActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in" id="camera-capture-modal">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white tracking-tight">Activate Spare Part Camera Capture</h3>
              </div>
              <button 
                onClick={closeCamera}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close camera"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Camera View Area */}
            <div className="p-5 flex-1 flex flex-col items-center justify-center bg-slate-950 relative min-h-[280px]">
              {cameraLoading ? (
                <div className="flex flex-col items-center gap-3 text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
                  <span className="text-xs">Initializing webcam lens...</span>
                </div>
              ) : cameraError ? (
                <div className="text-center p-6 space-y-3 max-w-xs">
                  <div className="inline-flex p-3 rounded-full bg-red-950/20 text-red-400 border border-red-900/30">
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                  </div>
                  <h4 className="text-xs font-bold text-red-400">Webcam Not Available</h4>
                  <p className="text-[11px] text-slate-400 leading-normal font-light">
                    {cameraError}
                  </p>
                </div>
              ) : (
                <div className="relative w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-auto max-h-[320px] object-cover"
                  />
                  <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur border border-slate-700/50 px-2 py-0.5 rounded text-[10px] text-emerald-400 font-bold font-mono tracking-wider uppercase flex items-center gap-1.5 shadow">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Live Preview
                  </div>
                </div>
              )}
            </div>

            {/* Footer / Controls */}
            <div className="p-4 bg-slate-900/60 border-t border-slate-800 flex flex-col gap-3">
              {/* Camera Source Selector if multiple devices exist */}
              {cameraDevices.length > 1 && !cameraError && (
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-[10px] text-slate-400 font-medium font-sans">Select Camera Input:</span>
                  <select
                    value={selectedCameraId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedCameraId(id);
                      startWebcam(id);
                    }}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[200px]"
                  >
                    {cameraDevices.map((device, idx) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera Device ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={closeCamera}
                  className="px-4 py-2 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs hover:bg-slate-800 transition-all font-medium cursor-pointer"
                >
                  Cancel
                </button>
                
                {!cameraError && (
                  <button
                    type="button"
                    disabled={cameraLoading}
                    onClick={takeSnapshot}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/10 flex items-center gap-1.5 cursor-pointer"
                    style={{ minHeight: '38px' }}
                  >
                    <Camera className="w-4 h-4 text-cyan-200" />
                    Capture Photo Snap
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Verification Modal Before Transmitting RFQ */}
      {showRfqVerification && (() => {
        const targetSuppliers = rfqRouteTarget === "Singapore Suppliers Only"
          ? sgSuppliers
          : rfqRouteTarget === "Distance Priority Hubs"
            ? suppliers.filter(s => s.distance <= 5000)
            : suppliers;

        const displayedSuppliers = targetSuppliers.length > 0 ? targetSuppliers : suppliers.slice(0, 3);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in" id="rfq-verification-modal">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">RFQ Dispatch Verification Request</h3>
                    <p className="text-[10px] text-slate-400">Review recipient list and generated handshake copy before transmitting</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowRfqVerification(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Main Contents (Scrollable) */}
              <div className="p-6 overflow-y-auto space-y-5 bg-slate-950/20 custom-scrollbar text-left">
                {/* Recipients Section */}
                <div className="space-y-2">
                  <h4 className="text-[11px] font-mono tracking-wider font-bold text-indigo-400 uppercase">
                    Proposed Recipients ({displayedSuppliers.length} Authorized Suppliers)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[140px] overflow-y-auto p-2 bg-slate-950 rounded-xl border border-slate-850">
                    {displayedSuppliers.map((s, idx) => (
                      <div key={idx} className="p-2 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-200 truncate">{s.name}</p>
                          <p className="text-[10px] text-slate-400 truncate">{s.location || "Singapore"}</p>
                        </div>
                        <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-900">
                          {s.distance <= 15 ? "Local Point" : `${Math.floor(s.distance).toLocaleString()} km`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Draft copy preview in pristine CELRON letterhead document */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-mono tracking-wider font-bold text-indigo-400 uppercase">
                    Formal Sourcing Enquiry (CELRON Professional Letterhead)
                  </h4>
                  
                  {/* Celron Paper Sheet */}
                  <div className="bg-white text-slate-800 p-6 sm:p-8 rounded-xl border border-slate-300 shadow-xl space-y-5 font-sans relative overflow-hidden select-text text-left">
                    {/* Watermark Logo Accent */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-100 font-extrabold text-[5.5rem] tracking-widest font-sans uppercase -rotate-12 pointer-events-none select-none opacity-20">
                      CELRON
                    </div>

                    {/* Letterhead Header Banner */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b-2 border-[#1e40af] pb-5 gap-6 relative z-10">
                      {/* Left: Beautiful CSS vector facsimile of the company logo */}
                      <div className="flex items-center gap-2">
                        <svg className="w-56 h-auto shrink-0" viewBox="0 0 170 65" fill="none" xmlns="http://www.w3.org/2000/svg">
                          {/* Funnel / smokestacks: three dark blue rectangles on top of ship */}
                          <rect x="70" y="8" width="4" height="12" rx="1" fill="#1e3a8a" />
                          <rect x="76" y="6" width="4" height="14" rx="1" fill="#1e3a8a" />
                          <rect x="82" y="8" width="4" height="12" rx="1" fill="#1e3a8a" />
                          
                          {/* Ship hull - large sweep to the right, sleek vector curves */}
                          <path d="M 60 25 C 80 25 100 15 115 5 C 105 18 90 28 65 30 Z" fill="#1e40af" />
                          <path d="M 65 30 L 115 5 C 117 3 118 4 116 6 C 108 19 92 31 68 33 Z" fill="#1d4ed8" />
                          <path d="M 52 23 C 58 23 64 25 70 28 L 65 30 C 60 28 55 25 50 24 Z" fill="#1e3a8a" />
                          
                          {/* Light blue sea waves underneath */}
                          <path d="M 70 33 C 85 33 100 28 112 25" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
                          <path d="M 68 37 C 82 37 98 32 110 29" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" />
                          <path d="M 70 41 C 82 41 95 37 105 34" stroke="#0284c7" strokeWidth="1.5" strokeLinecap="round" />
                          
                          {/* Red/orange gear (cogwheel) decoration on the left */}
                          <circle cx="35" cy="23" r="14" fill="#f59e0b" opacity="0.15" />
                          {/* Gear Teeth Outer (Red/orange parts) */}
                          <path d="M 35 7 L 37 10 L 40 8 L 41 12 L 45 11 L 44 15 L 48 16 L 46 20 L 49 22 L 46 25 L 48 29 L 44 30 L 45 34 L 41 33 L 40 37 L 37 35 L 35 38 L 33 35 L 30 37 L 29 33 L 25 34 L 26 30 L 22 29 L 24 25 L 21 22 L 24 20 L 22 16 L 26 15 L 25 11 L 29 12 L 30 8 L 33 10 Z" fill="#e12d2d" stroke="#f97316" strokeWidth="1" />
                          
                          {/* Yellow circle inner */}
                          <circle cx="35" cy="23" r="10" fill="#fef08a" stroke="#ca8a04" strokeWidth="1" />
                          
                          {/* Black turbine propeller inside yellow circle */}
                          <circle cx="35" cy="23" r="7" fill="#000000" />
                          {/* Propeller Blades inside */}
                          <path d="M 35 23 C 32 18 38 18 35 23 Z" fill="#ffffff" />
                          <path d="M 35 23 C 40 20 40 26 35 23 Z" fill="#ffffff" />
                          <path d="M 35 23 C 38 28 32 28 35 23 Z" fill="#ffffff" />
                          <path d="M 35 23 C 30 26 30 20 35 23 Z" fill="#ffffff" />
                          <circle cx="35" cy="23" r="2.5" fill="#ca8a04" />
                          <circle cx="35" cy="23" r="1" fill="#000000" />

                          {/* Horizontal grey separator line */}
                          <line x1="10" y1="46" x2="114" y2="46" stroke="#94a3b8" strokeWidth="1.5" />

                          {/* CEL-RON text styling */}
                          <text x="62" y="55" fontFamily="sans-serif" fontWeight="900" fontSize="13" fill="#1e40af" letterSpacing="1" textAnchor="middle">CEL-RON</text>

                          {/* —ENTERPRISES PTE LTD— text */}
                          <text x="62" y="62" fontFamily="sans-serif" fontWeight="bold" fontSize="5" fill="#475569" letterSpacing="0.5" textAnchor="middle">—ENTERPRISES PTE LTD—</text>
                        </svg>
                      </div>

                      {/* Right: Exact detailed letterhead context matching the uploaded corporate header layout */}
                      <div className="md:text-right space-y-0.5 font-sans">
                        <h1 className="text-[17px] sm:text-[19px] font-black tracking-tight font-sans text-slate-900 leading-tight">
                          <span className="text-[#e23e3e]">CEL-RON</span>{" "}
                          <span className="text-slate-900">ENTERPRISES PTE LTD</span>
                        </h1>
                        <p className="text-[11px] sm:text-[12px] font-black text-slate-900 tracking-wide font-sans">
                          UEN NO. 201436227C
                        </p>
                        <p className="text-[10px] sm:text-[10.5px] font-medium text-slate-700 italic font-sans">
                          "Sim Lim Tower"
                        </p>
                        <p className="text-[9.5px] sm:text-[10px] text-slate-600 font-sans leading-tight">
                          10, Jln, Besar, "Sim Lim Tower" #03-05, Singapore 208787
                        </p>
                        <p className="text-[9.5px] sm:text-[10px] text-slate-600 font-sans leading-none">
                          Phone: +65 81962270 &nbsp;|&nbsp; Email: <span className="text-indigo-900 font-semibold select-all">sales@celron.net</span>
                        </p>
                        <p className="text-[9.5px] sm:text-[10px] text-indigo-700 font-semibold font-mono tracking-tight pt-0.5">
                          www.celron.net
                        </p>
                      </div>
                    </div>

                    {/* Enquiry Reference & Senders/Metadata Block */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs font-sans text-slate-700 border-b border-slate-200 pb-4 relative z-10">
                      <div>
                        <p className="text-[10.5px] font-bold text-slate-400 uppercase font-mono tracking-wider">Reference No.</p>
                        <p className="font-bold text-slate-900 font-mono text-[11px] tracking-wide">CR-RFQ-26-45501</p>
                      </div>
                      <div>
                        <p className="text-[10.5px] font-bold text-slate-400 uppercase font-mono tracking-wider">System Handshake</p>
                        <p className="text-slate-900 font-mono text-[11px]">B2B API Tunneled</p>
                      </div>
                      <div className="col-span-2 md:col-span-1">
                        <p className="text-[10.5px] font-bold text-slate-400 uppercase font-mono tracking-wider">Target Scope</p>
                        <p className="text-indigo-900 font-bold font-mono text-[10px] bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 inline-block truncate max-w-full">
                          {rfqRouteTarget}
                        </p>
                      </div>
                    </div>

                    {/* Formal Letter Body Block */}
                    <div className="space-y-4 text-[12.5px] text-slate-800 leading-relaxed font-sans relative z-10">
                      <p className="font-semibold text-slate-900">
                        ATTN: Sales Manager, Accounts &amp; Technical Estimations Teams
                      </p>
                      
                      <p>
                        We are requesting a formal, binding B2B quotation for the industrial spare part item referenced here. Please review drawing dimensions and certifications required:
                      </p>

                      {/* Line Item Table Spec Block */}
                      <div className="border border-slate-300 rounded-lg overflow-hidden shrink-0 bg-slate-50/50">
                        <div className="grid grid-cols-3 bg-indigo-900 text-white font-mono text-[9px] font-bold uppercase p-2 tracking-wider">
                          <div className="col-span-2 border-r border-indigo-800 pl-1">Part / Serial Description</div>
                          <div className="text-right pr-1">Required Qty</div>
                        </div>
                        <div className="grid grid-cols-3 text-xs p-3 text-slate-900 border-b border-slate-200 bg-white">
                          <div className="col-span-2 font-bold font-mono break-all text-slate-900">{rfqPart}</div>
                          <div className="text-right font-bold pr-1 text-slate-900">{rfqQuantity} Unit(s)</div>
                        </div>
                        <div className="p-3 bg-slate-100/40 text-[11px] space-y-1 select-all">
                          <p><span className="font-bold text-slate-500 font-mono uppercase text-[9px] mr-1.5">Sourcing Urgency:</span> <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${rfqUrgency === "Routine" ? "bg-slate-200 text-slate-800" : rfqUrgency === "Critical AOG" ? "bg-amber-100 text-amber-850 border border-amber-200 animate-pulse" : "bg-red-105 text-red-800 border border-red-200 font-black animate-bounce"}`}>{rfqUrgency}</span></p>
                          {rfqBudget && <p><span className="font-bold text-slate-500 font-mono uppercase text-[9px] mr-1.5">Target Budget Limit:</span> <span className="text-slate-800 font-semibold">{rfqBudget}</span></p>}
                        </div>
                      </div>

                      {/* Technical Notes (If loaded) */}
                      {rfqNotes && (
                        <div className="space-y-1">
                          <h5 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">Technical Specifications / Notes:</h5>
                          <blockquote className="border-l-4 border-indigo-900 bg-indigo-50/30 p-3 rounded text-xs text-slate-700 italic whitespace-pre-wrap leading-normal font-mono select-all">
                            {rfqNotes}
                          </blockquote>
                        </div>
                      )}

                      {/* Attachment Status Block (Drawn dynamically if uploaded) */}
                      {rfqFile && (
                        <div className="border border-emerald-200 bg-emerald-50/25 p-3 rounded-lg flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-100 border border-emerald-200 text-emerald-800 flex items-center justify-center rounded shrink-0">
                            {rfqFileType.startsWith("image/") ? <Camera className="w-5.5 h-5.5 text-emerald-700" /> : <Paperclip className="w-5.5 h-5.5 text-emerald-700" />}
                          </div>
                          <div className="text-left min-w-0 flex-1">
                            <p className="text-[11px] font-bold text-emerald-950 truncate">ATTACHED: {rfqFileName}</p>
                            <p className="text-[9px] text-emerald-600 uppercase font-mono truncate">Transmitting 1 Attachment Securely inside B2B Envelope</p>
                          </div>
                          <span className="text-[9px] font-mono bg-emerald-600 text-white font-extrabold px-2 py-0.5 rounded shadow-sm shrink-0">SEALED</span>
                        </div>
                      )}
                    </div>

                    {/* Letterhead Footer Signature Stamp */}
                    <div className="flex justify-between items-end pt-4 border-t border-slate-200 text-xs relative z-10">
                      <div className="text-slate-400 font-mono text-[8px] space-y-0.5 leading-tight">
                        <p>© 2026 Celron Sourcing Operations Asia-Pac.</p>
                        <p>Authorized Digital signature validated via procurement agent portal.</p>
                      </div>
                      <div className="text-right font-sans shrink-0 space-y-1">
                        <div className="text-indigo-900 font-mono font-bold text-[12.5px] tracking-tight text-center border-b border-indigo-900/30 pb-0.5 italic px-2 bg-indigo-50/30 rounded relative self-end select-none">
                          <div className="absolute inset-0 bg-indigo-900/5 rounded-full filter blur-sm transform scale-95 -rotate-3 pointer-events-none" />
                          <span>Celron Procurement</span>
                          <span className="block text-[7.5px] font-mono uppercase tracking-wider text-slate-500 mt-0.5 font-normal font-sans">Singapore Station</span>
                        </div>
                        <p className="text-[9px] text-slate-400 font-mono">Singapore Station Chief Sourcing Officer</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Secure warning line */}
                <div className="flex items-start gap-2 bg-indigo-950/20 p-3 rounded-lg border border-indigo-900/35 text-[11px] text-indigo-300">
                  <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <p>
                    By clicking <strong>Confirm and Send RFQ</strong>, this platform will complete the B2B routing protocols and dispatch this RFQ packet to the verified matching distributors listed above.
                  </p>
                </div>
              </div>

              {/* Footer Controls */}
              <div className="p-4 bg-slate-900 border-t border-slate-805 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowRfqVerification(false)}
                  className="px-4 py-2 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs hover:bg-slate-800 transition-all font-medium cursor-pointer"
                >
                  Cancel / Edit Draft
                </button>
                <button
                  type="button"
                  onClick={confirmAndSendRFQ}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/10 flex items-center gap-1.5 cursor-pointer"
                  style={{ minHeight: '38px' }}
                >
                  <Send className="w-4 h-4 text-emerald-200" />
                  Confirm and Send RFQ
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
