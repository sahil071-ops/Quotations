'use client';
import { useState, useMemo } from 'react';

interface ResultsFilterProps {
  results: { specifications?: Record<string, unknown> | null }[];
  onFiltered: (filtered: ResultsFilterProps['results']) => void;
}

const LABELS: Record<string, string> = {
  material: 'Material',
  diameter_mm: 'Diameter (mm)',
  length_mm: 'Length (mm)',
  thread_type: 'Thread',
  end_finish: 'End finish',
  size_inches: 'Size (inches)',
  compression_type: 'Compression',
  armour_type: 'Armour',
  plate_type: 'Plate type',
  bolt_material: 'Bolt material',
  standard: 'Standard',
};

export function ResultsFilter({ results, onFiltered }: ResultsFilterProps) {
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  const filterOptions = useMemo(() => {
    const options: Record<string, Set<string>> = {};
    results.forEach(r => {
      if (!r.specifications) return;
      Object.entries(r.specifications).forEach(([key, value]) => {
        if (!value || typeof value === 'object') return;
        if (!options[key]) options[key] = new Set();
        options[key].add(String(value));
      });
    });
    return Object.fromEntries(
      Object.entries(options)
        .filter(([, values]) => values.size >= 2 && values.size <= 8)
        .map(([key, values]) => [key, Array.from(values).sort()])
    );
  }, [results]);

  const applyFilters = (filters: Record<string, string>) => {
    if (Object.keys(filters).length === 0) {
      onFiltered(results);
      return;
    }
    const filtered = results.filter(r =>
      Object.entries(filters).every(([key, value]) => {
        const spec = r.specifications?.[key];
        return spec !== undefined && String(spec) === value;
      })
    );
    onFiltered(filtered.length > 0 ? filtered : results);
  };

  const setFilter = (key: string, value: string) => {
    const newFilters = { ...activeFilters };
    if (newFilters[key] === value) {
      delete newFilters[key];
    } else {
      newFilters[key] = value;
    }
    setActiveFilters(newFilters);
    applyFilters(newFilters);
  };

  if (Object.keys(filterOptions).length === 0) return null;

  return (
    <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Filter results
        </span>
        {Object.keys(activeFilters).length > 0 && (
          <button
            onClick={() => { setActiveFilters({}); onFiltered(results); }}
            className="text-xs text-blue-600 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="space-y-2">
        {Object.entries(filterOptions).map(([key, values]) => (
          <div key={key} className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 w-24 shrink-0">
              {LABELS[key] || key}:
            </span>
            {values.map(value => (
              <button
                key={value}
                onClick={() => setFilter(key, value)}
                className={`px-2 py-1 rounded-full text-xs border transition-colors ${
                  activeFilters[key] === value
                    ? 'bg-blue-900 text-white border-blue-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-900'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
