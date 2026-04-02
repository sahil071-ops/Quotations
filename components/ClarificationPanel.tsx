'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ClarificationQuestion } from '@/types';

interface ClarificationPanelProps {
  questions: ClarificationQuestion[];
  onSubmit: (answers: Record<string, string>) => void;
  onSkip: () => void;
  isLoading: boolean;
}

const OTHER_OPTION = 'Other (please specify)';

export default function ClarificationPanel({
  questions,
  onSubmit,
  onSkip,
  isLoading,
}: ClarificationPanelProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});

  const setAnswer = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const setOther = (id: string, text: string) => {
    setOtherText((prev) => ({ ...prev, [id]: text }));
    // Use the typed value as the answer so it's included in the enriched query
    setAnswers((prev) => ({ ...prev, [id]: text || OTHER_OPTION }));
  };

  const handleSubmit = () => {
    // Replace any remaining OTHER_OPTION placeholders with empty (will be filtered in match route)
    const finalAnswers = Object.fromEntries(
      Object.entries(answers).map(([k, v]) => [k, v === OTHER_OPTION ? '' : v])
    );
    onSubmit(finalAnswers);
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
      <p className="mb-4 text-sm font-medium text-gray-700">
        A few quick questions to find the right product:
      </p>

      {questions.map((q) => (
        <div key={q.id} className="mb-5">
          <label className="mb-2 block text-sm font-medium text-gray-800">{q.question}</label>
          <div className="flex flex-wrap gap-2">
            {q.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setAnswer(q.id, opt)}
                disabled={isLoading}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                  answers[q.id] === opt || (opt === OTHER_OPTION && answers[q.id] === (otherText[q.id] || OTHER_OPTION))
                    ? 'border-blue-900 bg-blue-900 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-blue-900'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          {/* Free-text input for "Other" */}
          {answers[q.id] !== undefined &&
            (answers[q.id] === OTHER_OPTION || otherText[q.id] !== undefined) &&
            q.options.includes(OTHER_OPTION) && (
              <input
                type="text"
                placeholder="Type your answer..."
                value={otherText[q.id] ?? ''}
                onChange={(e) => setOther(q.id, e.target.value)}
                disabled={isLoading}
                autoFocus
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900 disabled:opacity-50"
              />
            )}
        </div>
      ))}

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Find Matches
        </button>
        <button
          onClick={onSkip}
          disabled={isLoading}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          Skip — search with query only
        </button>
      </div>
    </div>
  );
}
