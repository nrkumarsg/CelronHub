import React, { useState, useEffect } from "react";
import { Supplier } from "../types";
import { Compass, Ship, Globe, HelpCircle, ArrowUpDown, ChevronRight, MapPin } from "lucide-react";

interface RadarViewProps {
  suppliers: Supplier[];
  searchQuery: string;
}

export default function RadarView({ suppliers, searchQuery }: RadarViewProps) {
  const [maxDistance, setMaxDistance] = useState<number>(20000);
  const [sortBy, setSortBy] = useState<"distance" | "match">("distance");
  const [activeRadarIndex, setActiveRadarIndex] = useState<number | null>(null);

  // Filter suppliers by distance
  const filteredSuppliers = suppliers.filter((s) => s.distance <= maxDistance);

  // Sort based on selection
  const sortedSuppliers = [...filteredSuppliers].sort((a, b) => {
    if (sortBy === "distance") {
      return a.distance - b.distance;
    } else {
      return b.matchScore - a.matchScore;
    }
  });

  // Calculate coordinates for SVG Visualization
  // We place Singapore at the center (150, 150) inside a 300x300 SVG.
  // We map distance in km (0 to 20000) to a radius (0 to 140).
  const getCoordinatesForDistance = (distance: number, index: number) => {
    const center = 150;
    const maxRadius = 130;
    
    // Logarithmic or proportional scaling to make both close (0km) and far (15000km) visible nicely.
    // Let's use a power scale (d ^ 0.5) to keep spacing beautiful
    const radius = distance === 0 
      ? 12 
      : Math.min(12 + Math.pow(distance / 20000, 0.6) * (maxRadius - 12), maxRadius);

    // Spread angles smoothly around the circle based on index so dots don't overlap
    const angle = (index * 55 + 25) * (Math.PI / 180);
    
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
      radius
    };
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-900 text-slate-100 p-6 rounded-2xl border border-slate-800 shadow-2xl" id="radar-expansion-container">
      {/* Visual Radar Column */}
      <div className="lg:col-span-5 flex flex-col items-center bg-slate-950/80 p-6 rounded-xl border border-slate-800 relative overflow-hidden">
        {/* Animated Radar Background Grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-20"></div>
        
        <div className="w-full flex justify-between items-center mb-4 z-10">
          <div>
            <h3 className="text-sm font-semibold tracking-wider text-cyan-400 uppercase flex items-center gap-1.5">
              <Compass className="w-4 h-4 animate-spin-slow text-cyan-400" />
              Singapore Zero Point Radar
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Dynamic global radius expansion</p>
          </div>
          <span className="text-xs font-mono bg-cyan-950 text-cyan-400 px-2.5 py-1 rounded-full border border-cyan-800">
            Active Sweep
          </span>
        </div>

        {/* The SVG Radar Interface */}
        <div className="relative w-72 h-72 my-2 bg-slate-950 rounded-full border border-slate-800 flex items-center justify-center shadow-[0_0_30px_rgba(6,182,212,0.15)] overflow-hidden">
          {/* Glowing sweeping animation line */}
          <div 
            className="absolute top-1/2 left-1/2 w-[150px] h-[150px] bg-gradient-to-tr from-cyan-500/20 to-transparent origin-bottom-left -translate-y-full"
            style={{
              animation: "radar-sweep 5s infinite linear",
              transformOrigin: "0% 100%"
            }}
          />

          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 300">
            {/* Concentric distance rings */}
            <circle cx="150" cy="150" r="130" fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
            <circle cx="150" cy="150" r="100" fill="none" stroke="#334155" strokeWidth="1" />
            <circle cx="150" cy="150" r="70" fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
            <circle cx="150" cy="150" r="40" fill="none" stroke="#334155" strokeWidth="1" />
            <circle cx="150" cy="150" r="15" fill="none" stroke="#0891b2" strokeWidth="1.5" className="animate-pulse" />

            {/* Crosshairs */}
            <line x1="10" y1="150" x2="290" y2="150" stroke="#334155" strokeWidth="0.5" />
            <line x1="150" y1="10" x2="150" y2="290" stroke="#334155" strokeWidth="0.5" />

            {/* Ring Labels */}
            <text x="150" y="142" fill="#0891b2" fontSize="8" className="font-mono text-[8px] font-bold" textAnchor="middle">SG: (0 km)</text>
            <text x="150" y="106" fill="#475569" fontSize="7" className="font-mono text-[7px]" textAnchor="middle">2,500 km</text>
            <text x="150" y="76" fill="#475569" fontSize="7" className="font-mono text-[7px]" textAnchor="middle">7,500 km</text>
            <text x="150" y="46" fill="#475569" fontSize="7" className="font-mono text-[7px]" textAnchor="middle">13,500 km</text>
            <text x="150" y="16" fill="#475569" fontSize="7" className="font-mono text-[7px]" textAnchor="middle">20,000 km</text>

            {/* Singapore central target dot */}
            <g>
              <circle cx="150" cy="150" r="5" fill="#22c55e" />
              <circle cx="150" cy="150" r="10" fill="none" stroke="#22c55e" strokeWidth="1" className="animate-ping" style={{ animationDuration: '3s' }} />
            </g>

            {/* Supplier dot positions */}
            {sortedSuppliers.map((sup, idx) => {
              const coords = getCoordinatesForDistance(sup.distance, idx);
              const isSg = sup.distance <= 15;
              const isSelected = activeRadarIndex === idx;

              return (
                <g key={idx} 
                   className="cursor-pointer group"
                   onClick={() => setActiveRadarIndex(isSelected ? null : idx)}
                   onMouseEnter={() => setActiveRadarIndex(idx)}
                >
                  {/* Pulsing ring for selected state */}
                  {isSelected && (
                    <circle 
                      cx={coords.x} 
                      cy={coords.y} 
                      r="12" 
                      fill="none" 
                      stroke={isSg ? "#10b981" : "#06b6d4"} 
                      strokeWidth="1.5" 
                      className="animate-ping"
                    />
                  )}

                  {/* Outer glow aura on hover */}
                  <circle 
                    cx={coords.x} 
                    cy={coords.y} 
                    r="8" 
                    fill={isSg ? "rgba(16,185,129,0.2)" : "rgba(6,182,212,0.2)"} 
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  />

                  {/* Supplier marker dot */}
                  <circle 
                    cx={coords.x} 
                    cy={coords.y} 
                    r={isSelected ? "5.5" : "4.5"} 
                    fill={isSg ? "#10b981" : "#06b6d4"} 
                    className="transition-all stroke-slate-950 stroke-1"
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected Dot Overlay Information */}
        <div className="w-full mt-4 bg-slate-900/90 rounded-lg p-3 border border-slate-800 z-10 min-h-[72px]">
          {activeRadarIndex !== null && sortedSuppliers[activeRadarIndex] ? (
            <div>
              <div className="flex justify-between items-start">
                <h4 className="text-xs font-semibold text-white line-clamp-1">{sortedSuppliers[activeRadarIndex].name}</h4>
                <span className="text-[10px] font-mono font-medium text-cyan-400 bg-cyan-950 px-1.5 py-0.5 rounded ml-2 whitespace-nowrap">
                  {sortedSuppliers[activeRadarIndex].distance === 0 ? "Singapore Hub" : `${sortedSuppliers[activeRadarIndex].distance.toLocaleString()} km`}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1 line-clamp-2">
                <strong className="text-slate-400">Availability:</strong> {sortedSuppliers[activeRadarIndex].stockStatus}
                <br />
                <span className="text-slate-400 font-medium">Brands:</span> {sortedSuppliers[activeRadarIndex].availableBrandsInfo}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center p-2 text-center h-full text-xs text-slate-500">
              <p>Hover or click any beacon on the scan field to preview supplier details and radial layout</p>
            </div>
          )}
        </div>

        {/* Quick Legend tags */}
        <div className="w-full mt-3 flex justify-center gap-4 text-[10px] text-slate-400 z-10 border-t border-slate-800/80 pt-2">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
            <span>Singapore Center (0 Point)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 inline-block"></span>
            <span>Global Supplier Beacons</span>
          </div>
        </div>
      </div>

      {/* Interactive Controls & List Column */}
      <div className="lg:col-span-7 flex flex-col bg-slate-950/40 p-5 rounded-xl border border-slate-800">
        {/* Dynamic Controls Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-800 gap-3">
          <div>
            <h3 className="text-base font-medium text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-indigo-400" />
              Dynamic Kilometer Expansion
            </h3>
            <p className="text-xs text-slate-400">Displaying matching global inventory expanded incrementally</p>
          </div>

          {/* Sort selection action */}
          <div className="flex items-center bg-slate-900 rounded-lg p-1 border border-slate-800 text-xs">
            <button 
              onClick={() => setSortBy("distance")} 
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${sortBy === "distance" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              Closest First (0km Point)
            </button>
            <button 
              onClick={() => setSortBy("match")} 
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${sortBy === "match" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              AI Custom Match
            </button>
          </div>
        </div>

        {/* Max Distance Slider Widget */}
        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 my-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-slate-400 font-medium">Global Supply Radius Limit:</span>
            <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800">
              {maxDistance === 20000 ? "Maximum Radius (Worldwide)" : `≤ ${maxDistance.toLocaleString()} km away`}
            </span>
          </div>
          <input 
            type="range" 
            min="10" 
            max="20000" 
            step="100"
            value={maxDistance}
            onChange={(e) => setMaxDistance(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 my-2"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
            <span>Singapore (0km)</span>
            <span>East Asia / Middle East (5K)</span>
            <span>Europe / Africa (10K)</span>
            <span>Americas (20K)</span>
          </div>
        </div>

        {/* Counter results info */}
        <div className="text-xs text-slate-400 mb-3 flex justify-between items-center px-1">
          <span>Found <strong className="text-indigo-400 font-semibold">{sortedSuppliers.length} suppliers</strong> within specified limits.</span>
          {searchQuery && (
            <span className="text-[10px] italic bg-slate-900 px-2 py-0.5 rounded text-slate-500">
              Criteria: &quot;{searchQuery}&quot;
            </span>
          )}
        </div>

        {/* Incremental items list */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[380px]" style={{ scrollbarWidth: 'thin' }}>
          {sortedSuppliers.length > 0 ? (
            sortedSuppliers.map((supplier, index) => {
              const isLocalSG = supplier.distance <= 15;
              const isSelectedOnRadar = activeRadarIndex === index;

              return (
                <div 
                  key={index}
                  onMouseEnter={() => setActiveRadarIndex(index)}
                  className={`p-4 rounded-xl transition-all border text-left ${
                    isLocalSG 
                      ? "bg-gradient-to-r from-emerald-950/20 to-slate-900/60 border-emerald-900/50 hover:border-emerald-500/80" 
                      : "bg-slate-900/40 border-slate-800/80 hover:border-slate-700/80"
                  } ${isSelectedOnRadar ? "ring-2 ring-indigo-500 border-indigo-500/40" : ""}`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      {/* Name and segment badge */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white group-hover:text-cyan-400">
                          {supplier.name}
                        </span>
                        {isLocalSG && (
                          <span className="text-[10px] bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-800 font-medium">
                            Singapore Hub (0 Point)
                          </span>
                        )}
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md">
                          {supplier.industrySegment}
                        </span>
                      </div>

                      {/* City/Country location label */}
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        {supplier.location}
                        <span className="mx-1 text-slate-600">•</span>
                        <span className="font-mono text-cyan-400 bg-cyan-950/50 px-1.5 py-0.2 rounded text-[10px]">
                          {supplier.distance === 0 ? "0 km" : `${supplier.distance.toLocaleString()} km away`}
                        </span>
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-900 inline-block">
                        {supplier.matchScore}% Match
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1.5 font-mono">{supplier.stockStatus}</p>
                    </div>
                  </div>

                  {/* Available brands & recommend descriptions */}
                  <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-300 grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/30 p-2.5 rounded-lg">
                    <div>
                      <strong className="text-slate-400 block text-[10px] mb-0.5 uppercase tracking-wider">Identified Matching Inventory</strong>
                      <span className="font-mono text-slate-200 text-xs font-medium">{supplier.availableBrandsInfo}</span>
                    </div>
                    <div>
                      <strong className="text-slate-400 block text-[10px] mb-0.5 uppercase tracking-wider">Specialist Sourcing Intel</strong>
                      <span className="text-slate-300 font-light text-[11px] leading-relaxed line-clamp-2">{supplier.whyRecommended}</span>
                    </div>
                  </div>

                  {/* Supplier contact & direct procurement details helper info */}
                  <div className="mt-3 flex justify-between items-center text-[11px] text-slate-400">
                    <span className="truncate">Contact: <strong className="text-slate-300">{supplier.contactPerson}</strong></span>
                    <a 
                      href={supplier.website.startsWith("http") ? supplier.website : `https://${supplier.website}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-0.5 bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-900/50 hover:border-indigo-500"
                    >
                      Supplier Platform
                      <ChevronRight className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-900/20 rounded-xl border border-dashed border-slate-800 text-slate-500">
              <p className="text-sm">No suppliers found within {maxDistance.toLocaleString()} km radius.</p>
              <button 
                onClick={() => setMaxDistance(20000)}
                className="mt-3 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-medium transition-all"
              >
                Reset Distance Filter to Maximum
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
