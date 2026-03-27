'use client';

import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { FileSpreadsheet, Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface ColumnMapping {
  query: string;
  sku: string;
  region?: string;
  notes?: string;
}

interface ImportResult {
  success: boolean;
  total_rows: number;
  imported: number;
  errors: string[];
}

export default function TrainingClientPage() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping>({ query: '', sku: '', region: '', notes: '' });
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (selectedFile: File | null) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setHeaders([]);
    setMapping({ query: '', sku: '', region: '', notes: '' });
    setResult(null);

    setLoadingHeaders(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const res = await fetch('/api/import/training', { method: 'GET', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to read headers');
      setHeaders(data.headers ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to read file headers');
    } finally {
      setLoadingHeaders(false);
    }
  };

  const handleImport = async () => {
    if (!file || !mapping.query || !mapping.sku) {
      toast.error('Please select a file and map the required columns');
      return;
    }

    setImporting(true);
    setResult(null);
    try {
      const columnMapping: ColumnMapping = { query: mapping.query, sku: mapping.sku };
      if (mapping.region) columnMapping.region = mapping.region;
      if (mapping.notes) columnMapping.notes = mapping.notes;

      const fd = new FormData();
      fd.append('file', file);
      fd.append('column_mapping', JSON.stringify(columnMapping));

      const res = await fetch('/api/import/training', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      setResult(data);
      toast.success(`Imported ${data.imported} of ${data.total_rows} rows`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const SelectField = ({
    label,
    required,
    value,
    onChange,
  }: {
    label: string;
    required?: boolean;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
      >
        <option value="">— select column —</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Step 1: File upload */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-900 text-xs font-bold text-white">
            1
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Select Excel file</h2>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          className="cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-8 text-center transition-colors hover:border-blue-900"
        >
          {file ? (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
              <FileSpreadsheet className="h-5 w-5 text-blue-900" />
              <span className="font-medium">{file.name}</span>
              <span className="text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              <Upload className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              <p className="font-medium">Click to select .xlsx or .xls file</p>
              <p className="mt-1 text-xs text-gray-400">First row must contain column headers</p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
        </div>

        {loadingHeaders && (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading column headers…
          </div>
        )}

        {headers.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
              Detected columns ({headers.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {headers.map((h) => (
                <span
                  key={h}
                  className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700 font-mono"
                >
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Column mapping */}
      {headers.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-900 text-xs font-bold text-white">
              2
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Map columns</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="Query column"
              required
              value={mapping.query}
              onChange={(v) => setMapping((m) => ({ ...m, query: v }))}
            />
            <SelectField
              label="SKU column"
              required
              value={mapping.sku}
              onChange={(v) => setMapping((m) => ({ ...m, sku: v }))}
            />
            <SelectField
              label="Region column (optional)"
              value={mapping.region ?? ''}
              onChange={(v) => setMapping((m) => ({ ...m, region: v }))}
            />
            <SelectField
              label="Notes column (optional)"
              value={mapping.notes ?? ''}
              onChange={(v) => setMapping((m) => ({ ...m, notes: v }))}
            />
          </div>
        </div>
      )}

      {/* Step 3: Import */}
      {headers.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-900 text-xs font-bold text-white">
              3
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Import</h2>
          </div>

          <button
            onClick={handleImport}
            disabled={importing || !mapping.query || !mapping.sku}
            className="flex items-center gap-2 rounded-md bg-blue-900 px-5 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Import training data
              </>
            )}
          </button>

          {result && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="font-medium text-gray-900">
                  Imported {result.imported} of {result.total_rows} rows
                </span>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}
                  </div>
                  <ul className="space-y-1">
                    {result.errors.map((e, i) => (
                      <li key={i} className="text-xs text-red-600 font-mono break-all">
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
