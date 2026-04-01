'use client';

import type { MatchResult } from '@/types';
import MatchCard from './MatchCard';

interface MatchListProps {
  matches: MatchResult[];
  onApprove: (match: MatchResult) => void;
  onCorrect: (match: MatchResult) => void;
  approvedSku?: string | null;
  disabled?: boolean;
}

export default function MatchList({ matches, onApprove, onCorrect, approvedSku, disabled }: MatchListProps) {
  if (matches.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
        No matches found. Try refining your query or check that products are loaded.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {matches.map((match) => (
        <MatchCard
          key={match.sku}
          match={match}
          onApprove={onApprove}
          onCorrect={onCorrect}
          approved={approvedSku === match.sku}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
