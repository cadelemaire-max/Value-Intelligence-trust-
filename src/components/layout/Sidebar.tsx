import React from 'react';
import { Brain, List, PieChart as PieChartIcon, Briefcase, Activity, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { ViewState } from '../../types';

interface SidebarProps {
  view: ViewState;
  setView: (view: ViewState) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ view, setView }) => {
  return (
    <nav className="hidden md:flex w-20 lg:w-64 bg-slate-900 border-r border-slate-800 flex-col p-4 sticky top-0 h-screen z-50">
      <div className="flex items-center gap-3 mb-10 px-2">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
          <Brain className="text-white w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-white hidden lg:block">APEA Elite</h1>
      </div>
      
      <div className="flex flex-row md:flex-col gap-2 flex-1">
        {[
          { id: 'fixtures', icon: List, label: 'Fixtures' },
          { id: 'analytics', icon: PieChartIcon, label: 'Analytics' },
          { id: 'portfolio', icon: Briefcase, label: 'Portfolio' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id as ViewState)}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl transition-all group relative",
              view === item.id ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-500 hover:bg-slate-800 hover:text-slate-300"
            )}
          >
            <item.icon size={24} />
            <span className="hidden lg:block font-bold">{item.label}</span>
            {view === item.id && <motion.div layoutId="nav-pill" className="absolute left-0 w-1 h-6 bg-white rounded-full hidden lg:block" />}
          </button>
        ))}
      </div>

      <div className="mt-auto hidden md:block">
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 mb-4 hidden lg:block">
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">System Status</p>
          <div className="flex items-center gap-2 text-xs text-green-400 font-bold">
            <Activity size={14} className="animate-pulse" />
            Optimal
          </div>
        </div>
        <button className="w-full p-3 text-slate-500 hover:text-white transition-colors flex justify-center lg:justify-start items-center gap-3">
          <Info size={24} />
          <span className="hidden lg:block font-bold">Help</span>
        </button>
      </div>
    </nav>
  );
};
