import React from "react";
import { Mail, Phone, Globe, MapPin, Building, LayoutGrid, List, SlidersHorizontal, Calendar, Eye } from "lucide-react";
import { BusinessCard } from "../types";

interface CardListProps {
  cards: BusinessCard[];
  searchQuery: string;
  onCardClick: (card: BusinessCard) => void;
  viewLayout: "grid" | "list";
  setViewLayout: (layout: "grid" | "list") => void;
  sortBy: string;
  setSortBy: (val: string) => void;
  token: string;
}

export default function CardList({
  cards,
  searchQuery,
  onCardClick,
  viewLayout,
  setViewLayout,
  sortBy,
  setSortBy,
  token,
}: CardListProps) {
  
  // Highlighting text matches safely
  const highlightText = (text: string, highlight: string) => {
    if (!text) return <span>-</span>;
    if (!highlight.trim()) return <span>{text}</span>;
    const regex = new RegExp(`(${highlight.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="bg-indigo-500/30 text-indigo-200 border-b border-indigo-400 px-0.5 rounded font-medium">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  // Sort logic
  const sortedCards = [...cards].sort((a, b) => {
    if (sortBy === "name") {
      return (a.name || "").localeCompare(b.name || "");
    } else if (sortBy === "company") {
      return (a.company || "").localeCompare(b.company || "");
    } else {
      // Date Sort decending
      return new Date(b.indexedAt || "").getTime() - new Date(a.indexedAt || "").getTime();
    }
  });

  return (
    <div className="space-y-4 flex flex-col flex-1 min-h-0">
      
      {/* Filtering Actions bar */}
      <div className="flex items-center justify-between gap-2 shrink-0 bg-slate-900/40 p-3 rounded-2xl border border-slate-800/80">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <SlidersHorizontal className="w-3.5 h-3.5" /> Sort:
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="cursor-pointer bg-slate-950 border border-slate-800 text-slate-200 px-2 py-1 rounded-lg text-xs font-semibold focus:outline-none focus:border-indigo-500 transition"
          >
            <option value="date">Latest Synced</option>
            <option value="name">Holder Name</option>
            <option value="company">Company Name</option>
          </select>
        </div>

        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
          <button
            onClick={() => setViewLayout("grid")}
            className={`p-1.5 rounded-lg cursor-pointer transition ${viewLayout === "grid" ? "bg-slate-800 text-white" : "text-slate-500 hover:text-white"}`}
            title="Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewLayout("list")}
            className={`p-1.5 rounded-lg cursor-pointer transition ${viewLayout === "list" ? "bg-slate-800 text-white" : "text-slate-500 hover:text-white"}`}
            title="List View"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {sortedCards.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-910/20 text-center border border-slate-800/50 rounded-2xl">
          <span className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center mb-3 text-slate-500 font-display">?</span>
          <p className="text-sm font-semibold text-slate-300">No cards matched search query</p>
          <p className="text-xs text-slate-500 max-w-xs mt-1">Try adapting searching variables or check if folder is completely synchronized.</p>
        </div>
      ) : viewLayout === "grid" ? (
        
        /* Grid Layout (Simulated actual cards) */
        <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4">
          {sortedCards.map((card) => (
            <div
              key={card.fileId}
              onClick={() => onCardClick(card)}
              className={`group cursor-pointer bg-slate-900 border rounded-2xl overflow-hidden flex flex-col aspect-[1.62/1] relative p-4 transition-all duration-300 transform active:scale-[0.99] ${
                card.isPending 
                  ? "border-amber-500/20 hover:border-amber-500/50 hover:shadow-[0_0_15px_rgba(245,158,11,0.06)]"
                  : "border-slate-800/80 hover:border-indigo-500/50 hover:shadow-[0_0_15px_rgba(79,70,229,0.1)]"
              }`}
            >
              {/* Background card accent line */}
              <div className={`absolute top-0 left-0 w-1.5 h-full ${card.isPending ? "bg-amber-500/80" : "bg-gradient-to-ob from-indigo-500 to-violet-500"}`} />
              
              <div className="flex justify-between items-start mb-2 gap-2">
                <div className="min-w-0">
                  <span className={`text-[9px] font-bold font-mono tracking-wider px-1.5 py-0.5 rounded uppercase ${
                    card.isPending 
                      ? "text-amber-400 bg-amber-500/10 border border-amber-500/15"
                      : "text-indigo-400 bg-indigo-600/10 border border-indigo-500/15"
                  }`}>
                    {highlightText(card.company, searchQuery)}
                  </span>
                  <h3 className={`text-sm font-bold font-display mt-2 truncate ${card.isPending ? "text-amber-200" : "text-white"}`}>
                    {card.isPending ? "Click to Analyze" : highlightText(card.name, searchQuery)}
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {card.isPending ? "Unindexed Business Card" : highlightText(card.title, searchQuery)}
                  </p>
                </div>
 
                {/* Thumb Preview proxy */}
                <div className="w-14 h-10 bg-slate-950/80 rounded border border-slate-800/60 overflow-hidden flex items-center justify-center shrink-0">
                  <img
                    src={`/api/drive/image/${card.fileId}?token=${encodeURIComponent(token)}`}
                    alt={card.name}
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
              </div>
 
              {/* Dynamic contact badges */}
              <div className="mt-auto space-y-1.5 text-[10px] text-slate-400 border-t border-slate-800/60 pt-2 font-mono">
                {card.isPending ? (
                  <div className="flex items-center gap-1.5 text-amber-400/80 text-[9px] py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                    <span className="truncate">OCR pending. Click to extract details.</span>
                  </div>
                ) : (
                  <>
                    {card.phones.length > 0 && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Phone className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span className="truncate">{highlightText(card.phones[0], searchQuery)}</span>
                      </div>
                    )}
                    {card.emails.length > 0 && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Mail className="w-3 h-3 text-indigo-400 shrink-0" />
                        <span className="truncate">{highlightText(card.emails[0], searchQuery)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
 
              {/* Details inspection badge */}
              <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition duration-200">
                <span className={`text-[9px] border font-mono px-2 py-1 rounded-md flex items-center gap-1 select-none ${
                  card.isPending 
                    ? "bg-slate-800 border-amber-500/20 text-amber-300"
                    : "bg-slate-800 border-slate-700 text-slate-300"
                }`}>
                  <Eye className={`w-3 h-3 ${card.isPending ? "text-amber-400" : "text-indigo-400"}`} /> {card.isPending ? "Analyze" : "Inspect"}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        
        /* List Layout (Dense Table layout) */
        <div className="flex-1 overflow-y-auto pr-1 space-y-2 pb-4">
          {sortedCards.map((card) => (
            <div
              key={card.fileId}
              onClick={() => onCardClick(card)}
              className={`w-full flex items-center justify-between p-3.5 bg-slate-900 hover:bg-slate-800/50 border cursor-pointer rounded-xl transition duration-200 group relative truncate ${
                card.isPending ? "border-amber-500/20 hover:border-amber-500/45" : "border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-10 bg-slate-950/80 rounded-lg border border-slate-800/60 overflow-hidden flex items-center justify-center shrink-0">
                  <img
                    src={`/api/drive/image/${card.fileId}?token=${encodeURIComponent(token)}`}
                    alt={card.name}
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
 
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] font-bold truncate ${card.isPending ? "text-amber-200/95" : "text-white"}`}>
                      {card.isPending ? "Click to Analyze Card" : highlightText(card.name, searchQuery)}
                    </span>
                    <span className={`text-[9px] border px-1.5 py-0.5 rounded font-bold font-mono uppercase shrink-0 ${
                      card.isPending 
                        ? "text-amber-400 bg-amber-500/10 border-amber-500/15" 
                        : "text-indigo-400 bg-indigo-600/10 border-indigo-500/15"
                    }`}>
                      {highlightText(card.company, searchQuery)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1 truncate">
                    <span className="truncate">{card.isPending ? "AI resolution available" : highlightText(card.title, searchQuery)}</span>
                    {!card.isPending && card.phones.length > 0 && (
                      <span className="flex items-center gap-1 shrink-0 bg-slate-950/50 px-1.5 py-0.5 rounded border border-slate-800 text-[9px] font-mono">
                        <Phone className="w-2.5 h-2.5 text-emerald-500" /> {card.phones[0]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
 
              {/* End Icon trigger details */}
              <div className="text-slate-500 group-hover:text-white transition shrink-0 ml-4">
                <Eye className={`w-4 h-4 ${card.isPending ? "text-amber-400" : "text-indigo-500/70"}`} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
