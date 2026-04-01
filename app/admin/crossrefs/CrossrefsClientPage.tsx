'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, Upload, Search, Loader2 } from 'lucide-react';
import type { CompetitorCrossref } from '@/types';

const CONFIDENCE_STYLES = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-red-100 text-red-800',
};

export default function CrossrefsClientPage() {
  const [crossrefs, setCrossrefs] = useState<CompetitorCrossref[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  // Add form
  const [newRow, setNewRow] = useState({
    competitor_name: '',
    competitor_sku: '',
    axis_sku: '',
    confidence: 'medium',
    notes: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50', q });
      const res = await fetch(`/api/admin/crossrefs?${params}`);
      const data = await res.json();
      setCrossrefs(data.crossrefs ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/crossrefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRow),
    });
    if (!res.ok) {
      const d = await res.json();
      toast.error(d.error ?? 'Failed to add');
      return;
    }
    toast.success('Cross-reference added');
    setShowAdd(false);
    setNewRow({ competitor_name: '', competitor_sku: '', axis_sku: '', confidence: 'medium', notes: '' });
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this cross-reference?')) return;
    const res = await fetch(`/api/admin/crossrefs?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setCrossrefs((prev) => prev.filter((c) => c.id !== id));
      toast.success('Deleted');
    } else {
      toast.error('Delete failed');
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    const fd = new FormData();
    fd.append('file', importFile);
    try {
      const res = await fetch('/api/import/crossrefs', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      toast.success(data.message ?? `Imported ${data.imported ?? data.total} cross-references`);
      setImportFile(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search..."
            className="w-full rounded-md border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Upload className="h-4 w-4" />
            Import Excel
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {importFile && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex items-center gap-2 rounded-md bg-blue-900 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {importing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {importing ? 'Importing...' : `Import "${importFile.name}"`}
            </button>
          )}
        </div>

        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-md bg-blue-900 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
            {[
              { label: 'Competitor name', key: 'competitor_name', required: true },
              { label: 'Competitor SKU', key: 'competitor_sku', required: true },
              { label: 'Axis SKU', key: 'axis_sku', required: false },
              { label: 'Notes', key: 'notes', required: false },
            ].map(({ label, key, required }) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
                <input
                  type="text"
                  value={(newRow as Record<string, string>)[key]}
                  onChange={(e) => setNewRow((prev) => ({ ...prev, [key]: e.target.value }))}
                  required={required}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
                />
              </div>
            ))}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Confidence</label>
              <select
                value={newRow.confidence}
                onChange={(e) => setNewRow((prev) => ({ ...prev, confidence: e.target.value }))}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="rounded-md bg-blue-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800">
                Save
              </button>
              <button type="button" onClick={() => setShowAdd(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Many-to-many note */}
      <p className="mb-3 text-xs text-gray-400">
        One competitor SKU may map to multiple Axis SKUs — each mapping is a separate row. This is expected.
      </p>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                {['Competitor', 'Competitor SKU', 'Axis SKU', 'Confidence', 'Notes', 'Date', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {crossrefs.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{c.competitor_name}</td>
                  <td className="px-4 py-2.5 font-mono text-gray-700">{c.competitor_sku}</td>
                  <td className="px-4 py-2.5 font-mono text-blue-900">{c.axis_sku ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${CONFIDENCE_STYLES[c.confidence]}`}>
                      {c.confidence}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 max-w-xs truncate">{c.notes ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => handleDelete(c.id)} className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {crossrefs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No cross-references found.</td></tr>
              )}
            </tbody>
          </table>
          {total > 50 && (
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
              <span className="text-xs text-gray-500">{total} total</span>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Prev</button>
                <button disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
