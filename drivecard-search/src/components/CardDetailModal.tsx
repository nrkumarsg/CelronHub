import React, { useState } from "react";
import { X, Copy, Check, Mail, Phone, MapPin, Globe, Layout, User, Briefcase, FileText } from "lucide-react";
import { BusinessCard } from "../types";

interface CardDetailModalProps {
  card: BusinessCard | null;
  onClose: () => void;
  token: string;
  folderId: string;
  onCardUpdated?: (updated: BusinessCard) => void;
}

export default function CardDetailModal({ card, onClose, token, folderId, onCardUpdated }: CardDetailModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showOcr, setShowOcr] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!card) return null;

  // Render file URL directed through our secure backend proxy using tokens
  const imageUrl = `/api/drive/image/${card.fileId}?token=${encodeURIComponent(token)}`;

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleSingleIndex = async () => {
    setIsIndexing(true);
    setError(null);
    try {
      const res = await fetch("/api/drive/cards/index-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: card.fileId,
          folderId,
          token,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to index business card");
      }

      const data = await res.json();
      if (data.card && onCardUpdated) {
        onCardUpdated(data.card);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during OCR extraction.");
    } finally {
      setIsIndexing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div>
            <span className="text-xs font-mono text-indigo-400 font-medium">Business Card Inspector</span>
            <h2 className="text-lg font-bold font-display text-white truncate max-w-sm">{card.name}</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body Scroll Container */}
        <div className="overflow-y-auto p-6 space-y-6 flex-1">
          
          {/* Card image canvas */}
          <div className="relative group bg-slate-950/80 rounded-2xl overflow-hidden aspect-[1.62/1] border border-slate-800/80 flex items-center justify-center p-2 shadow-inner">
            <img 
              src={imageUrl} 
              alt={card.name} 
              className="max-h-full max-w-full rounded-lg object-contain shadow-md transition-all duration-300 group-hover:scale-[1.01]"
              onError={(e) => {
                // If direct loading fails, render an aesthetic modern card backup
                (e.target as HTMLElement).style.display = "none";
              }}
            />
            {/* Overlay indicators */}
            <div className="absolute top-2 right-2 bg-slate-900/90 text-slate-300 font-mono text-[9px] border border-slate-800 px-2 py-0.5 rounded-md">
              Target File
            </div>
          </div>

          {card.isPending && (
            <div className="bg-amber-950/20 border border-amber-500/20 rounded-2xl p-5 space-y-4 flex flex-col items-center text-center">
              <div className="space-y-1">
                <span className="text-amber-400 font-mono text-[10px] font-bold uppercase tracking-wider">Unindexed Resource</span>
                <h4 className="text-sm font-bold text-slate-100">Extract Card Details & Transcribe OCR</h4>
                <p className="text-xs text-slate-400 max-w-md">
                  This card was identified in your folder but has not been parsed yet. Click below to index its content dynamically with Google Gemini 3.5!
                </p>
              </div>
              <button
                disabled={isIndexing}
                onClick={handleSingleIndex}
                className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-slate-950 px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 cursor-pointer"
              >
                {isIndexing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-slate-950" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Extracting details...
                  </>
                ) : (
                  <>⚡ Extract Details & Save index</>
                )}
              </button>
              {error && <p className="text-xs text-rose-400 font-mono">{error}</p>}
            </div>
          )}

          {/* Quick Actions Panel */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {card.emails.length > 0 && (
              <a 
                href={`mailto:${card.emails[0]}`}
                className="flex items-center gap-2 justify-center py-2.5 px-3 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 text-xs font-semibold border border-indigo-500/15 transition-all text-center"
              >
                <Mail className="w-4 h-4" /> Email Person
              </a>
            )}
            {card.phones.length > 0 && (
              <a 
                href={`tel:${card.phones[0]}`}
                className="flex items-center gap-2 justify-center py-2.5 px-3 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 text-xs font-semibold border border-emerald-500/15 transition-all text-center"
              >
                <Phone className="w-4 h-4" /> Call Number
              </a>
            )}
            {card.website && (
              <a 
                href={card.website.startsWith("http") ? card.website : `https://${card.website}`}
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-2 justify-center py-2.5 px-3 rounded-xl bg-violet-600/10 hover:bg-violet-600/20 text-violet-400 text-xs font-semibold border border-violet-500/15 transition-all text-center"
              >
                <Globe className="w-4 h-4" /> Visit Website
              </a>
            )}
            <button 
              onClick={() => setShowOcr(!showOcr)}
              className={`flex items-center gap-2 justify-center py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all text-center ${
                showOcr 
                ? "bg-amber-600/20 border-amber-500/35 text-amber-400" 
                : "bg-slate-800 hover:bg-slate-700 border-slate-700/60 text-slate-300"
              }`}
            >
              <FileText className="w-4 h-4" /> {showOcr ? "View Layout" : "View Raw OCR"}
            </button>
          </div>

          {/* Conditional Layout Details or Raw OCR */}
          {showOcr ? (
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 space-y-2">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800/50">
                <span className="text-xs font-bold text-amber-400 font-mono tracking-wider uppercase flex items-center gap-1.5/2">
                  <FileText className="w-4 h-4" /> Raw OCR Transcription
                </span>
                <button
                  onClick={() => handleCopy(card.ocrText, "ocrText")}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                >
                  {copiedField === "ocrText" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap pt-2 select-all break-words">
                {card.ocrText || "No readable metadata transcript found."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Organized grid of fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Holder details */}
                <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4 flex gap-3 text-sm">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] text-slate-500 font-medium tracking-wider uppercase">Person Name</span>
                    <p className="text-sm font-semibold text-slate-100 flex items-center justify-between gap-1 mt-0.5">
                      <span className="truncate">{card.name}</span>
                      <button 
                        onClick={() => handleCopy(card.name, "name")} 
                        className="p-1 text-slate-500 hover:text-indigo-400 rounded transition shrink-0"
                      >
                        {copiedField === "name" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </p>
                  </div>
                </div>

                {/* Job Title */}
                <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4 flex gap-3 text-sm">
                  <div className="w-9 h-9 rounded-xl bg-violet-600/10 border border-violet-500/15 flex items-center justify-center text-violet-400 shrink-0">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] text-slate-500 font-medium tracking-wider uppercase">Job Title / Role</span>
                    <p className="text-sm font-semibold text-slate-100 flex items-center justify-between gap-1 mt-0.5">
                      <span className="truncate">{card.title}</span>
                      <button 
                        onClick={() => handleCopy(card.title, "title")} 
                        className="p-1 text-slate-500 hover:text-indigo-400 rounded transition shrink-0"
                      >
                        {copiedField === "title" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </p>
                  </div>
                </div>

                {/* Company Name */}
                <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4 flex gap-3 text-sm">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
                    <Layout className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] text-slate-500 font-medium tracking-wider uppercase">Company</span>
                    <p className="text-sm font-semibold text-slate-100 flex items-center justify-between gap-1 mt-0.5">
                      <span className="truncate">{card.company}</span>
                      <button 
                        onClick={() => handleCopy(card.company, "company")} 
                        className="p-1 text-slate-500 hover:text-indigo-400 rounded transition shrink-0"
                      >
                        {copiedField === "company" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </p>
                  </div>
                </div>

                {/* Website */}
                <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4 flex gap-3 text-sm">
                  <div className="w-9 h-9 rounded-xl bg-violet-600/10 border border-violet-500/15 flex items-center justify-center text-violet-400 shrink-0">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] text-slate-500 font-medium tracking-wider uppercase">Website</span>
                    <p className="text-sm font-semibold text-slate-100 flex items-center justify-between gap-1 mt-0.5">
                      <span className="truncate">{card.website || "N/A"}</span>
                      {card.website && (
                        <button 
                          onClick={() => handleCopy(card.website, "website")} 
                          className="p-1 text-slate-500 hover:text-indigo-400 rounded transition shrink-0"
                        >
                          {copiedField === "website" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </p>
                  </div>
                </div>

              </div>

              {/* Dynamic contact listings (Emails & Phone numbers can exceed 1) */}
              <div className="space-y-4">
                {/* Contact numbers */}
                <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-5 text-sm">
                  <span className="text-[10px] text-slate-500 font-medium tracking-wider uppercase block mb-3">Phone Numbers</span>
                  {card.phones.length > 0 ? (
                    <div className="space-y-2.5">
                      {card.phones.map((phone, pIdx) => (
                        <div key={pIdx} className="flex items-center justify-between bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-xl">
                          <a href={`tel:${phone}`} className="flex items-center gap-2.5 text-slate-200 hover:text-emerald-400 font-mono transition">
                            <Phone className="w-4 h-4 text-emerald-500/80" />
                            <span>{phone}</span>
                          </a>
                          <button 
                            onClick={() => handleCopy(phone, `phone-${pIdx}`)} 
                            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                          >
                            {copiedField === `phone-${pIdx}` ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No contact numbers detected</p>
                  )}
                </div>

                {/* Email addresses */}
                <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-5 text-sm">
                  <span className="text-[10px] text-slate-500 font-medium tracking-wider uppercase block mb-3">Email Addresses</span>
                  {card.emails.length > 0 ? (
                    <div className="space-y-2.5">
                      {card.emails.map((email, eIdx) => (
                        <div key={eIdx} className="flex items-center justify-between bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-xl">
                          <a href={`mailto:${email}`} className="flex items-center gap-2.5 text-slate-200 hover:text-indigo-400 font-mono transition">
                            <Mail className="w-4 h-4 text-indigo-500/80" />
                            <span>{email}</span>
                          </a>
                          <button 
                            onClick={() => handleCopy(email, `email-${eIdx}`)} 
                            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                          >
                            {copiedField === `email-${eIdx}` ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No emails detected</p>
                  )}
                </div>

                {/* Office Location */}
                {card.address && (
                  <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-5 text-sm">
                    <span className="text-[10px] text-slate-500 font-medium tracking-wider uppercase block mb-2">Office Address</span>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-2.5 text-slate-300">
                        <MapPin className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                        <span className="leading-relaxed text-sm">{card.address}</span>
                      </div>
                      <button 
                        onClick={() => handleCopy(card.address, "address")} 
                        className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition shrink-0"
                      >
                        {copiedField === "address" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer timestamp */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 text-slate-500 text-[10px] font-mono flex items-center justify-between">
          <span>Synced: {new Date(card.indexedAt).toLocaleString()}</span>
          <span>Drive Link: Yes (cached index active)</span>
        </div>
      </div>
    </div>
  );
}
