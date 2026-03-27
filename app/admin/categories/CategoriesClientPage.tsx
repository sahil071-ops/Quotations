'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Trash2, Plus, Loader2, ChevronDown, ChevronRight } from 'lucide-react';

interface CategoryPair {
  main_category: string;
  sub_category: string;
}

interface GroupedCategory {
  main: string;
  subs: string[];
}

export default function CategoriesClientPage() {
  const [categories, setCategories] = useState<CategoryPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedMains, setExpandedMains] = useState<Set<string>>(new Set());

  // Add-sub inline state per main
  const [addSubFor, setAddSubFor] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState('');
  const [savingSub, setSavingSub] = useState(false);

  // Add new main form
  const [showAddMain, setShowAddMain] = useState(false);
  const [newMainName, setNewMainName] = useState('');
  const [newMainFirstSub, setNewMainFirstSub] = useState('');
  const [savingMain, setSavingMain] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/categories');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load categories');
      const cats: CategoryPair[] = data.categories ?? [];
      setCategories(cats);
      // Expand all by default
      setExpandedMains(new Set(cats.map((c) => c.main_category)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const grouped: GroupedCategory[] = Array.from(
    categories.reduce((map, c) => {
      if (!map.has(c.main_category)) map.set(c.main_category, []);
      map.get(c.main_category)!.push(c.sub_category);
      return map;
    }, new Map<string, string[]>())
  )
    .map(([main, subs]) => ({ main, subs: subs.sort() }))
    .sort((a, b) => a.main.localeCompare(b.main));

  const handleDeleteSub = async (main: string, sub: string) => {
    const key = `${main}::${sub}`;
    setDeleting(key);
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ main_category: main, sub_category: sub }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      toast.success(`Removed "${sub}"`);
      await fetchCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteMain = async (main: string) => {
    if (!confirm(`Delete "${main}" and all its sub-categories?`)) return;
    setDeleting(`main::${main}`);
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ main_category: main }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      toast.success(`Deleted "${main}" and all sub-categories`);
      await fetchCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const handleAddSub = async (main: string) => {
    if (!newSubName.trim()) {
      toast.error('Sub-category name is required');
      return;
    }
    setSavingSub(true);
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ main_category: main, sub_category: newSubName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add');
      toast.success(`Added "${newSubName.trim()}" to "${main}"`);
      setNewSubName('');
      setAddSubFor(null);
      await fetchCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add sub-category');
    } finally {
      setSavingSub(false);
    }
  };

  const handleAddMain = async () => {
    if (!newMainName.trim() || !newMainFirstSub.trim()) {
      toast.error('Both fields are required');
      return;
    }
    setSavingMain(true);
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          main_category: newMainName.trim(),
          sub_category: newMainFirstSub.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add');
      toast.success(`Added main category "${newMainName.trim()}"`);
      setNewMainName('');
      setNewMainFirstSub('');
      setShowAddMain(false);
      await fetchCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add main category');
    } finally {
      setSavingMain(false);
    }
  };

  const toggleExpand = (main: string) => {
    setExpandedMains((prev) => {
      const next = new Set(prev);
      if (next.has(main)) next.delete(main);
      else next.add(main);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.length === 0 && !showAddMain && (
        <div className="rounded-lg border border-dashed border-gray-200 p-10 text-center text-gray-400 text-sm">
          No categories yet. Add the first one below.
        </div>
      )}

      {grouped.map(({ main, subs }) => {
        const isExpanded = expandedMains.has(main);
        const isDeletingMain = deleting === `main::${main}`;

        return (
          <div key={main} className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            {/* Main category header */}
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
              <button
                type="button"
                onClick={() => toggleExpand(main)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-blue-900"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                )}
                {main}
                <span className="ml-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-normal text-gray-500">
                  {subs.length}
                </span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddSubFor(main);
                    setNewSubName('');
                  }}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add sub
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteMain(main)}
                  disabled={isDeletingMain}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  title="Delete main category and all subs"
                >
                  {isDeletingMain ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Sub categories */}
            {isExpanded && (
              <div className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  {subs.map((sub) => {
                    const key = `${main}::${sub}`;
                    return (
                      <span
                        key={sub}
                        className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700"
                      >
                        {sub}
                        <button
                          type="button"
                          onClick={() => handleDeleteSub(main, sub)}
                          disabled={deleting === key}
                          className="ml-0.5 text-gray-400 hover:text-red-500 disabled:opacity-50"
                        >
                          {deleting === key ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </button>
                      </span>
                    );
                  })}

                  {subs.length === 0 && (
                    <span className="text-xs text-gray-400 italic">No sub-categories</span>
                  )}
                </div>

                {/* Inline add sub form */}
                {addSubFor === main && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Sub-category name"
                      value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddSub(main)}
                      autoFocus
                      className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddSub(main)}
                      disabled={savingSub}
                      className="flex items-center gap-1 rounded-md bg-blue-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                    >
                      {savingSub && <Loader2 className="h-3 w-3 animate-spin" />}
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddSubFor(null); setNewSubName(''); }}
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add new main category */}
      {showAddMain ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">New main category</h3>
          <input
            type="text"
            placeholder="Main category name"
            value={newMainName}
            onChange={(e) => setNewMainName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
          />
          <input
            type="text"
            placeholder="First sub-category name"
            value={newMainFirstSub}
            onChange={(e) => setNewMainFirstSub(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddMain}
              disabled={savingMain}
              className="flex items-center gap-1.5 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {savingMain && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
            <button
              type="button"
              onClick={() => { setShowAddMain(false); setNewMainName(''); setNewMainFirstSub(''); }}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddMain(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 hover:border-blue-900 hover:text-blue-900 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add new main category
        </button>
      )}
    </div>
  );
}
