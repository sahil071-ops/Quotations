'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Globe } from 'lucide-react';
import QueryBox from '@/components/QueryBox';
import MatchList from '@/components/MatchList';
import FeedbackModal from '@/components/FeedbackModal';
import ClarificationPanel from '@/components/ClarificationPanel';
import { SkeletonCardList } from '@/components/SkeletonCard';
import { ResultsFilter } from '@/components/ResultsFilter';
import type { QueryMatchResponse, MatchResult, ClarificationQuestion } from '@/types';

// Phase machine:
// idle → searching → clarifying (if variant family detected) → searching → done
//                  → done (if no clarification needed)
type Phase = 'idle' | 'searching' | 'clarifying' | 'done';

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
  const [filteredMatches, setFilteredMatches] = useState<MatchResult[]>([]);
  const [lastCountry, setLastCountry] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [families, setFamilies] = useState<string[]>([]);
  const [approvedSku, setApprovedSku] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{ open: boolean; match: MatchResult | null }>({
    open: false,
    match: null,
  });
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  useEffect(() => {
    fetch('/api/query/families')
      .then((r) => r.json())
      .then((d) => setFamilies(d.families ?? []))
      .catch(() => {});
  }, []);

  const callEndpoint = async (
    query: string,
    country: string,
    family: string,
    clarificationAnswers: Record<string, string>
  ) => {
    const res = await fetch('/api/query/search-then-clarify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        country: country || undefined,
        family: family || undefined,
        engineer_id: engineerId,
        clarificationAnswers: Object.keys(clarificationAnswers).length > 0 ? clarificationAnswers : undefined,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? 'Search failed');
    }

    return res.json() as Promise<
      | { mode: 'clarify'; questions: ClarificationQuestion[]; candidateCount: number }
      | ({ mode: 'results' } & QueryMatchResponse)
    >;
  };

  const handleQuery = async (query: string, country: string, family: string) => {
    setPhase('searching');
    setPendingQuery(query);
    setPendingCountry(country);
    setPendingFamily(family);
    setResult(null);
    setApprovedSku(null);
    setLastCountry(country);
    setClarifyQuestions([]);

    try {
      setSearchStatus('Searching product catalog…');
      await delay(300);

      const data = await callEndpoint(query, country, family, {});

      if (data.mode === 'clarify') {
        setClarifyQuestions(data.questions);
        setSearchStatus('');
        setPhase('clarifying');
        return;
      }

      setSearchStatus('Ranking matches…');
      await delay(100);
      setSearchStatus('');
      setResult(data);
      setFilteredMatches(data.matches ?? []);
      setPhase('done');
    } catch (err) {
      setSearchStatus('');
      toast.error(err instanceof Error ? err.message : 'Network error — please try again');
      setPhase('idle');
    }
  };

  const handleClarificationSubmit = async (answers: Record<string, string>) => {
    setPhase('searching');
    setSearchStatus('Searching product catalog…');

    try {
      const data = await callEndpoint(pendingQuery, pendingCountry, pendingFamily, answers);

      setSearchStatus('Ranking matches…');
      await delay(100);
      setSearchStatus('');

      // If somehow still gets clarify (shouldn't happen), fall through to results
      if (data.mode === 'results') {
        setResult(data);
        setFilteredMatches(data.matches ?? []);
      }
      setPhase('done');
    } catch (err) {
      setSearchStatus('');
      toast.error(err instanceof Error ? err.message : 'Network error — please try again');
      setPhase('idle');
    }
  };

  const handleSkip = async () => {
    setPhase('searching');
    setSearchStatus('Searching product catalog…');

    try {
      // _skip flag tells the endpoint to bypass variant detection
      const data = await callEndpoint(pendingQuery, pendingCountry, pendingFamily, { _skip: 'true' });

      setSearchStatus('Ranking matches…');
      await delay(100);
      setSearchStatus('');

      if (data.mode === 'results') {
        setResult(data);
        setFilteredMatches(data.matches ?? []);
      }
      setPhase('done');
    } catch (err) {
      setSearchStatus('');
      toast.error(err instanceof Error ? err.message : 'Network error — please try again');
      setPhase('idle');
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

  const isLoadingQuery = phase === 'searching';

  return (
    <div className="space-y-6">
      {/* Query form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <QueryBox onSubmit={handleQuery} isLoading={isLoadingQuery} families={families} />
      </div>

      {/* Searching: status + skeleton */}
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

      {/* Clarification panel */}
      {phase === 'clarifying' && clarifyQuestions.length > 0 && (
        <ClarificationPanel
          questions={clarifyQuestions}
          onSubmit={handleClarificationSubmit}
          onSkip={handleSkip}
          isLoading={false}
        />
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
            <span>
              {filteredMatches.length < result.total
                ? `${filteredMatches.length} of ${result.total} matches`
                : `${result.total} matches found`}
            </span>
          </div>

          <ResultsFilter
            results={result.matches}
            onFiltered={(filtered) => setFilteredMatches(filtered as MatchResult[])}
          />

          <MatchList
            matches={filteredMatches}
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
