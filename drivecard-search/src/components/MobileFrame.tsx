import React, { useEffect, useState } from "react";
import { Laptop, Smartphone, Wifi, Battery, Signal } from "lucide-react";

interface MobileFrameProps {
  children: React.ReactNode;
  isMobileMode: boolean;
  setIsMobileMode: (val: boolean) => void;
}

export default function MobileFrame({ children, isMobileMode, setIsMobileMode }: MobileFrameProps) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      setTime(`${hours}:${minutes} ${ampm}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000); // update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col items-center justify-start p-4 md:p-6 transition-all relative overflow-hidden">
      
      {/* Dynamic ambient backgrounds */}
      <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[50%] bg-indigo-600/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-violet-600/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Floating Toolbar for Workspace Switching */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-6 z-20 bg-slate-900/60 border border-slate-800 p-3.5 rounded-2xl backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/35 flex items-center justify-center text-indigo-400">
            <Smartphone className="w-5.5 h-5.5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-wide text-white font-display">DriveCard Mobile Simulator</h1>
            <p className="text-[10px] text-slate-400 font-mono">TypeScript Full-Stack Interface</p>
          </div>
        </div>

        {/* Workspace Mode switch triggers */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setIsMobileMode(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
              isMobileMode
                ? "bg-indigo-600 font-bold text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Smartphone className="w-4 h-4" /> 📱 Mobile App
          </button>
          <button
            onClick={() => setIsMobileMode(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
              !isMobileMode
                ? "bg-indigo-600 font-bold text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Laptop className="w-4 h-4" /> 💻 Desktop Dashboard
          </button>
        </div>
      </div>

      {/* Main viewport canvas */}
      {isMobileMode ? (
        <div className="relative mx-auto border-[12px] border-slate-900 w-full max-w-[400px] h-[820px] rounded-[52px] bg-slate-950 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col z-10 transition-all duration-300">
          
          {/* Virtual Notch and camera bezel */}
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 h-7 w-36 bg-slate-900 rounded-b-2xl z-50 flex items-center justify-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-slate-950 border border-slate-800/80"></span>
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/40"></span>
          </div>

          {/* Device status header bar */}
          <div className="h-10 px-6 pt-2 select-none flex items-center justify-between text-[11px] font-bold font-mono text-slate-400 bg-slate-950 shrink-0 z-40">
            <span>{time || "11:58 AM"}</span>
            <div className="flex items-center gap-1.5 pt-0.5">
              <Signal className="w-3.5 h-3.5" />
              <Wifi className="w-3.5 h-3.5" />
              <div className="flex items-center gap-0.5">
                <span className="text-[9px] font-semibold">94%</span>
                <Battery className="w-4 h-4 rotate-18 bg-current/20 rounded-sm" />
              </div>
            </div>
          </div>

          {/* Real simulated application body */}
          <div className="flex-1 overflow-hidden relative flex flex-col bg-slate-950">
            {children}
          </div>

          {/* Device virtual home strip */}
          <div className="h-5 bg-slate-950 flex items-center justify-center shrink-0 z-40">
            <div className="w-28 h-1 bg-slate-800 rounded-full"></div>
          </div>

        </div>
      ) : (
        <div className="w-full max-w-7xl flex-1 bg-slate-900 border border-slate-800/80 rounded-3xl overflow-hidden shadow-2xl flex flex-col z-10 transition-all duration-300">
          {children}
        </div>
      )}
    </div>
  );
}
