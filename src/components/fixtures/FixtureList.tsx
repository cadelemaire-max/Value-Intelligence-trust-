import React from 'react';
import { motion } from 'motion/react';
import { FixtureItem } from './FixtureItem';
import { FixtureSkeleton } from './FixtureSkeleton';

interface FixtureListProps {
  signals: any[];
  isLoading: boolean;
  onMatchClick: (match: any) => void;
  onQuickBet: (match: any) => void;
}

export const FixtureList: React.FC<FixtureListProps> = ({ signals, isLoading, onMatchClick, onQuickBet }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4">
        {[1, 2, 3, 4].map(i => <FixtureSkeleton key={i} />)}
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="text-center py-20 bg-slate-900/50 rounded-3xl border border-slate-800 border-dashed">
        <p className="text-slate-500 font-medium">No matches found matching your filters.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {signals.map((signal, index) => (
        <FixtureItem 
          key={signal.id}
          signal={signal}
          index={index}
          onClick={() => onMatchClick(signal)}
          onQuickBet={() => onQuickBet(signal)}
        />
      ))}
    </div>
  );
};
