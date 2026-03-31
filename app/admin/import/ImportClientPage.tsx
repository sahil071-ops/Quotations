'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Upload, Loader2, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { EmbeddingProgress } from '@/components/EmbeddingProgress';

interface ImportResult {
  success: boolean;
  total_rows: number;
  upserted: number;
  reembedded?: number;
  errors: string[];
  embeddingRequired?: boolean;
  message?: string;
}

function ImportPanel({
  title,
  description,
  endpoint,
  accept,
  showEmbedStep,
}: {
  title: string;
  description: string;
  endpoint: string;
  accept: string;
  showEmbedStep?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [showMapping, setShowMapping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const TARGET_FIELDS = ['sku', 'name', 'description', 'family', 'countries'];

  const handleFileChange = async (f: File | null) => {
    setFile(f);
    setResult(null);
    setHeaders([]);
    setMapping({});
    setShowMapping(false);

    if (!f) return;

    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch(`${endpoint}?headers=1`, { method: 'POST', body: fd });
      if (res.ok) {
        const data = await res.json();
        if (data.headers?.length) {
          setHeaders(data.headers);
          setShowMapping(true);
        }
      }
    } catch {
      // Headers preview is optional — silent fail is fine
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);

    const fd = new FormData();
    fd.append('file', file);
    if (Object.keys(mapping).length > 0) {
      fd.append('column_mapping', JSON.stringify(mapping));
    }

    try {
      const res = await fetch(endpoint, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      setResult(data);
      toast.success(data.message ?? `Imported ${data.upserted} records`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-gray-900">{title}</h2>
      <p className="mb-4 text-sm text-gray-500">{description}</p>

      {/* File picker */}
      <label className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 transition-colors hover:border-blue-900">
        {file ? (
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <FileText className="h-5 w-5 text-blue-900" />
            {file.name}
          </div>
        ) : (
          <>
            <Upload className="mb-2 h-8 w-8 text-gray-300" />
            <span className="text-sm text-gray-500">Click to select {accept} file</span>
          </>
        )}
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        />
      </label>

      {/* Column mapping */}
      {showMapping && headers.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="mb-3 text-sm font-medium text-amber-800">
            Map your file&apos;s column headers to the expected fields (optional — auto-detect works for standard SAP exports):
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TARGET_FIELDS.map((target) => (
              <div key={target}>
                <label className="mb-1 block text-xs font-medium text-gray-700 capitalize">{target}</label>
                <select
                  value={mapping[target] ?? ''}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [target]: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-900 focus:outline-none"
                >
                  <option value="">(auto-detect)</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleImport}
        disabled={!file || loading}
        className="flex items-center gap-2 rounded-md bg-blue-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? 'Importing...' : 'Start Import'}
      </button>

      {/* Result */}
      {result && (
        <div className={`mt-4 rounded-lg p-4 ${result.errors.length > 0 ? 'border border-amber-200 bg-amber-50' : 'border border-green-200 bg-green-50'}`}>
          <div className="mb-2 flex items-center gap-2">
            {result.errors.length > 0 ? (
              <AlertCircle className="h-4 w-4 text-amber-600" />
            ) : (
              <CheckCircle className="h-4 w-4 text-green-700" />
            )}
            <span className="text-sm font-medium text-gray-900">
              {result.upserted} / {result.total_rows} records imported
            </span>
          </div>

          {result.errors.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs font-medium text-amber-700">{result.errors.length} rows skipped:</p>
              {result.errors.slice(0, 5).map((e, i) => (
                <p key={i} className="text-xs text-amber-600">{e}</p>
              ))}
              {result.errors.length > 5 && (
                <p className="text-xs text-amber-500">…and {result.errors.length - 5} more</p>
              )}
            </div>
          )}

          {/* Embedding step — shown only after SAP import */}
          {showEmbedStep && result.embeddingRequired && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="mb-1 text-sm font-semibold text-blue-900">Step 2 — Make products searchable</p>
              <p className="mb-3 text-xs text-blue-700">
                Products are saved but not yet searchable. Generate embeddings to enable AI matching.
              </p>
              <EmbeddingProgress totalProducts={result.upserted} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ImportClientPage() {
  return (
    <div className="space-y-6">
      <ImportPanel
        title="SAP / Product Catalog Import"
        description="Import products from a SAP export (CSV or Excel). Step 1 saves all products. Step 2 generates embeddings to make them searchable."
        endpoint="/api/import/sap"
        accept=".xlsx,.xls,.csv"
        showEmbedStep
      />

      <ImportPanel
        title="Competitor Cross-Reference Import"
        description="Import competitor part number mappings (Excel). Expected columns: Competitor Name, Competitor SKU, Axis SKU, Confidence, Notes."
        endpoint="/api/import/crossrefs"
        accept=".xlsx,.xls,.csv"
      />
    </div>
  );
}
