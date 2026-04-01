'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, ChevronDown } from 'lucide-react';
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
  'bg-gray-600 text-white',
  'bg-gray-400 text-white',
];

export default function MatchCard({ match, onApprove, onCorrect, approved, disabled }: MatchCardProps) {
  const [expanded, setExpanded] = useState(match.rank === 1);

  const rankIdx = Math.min(match.rank - 1, RANK_STYLES.length - 1);
  const topSpecs = match.specifications ? Object.entries(match.specifications).slice(0, 5) : [];

  return (
    <div className={`border-b last:border-b-0 border-gray-100 ${approved ? 'bg-green-50' : ''}`}>
      {/* Collapsed row — always visible */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(ev) => ev.key === 'Enter' && setExpanded((e) => !e)}
        className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50"
      >
        <span
          className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${RANK_STYLES[rankIdx]}`}
        >
          {match.rank}
        </span>

        <span className="mt-0.5 w-32 shrink-0 font-mono text-sm font-bold text-blue-900">
          {match.sku}
        </span>

        <span className="flex-1 text-sm text-gray-800">{match.name}</span>

        {match.family && (
          <span className="mt-0.5 hidden shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 sm:block">
            {match.family}
          </span>
        )}

        <span
          className={`mt-0.5 shrink-0 rounded border px-2 py-0.5 text-xs font-medium capitalize ${CONFIDENCE_STYLES[match.confidence]}`}
        >
          {match.confidence}
        </span>

        {approved ? (
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
        ) : (
          <ChevronDown
            className={`mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        )}
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 pb-4 pt-3">
          {match.description && (
            <p className="mb-3 text-sm text-gray-700">{match.description}</p>
          )}

          {topSpecs.length > 0 && (
            <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
              {topSpecs.map(([key, val]) => (
                <div key={key} className="text-xs">
                  <span className="font-medium text-gray-600">{key}:</span>{' '}
                  <span className="text-gray-800">{String(val)}</span>
                </div>
              ))}
            </div>
          )}

          <p className="mb-3 text-xs italic text-gray-500">&ldquo;{match.reasoning}&rdquo;</p>

          {!approved && (
            <div className="flex gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); onApprove(match); }}
                disabled={disabled}
                className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                This is correct
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onCorrect(match); }}
                disabled={disabled}
                className="flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Wrong — correct it
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
