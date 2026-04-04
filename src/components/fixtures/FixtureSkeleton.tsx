import React from 'react';

export const FixtureSkeleton = () => (
  <div className="bg-slate-900 border border-slate-800 rounded-2xl md:rounded-3xl p-4 md:p-6 animate-pulse">
    <div className="flex flex-col lg:flex-row items-center gap-4 md:gap-8">
      <div className="flex-1 flex items-center gap-4 md:gap-6 w-full">
        <div className="min-w-[60px] md:min-w-[80px] space-y-2">
          <div className="h-2 bg-slate-800 rounded w-1/2 mx-auto" />
          <div className="h-3 bg-slate-800 rounded w-full mx-auto" />
        </div>
        <div className="flex-1 flex items-center justify-center gap-3 md:gap-4">
          <div className="h-4 bg-slate-800 rounded w-1/3" />
          <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-800 rounded-full" />
          <div className="h-4 bg-slate-800 rounded w-1/3" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 md:gap-4 w-full lg:w-auto">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-slate-950 px-3 py-2 rounded-xl md:rounded-2xl border border-slate-800/50 h-12 w-20" />
        ))}
      </div>
    </div>
  </div>
);
