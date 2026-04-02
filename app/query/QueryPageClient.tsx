'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Globe, Loader2 } from 'lucide-react';
import QueryBox from '@/components/QueryBox';
import MatchList from '@/components/MatchList';
import FeedbackModal from '@/components/FeedbackModal';
import ClarificationPanel from '@/components/ClarificationPanel';
import { SkeletonCardList } from '@/components/SkeletonCard';
import type { QueryMatchResponse, MatchResult, ClarificationQuestion } from '@/types';

type Phase = 'idle' | 'clarifying' | 'searching' | 'done';

interface QueryPageClientProps {
  engineerId: string;
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export default function QueryPageClient({ engineerId }: QueryPageClientProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [pendingQuery, setPendingQuery] = useState('');
  const [pendingCountry, setPendingCountry] = useState('');
  const [pendingFamily, setPendingFamily] = useState('');
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarificationQuestion[]>([]);
  const [result, setResult] = useState<QueryMatchResponse | null>(null);
  const [lastCountry, setLastCountry] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [families, setFamilies] = useState<string[]>([]);
  const [approvedSku, setApprovedSku] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{ open: boolean; match: MatchResult | null }>({
    open: false,
    match: null,
  });
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // Load product families on mount
  useEffect(() => {
    fetch('/api/query/families')
      .then((r) => r.json())
      .then((d) => setFamilies(d.families ?? []))
      .catch(() => {});
  }, []);

  const runSearch = async (query: string, country: string, family: string, answers: Record<string, string>) => {
    setPhase('searching');
    try {
      setSearchStatus('Understanding your query…');
      await delay(300);
      setSearchStatus('Searching product catalog…');

      const res = await fetch('/api/query/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          country: country || undefined,
          family: family || undefined,
          engineer_id: engineerId,
          clarificationAnswers: Object.keys(answers).length > 0 ? answers : undefined,
        }),
      });

      setSearchStatus('Ranking matches…');
      const data = await res.json();
      setSearchStatus('');

      if (!res.ok) {
        toast.error(data.error ?? 'Failed to fetch matches');
        setPhase('idle');
        return;
      }

      setResult(data as QueryMatchResponse);
      setPhase('done');
    } catch {
      setSearchStatus('');
      toast.error('Network error — please try again');
      setPhase('idle');
    }
  };

  const handleQuery = async (query: string, country: string, family: string) => {
    setPhase('clarifying');
    setPendingQuery(query);
    setPendingCountry(country);
    setPendingFamily(family);
    setResult(null);
    setApprovedSku(null);
    setLastCountry(country);
    setClarifyQuestions([]);

    try {
      const clarifyRes = await fetch('/api/query/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, family: family || undefined }),
      });
      const clarifyData = await clarifyRes.json();
      const questions: ClarificationQuestion[] = clarifyData.questions ?? [];

      if (questions.length > 0) {
        setClarifyQuestions(questions);
        return; // stay in 'clarifying' — ClarificationPanel renders
      }

      await runSearch(query, country, family, {});
    } catch {
      await runSearch(query, country, family, {});
    }
  };

  const handleClarificationSubmit = (answers: Record<string, string>) => {
    runSearch(pendingQuery, pendingCountry, pendingFamily, answers);
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

  const isLoadingQuery =
    phase === 'searching' ||
    (phase === 'clarifying' && clarifyQuestions.length === 0);

  return (
    <div className="space-y-6">
      {/* Query form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <QueryBox onSubmit={handleQuery} isLoading={isLoadingQuery} families={families} />
      </div>

      {/* Clarify in-flight spinner */}
      {phase === 'clarifying' && clarifyQuestions.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking catalog…
        </div>
      )}

      {/* Clarification panel */}
      {phase === 'clarifying' && clarifyQuestions.length > 0 && (
        <ClarificationPanel
          questions={clarifyQuestions}
          onSubmit={handleClarificationSubmit}
          onSkip={() => runSearch(pendingQuery, pendingCountry, pendingFamily, {})}
          isLoading={false}
        />
      )}

      {/* Loading skeleton + progress status */}
      {phase === 'searching' && (
        <>
          {searchStatus && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-900 border-t-transparent" />
              {searchStatus}
            </div>
          )}
          <SkeletonCardList />
        </>
      )}

      {/* Results */}
      {phase === 'done' && result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <Globe className="h-3.5 w-3.5" />
            <span>
              Detected language: <strong>{result.detected_language}</strong>
            </span>
            {lastCountry && (
              <>
                <span className="text-gray-300">|</span>
                <span>Region: <strong>{lastCountry}</strong></span>
              </>
            )}
            <span className="text-gray-300">|</span>
            <span>{result.total} matches found</span>
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
