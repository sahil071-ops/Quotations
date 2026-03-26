'use client';

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { MatchResult } from '@/types';

interface ProductSuggestion {
  sku: string;
  name: string;
  family?: string | null;
}

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (correctSku: string, notes: string) => void;
  match: MatchResult | null;
  isSubmitting?: boolean;
}

export default function FeedbackModal({ isOpen, onClose, onSubmit, match, isSubmitting }: FeedbackModalProps) {
  const [correctSku, setCorrectSku] = useState('');
  const [notes, setNotes] = useState('');
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!isOpen) {
      setCorrectSku('');
      setNotes('');
      setSuggestions([]);
    }
  }, [isOpen]);

  const searchProducts = async (q: string) => {
    if (!q || q.length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=8`);
      const data = await res.json();
      setSuggestions(data.products ?? []);
      setShowSuggestions(true);
    } catch {
      // ignore search errors
    }
  };

  const handleSkuChange = (val: string) => {
    setCorrectSku(val);
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => searchProducts(val), 300);
  };

  const selectSuggestion = (p: ProductSuggestion) => {
    setCorrectSku(p.sku);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctSku.trim()) return;
    onSubmit(correctSku.trim(), notes.trim());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Correct this match</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Current match */}
        {match && (
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
            <p className="text-xs text-gray-500">AI suggested:</p>
            <p className="font-mono text-sm font-semibold text-gray-700">{match.sku}</p>
            <p className="text-xs text-gray-600">{match.name}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* SKU search */}
          <div className="relative">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Which SKU is correct? <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={correctSku}
              onChange={(e) => handleSkuChange(e.target.value)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Search by SKU or product name..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
              required
              autoFocus
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                {suggestions.map((p) => (
                  <li
                    key={p.sku}
                    onMouseDown={() => selectSuggestion(p)}
                    className="cursor-pointer px-3 py-2 hover:bg-blue-50"
                  >
                    <span className="font-mono text-sm font-semibold text-blue-900">{p.sku}</span>
                    <span className="ml-2 text-xs text-gray-600">{p.name}</span>
                    {p.family && (
                      <span className="ml-1 text-xs text-gray-400">({p.family})</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Briefly explain the correction..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!correctSku.trim() || isSubmitting}
              className="flex-1 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Correction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
