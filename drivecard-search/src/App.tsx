import React, { useEffect, useState, useRef } from "react";
import { 
  Search, RefreshCw, LogOut, Loader, Sparkles, 
  Plus, Folder, AlertTriangle, FileImage, Clipboard, 
  Check, ArrowRight, UserCheck, CheckCircle, ExternalLink
} from "lucide-react";
import { initAuth, googleSignOut } from "./firebase";
import { BusinessCard } from "./types";
import SignIn from "./components/SignIn";
import MobileFrame from "./components/MobileFrame";
import CardDetailModal from "./components/CardDetailModal";
import CardList from "./components/CardList";

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Layout mode state
  const [isMobileMode, setIsMobileMode] = useState(true);

  // Folder state pre-populated with user's drive folder
  const [folderId, setFolderId] = useState("1FopCXZKCiKTQrwExkB2D_JGm1tVWqOwU");
  const [folderName, setFolderName] = useState<string | null>(null);

  // Business Card list state
  const [cards, setCards] = useState<BusinessCard[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [viewLayout, setViewLayout] = useState<"grid" | "list">("grid");

  // Selected card inspecting state
  const [selectedCard, setSelectedCard] = useState<BusinessCard | null>(null);

  // Card Sync/OCR Engine Pipeline progress States
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [syncResults, setSyncResults] = useState<{ total: number; cached: number; processed: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // New Business Card Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Initialize Authentication State on boot
  useEffect(() => {
    initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setLoadingAuth(false);
        // Automatically start synchronization if folder and token are active
        triggerSync(folderId, accessToken);
      },
      () => {
        setLoadingAuth(false);
      }
    );
  }, []);

  const handleSignInSuccess = (signedInUser: any, userToken: string) => {
    setUser(signedInUser);
    setToken(userToken);
    triggerSync(folderId, userToken);
  };

  const handleSignOut = async () => {
    try {
      await googleSignOut();
      setUser(null);
      setToken(null);
      setCards([]);
      setFolderName(null);
    } catch (err) {
      console.error("Sign out error", err);
    }
  };

  // Google Drive Cards OCR Sync Engine (SSE Implementation)
  const triggerSync = (currentFolder: string, currentToken: string | null) => {
    if (!currentFolder || !currentToken) return;

    setIsSyncing(true);
    setSyncError(null);
    setSyncResults(null);
    setSyncStep("initializing");
    setSyncMessage("Connecting search engine to Google Drive...");
    setSyncProgress({ current: 0, total: 0 });

    const cleanFolderId = extractFolderId(currentFolder);

    const sseUrl = `/api/drive/cards/sync?folderId=${encodeURIComponent(cleanFolderId)}&token=${encodeURIComponent(currentToken)}`;
    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.step) {
          case "folder-verify":
          case "listing-files":
          case "searching-index":
          case "loading-index":
            setSyncStep(data.step);
            setSyncMessage(data.message || "");
            break;

          case "folder-verified":
            setFolderName(data.folderName);
            break;

          case "sync-ready":
            setSyncStep("ready");
            setSyncResults({
              total: data.total,
              cached: data.cached,
              processed: 0
            });
            if (data.needsProcessing > 0) {
              setSyncMessage(`Found ${data.needsProcessing} new/updated cards needing indexing. Starting OCR pipeline...`);
            } else {
              setSyncMessage("Checking index sync. All cards verified cached.");
            }
            break;

          case "processing-card":
            setSyncStep("processing");
            setSyncMessage(data.message);
            setSyncProgress({ current: data.current, total: data.total });
            break;

          case "card-indexed":
            // Stream in parsed card object dynamically so they populate on screen in real time
            setCards((prev) => {
              // Deduplicate
              const filtered = prev.filter((c) => c.fileId !== data.card.fileId);
              return [...filtered, data.card];
            });
            setSyncResults((prev) => prev ? { ...prev, processed: data.current } : null);
            break;

          case "complete":
            setCards(data.cards || []);
            setIsSyncing(false);
            setSyncStep("complete");
            setSyncMessage("Folder index fully up-to-date!");
            eventSource.close();
            break;

          case "failed":
            throw new Error(data.error || "Synchronisation pipeline interrupted");
        }
      } catch (err: any) {
        console.error("SSE message error:", err);
        setSyncError(err.message || "Pipeline sync failed");
        setIsSyncing(false);
        eventSource.close();
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource connection error:", err);
      setSyncError("Lost communication link with indexing stream. Verify connection.");
      setIsSyncing(false);
      eventSource.close();
    };
  };

  // Extract folder ID if they paste full google drive links
  const extractFolderId = (input: string) => {
    const parts = input.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    return parts ? parts[1] : input.trim();
  };

  // File Upload Handlers (Drag & Drop + Click)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadCardImage(files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await uploadCardImage(files[0]);
    }
  };

  const uploadCardImage = async (file: File) => {
    if (!token) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Only JPG, JPEG or PNG image files are supported of business cards.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      const base64 = await convertFileToBase64(file);
      
      const response = await fetch("/api/drive/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          folderId: extractFolderId(folderId),
          base64Data: base64,
          fileName: file.name,
          mimeType: file.type,
          token,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to upload file to Google Drive.");
      }

      setUploadSuccess(true);
      // Immediately trigger indexing sync which processes the newly uploaded card!
      triggerSync(folderId, token);
      
      // Auto-clear success message after 3s
      setTimeout(() => setUploadSuccess(false), 3500);
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "An error occurred during business card upload.");
    } finally {
      setIsUploading(false);
    }
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Strip data:image/...;base64, prefix
        const base64String = result.split(",")[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Search logic - filters across all parsed variables AND deep OCR blocks!
  const filteredCards = cards.filter((card) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    return (
      (card.name || "").toLowerCase().includes(query) ||
      (card.title || "").toLowerCase().includes(query) ||
      (card.company || "").toLowerCase().includes(query) ||
      (card.address || "").toLowerCase().includes(query) ||
      (card.website || "").toLowerCase().includes(query) ||
      (card.emails || []).some((email) => email.toLowerCase().includes(query)) ||
      (card.phones || []).some((phone) => phone.toLowerCase().includes(query)) ||
      // Deep OCR search!
      (card.ocrText || "").toLowerCase().includes(query)
    );
  });

  // Auth Loading spinner
  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100">
        <Loader className="w-8 h-8 text-indigo-400 animate-spin mb-4" />
        <p className="text-xs font-mono text-slate-500">Initializing Identity Providers...</p>
      </div>
    );
  }

  // Not signed in
  if (!user || !token) {
    return <SignIn onSignInSuccess={handleSignInSuccess} />;
  }

  return (
    <MobileFrame isMobileMode={isMobileMode} setIsMobileMode={setIsMobileMode}>
      <div className="flex flex-col h-full bg-slate-950 text-slate-100 font-sans select-none relative">
        
        {/* Custom Application Navigation Header */}
        <div className="bg-slate-900 border-b border-slate-800/80 px-5 py-4 shrink-0 flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8.5 h-8.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/10">
              <Sparkles className="w-4.5 h-4.5 text-white animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold font-display text-white tracking-wide">DriveCard Search</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] font-mono text-slate-400 truncate max-w-[120px]" title={user.email}>
                  {user.email}
                </span>
              </div>
            </div>
          </div>

          <button 
            onClick={handleSignOut}
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition"
            title="Log Out Session"
          >
            <LogOut className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Sync panel / Progress banner */}
        {isSyncing && (
          <div className="bg-indigo-600/10 border-b border-indigo-500/20 px-5 py-3 shrink-0 flex flex-col gap-1.5 transition-all animate-in slide-in-from-top duration-300">
            <div className="flex items-center justify-between text-[11px] font-mono font-bold text-indigo-300">
              <span className="flex items-center gap-1.5 uppercase tracking-wider">
                <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
                OCR Sync Active
              </span>
              {syncStep === "processing" && syncProgress.total > 0 && (
                <span>{syncProgress.current} / {syncProgress.total} Files</span>
              )}
            </div>
            <p className="text-xs text-slate-300 leading-tight truncate">
              {syncMessage}
            </p>
            {syncStep === "processing" && syncProgress.total > 0 && (
              <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-0.5 border border-slate-800/80">
                <div 
                  className="bg-indigo-500 h-full transition-all duration-300 rounded-full" 
                  style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Secondary error reports banner */}
        {syncError && (
          <div className="bg-rose-500/10 border-b border-rose-500/20 px-5 py-3 shrink-0 flex items-center justify-between text-xs text-rose-300 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              <p className="truncate font-mono text-[10px] leading-relaxed">{syncError}</p>
            </div>
            <button 
              onClick={() => triggerSync(folderId, token)}
              className="px-2 py-1 bg-rose-500/15 border border-rose-500/25 rounded-md hover:bg-rose-500/25 text-[10px] font-bold font-mono transition text-rose-400 shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Scrollable Work Container */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          
          {/* 1. Drive Connection Settings card */}
          <div className="bg-slate-900/60 border border-slate-800/80 p-4.5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                <Folder className="w-3.5 h-3.5 text-indigo-400" /> Google Drive target Location
              </label>
              {folderName && (
                <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                  Connected
                </span>
              )}
            </div>
            
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Folder ID or Share Link"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                disabled={isSyncing}
                className="flex-1 min-w-0 bg-slate-950 border border-slate-800 text-slate-200 px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 hover:border-slate-700 placeholder-slate-600 disabled:opacity-50 transition"
              />
              <button
                onClick={() => triggerSync(folderId, token)}
                disabled={isSyncing || !folderId}
                className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl cursor-pointer transition shrink-0 flex items-center justify-center"
                title="Synchronize Google Drive cards"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
              </button>
            </div>

            {folderName && (
              <div className="text-[11px] text-slate-400 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/45 flex justify-between items-center gap-3">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-slate-400 shrink-0">Folder:</span>
                  <a
                    href={`https://drive.google.com/drive/folders/${extractFolderId(folderId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 font-semibold truncate flex items-center gap-1 hover:underline transition"
                    title="Open connected folder in Google Drive"
                  >
                    <span className="truncate">{folderName}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
                <span className="text-[10px] text-indigo-400 font-mono shrink-0 font-bold">{cards.length} Scanned</span>
              </div>
            )}
          </div>

          {/* 2. Drag/Drop File Upload Module */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer border border-dashed rounded-2xl p-5 text-center flex flex-col items-center justify-center transition-all ${
              isDragging 
              ? "border-indigo-500 bg-indigo-500/5 scale-[1.01]" 
              : "border-slate-800 hover:border-slate-700 bg-slate-900/10 hover:bg-slate-900/30"
            }`}
          >
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              accept="image/*"
            />
            {isUploading ? (
              <div className="flex flex-col items-center">
                <Loader className="w-7 h-7 text-indigo-400 animate-spin mb-2" />
                <p className="text-xs font-semibold text-slate-300">Uploading new business card...</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Transferring media bytes to Drive folder</p>
              </div>
            ) : uploadSuccess ? (
              <div className="flex flex-col items-center animate-in zoom-in-95">
                <CheckCircle className="w-7 h-7 text-emerald-400 mb-2" />
                <p className="text-xs font-semibold text-slate-200">Card Uploaded Successfully!</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Triggering automatic card indexing...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <FileImage className="w-7 h-7 text-slate-500 mb-2 group-hover:text-slate-300" />
                <p className="text-xs font-semibold text-slate-300">Add New Business Card</p>
                <p className="text-[10px] text-slate-500 mt-1 max-w-xs leading-normal">
                  Drag and drop a JPG image here, or <strong>click to browse files</strong>
                </p>
              </div>
            )}

            {uploadError && (
              <p className="text-[10px] text-rose-400 font-mono mt-2 leading-relaxed max-w-xs">{uploadError}</p>
            )}
          </div>

          {/* 3. Search Bar Widget */}
          <div className="relative shrink-0">
            <span className="absolute inset-y-0 left-3.5 flex items-center text-slate-500 pointer-events-none">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search by name, company, job title or OCR word..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-slate-100 pl-10 pr-4 py-2.5 rounded-2xl text-xs font-semibold focus:outline-none focus:border-indigo-500 placeholder-slate-500 transition shadow-inner"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-3.5 flex items-center text-slate-500 hover:text-white text-[10px] font-mono font-bold"
              >
                Clear
              </button>
            )}
          </div>

          {/* 4. Display Cards grid or Interactive Onboarding/Troubleshooting Guide */}
          {cards.length > 0 ? (
            <CardList
              cards={filteredCards}
              searchQuery={searchQuery}
              onCardClick={(card) => setSelectedCard(card)}
              viewLayout={viewLayout}
              setViewLayout={setViewLayout}
              sortBy={sortBy}
              setSortBy={setSortBy}
              token={token}
            />
          ) : !isSyncing ? (
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-300">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800/60">
                <Sparkles className="w-4.5 h-4.5 text-indigo-400 shrink-0" />
                <h3 className="text-sm font-bold font-display text-white">How DriveCard Search Works</h3>
              </div>

              <div className="space-y-4 text-xs leading-relaxed">
                <div className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-indigo-600/15 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-[10px] font-mono shrink-0">1</span>
                  <div>
                    <strong className="text-slate-200">OAuth Consent (Crucial Step)</strong>
                    <p className="text-slate-400 mt-1">
                      During Gmail/Google sign-in, and on the prompt screen, you <strong className="text-indigo-400">MUST tick/check the box</strong> to grant permission to "See and download Google Drive files". If skipped, Google returns empty listings for safety.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-indigo-600/15 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-[10px] font-mono shrink-0">2</span>
                  <div>
                    <strong className="text-slate-200">Drive Location & Target Folder ID</strong>
                    <p className="text-slate-400 mt-1">
                      Paste the Folder ID or direct Drive link into the location bar. If the folder is shared with you via link, log into Google Drive on your computer, open that folder, and click <strong className="text-indigo-400 font-medium">"Add shortcut to Drive"</strong> so the API can view it.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-indigo-600/15 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-[10px] font-mono shrink-0">3</span>
                  <div>
                    <strong className="text-slate-200">Gemini OCR & Local Cache Indexing</strong>
                    <p className="text-slate-400 mt-1">
                      Once connected, the API identifies image files (`.jpg`, `.jpeg`, `.png`, `.webp`), performs visual OCR, detects names/phones/companies via Gemini, and automatically creates a lightweight <code className="text-indigo-300 font-mono text-[10px] bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">_business_cards_index.json</code> cache file inside your folder to read instantly on next loads!
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/60 text-xs space-y-3">
                <div className="flex items-center gap-1.5/2 text-amber-500 font-semibold font-mono text-[10px] uppercase tracking-wider">
                  <AlertTriangle className="w-3.5 h-3.5" /> No results found yet? Try this fix:
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  If the folder status verifying is success but lists 0 cards, you likely missed checking the permission checkbox. Reauth with complete permissions:
                </p>
                <button
                  onClick={handleSignOut}
                  className="w-full py-2 bg-indigo-600/10 hover:bg-indigo-600/25 border border-indigo-500/20 hover:border-indigo-500/45 text-indigo-400 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Sign Out & Sign-in again (Grant Permission)
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-900/10 border border-slate-800/50 rounded-2xl">
              <Loader className="w-6 h-6 text-indigo-400 animate-spin mb-2" />
              <p className="text-xs font-semibold text-slate-300">Synchronizing cache index...</p>
            </div>
          )}

        </div>

        {/* Inspect Card Modal overlay */}
        {selectedCard && (
          <CardDetailModal
            card={selectedCard}
            onClose={() => setSelectedCard(null)}
            token={token}
            folderId={extractFolderId(folderId)}
            onCardUpdated={(updated) => {
              // 1. Update the cards collection
              setCards((prev) => prev.map((c) => (c.fileId === updated.fileId ? updated : c)));
              // 2. Refresh current selection instantly
              setSelectedCard(updated);
            }}
          />
        )}

      </div>
    </MobileFrame>
  );
}
