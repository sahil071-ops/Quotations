'use client';

import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { Upload, RefreshCw, Trash2, FileText, Loader2, X } from 'lucide-react';
import type { CatalogDocument } from '@/types';
import { AXIS_COUNTRIES } from '@/constants/countries';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  processing: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

interface UploadModalProps {
  onClose: () => void;
  onUploaded: (doc: CatalogDocument) => void;
}

function UploadModal({ onClose }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [family, setFamily] = useState('');
  const [countries, setCountries] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleCountry = (code: string) => {
    setCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('product_family', family);
    formData.append('countries', JSON.stringify(countries));

    let docId: string | null = null;
    try {
      const res = await fetch('/api/catalog/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      docId = data.document_id;
      toast.success('PDF uploaded successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
      setUploading(false);
      return;
    }

    setUploading(false);
    setIngesting(true);

    try {
      const res = await fetch('/api/catalog/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: docId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Ingestion failed');
      toast.success(`Ingested: ${data.pages_processed} pages, ${data.products_affected} products updated`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ingestion failed');
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold">Upload Catalog PDF</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {/* File picker */}
          <div
            onClick={() => fileRef.current?.click()}
            className="cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-6 text-center hover:border-blue-900"
          >
            {file ? (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                <FileText className="h-5 w-5 text-blue-900" />
                {file.name}
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                <Upload className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                Click to select PDF
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* Family */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Product family</label>
            <input
              type="text"
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              placeholder="e.g. Motor Protection"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-900"
            />
          </div>

          {/* Countries */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Applicable countries</label>
            <div className="flex flex-wrap gap-2">
              {AXIS_COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => toggleCountry(c.code)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    countries.includes(c.code)
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'border-gray-300 text-gray-600 hover:border-blue-900'
                  }`}
                >
                  {c.code}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-md border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || uploading || ingesting}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-900 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {(uploading || ingesting) && <Loader2 className="h-4 w-4 animate-spin" />}
              {uploading ? 'Uploading...' : ingesting ? 'Ingesting...' : 'Upload & Ingest'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CatalogClientPage({ initialDocuments }: { initialDocuments: CatalogDocument[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [showUpload, setShowUpload] = useState(false);
  const [reingesting, setReingesting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleReingest = async (docId: string) => {
    setReingesting(docId);
    try {
      const res = await fetch('/api/catalog/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: docId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Re-ingestion failed');
      toast.success(`Re-ingested: ${data.pages_processed} pages`);
      setDocuments((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, status: 'completed' } : d))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Re-ingestion failed');
    } finally {
      setReingesting(null);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Delete this catalog document?')) return;
    setDeleting(docId);
    try {
      const res = await fetch(`/api/catalog/delete?id=${docId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      toast.success('Document deleted');
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          <Upload className="h-4 w-4" /> Upload PDF
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 p-10 text-center text-gray-400">
          No catalogs uploaded yet.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                {['Filename', 'Family', 'Countries', 'Pages', 'Status', 'Uploaded', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="font-medium text-gray-900 max-w-xs truncate">{doc.filename}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{doc.product_family ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{doc.countries?.join(', ') ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{doc.page_count ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[doc.status]}`}>
                      {doc.status}
                    </span>
                    {doc.error_message && (
                      <p className="mt-0.5 text-xs text-red-600 max-w-xs truncate">{doc.error_message}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleReingest(doc.id)}
                        disabled={reingesting === doc.id}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        title="Re-ingest"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${reingesting === doc.id ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        disabled={deleting === doc.id}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={(doc) => {
            setDocuments((prev) => [doc, ...prev]);
            setShowUpload(false);
          }}
        />
      )}
    </>
  );
}
