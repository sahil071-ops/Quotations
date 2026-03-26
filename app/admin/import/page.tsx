import ImportClientPage from './ImportClientPage';

export default function ImportPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Import Data</h1>
        <p className="mt-1 text-sm text-gray-500">
          Import products from SAP export or competitor cross-reference files.
        </p>
      </div>
      <ImportClientPage />
    </div>
  );
}
