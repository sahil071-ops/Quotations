'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import QueryBox from '@/components/QueryBox';
import MatchList from '@/components/MatchList';
import FeedbackModal from '@/components/FeedbackModal';
import { SkeletonCardList } from '@/components/SkeletonCard';
import type { QueryMatchResponse, MatchResult } from '@/types';
import { Globe } from 'lucide-react';

interface QueryPageClientProps {
  engineerId: string;
}

export default function QueryPageClient({ engineerId }: QueryPageClientProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryMatchResponse | null>(null);
  const [approvedSku, setApprovedSku] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{ open: boolean; match: MatchResult | null }>({
    open: false,
    match: null,
  });
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const handleQuery = async (query: string, country: string) => {
    setLoading(true);
    setResult(null);
    setApprovedSku(null);

    try {
      const res = await fetch('/api/query/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, country, engineer_id: engineerId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Failed to fetch matches');
        return;
      }

      setResult(data as QueryMatchResponse);
    } catch {
      toast.error('Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (match: MatchResult) => {
    if (!result?.query_id) return;
    setApprovedSku(match.sku);

    await fetch('/api/query/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query_id: result.query_id, selected_sku: match.sku }),
    });

    toast.success(`Approved: ${match.sku}`);
  };

  const handleCorrect = (match: MatchResult) => {
    setFeedbackModal({ open: true, match });
  };

  const handleFeedbackSubmit = async (correctSku: string, notes: string) => {
    if (!result?.query_id || !feedbackModal.match) return;
    setSubmittingFeedback(true);

    try {
      const res = await fetch('/api/query/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_id: result.query_id,
          engineer_id: engineerId,
          raw_query: '',
          country_context: null,
          ai_suggested_sku: feedbackModal.match.sku,
          correct_sku: correctSku,
          correction_notes: notes,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to save correction');
        return;
      }

      toast.success('Thanks — your correction will improve future results');
      setFeedbackModal({ open: false, match: null });
      setApprovedSku(correctSku);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Query form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <QueryBox onSubmit={handleQuery} isLoading={loading} />
      </div>

      {/* Loading skeletons */}
      {loading && <SkeletonCardList />}

      {/* Results */}
      {!loading && result && (
        <div className="space-y-4">
          {/* Meta */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <Globe className="h-3.5 w-3.5" />
            <span>Detected language: <strong>{result.detected_language}</strong></span>
            <span className="text-gray-300">|</span>
            <span>{result.matches.length} matches found</span>
          </div>

          <MatchList
            matches={result.matches}
            onApprove={handleApprove}
            onCorrect={handleCorrect}
            approvedSku={approvedSku}
            disabled={!!approvedSku}
          />
        </div>
      )}

      <FeedbackModal
        isOpen={feedbackModal.open}
        onClose={() => setFeedbackModal({ open: false, match: null })}
        onSubmit={handleFeedbackSubmit}
        match={feedbackModal.match}
        isSubmitting={submittingFeedback}
      />
    </div>
  );
}
