'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface CategoryPair {
  main_category: string;
  sub_category: string;
}

interface CategorySelectorProps {
  selectedMains: string[];
  selectedSubs: string[];
  onChangeMains: (mains: string[]) => void;
  onChangeSubs: (subs: string[]) => void;
}

export default function CategorySelector({
  selectedMains,
  selectedSubs,
  onChangeMains,
  onChangeSubs,
}: CategorySelectorProps) {
  const [categories, setCategories] = useState<CategoryPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddMain, setShowAddMain] = useState(false);
  const [showAddSub, setShowAddSub] = useState(false);
  const [newMainName, setNewMainName] = useState('');
  const [newMainFirstSub, setNewMainFirstSub] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [newSubForMain, setNewSubForMain] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/admin/categories');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load categories');
      setCategories(data.categories ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const uniqueMains = Array.from(new Set(categories.map((c) => c.main_category))).sort();

  const subsForMains = (mains: string[]) =>
    Array.from(
      new Set(
        categories
          .filter((c) => mains.includes(c.main_category))
          .map((c) => c.sub_category)
      )
    ).sort();

  const toggleMain = (main: string) => {
    if (selectedMains.includes(main)) {
      const newMains = selectedMains.filter((m) => m !== main);
      onChangeMains(newMains);
      // Remove subs that no longer belong to any selected main
      const validSubs = new Set(subsForMains(newMains));
      onChangeSubs(selectedSubs.filter((s) => validSubs.has(s)));
    } else {
      onChangeMains([...selectedMains, main]);
    }
  };

  const toggleSub = (sub: string) => {
    if (selectedSubs.includes(sub)) {
      onChangeSubs(selectedSubs.filter((s) => s !== sub));
    } else {
      onChangeSubs([...selectedSubs, sub]);
    }
  };

  const handleAddMain = async () => {
    if (!newMainName.trim() || !newMainFirstSub.trim()) {
      toast.error('Both main category name and first sub-category are required');
      return;
    }
    setSaving(true);
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
      if (!res.ok) throw new Error(data.error ?? 'Failed to add category');
      toast.success('Main category added');
      setNewMainName('');
      setNewMainFirstSub('');
      setShowAddMain(false);
      await fetchCategories();
      onChangeMains([...selectedMains, newMainName.trim()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add category');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSub = async () => {
    if (!newSubName.trim() || !newSubForMain) {
      toast.error('Sub-category name and parent main category are required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          main_category: newSubForMain,
          sub_category: newSubName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add sub-category');
      toast.success('Sub-category added');
      setNewSubName('');
      setNewSubForMain('');
      setShowAddSub(false);
      await fetchCategories();
      onChangeSubs([...selectedSubs, newSubName.trim()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add sub-category');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  const availableSubs = subsForMains(selectedMains);

  return (
    <div className="space-y-4">
      {/* Main categories */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Main Product Category</label>
          <button
            type="button"
            onClick={() => {
              setShowAddMain((v) => !v);
              setShowAddSub(false);
            }}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add new
          </button>
        </div>

        {uniqueMains.length === 0 && !showAddMain ? (
          <p className="text-sm text-gray-400 italic">No categories yet. Add one below.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {uniqueMains.map((main) => (
              <button
                key={main}
                type="button"
                onClick={() => toggleMain(main)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  selectedMains.includes(main)
                    ? 'bg-blue-900 text-white border-blue-900'
                    : 'border-gray-300 text-gray-600 hover:border-blue-900'
                }`}
              >
                {main}
              </button>
            ))}
          </div>
        )}

        {showAddMain && (
          <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-700">New main category</p>
            <input
              type="text"
              placeholder="Main category name"
              value={newMainName}
              onChange={(e) => setNewMainName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
            />
            <input
              type="text"
              placeholder="First sub-category name"
              value={newMainFirstSub}
              onChange={(e) => setNewMainFirstSub(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddMain}
                disabled={saving}
                className="flex items-center gap-1 rounded-md bg-blue-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                Save
              </button>
              <button
                type="button"
                onClick={() => { setShowAddMain(false); setNewMainName(''); setNewMainFirstSub(''); }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sub categories */}
      {selectedMains.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Sub Product Category</label>
            <button
              type="button"
              onClick={() => {
                setShowAddSub((v) => !v);
                setShowAddMain(false);
                setNewSubForMain(selectedMains.length === 1 ? selectedMains[0] : '');
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add new
            </button>
          </div>

          {availableSubs.length === 0 && !showAddSub ? (
            <p className="text-sm text-gray-400 italic">No sub-categories for selected mains.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableSubs.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => toggleSub(sub)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    selectedSubs.includes(sub)
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'border-gray-300 text-gray-600 hover:border-blue-900'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}

          {showAddSub && (
            <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-700">New sub-category</p>
              {selectedMains.length > 1 && (
                <select
                  value={newSubForMain}
                  onChange={(e) => setNewSubForMain(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
                >
                  <option value="">— select parent main —</option>
                  {selectedMains.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
              <input
                type="text"
                placeholder="Sub-category name"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddSub}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-md bg-blue-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddSub(false); setNewSubName(''); setNewSubForMain(''); }}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
