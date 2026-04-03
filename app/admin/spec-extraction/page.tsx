'use client';
import { useState } from 'react';

export default function SpecExtractionPage() {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  async function runExtraction() {
    setStatus('running');
    setProcessed(0);
    setErrors([]);

    const countRes = await fetch('/api/admin/spec-extraction?count=1');
    const { total: totalProducts } = await countRes.json();
    setTotal(totalProducts);

    let offset = 0;
    const batchSize = 50;

    while (true) {
      const res = await fetch('/api/admin/spec-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offset, batchSize }),
      });

      const data = await res.json();

      if (data.error) {
        setErrors(prev => [...prev, data.error]);
        setStatus('error');
        return;
      }

      setProcessed(offset + data.processed);

      if (data.errors?.length) {
        setErrors(prev => [...prev, ...data.errors.slice(0, 3)]);
      }

      if (data.done) {
        setStatus('done');
        return;
      }

      offset = data.nextOffset;
      await new Promise(r => setTimeout(r, 300));
    }
  }

  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Spec Extraction</h1>
      <p className="text-gray-500 mb-8">
        Parse product names into structured specifications (material, diameter, length, etc.)
        to enable precise SQL-based search. Run once — takes ~15 minutes for 11,000+ products.
      </p>

      {status === 'idle' && (
        <button
          onClick={runExtraction}
          className="px-6 py-3 bg-blue-900 text-white rounded-lg font-medium hover:bg-blue-800"
        >
          Start Spec Extraction
        </button>
      )}

      {status === 'running' && (
        <div>
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Extracting specs...</span>
            <span>{processed} / {total} ({pct}%)</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
            <div
              className="bg-blue-900 h-3 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">Do not close this tab.</p>
        </div>
      )}

      {status === 'done' && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800 font-medium">✓ Spec extraction complete — {processed} products updated.</p>
          <p className="text-green-700 text-sm mt-1">Search will now use structured spec matching.</p>
        </div>
      )}

      {status === 'error' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 font-medium">Error during extraction.</p>
          <button onClick={runExtraction} className="mt-2 text-sm underline text-red-700">Retry</button>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          <p className="font-medium mb-1">Some rows had errors (skipped):</p>
          {errors.slice(0, 5).map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}
    </div>
  );
}
