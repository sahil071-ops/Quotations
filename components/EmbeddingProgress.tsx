'use client';

import { useState } from 'react';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export function EmbeddingProgress({ totalProducts }: { totalProducts: number }) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [processed, setProcessed] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  async function runEmbedding() {
    setStatus('running');
    setProcessed(0);

    let offset = 0;
    const batchSize = 50;

    while (true) {
      try {
        const res = await fetch('/api/embed/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset, batchSize }),
        });

        const data = await res.json();

        if (data.error) {
          setErrorMsg(data.error);
          setStatus('error');
          return;
        }

        setProcessed(data.progress?.processed ?? offset + batchSize);

        if (data.done) {
          setStatus('done');
          return;
        }

        offset = data.nextOffset;

        // Brief pause between batches to avoid OpenAI rate limits
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus('error');
        return;
      }
    }
  }

  const pct = totalProducts > 0 ? Math.min(100, Math.round((processed / totalProducts) * 100)) : 0;

  return (
    <div className="mt-3">
      {status === 'idle' && (
        <button
          onClick={runEmbedding}
          className="flex items-center gap-2 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          Generate Embeddings
        </button>
      )}

      {status === 'running' && (
        <div>
          <div className="mb-1 flex items-center justify-between text-sm text-gray-600">
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Embedding products...
            </span>
            <span>{processed} / {totalProducts} ({pct}%)</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-2 rounded-full bg-blue-900 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">Running in batches of 50. Do not close this tab.</p>
        </div>
      )}

      {status === 'done' && (
        <div className="flex items-center gap-1.5 text-sm font-medium text-green-700">
          <CheckCircle className="h-4 w-4" /> All products are now searchable.
        </div>
      )}

      {status === 'error' && (
        <div className="text-sm text-red-600">
          <AlertCircle className="mb-0.5 mr-1 inline h-4 w-4" />
          {errorMsg}
          <button onClick={runEmbedding} className="ml-3 underline hover:no-underline">
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
