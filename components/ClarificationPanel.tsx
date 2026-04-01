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

export default function ClarificationPanel({
  questions,
  onSubmit,
  onSkip,
  isLoading,
}: ClarificationPanelProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const setAnswer = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
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
                  answers[q.id] === opt
                    ? 'border-blue-900 bg-blue-900 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-blue-900'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={() => onSubmit(answers)}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Find Matches
        </button>
        <button
          onClick={onSkip}
          disabled={isLoading}
          className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
        >
          Skip — search anyway
        </button>
      </div>
    </div>
  );
}
