'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Search, RefreshCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import type { Product } from '@/types';

export default function ProductsClientPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reembedding, setReembedding] = useState<string | null>(null);
  const PAGE_SIZE = 25;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const offset = (page - 1) * PAGE_SIZE;

    let query = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (q) {
      query = query.or(`sku.ilike.%${q}%,name.ilike.%${q}%,family.ilike.%${q}%`);
    }

    const { data, count } = await query;
    setProducts((data ?? []) as Product[]);
    setTotal(count ?? 0);
    setLoading(false);
  }, [page, q]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleReembed = async (product: Product) => {
    setReembedding(product.id);
    try {
      const res = await fetch('/api/embed/product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id }),
      });
      if (!res.ok) throw new Error('Re-embed failed');
      toast.success(`Re-embedded ${product.sku}`);
    } catch {
      toast.error('Re-embed failed');
    } finally {
      setReembedding(null);
    }
  };

  return (
    <>
      {/* Search */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search SKU, name, or family..."
            className="w-full rounded-md border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
          />
        </div>
        <span className="text-sm text-gray-500">{total} products</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                {['SKU', 'Name', 'Family', 'Countries', 'Active', 'Updated', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((p) => (
                <>
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-semibold text-blue-900">{p.sku}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
                      <div className="truncate">{p.name}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.family ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{p.countries?.join(', ') ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${p.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{new Date(p.updated_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleReembed(p)}
                          disabled={reembedding === p.id}
                          className="rounded p-1 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                          title="Re-embed"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${reembedding === p.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                          className="rounded p-1 text-gray-500 hover:bg-gray-100"
                        >
                          {expanded === p.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === p.id && (
                    <tr key={`${p.id}-detail`} className="bg-gray-50">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="mb-1 font-semibold text-gray-700">Description</p>
                            <p className="text-gray-600">{p.description ?? 'No description'}</p>
                          </div>
                          <div>
                            <p className="mb-1 font-semibold text-gray-700">Specifications</p>
                            {p.specifications ? (
                              <pre className="text-xs text-gray-600 bg-white rounded p-2 border border-gray-200 overflow-auto max-h-32">
                                {JSON.stringify(p.specifications, null, 2)}
                              </pre>
                            ) : (
                              <p className="text-gray-400">No specifications</p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No products found.</td></tr>
              )}
            </tbody>
          </table>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
              <span className="text-xs text-gray-500">Page {page} of {Math.ceil(total / PAGE_SIZE)}</span>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Prev</button>
                <button disabled={page * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
