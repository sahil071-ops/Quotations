'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle, Loader2, Filter } from 'lucide-react';
import type { Feedback } from '@/types';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';

export default function FeedbackClientPage() {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [promoting, setPromoting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    let query = supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (pendingOnly) query = query.eq('promoted_to_index', false);

    const { data } = await query;
    setFeedback((data ?? []) as Feedback[]);
    setLoading(false);
  }, [pendingOnly]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const selectAllPending = () => {
    const pendingIds = feedback.filter((f) => !f.promoted_to_index).map((f) => f.id);
    setSelected(new Set(pendingIds));
  };

  const handlePromote = async () => {
    if (selected.size === 0) return;
    setPromoting(true);
    try {
      const res = await fetch('/api/admin/feedback/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback_ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Promote failed');

      const successCount = data.results.filter((r: { success?: boolean }) => r.success).length;
      toast.success(`Promoted ${successCount} correction(s) to vector index`);
      setSelected(new Set());
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Promotion failed');
    } finally {
      setPromoting(false);
    }
  };

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={(e) => { setPendingOnly(e.target.checked); setSelected(new Set()); }}
              className="rounded border-gray-300"
            />
            <Filter className="h-4 w-4" /> Pending only
          </label>
          {feedback.some((f) => !f.promoted_to_index) && (
            <button onClick={selectAllPending} className="text-xs text-blue-700 hover:underline">
              Select all pending
            </button>
          )}
        </div>

        {selected.size > 0 && (
          <button
            onClick={handlePromote}
            disabled={promoting}
            className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {promoting && <Loader2 className="h-4 w-4 animate-spin" />}
            <CheckCircle className="h-4 w-4" />
            Promote to Index ({selected.size})
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 w-8"></th>
                {['Date', 'Original Query', 'AI Suggested', 'Correct SKU', 'Notes', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {feedback.map((f) => (
                <tr key={f.id} className={`hover:bg-gray-50 ${selected.has(f.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-3">
                    {!f.promoted_to_index && (
                      <input
                        type="checkbox"
                        checked={selected.has(f.id)}
                        onChange={() => toggleSelect(f.id)}
                        className="rounded border-gray-300"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {new Date(f.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="truncate text-gray-700" title={f.raw_query}>{f.raw_query}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-gray-600">{f.ai_suggested_sku ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-sm font-semibold text-blue-900">{f.correct_sku}</td>
                  <td className="px-4 py-3 max-w-xs text-gray-500 truncate">{f.correction_notes ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      f.promoted_to_index ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {f.promoted_to_index ? 'Promoted' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {!f.promoted_to_index && (
                      <button
                        onClick={() => { setSelected(new Set([f.id])); }}
                        className="text-xs text-blue-700 hover:underline"
                      >
                        Select
                      </button>
                    )}
                    {f.promoted_to_index && f.promoted_at && (
                      <span className="text-xs text-gray-400">{new Date(f.promoted_at).toLocaleDateString()}</span>
                    )}
                  </td>
                </tr>
              ))}
              {feedback.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No feedback yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
