'use client';

import { CheckCircle, XCircle } from 'lucide-react';
import type { MatchResult } from '@/types';

interface MatchCardProps {
  match: MatchResult;
  onApprove: (match: MatchResult) => void;
  onCorrect: (match: MatchResult) => void;
  approved?: boolean;
  disabled?: boolean;
}

const CONFIDENCE_STYLES = {
  high: 'bg-green-100 text-green-800 border-green-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-red-100 text-red-800 border-red-200',
};

const RANK_STYLES = [
  'bg-blue-900 text-white',
  'bg-gray-700 text-white',
  'bg-gray-500 text-white',
];

export default function MatchCard({ match, onApprove, onCorrect, approved, disabled }: MatchCardProps) {
  const rankIdx = Math.min(match.rank - 1, 2);
  const topSpecs = match.specifications
    ? Object.entries(match.specifications).slice(0, 3)
    : [];

  return (
    <div className={`rounded-lg border-2 bg-white p-5 shadow-sm transition-all ${approved ? 'border-green-400' : 'border-gray-200'}`}>
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${RANK_STYLES[rankIdx]}`}>
            {match.rank}
          </span>
          <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${CONFIDENCE_STYLES[match.confidence]}`}>
            {match.confidence}
          </span>
        </div>
        {approved && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
            <CheckCircle className="h-4 w-4" /> Approved
          </span>
        )}
      </div>

      {/* SKU */}
      <div className="mb-1 font-mono text-lg font-bold text-blue-900">{match.sku}</div>

      {/* Name */}
      <div className="mb-1 text-sm font-semibold text-gray-900">{match.name}</div>

      {/* Family */}
      {match.family && (
        <div className="mb-2 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {match.family}
        </div>
      )}

      {/* Key Specs */}
      {topSpecs.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {topSpecs.map(([key, val]) => (
            <div key={key} className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">{key}:</span> {String(val)}
            </div>
          ))}
        </div>
      )}

      {/* Reasoning */}
      <p className="mb-4 text-xs italic text-gray-500">&ldquo;{match.reasoning}&rdquo;</p>

      {/* Actions */}
      {!approved && (
        <div className="flex gap-2">
          <button
            onClick={() => onApprove(match)}
            disabled={disabled}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            This is correct
          </button>
          <button
            onClick={() => onCorrect(match)}
            disabled={disabled}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            Wrong — correct it
          </button>
        </div>
      )}
    </div>
  );
}
