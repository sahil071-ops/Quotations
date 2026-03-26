import { createServerSupabaseClient } from '@/lib/supabase';
import CatalogClientPage from './CatalogClientPage';
import type { CatalogDocument } from '@/types';

export default async function CatalogPage() {
  const supabase = createServerSupabaseClient();
  const { data: documents } = await supabase
    .from('catalog_documents')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Catalog PDFs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload and ingest product catalog PDFs to improve matching accuracy.
        </p>
      </div>
      <CatalogClientPage initialDocuments={(documents ?? []) as CatalogDocument[]} />
    </div>
  );
}
