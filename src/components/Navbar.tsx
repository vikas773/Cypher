import React from 'react';
import { Cpu, ShieldCheck, Zap, Layers, RefreshCw } from 'lucide-react';

interface NavbarProps {
  onOpenSimulator: () => void;
  onOpenBatchRepair: () => void;
  onReset: () => void;
  hasActiveFile: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenSimulator,
  onOpenBatchRepair,
  onReset,
  hasActiveFile,
}) => {
  return (
    <header className="cypher-navbar flex items-center justify-between px-6 py-4 bg-slate-950/80 backdrop-blur-md border-b border-cyan-500/20 sticky top-0 z-50">
      {/* Top Left Corner Glowing Cypher Logo & Home Button */}
      <button
        onClick={onReset}
        className="cypher-logo-home-btn group relative flex items-center gap-3 bg-transparent hover:bg-transparent border-0 p-0 transition-all duration-300 cursor-pointer outline-none"
        title="Return to Cypher Home Page"
        aria-label="Cypher Home Button"
      >
        <div className="relative z-10 flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-500/25 text-cyan-300 group-hover:text-white border border-cyan-400/60 group-hover:border-cyan-300 transition-all shadow-[0_0_16px_rgba(6,182,212,0.6)] group-hover:shadow-[0_0_24px_rgba(6,182,212,0.85)]">
          <Cpu size={20} className="animate-pulse text-cyan-300" />
        </div>
        <div className="relative z-10 text-left flex flex-col">
          <span className="text-lg font-black tracking-wider text-white group-hover:text-cyan-200 font-mono leading-none drop-shadow-[0_0_12px_rgba(6,182,212,0.7)]">
            CYPHER
          </span>
          <span className="text-[10px] font-bold tracking-widest text-cyan-400 group-hover:text-cyan-300 uppercase leading-tight mt-0.5">
            RECONSTRUCTOR
          </span>
        </div>
      </button>

      <div className="navbar-actions flex items-center gap-3">
        {hasActiveFile && (
          <button className="cypher-btn btn-secondary flex items-center gap-2" onClick={onReset} title="Load New File">
            <RefreshCw size={16} />
            <span>New Scan</span>
          </button>
        )}

        <button className="cypher-btn btn-secondary flex items-center gap-2" onClick={onOpenBatchRepair} title="Batch Repair Queue">
          <Layers size={16} className="text-violet-400" />
          <span>Batch Queue</span>
        </button>

        <button className="cypher-btn btn-accent flex items-center gap-2" onClick={onOpenSimulator} title="Stress Test & Corruptor Lab">
          <Zap size={16} className="text-yellow-400" />
          <span>Corruptor Lab</span>
          <span className="btn-badge">Demo</span>
        </button>

        <div className="engine-status hidden sm:flex items-center gap-2 bg-emerald-950/40 border border-emerald-500/30 rounded-full px-3 py-1.5 text-xs font-mono">
          <ShieldCheck size={16} className="text-emerald-400" />
          <div className="status-info flex flex-col leading-tight">
            <span className="status-label text-[9px] text-gray-400 font-sans">HEURISTIC ENGINES</span>
            <span className="status-value text-emerald-400 font-bold">READY (25+ FORMATS)</span>
          </div>
        </div>
      </div>
    </header>
  );
};
