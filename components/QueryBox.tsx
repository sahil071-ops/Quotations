'use client';

import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import CountrySelector from './CountrySelector';

interface QueryBoxProps {
  onSubmit: (query: string, country: string) => void;
  isLoading?: boolean;
}

export default function QueryBox({ onSubmit, isLoading }: QueryBoxProps) {
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !country) return;
    onSubmit(query.trim(), country);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Client query
        </label>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={5}
          placeholder="Paste client query here — any language, competitor references, or description&#10;&#10;Example: 'Siemens 3RV1021-4AA10 equivalent needed for 16A motor protection, DIN rail mounting'"
          className="w-full resize-none rounded-md border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
          disabled={isLoading}
        />
      </div>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Region <span className="text-red-500">*</span>
          </label>
          <CountrySelector value={country} onChange={setCountry} disabled={isLoading} />
        </div>

        <button
          type="submit"
          disabled={!query.trim() || !country || isLoading}
          className="flex items-center gap-2 rounded-md bg-blue-900 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Find Matches
            </>
          )}
        </button>
      </div>
    </form>
  );
}
