'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Globe, Loader2 } from 'lucide-react';
import QueryBox from '@/components/QueryBox';
import MatchList from '@/components/MatchList';
import FeedbackModal from '@/components/FeedbackModal';
import ClarificationPanel from '@/components/ClarificationPanel';
import { SkeletonCardList } from '@/components/SkeletonCard';
import type { QueryMatchResponse, MatchResult, ClarificationQuestion } from '@/types';

type Phase = 'idle' | 'classifying' | 'clarifying' | 'searching' | 'done';

interface QueryPageClientProps {
  engineerId: string;
}

export default function QueryPageClient({ engineerId }: QueryPageClientProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [pendingQuery, setPendingQuery] = useState('');
  const [pendingCountry, setPendingCountry] = useState('');
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarificationQuestion[]>([]);
  const [result, setResult] = useState<QueryMatchResponse | null>(null);
  const [lastCountry, setLastCountry] = useState('');
  const [approvedSku, setApprovedSku] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{ open: boolean; match: MatchResult | null }>({
    open: false,
    match: null,
  });
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const runSearch = async (query: string, country: string, answers: Record<string, string>) => {
    setPhase('searching');
    try {
      const res = await fetch('/api/query/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          country: country || undefined,
          engineer_id: engineerId,
          clarificationAnswers: Object.keys(answers).length > 0 ? answers : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Failed to fetch matches');
        setPhase('idle');
        return;
      }

      setResult(data as QueryMatchResponse);
      setPhase('done');
    } catch {
      toast.error('Network error — please try again');
      setPhase('idle');
    }
  };

  const handleQuery = async (query: string, country: string) => {
    setPhase('classifying');
    setPendingQuery(query);
    setPendingCountry(country);
    setResult(null);
    setApprovedSku(null);
    setLastCountry(country);
    setClarifyQuestions([]);

    try {
      const classRes = await fetch('/api/query/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const classData = await classRes.json();

      if (classData.mode === 'generic') {
        // Try to get clarification questions
        try {
          const clarifyRes = await fetch('/api/query/clarify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
          });
          const clarifyData = await clarifyRes.json();

          if (!clarifyData.fallbackToSearch && clarifyData.questions?.length > 0) {
            setClarifyQuestions(clarifyData.questions);
            setPhase('clarifying');
            return;
          }
        } catch {
          // Clarify failed — fall through to direct search
        }
      }

      // Specific mode (or generic fallback)
      await runSearch(query, country, {});
    } catch {
      // Classify failed — fall through to direct search
      await runSearch(query, country, {});
    }
  };

  const handleClarificationSubmit = (answers: Record<string, string>) => {
    runSearch(pendingQuery, pendingCountry, answers);
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
          country_context: lastCountry || null,
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

  const isLoadingQuery = phase === 'classifying' || phase === 'searching';

  return (
    <div className="space-y-6">
      {/* Query form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <QueryBox onSubmit={handleQuery} isLoading={isLoadingQuery} />
      </div>

      {/* Classifying indicator */}
      {phase === 'classifying' && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analysing query…
        </div>
      )}

      {/* Clarification panel */}
      {phase === 'clarifying' && clarifyQuestions.length > 0 && (
        <ClarificationPanel
          questions={clarifyQuestions}
          onSubmit={handleClarificationSubmit}
          onSkip={() => runSearch(pendingQuery, pendingCountry, {})}
          isLoading={false}
        />
      )}

      {/* Loading skeleton */}
      {phase === 'searching' && <SkeletonCardList />}

      {/* Results */}
      {phase === 'done' && result && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <Globe className="h-3.5 w-3.5" />
            <span>
              Detected language: <strong>{result.detected_language}</strong>
            </span>
            {lastCountry && (
              <>
                <span className="text-gray-300">|</span>
                <span>
                  Region: <strong>{lastCountry}</strong>
                </span>
              </>
            )}
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
